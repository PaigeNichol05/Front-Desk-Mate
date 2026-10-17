import { uid, now, audit } from './db.js';
import { coverageContext } from './code-coverage.js';
import { ELIGIBILITY_SCENARIOS, eligibilityHash, simulateEligibility, validateSimulatedEligibility } from './eligibility-adapter.js';

const fail = (status, message) => Object.assign(Error(message), { status });
const notice = 'SIMULATED TEST DATA. No insurer connection. Eligibility, plan benefits, procedure coverage, authorization and payment are separate. Professional review is required; no coverage or reimbursement is guaranteed.';

export function migrateEligibility(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS eligibility_requests (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      patient_id TEXT NOT NULL REFERENCES patients(id), encounter_id TEXT NOT NULL REFERENCES encounters(id),
      request_key TEXT NOT NULL, request_json TEXT NOT NULL, request_hash TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('SIMULATED_RESPONSE','FAILED')),
      response_json TEXT, response_hash TEXT, error_json TEXT,
      created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, recheck_on TEXT NOT NULL,
      UNIQUE(org_id,request_key), UNIQUE(id,org_id),
      FOREIGN KEY(encounter_id,org_id,patient_id) REFERENCES encounters(id,org_id,patient_id),
      FOREIGN KEY(created_by,org_id) REFERENCES users(id,org_id)
    );
    CREATE INDEX IF NOT EXISTS eligibility_context ON eligibility_requests(org_id,encounter_id);
    CREATE TABLE IF NOT EXISTS eligibility_reviews (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      request_id TEXT NOT NULL REFERENCES eligibility_requests(id),
      disposition TEXT NOT NULL CHECK(disposition IN ('NEEDS_INFORMATION','REVIEWED_SIMULATION_ONLY')),
      notes TEXT NOT NULL, reviewed_by TEXT NOT NULL REFERENCES users(id), reviewed_at TEXT NOT NULL,
      FOREIGN KEY(request_id,org_id) REFERENCES eligibility_requests(id,org_id),
      FOREIGN KEY(reviewed_by,org_id) REFERENCES users(id,org_id)
    );
  `);
  for (const table of ['eligibility_requests', 'eligibility_reviews']) {
    for (const operation of ['UPDATE', 'DELETE']) db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_${operation.toLowerCase()} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'Eligibility history is immutable'); END;`);
  }
}
function staff(db, user, write = false) {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND org_id=? AND active=1').get(user.id, user.org_id);
  if (!u || !(write ? ['BILLER', 'ADMIN'] : ['BILLER', 'ADMIN', 'PHYSICIAN']).includes(u.role)) throw fail(403, 'Eligibility staff permission required');
  return u;
}
function encounter(db, user, id) {
  const e = db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(id, user.org_id);
  if (!e) throw fail(404, 'Encounter not found');
  return e;
}
function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function decode(row) {
  return { id: row.id, encounter_id: row.encounter_id, patient_id: row.patient_id,
    request: JSON.parse(row.request_json), request_hash: row.request_hash, outcome: row.outcome,
    response: row.response_json ? JSON.parse(row.response_json) : null, response_hash: row.response_hash,
    error: row.error_json ? JSON.parse(row.error_json) : null,
    created_by: row.created_by, created_at: row.created_at, recheck_on: row.recheck_on,
    simulated: true, authenticated_insurer_response: false, live_transmission_enabled: false, notice };
}
function reviews(db, user, requestId) {
  return db.prepare('SELECT id,disposition,notes,reviewed_by,reviewed_at FROM eligibility_reviews WHERE org_id=? AND request_id=? ORDER BY rowid').all(user.org_id, requestId);
}
export function eligibilityForContext(db, user, patient, key) {
  const row = db.prepare('SELECT * FROM eligibility_requests WHERE org_id=? AND patient_id=? AND encounter_id=? ORDER BY rowid DESC').all(user.org_id, patient.id, key.encounter_id)
    .find(r => { const b = JSON.parse(r.request_json); return b.member_id === patient.member_id && b.payer_name === patient.payer_name && JSON.stringify(b.context) === JSON.stringify(key); });
  if (!row) return null;
  const d = decode(row), effective = d.response?.member_eligibility;
  const stale = now().slice(0, 10) > row.recheck_on || (!!effective && (key.service_date < effective.starts_on || key.service_date > effective.ends_on));
  return { ...d, stale, reviews: reviews(db, user, row.id), professional_review_required: true,
    usable_as_real_coverage_evidence: false };
}
export function createEligibilityService(db, { enabled = false } = {}) {
  return {
    config(user) {
      staff(db, user);
      return { simulation_enabled: enabled, live_transmission_enabled: false, scenarios: ELIGIBILITY_SCENARIOS,
        fixture: { member_id: 'DEMO-MEMBER-001', payer_id: 'EXAMPLE-HEALTH-TEST', provider_reference: 'DEMO-PROVIDER-001' }, notice };
    },
    request(user, body) {
      const u = staff(db, user, true);
      if (!enabled) throw fail(403, 'Fictional eligibility is disabled');
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'Eligibility request must be an object');
      const { e, p, key } = coverageContext(db, u, body);
      if (body.fictional_confirmed !== true || !ELIGIBILITY_SCENARIOS.includes(body.scenario) ||
          typeof body.request_key !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.request_key)) throw fail(400, 'Confirm fictional data, a supported scenario and a request key');
      // Restrict execution to the bundled specimen, even if this flag is accidentally enabled elsewhere.
      if (u.org_id !== 'demo-clinic' || p.id !== 'patient-001' || e.id !== 'enc-001' ||
          p.member_id !== 'DEMO-MEMBER-001' || p.payer_name !== 'Example Health Plan' ||
          e.clinician_id !== 'doctor-001' || body.member_id !== p.member_id ||
          body.payer_id !== 'EXAMPLE-HEALTH-TEST' || body.provider_reference !== 'DEMO-PROVIDER-001' ||
          body.service_date !== e.date_of_service || !db.prepare("SELECT 1 FROM users WHERE id=? AND org_id=? AND role='PHYSICIAN' AND active=1").get(e.clinician_id,u.org_id)) throw fail(422, 'Only the bundled fictional member, payer, provider and matching service date are supported');
      const request = { patient_id: p.id, member_id: body.member_id, payer_id: body.payer_id,
        payer_name: p.payer_name, provider_reference: body.provider_reference, context: key, scenario: body.scenario };
      const hash = eligibilityHash(request);
      return transaction(db, () => {
        const old = db.prepare('SELECT * FROM eligibility_requests WHERE org_id=? AND request_key=?').get(u.org_id, body.request_key);
        if (old) {
          if (old.request_hash !== hash) throw fail(409, 'Request key already belongs to a different eligibility request');
          audit(db, u, 'REPLAY_ELIGIBILITY_REQUEST', 'eligibility_request', old.id);
          return { ...decode(old), duplicate: true };
        }
        const id = uid(), created = now(), recheck = new Date(Date.parse(created) + 86400000).toISOString().slice(0, 10);
        let response = null, error = null;
        try { response = validateSimulatedEligibility(simulateEligibility(request)); }
        catch (err) {
          const code = ['TIMEOUT', 'UNAVAILABLE', 'INVALID_ADAPTER_RESPONSE'].includes(err.code) ? err.code : 'ADAPTER_FAILURE';
          error = { code, retryable: ['TIMEOUT', 'UNAVAILABLE'].includes(code), message: 'Simulated request failed. No eligibility or benefit conclusion is available. Retain this attempt; a retry requires a new request key.' };
        }
        db.prepare('INSERT INTO eligibility_requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
          id, u.org_id, p.id, e.id, body.request_key, JSON.stringify(request), hash,
          error ? 'FAILED' : 'SIMULATED_RESPONSE', response ? JSON.stringify(response) : null,
          response ? eligibilityHash(response) : null, error ? JSON.stringify(error) : null, u.id, created, recheck);
        audit(db, u, error ? 'ELIGIBILITY_FAILED' : 'RECEIVE_SIMULATED_ELIGIBILITY', 'eligibility_request', id);
        return decode(db.prepare('SELECT * FROM eligibility_requests WHERE id=? AND org_id=?').get(id, u.org_id));
      });
    },
    history(user, encounterId) {
      const u = staff(db, user); encounter(db, u, encounterId);
      return transaction(db, () => {
        const history = db.prepare('SELECT * FROM eligibility_requests WHERE org_id=? AND encounter_id=? ORDER BY rowid DESC').all(u.org_id, encounterId)
          .map(r => ({ ...decode(r), reviews: reviews(db, u, r.id) }));
        audit(db, u, 'VIEW_ELIGIBILITY_HISTORY', 'encounter', encounterId);
        return { history, notice };
      });
    },
    review(user, id, body) {
      const u = staff(db, user, true);
      const r = db.prepare('SELECT * FROM eligibility_requests WHERE id=? AND org_id=?').get(id, u.org_id);
      if (!r) throw fail(404, 'Eligibility request not found');
      if (body?.reviewed !== true || !['NEEDS_INFORMATION', 'REVIEWED_SIMULATION_ONLY'].includes(body.disposition) ||
          typeof body.notes !== 'string' || !body.notes.trim() || body.notes.length > 3000) throw fail(400, 'Review disposition, notes and confirmation required');
      return transaction(db, () => {
        const reviewId = uid();
        db.prepare('INSERT INTO eligibility_reviews VALUES (?,?,?,?,?,?,?)').run(reviewId, u.org_id, r.id, body.disposition, body.notes.trim(), u.id, now());
        audit(db, u, 'REVIEW_SIMULATED_ELIGIBILITY', 'eligibility_request', r.id);
        return { id: reviewId, professional_review_required: true, service_coverage: 'NOT_ESTABLISHED', notice };
      });
    },
  };
}
