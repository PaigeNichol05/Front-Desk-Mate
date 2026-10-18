import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seed } from '../src/db.js';
import { stageCatalog, publishCatalog, catalogReleases } from '../src/catalog-updates.js';
import { searchCodes } from '../src/code-coverage.js';

function fixture(t) {
  const db = openDb(':memory:'); seed(db); t.after(() => db.close());
  const admin = { id: 'biller-001', org_id: 'demo-clinic' }, doctor = { id: 'doctor-001', org_id: 'demo-clinic' };
  db.exec("UPDATE users SET role='ADMIN' WHERE id='biller-001'");
  return { db, admin, doctor, patient: { id: 'portal-001', org_id: 'demo-clinic' } };
}
const release = (version = 'SYNTHETIC-2030-TEST') => ({ system: 'HCPCS', version, starts_on: '2030-01-01', ends_on: '2030-12-31', source_url: 'https://www.cms.gov/files/zip/synthetic-test-only.zip', source_sha256: 'a'.repeat(64), complete_release: true, rights_attested: true, codes: [
  { code: 'J0001', description: 'SYNTHETIC TEST ENTRY ONLY', starts_on: '2030-01-01', ends_on: '2030-12-31' },
  { code: 'J0002', description: 'SYNTHETIC SECOND TEST ENTRY', starts_on: '2030-04-01', ends_on: '2030-12-31' },
] });
const query = (code = '', date = '2030-01-01') => ({ system: 'HCPCS', q: code, service_date: date });
test('staging does not change code search; reviewed publication selects by service date and later corrections remove obsolete codes', t => {
  const f = fixture(t), staged = stageCatalog(f.db, f.admin, release());
  assert.equal(staged.summary.added, 2);
  assert.equal(searchCodes(f.db, f.admin, query()).available, false);
  assert.throws(() => publishCatalog(f.db, f.admin, staged.id, { reviewed: false }), /Confirm review/);
  assert.throws(() => publishCatalog(f.db, f.admin, staged.id, { reviewed: true, data_sha256: 'wrong' }), /fingerprint/);
  const publish = s => publishCatalog(f.db, f.admin, s.id, { reviewed: true, data_sha256: s.data_sha256, notes: 'Reviewed synthetic test fixture, no real source claims.' });
  publish(staged);
  assert.equal(publish(staged).duplicate, true);
  assert.equal(searchCodes(f.db, f.doctor, query('J0001')).results[0].description, 'SYNTHETIC TEST ENTRY ONLY');
  assert.equal(searchCodes(f.db, f.admin, query('J0002')).total, 0);
  assert.equal(searchCodes(f.db, f.admin, query('J0002', '2030-04-01')).total, 1);
  assert.equal(searchCodes(f.db, f.admin, query('', '2029-12-31')).available, false);
  assert.equal(searchCodes(f.db, f.admin, query('J3301', '2026-10-18')).total, 1);
  const correction = { ...release('SYNTHETIC-CORRECTION'), codes: [{ ...release().codes[0], code: 'J0003' }] };
  const second = stageCatalog(f.db, f.admin, correction); assert.equal(second.summary.removed, 1); publish(second);
  assert.equal(searchCodes(f.db, f.admin, query('J0001')).total, 0);
  assert.equal(searchCodes(f.db, f.admin, query('J0003')).total, 1);
  for (const table of ['catalog_releases', 'catalog_publications']) {
    assert.throws(() => f.db.exec(`DELETE FROM ${table}`), /immutable/);
    assert.throws(() => f.db.exec(`UPDATE ${table} SET id='edited'`), /immutable/);
  }
  assert.equal(catalogReleases(f.db, f.admin).length, 2);
});
test('catalog staging validates full release, source/rights, code system, dates, duplicates and CPT licensing', t => {
  const f = fixture(t);
  for (const bad of [null, {}, { ...release(), rights_attested: false }, { ...release(), complete_release: false }, { ...release(), source_url: 'https://example.com/not-cms' }, { ...release(), source_sha256: 'wrong' }, { ...release(), starts_on: '2030-02-30' }, { ...release(), codes: [] }, { ...release(), codes: [release().codes[0], release().codes[0]] }, { ...release(), codes: [{ ...release().codes[0], code: 'D0001' }] }]) assert.throws(() => stageCatalog(f.db, f.admin, bad));
  assert.throws(() => stageCatalog(f.db, f.doctor, release()), /permission/);
  assert.throws(() => catalogReleases(f.db, f.patient), /permission/);
  const cpt = { ...release('CPT-SYNTHETIC'), system: 'CPT', source_url: 'https://licensed-vendor.example.test/release', codes: [{ ...release().codes[0], code: '00000' }] };
  assert.throws(() => stageCatalog(f.db, f.admin, cpt), /license reference/);
  const staged = stageCatalog(f.db, f.admin, { ...cpt, license_reference: 'SYNTHETIC LICENSE REFERENCE; NO REAL CPT CONTENT' });
  publishCatalog(f.db, f.admin, staged.id, { reviewed: true, data_sha256: staged.data_sha256, notes: 'Synthetic license test.' });
  assert.equal(searchCodes(f.db, f.doctor, { system: 'CPT', q: '00000', service_date: '2030-01-01' }).total, 1);
});
test('changed baseline requires a fresh review; tenant isolation, durable audit and atomic rollback apply', t => {
  const f = fixture(t), a = stageCatalog(f.db, f.admin, release('FIRST')), b = stageCatalog(f.db, f.admin, release('SECOND'));
  publishCatalog(f.db, f.admin, a.id, { reviewed: true, data_sha256: a.data_sha256, notes: 'Synthetic review.' });
  assert.throws(() => publishCatalog(f.db, f.admin, b.id, { reviewed: true, data_sha256: b.data_sha256, notes: 'Stale review.' }), /baseline changed/);
  f.db.exec("INSERT INTO organizations VALUES ('other','Other'); INSERT INTO users(id,org_id,email,name,role,password_hash) VALUES ('other','other','other@test','Other','ADMIN','x')");
  const other = { id: 'other', org_id: 'other' };
  assert.deepEqual(catalogReleases(f.db, other), []);
  assert.equal(searchCodes(f.db, other, query()).available, false);
  assert.throws(() => publishCatalog(f.db, other, b.id, {}), /not found/);
  assert.throws(() => f.db.prepare('INSERT INTO catalog_publications VALUES (?,?,?,?,?,?)').run('forged', 'other', b.id, 'bad', 'other', new Date().toISOString()), /FOREIGN KEY/);
  f.db.exec("CREATE TRIGGER block_catalog_audit BEFORE INSERT ON audit_log WHEN NEW.action='STAGE_CODE_CATALOG' BEGIN SELECT RAISE(ABORT,'test audit failure'); END;");
  assert.throws(() => stageCatalog(f.db, f.admin, release('ROLLBACK')), /audit failure/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM catalog_releases').get().n, 2);
  f.db.exec("UPDATE users SET active=0 WHERE id='biller-001'");
  assert.throws(() => stageCatalog(f.db, f.admin, release('INACTIVE')), /permission/);
});
