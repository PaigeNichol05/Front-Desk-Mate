import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, seed } from '../src/db.js';
import { createEligibilityService } from '../src/eligibility.js';
import { coverageView, recordCoverage } from '../src/code-coverage.js';
import { simulateEligibility, eligibilityHash, ELIGIBILITY_SCENARIOS } from '../src/eligibility-adapter.js';

export const context = { encounter_id: 'enc-001', plan_reference: 'Fictional group A PPO', procedure_system: 'HCPCS', procedure_code: 'J3301', diagnosis_code: 'M54.50', modifier: '', units: 1, place_of_service: '11' };
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'eligibility-')), path = join(dir, 'db');
  let db = openDb(path); seed(db);
  db.prepare('UPDATE encounters SET date_of_service=? WHERE id=?').run('2026-10-17', 'enc-001');
  let service = createEligibilityService(db, { enabled: true });
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { get db() { return db; }, get service() { return service; },
    restart() { db.close(); db = openDb(path); service = createEligibilityService(db, { enabled: true }); },
    biller: { id: 'biller-001', org_id: 'demo-clinic' }, doctor: { id: 'doctor-001', org_id: 'demo-clinic' }, patient: { id: 'portal-001', org_id: 'demo-clinic' } };
}
const request = (scenario = 'ACTIVE_BENEFITS', key = 'test-request-0001') => ({ ...context, member_id: 'DEMO-MEMBER-001', payer_id: 'EXAMPLE-HEALTH-TEST', provider_reference: 'DEMO-PROVIDER-001', service_date: '2026-10-17', fictional_confirmed: true, scenario, request_key: key });

test('eligibility fixture is deterministic and never treats active membership, benefits or cost sharing as procedure approval', t => {
  const f = setup(t), d = f.service.request(f.biller, request());
  assert.deepEqual(simulateEligibility(d.request), simulateEligibility(d.request));
  assert.equal(d.response_hash, eligibilityHash(d.response));
  assert.equal(d.response.member_eligibility.status, 'ACTIVE');
  assert.equal(d.response.plan_benefits[0].deductible.remaining_cents, 75000);
  assert.equal(d.response.plan_benefits[0].copayment.amount_cents, 3500);
  assert.equal(d.response.service_coverage.status, 'NOT_ESTABLISHED');
  assert.equal(d.response.authorization.decision, 'NOT_REQUESTED');
  assert.equal(d.response.payment.guaranteed, false);
  assert.equal(d.response.professional_review_required, true);
  assert.equal(d.authenticated_insurer_response, false);
  assert.equal(d.response.member_eligibility.starts_on, '2026-01-01');
  assert.equal(d.response.member_eligibility.ends_on, '2026-12-31');
  assert.equal(coverageView(f.db, f.biller, context).status, 'NOT_VERIFIED');
  assert.equal(coverageView(f.db, f.biller, context).simulated_eligibility.id, d.id);
});

