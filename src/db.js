import { migrateCodeCoverage } from './code-coverage.js';
import { migrateClearinghouse } from './clearinghouse-schema.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, scryptSync, randomBytes } from 'node:crypto';

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), patient_id TEXT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('PATIENT','PHYSICIAN','BILLER','ADMIN')), password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, dob TEXT NOT NULL, mrn TEXT NOT NULL, payer_name TEXT, member_id TEXT, UNIQUE(org_id,mrn));
    CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES patients(id), clinician_id TEXT REFERENCES users(id), starts_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'SCHEDULED');
    CREATE TABLE IF NOT EXISTS encounters (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES patients(id), clinician_id TEXT REFERENCES users(id), appointment_id TEXT REFERENCES appointments(id), date_of_service TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SIGNED','CHECKED_OUT')), signed_at TEXT, checked_out_at TEXT);
    CREATE TABLE IF NOT EXISTS clinical_sections (id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id), kind TEXT NOT NULL CHECK(kind IN ('SYMPTOM','HISTORY','MEDICATION','ALLERGY','EXAM','ASSESSMENT','PLAN','LAB','CONSENT','MESSAGE','CALL','DICTATION')), content TEXT NOT NULL, author_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES patients(id), encounter_id TEXT REFERENCES encounters(id), kind TEXT NOT NULL CHECK(kind IN ('IMAGE','DOCUMENT')), filename TEXT NOT NULL, mime TEXT NOT NULL, storage_key TEXT NOT NULL, bytes INTEGER NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS authorizations (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES patients(id), payer_name TEXT NOT NULL, auth_number TEXT, procedure_code TEXT NOT NULL, starts_on TEXT, ends_on TEXT, status TEXT NOT NULL DEFAULT 'REQUESTED', notes TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS code_suggestions (id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id), system TEXT NOT NULL CHECK(system IN ('ICD10CM','CPT','HCPCS','MODIFIER')), code TEXT NOT NULL, rationale TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'MANUAL', status TEXT NOT NULL DEFAULT 'SUGGESTED', reviewed_by TEXT REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS claims (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, encounter_id TEXT NOT NULL UNIQUE REFERENCES encounters(id), patient_id TEXT NOT NULL REFERENCES patients(id), payer_name TEXT NOT NULL, member_id TEXT NOT NULL, status TEXT NOT NULL, total_cents INTEGER NOT NULL DEFAULT 0, external_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS claim_lines (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), procedure_system TEXT NOT NULL, procedure_code TEXT NOT NULL, modifier TEXT, diagnosis_code TEXT NOT NULL, units INTEGER NOT NULL, charge_cents INTEGER NOT NULL, authorization_id TEXT REFERENCES authorizations(id));
    CREATE TABLE IF NOT EXISTS claim_events (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), event_type TEXT NOT NULL, detail TEXT NOT NULL, occurred_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS denials (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), reason_code TEXT, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', received_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS appeals (id TEXT PRIMARY KEY, denial_id TEXT NOT NULL REFERENCES denials(id), status TEXT NOT NULL DEFAULT 'DRAFT', narrative TEXT NOT NULL, submitted_at TEXT, created_by TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), amount_cents INTEGER NOT NULL, adjustment_cents INTEGER NOT NULL DEFAULT 0, reference TEXT NOT NULL, posted_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, patient_id TEXT REFERENCES patients(id), kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN');
    CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL, resource_id TEXT NOT NULL, occurred_at TEXT NOT NULL);
  `);
  migrateClearinghouse(db);
  migrateCodeCoverage(db);
  return db;
}
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function seed(db) {
  if (db.prepare('SELECT count(*) AS n FROM organizations').get().n) return;
  const org='demo-clinic', p='patient-001', doc='doctor-001', patientUser='portal-001', biller='biller-001';
  db.prepare('INSERT INTO organizations VALUES (?,?)').run(org,'ClinicCommand Demo Practice');
  db.prepare('INSERT INTO patients VALUES (?,?,?,?,?,?,?)').run(p,org,'Jordan Sample','1988-04-12','DEMO-001','Example Health Plan','DEMO-MEMBER-001');
  for(const [id,email,name,role,patientId] of [[doc,'doctor@example.test','Dr. Avery Demo','PHYSICIAN',null],[patientUser,'patient@example.test','Jordan Sample','PATIENT',p],[biller,'biller@example.test','Morgan Biller','BILLER',null]]) {
    db.prepare('INSERT INTO users (id,org_id,patient_id,email,name,role,password_hash) VALUES (?,?,?,?,?,?,?)').run(id,org,patientId,email,name,role,passwordHash('DemoOnly!ChangeMe123'));
  }
  db.prepare('INSERT INTO appointments VALUES (?,?,?,?,?,?)').run('appt-001',org,p,doc,new Date(Date.now()+86400000).toISOString(),'SCHEDULED');
  db.prepare('INSERT INTO encounters (id,org_id,patient_id,clinician_id,date_of_service) VALUES (?,?,?,?,?)').run('enc-001',org,p,doc,new Date().toISOString().slice(0,10));
  db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?)').run('task-001',org,p,'CALLBACK','Confirm follow-up appointment','OPEN');
}
export function audit(db,user,action,resource,id){ db.prepare('INSERT INTO audit_log VALUES (?,?,?,?,?,?,?)').run(uid(),user.org_id,user.id,action,resource,id,now()); }
