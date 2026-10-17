import { uid, now, audit } from './db.js';
const fail = (status, message) => Object.assign(Error(message), { status });

export function migrateVitals(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS vital_observations (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
    patient_id TEXT NOT NULL REFERENCES patients(id), encounter_id TEXT NOT NULL REFERENCES encounters(id),
    supersedes_id TEXT UNIQUE REFERENCES vital_observations(id),
    systolic INTEGER, diastolic INTEGER, heart_rate INTEGER,
    measured_at TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('MANUAL','SIMULATED_DEVICE')),
    source_reference TEXT NOT NULL, position TEXT NOT NULL, arm TEXT NOT NULL, notes TEXT NOT NULL,
    recorded_by TEXT NOT NULL REFERENCES users(id), recorded_at TEXT NOT NULL,
    CHECK((systolic IS NULL AND diastolic IS NULL) OR (systolic IS NOT NULL AND diastolic IS NOT NULL)),
    CHECK(systolic IS NOT NULL OR heart_rate IS NOT NULL),
    UNIQUE(id,org_id,encounter_id),
    FOREIGN KEY(encounter_id,org_id,patient_id) REFERENCES encounters(id,org_id,patient_id),
    FOREIGN KEY(recorded_by,org_id) REFERENCES users(id,org_id),
    FOREIGN KEY(supersedes_id,org_id,encounter_id) REFERENCES vital_observations(id,org_id,encounter_id)
  );
  CREATE INDEX IF NOT EXISTS vitals_scope ON vital_observations(org_id,encounter_id);
  CREATE TRIGGER IF NOT EXISTS vitals_no_update BEFORE UPDATE ON vital_observations BEGIN SELECT RAISE(ABORT,'Vital observations are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS vitals_no_delete BEFORE DELETE ON vital_observations BEGIN SELECT RAISE(ABORT,'Vital observations are immutable'); END;`);
}
function access(db, user, id, write = false) {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND org_id=? AND active=1').get(user.id, user.org_id);
  if (!u || !['PATIENT', 'PHYSICIAN'].includes(u.role) || (write && u.role !== 'PHYSICIAN')) throw fail(403, 'Clinical vital-sign permission required');
  const e = db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(id, u.org_id);
  if (!e) throw fail(404, 'Encounter not found');
  if ((u.role === 'PATIENT' && u.patient_id !== e.patient_id) || (u.role === 'PHYSICIAN' && e.clinician_id !== u.id)) throw fail(403, 'Only this patient or the assigned clinician can access vital signs');
  if (write && e.status !== 'OPEN') throw fail(409, 'Signed encounter vital signs are locked');
  return { u, e };
}
function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = work(); db.exec('COMMIT'); return r; } catch (err) { db.exec('ROLLBACK'); throw err; }
}
export function recordVitals(db, user, encounterId, body) {
  const { u, e } = access(db, user, encounterId, true);
  if (!body || body.reviewed !== true || !['MANUAL', 'SIMULATED_DEVICE'].includes(body.source)) throw fail(400, 'Confirm reviewed readings and their source');
  const simulated = body.source === 'SIMULATED_DEVICE';
  const b = simulated ? { ...body, systolic: 118, diastolic: 76, heart_rate: 72, measured_at: now(), source_reference: 'FIXED_VITALS_FIXTURE_V1', position: 'SEATED', arm: 'LEFT' } : body;
  const value = (v, min, max) => {
    if (v === undefined || v === null) return null;
    if (!Number.isSafeInteger(v) || v < min || v > max) throw fail(400, 'Reading outside supported input range; verify the entered value and units');
    return v;
  };
  const sys = value(b.systolic, 20, 350), dia = value(b.diastolic, 10, 250), hr = value(b.heart_rate, 10, 300);
  if ((sys === null) !== (dia === null) || (sys === null && hr === null) || (sys !== null && sys <= dia)) throw fail(400, 'Supply both blood-pressure values in mmHg and/or pulse in beats/min; verify systolic exceeds diastolic');
  if (typeof b.measured_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(b.measured_at) ||
      !Number.isFinite(Date.parse(b.measured_at)) || new Date(b.measured_at).toISOString() !== b.measured_at || Date.parse(b.measured_at) > Date.now()) throw fail(400, 'Supply a valid measurement timestamp, not in the future');
  if (b.measured_at.slice(0, 10) !== e.date_of_service) throw fail(400, 'Measurement date must match this encounter service date');
  if (typeof b.source_reference !== 'string' || !b.source_reference.trim() || b.source_reference.length > 300 ||
      !['SEATED', 'STANDING', 'LYING', 'UNSPECIFIED'].includes(b.position) || !['LEFT', 'RIGHT', 'UNSPECIFIED'].includes(b.arm) ||
      (b.notes !== undefined && (typeof b.notes !== 'string' || b.notes.length > 1000))) throw fail(400, 'Measurement source, position, arm and valid notes are required');
  return transaction(db, () => {
    const parent = b.supersedes_id || null;
    if (parent && !db.prepare('SELECT 1 FROM vital_observations v WHERE v.id=? AND v.org_id=? AND v.encounter_id=? AND NOT EXISTS(SELECT 1 FROM vital_observations n WHERE n.supersedes_id=v.id)').get(parent, u.org_id, e.id)) throw fail(409, 'Correction must reference a current observation in this encounter');
    if (parent && !b.notes?.trim()) throw fail(400, 'Explain the reason for this correction');
    const id = uid();
    db.prepare('INSERT INTO vital_observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      id, u.org_id, e.patient_id, e.id, parent, sys, dia, hr, b.measured_at, b.source,
      b.source_reference.trim(), b.position, b.arm, b.notes?.trim() || '', u.id, now());
    audit(db, u, parent ? 'CORRECT_VITALS' : 'RECORD_VITALS', 'vital_observation', id);
    return { id, simulated, blood_pressure_unit: 'mmHg', heart_rate_unit: 'beats/min' };
  });
}
export function vitalHistory(db, user, encounterId) {
  const { u, e } = access(db, user, encounterId);
  return transaction(db, () => {
    const history = db.prepare('SELECT v.*, NOT EXISTS(SELECT 1 FROM vital_observations n WHERE n.supersedes_id=v.id) AS current FROM vital_observations v WHERE v.org_id=? AND v.encounter_id=? ORDER BY v.measured_at DESC,v.rowid DESC').all(u.org_id, e.id);
    audit(db, u, 'VIEW_VITALS', 'encounter', e.id);
    return { history, blood_pressure_unit: 'mmHg', heart_rate_unit: 'beats/min', device_connected: false,
      continuous_monitoring: false, notice: 'Recorded observations only. Software cannot measure blood pressure without a compatible validated device. The sample device button generates fixed fictional values. No live sensor, ECG, diagnosis, alerting or continuous monitoring is connected.' };
  });
}