test('all scenarios preserve uncertainty, null costs and durable failures without a network dependency', t => {
  const f = setup(t), originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Network must not be called'); };
  try {
    const results = Object.fromEntries(ELIGIBILITY_SCENARIOS.map(s => [s, f.service.request(f.biller, request(s, `scenario-${s}`))]));
    assert.equal(results.INACTIVE.response.member_eligibility.status, 'INACTIVE');
    assert.deepEqual(results.INACTIVE.response.plan_benefits, []);
    assert.equal(results.PARTIAL.response.network.status, 'UNKNOWN');
    assert.equal(results.PARTIAL.response.plan_benefits[0].copayment, null);
    assert.equal(results.PARTIAL.response.plan_benefits[0].deductible, null);
    assert.match(results.EXCLUSIONS.response.plan_benefits[0].exclusions[0], /cosmetic/);
    for (const scenario of ['TIMEOUT', 'UNAVAILABLE', 'INVALID_RESPONSE']) {
      assert.equal(results[scenario].outcome, 'FAILED');
      assert.equal(results[scenario].response, null);
      assert.equal(results[scenario].error.retryable, scenario !== 'INVALID_RESPONSE');
    }
    assert.equal(results.INVALID_RESPONSE.error.code, 'INVALID_ADAPTER_RESPONSE');
    assert.equal(coverageView(f.db, f.biller, context).simulated_eligibility.outcome, 'FAILED');
    assert.equal(f.service.history(f.doctor, 'enc-001').history.length, 7);
    assert.equal(f.db.prepare("SELECT count(*) n FROM audit_log WHERE action='ELIGIBILITY_FAILED'").get().n, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test('idempotent replay, retries, immutable reviews and history survive restart; audit failures roll back writes', t => {
  const f = setup(t), d = f.service.request(f.biller, request('TIMEOUT'));
  assert.equal(f.service.request(f.biller, request('TIMEOUT')).id, d.id);
  assert.equal(f.service.request(f.biller, request('TIMEOUT')).duplicate, true);
  assert.throws(() => f.service.request(f.biller, request('ACTIVE_BENEFITS')), /different eligibility request/);
  f.service.request(f.biller, request('ACTIVE_BENEFITS', 'new-attempt-0002'));
  const review = f.service.review(f.biller, d.id, { disposition: 'NEEDS_INFORMATION', notes: 'Recheck after fictional failure.', reviewed: true });
  assert.equal(review.professional_review_required, true);
  assert.equal(review.service_coverage, 'NOT_ESTABLISHED');
  for (const table of ['eligibility_requests', 'eligibility_reviews']) {
    assert.throws(() => f.db.exec(`DELETE FROM ${table}`), /immutable/);
    assert.throws(() => f.db.exec(`UPDATE ${table} SET id='edited'`), /immutable/);
  }
  f.restart();
  const history = f.service.history(f.biller, 'enc-001').history;
  assert.equal(history.length, 2);
  assert.equal(history[1].reviews[0].id, review.id);
  assert.equal(history[1].outcome, 'FAILED');
  assert.equal(history[0].response.member_eligibility.status, 'ACTIVE');
  f.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log WHEN NEW.action='RECEIVE_SIMULATED_ELIGIBILITY' BEGIN SELECT RAISE(ABORT,'test audit failure'); END;");
  assert.throws(() => f.service.request(f.biller, request('ACTIVE_BENEFITS', 'rollback-request')), /test audit failure/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM eligibility_requests').get().n, 2);
});

test('coverage simulation only matches the full member and service context and cannot replace manual evidence', t => {
  const f = setup(t); f.service.request(f.biller, request());
  for (const changed of [{ plan_reference: 'Other plan' }, { procedure_code: 'J1100' }, { diagnosis_code: 'M54.2' }, { modifier: '25' }, { units: 2 }, { place_of_service: '22' }]) assert.equal(coverageView(f.db, f.biller, { ...context, ...changed }).simulated_eligibility, null);
  for (const sql of ["UPDATE patients SET member_id='other'", "UPDATE patients SET payer_name='other'", "UPDATE encounters SET clinician_id='biller-001'", "UPDATE encounters SET date_of_service='2026-10-16'"]) {
    f.db.exec('SAVEPOINT change_context'); f.db.exec(sql);
    assert.equal(coverageView(f.db, f.biller, context).simulated_eligibility, null);
    f.db.exec('ROLLBACK TO change_context; RELEASE change_context');
  }
  const today = new Date().toISOString().slice(0, 10), future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  recordCoverage(f.db, f.biller, { ...context, evidence: { reviewed: true, source_kind: 'INSURER_CALL', source_reference: 'Fictional manual evidence', status: 'CONDITIONAL', checked_on: today, expires_on: future, eligibility: 'UNKNOWN', network: 'UNKNOWN', provider_enrollment: 'UNKNOWN', requirements: 'Manual review needed', cost_sharing: 'Unknown' } });
  assert.equal(coverageView(f.db, f.biller, context).status, 'CONDITIONAL');
  f.service.request(f.biller, request('INACTIVE', 'inactive-attempt'));
  const view = coverageView(f.db, f.biller, context);
  assert.equal(view.status, 'CONDITIONAL');
  assert.equal(view.simulated_eligibility.response.member_eligibility.status, 'INACTIVE');
  assert.equal(view.evidence.source_reference, 'Fictional manual evidence');
});

test('stale responses remain history with an explicit recheck hold', t => {
  const f = setup(t), OriginalDate = globalThis.Date;
  globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ['2020-01-01T12:00:00.000Z'])); } static now() { return OriginalDate.parse('2020-01-01T12:00:00.000Z'); } };
  try { f.service.request(f.biller, request()); } finally { globalThis.Date = OriginalDate; }
  const view = coverageView(f.db, f.biller, context);
  assert.equal(view.simulated_eligibility.stale, true);
  assert.equal(view.status, 'NOT_VERIFIED');
  assert.equal(view.professional_review_required, true);
});

test('eligibility requires active organization staff, write permissions, valid fixtures and explicit opt-in', t => {
  const f = setup(t);
  assert.throws(() => createEligibilityService(f.db).request(f.biller, request()), /disabled/);
  for (const bad of [null, [], 42, {}, { ...request(), fictional_confirmed: false }, { ...request(), scenario: 'LIVE' }, { ...request(), request_key: 'short' }]) assert.throws(() => f.service.request(f.biller, bad));
  for (const changed of [{ member_id: 'real-member' }, { payer_id: 'real-payer' }, { provider_reference: 'real-provider' }, { service_date: '2026-10-16' }]) assert.throws(() => f.service.request(f.biller, { ...request(), ...changed }), /bundled fictional/);
  assert.throws(() => f.service.request(f.doctor, request()), /permission/);
  assert.throws(() => f.service.history(f.patient, 'enc-001'), /permission/);
  const r = f.service.request(f.biller, request());
  assert.throws(() => f.service.review(f.doctor, r.id, { reviewed: true }), /permission/);
  assert.throws(() => f.service.review(f.biller, r.id, { reviewed: false }), /confirmation/);
  f.db.prepare("INSERT INTO organizations VALUES ('other','Other')").run();
  f.db.prepare("INSERT INTO users(id,org_id,email,name,role,password_hash) VALUES ('other','other','other@test','Other','BILLER','x')").run();
  const other = { id: 'other', org_id: 'other' };
  assert.throws(() => f.service.history(other, 'enc-001'), /not found/);
  assert.throws(() => f.service.request(other, request()), /not found/);
  assert.throws(() => f.service.review(other, r.id, { reviewed: true }), /not found/);
  const original = f.db.prepare('SELECT * FROM eligibility_requests WHERE id=?').get(r.id);
  const forged = { ...original, id: 'cross-tenant-request', org_id: 'other', created_by: 'other' };
  assert.throws(() => f.db.prepare(`INSERT INTO eligibility_requests (${Object.keys(forged).join(',')}) VALUES (${Object.keys(forged).map(() => '?').join(',')})`).run(...Object.values(forged)), /FOREIGN KEY/);
  assert.throws(() => f.db.prepare('INSERT INTO eligibility_reviews VALUES (?,?,?,?,?,?,?)').run('cross-review', 'other', r.id, 'NEEDS_INFORMATION', 'Fictional test', 'other', new Date().toISOString()), /FOREIGN KEY/);
  f.db.exec("UPDATE users SET active=0 WHERE id='biller-001'");
  assert.throws(() => f.service.history(f.biller, 'enc-001'), /permission/);
  assert.throws(() => f.service.request(f.biller, request()), /permission/);
});
