import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, seed } from '../src/db.js';
import { createBillingAudits, BILLING_SOURCES, BILLING_AUDIT_INTERVAL, readBillingSource } from '../src/billing-audits.js';

function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'billing-audits-')), path = join(dir, 'db');
  let db = openDb(path); seed(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { get db() { return db; }, restart() { db.close(); db = openDb(path); return createBillingAudits(db, options); },
    service: createBillingAudits(db, options), biller: { id: 'biller-001', org_id: 'demo-clinic' }, patient: { id: 'portal-001', org_id: 'demo-clinic' } };
}
const sample = () => ({ sha256: 'a'.repeat(64), bytes: 10, retrieved_url: 'https://www.cms.gov/', release_links: [] });
test('five-day schedule persists; failed checks are unknown, retry hourly, and never activate codes', async t => {
  let time = Date.parse('2026-10-18T12:00:00Z'), changed = false, broken = false, calls = 0;
  const options = { scheduled: true, clock: () => time, reader: async source => {
    calls++; if (broken && source.id === 'CMS_HCPCS') throw Error('No source access');
    return { ...sample(), sha256: changed ? 'b'.repeat(64) : 'a'.repeat(64), release_links: changed ? ['https://www.cms.gov/new-fixture.zip'] : [] };
  } };
  const f = fixture(t, options);
  assert.equal((await f.service.tick()).completed, 1); assert.equal(calls, BILLING_SOURCES.length);
  assert.equal((await f.service.tick()).completed, 0);
  const first = f.service.view(f.biller); assert.ok(first.history[0].results.every(r => r.status === 'BASELINE_RECORDED'));
  assert.equal(Date.parse(first.next_due), time + BILLING_AUDIT_INTERVAL);
  assert.equal(first.installed.find(c => c.system === 'CPT').status, 'LICENSED_IMPORT_REQUIRED');
  const reopened = f.restart(); time += BILLING_AUDIT_INTERVAL; changed = true;
  await reopened.tick();
  assert.equal(reopened.view(f.biller).history[0].outcome, 'SOURCE_CHANGES_REVIEW_REQUIRED');
  assert.equal(f.db.prepare('SELECT count(*) n FROM catalog_publications').get().n, 0);
  time += BILLING_AUDIT_INTERVAL; broken = true; await reopened.tick();
  const failed = reopened.view(f.biller); assert.equal(failed.history[0].outcome, 'INCOMPLETE_REVIEW_REQUIRED');
  assert.equal(failed.history[0].results.find(r => r.id === 'CMS_HCPCS').status, 'CHECK_FAILED');
  assert.equal(Date.parse(failed.next_due), time + 3600000);
  assert.throws(() => f.db.exec('DELETE FROM billing_audit_runs'), /immutable/);
  assert.throws(() => f.db.exec("UPDATE billing_audit_runs SET outcome='ALL_CURRENT'"), /immutable/);
});
test('staff-only audits, tenant history and disabled schedule preserve explicit uncertainty', async t => {
  const f = fixture(t, { reader: async () => sample() });
  assert.deepEqual(await f.service.tick(), { scheduled: false });
  assert.equal(f.service.view(f.biller).history.length, 0);
  await assert.rejects(() => f.service.run(f.patient), /permission/);
  assert.throws(() => f.service.view(f.patient), /permission/);
  await f.service.run(f.biller); await f.service.run(f.biller);
  assert.ok(f.service.view(f.biller).history[0].results.every(r => r.status === 'UNCHANGED_FINGERPRINT'));
  f.db.exec("INSERT INTO organizations VALUES ('other','Other'); INSERT INTO users(id,org_id,email,name,role,password_hash) VALUES ('other','other','other@test','Other','BILLER','x')");
  assert.equal(f.service.view({ id: 'other', org_id: 'other' }).history.length, 0);
  f.db.exec("UPDATE users SET active=0 WHERE id='biller-001'");
  await assert.rejects(() => f.service.run(f.biller), /permission/);
});
test('overlapping runs are blocked and restart recovery prevents late-worker results from overwriting history', async t => {
  let time = Date.parse('2026-10-18T12:00:00Z'); const waits = [];
  const f = fixture(t, { clock: () => time, reader: () => new Promise(resolve => waits.push(() => resolve(sample()))) });
  const first = f.service.run(f.biller);
  await assert.rejects(() => f.service.run(f.biller), /already running/);
  time += 120001;
  const recovery = createBillingAudits(f.db, { clock: () => time, reader: async () => sample() });
  await recovery.run(f.biller); waits.forEach(resolve => resolve());
  await assert.rejects(() => first, /lease expired/);
  const history = recovery.view(f.biller).history;
  assert.equal(history.length, 2); assert.equal(history[1].outcome, 'INTERRUPTED');
});
test('public fetcher rejects unregistered URLs, cross-host redirects, wrong formats and oversized responses', async () => {
  await assert.rejects(() => readBillingSource({ ...BILLING_SOURCES[0], url: 'http://127.0.0.1' }), /Unsupported/);
  let calls = 0;
  await assert.rejects(() => readBillingSource(BILLING_SOURCES[0], async () => { calls++; return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }); }), e => e.code === 'SOURCE_REDIRECT');
  assert.equal(calls, 1);
  await assert.rejects(() => readBillingSource(BILLING_SOURCES[0], async () => new Response('access denied', { status: 403 })), e => e.code === 'ACCESS_REQUIRED');
  await assert.rejects(() => readBillingSource(BILLING_SOURCES[0], async () => new Response('{}', { headers: { 'content-type': 'application/json' } })), e => e.code === 'SOURCE_FORMAT');
  await assert.rejects(() => readBillingSource(BILLING_SOURCES[0], async () => new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } })), e => e.code === 'SOURCE_TOO_LARGE');
  await assert.rejects(() => readBillingSource(BILLING_SOURCES[0], async () => new Response('<title>Sign in</title>', { headers: { 'content-type': 'text/html' } })), e => e.code === 'ACCESS_REQUIRED');
  const result = await readBillingSource(BILLING_SOURCES[0], async (url, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'manual');
    return new Response('<a href="/files/zip/test-release.zip">Fixture</a><a href="https://untrusted.test/other.zip">Other</a>', { headers: { 'content-type': 'text/html' } });
  });
  assert.deepEqual(result.release_links, ['https://www.cms.gov/files/zip/test-release.zip']);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});
