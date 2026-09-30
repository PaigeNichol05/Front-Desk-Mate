// Synthetic demonstration only. No microphone, uploads, speech, or transcription.
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, chmodSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { uid, now, audit } from './db.js';

const error = (status, message) => Object.assign(new Error(message), { status });
const object = b => { if (!b || typeof b !== 'object' || Array.isArray(b)) throw error(400, 'JSON object required'); };
const terminal = new Set(['REFUSED', 'STOPPED', 'DELETION_PENDING', 'DELETED']);
export function syntheticWav() {
  const samples = 8000, data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(1200 * Math.sin(i * 2 * Math.PI * 440 / 8000)), 44 + i * 2);
  return data;
}
export function createAudioService(db, directory, { enabled = false, clock = now, remove = unlinkSync } = {}) {
  const dir = resolve(directory);
  if (enabled) { mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700); }
  db.exec(`
    CREATE TABLE IF NOT EXISTS encounter_audio (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id),
      org_id TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES patients(id),
      clinician_id TEXT NOT NULL REFERENCES users(id), created_by TEXT NOT NULL REFERENCES users(id),
      state TEXT NOT NULL CHECK(state IN ('CONSENT_PENDING','READY','RECORDING','DRAFT','APPROVED','PUBLISHED','REFUSED','STOPPED','DELETION_PENDING','DELETED')),
      source TEXT NOT NULL CHECK(source='SYNTHETIC_TONE_V1'), storage_key TEXT,
      mime TEXT NOT NULL DEFAULT 'audio/wav', bytes INTEGER NOT NULL DEFAULT 0, sha256 TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT,
      approved_at TEXT, approved_by TEXT REFERENCES users(id), published_at TEXT,
      published_by TEXT REFERENCES users(id), expires_at TEXT NOT NULL, deleted_at TEXT,
      deletion_reason TEXT
    );
    CREATE TABLE IF NOT EXISTS audio_consents (
      id TEXT PRIMARY KEY, audio_id TEXT NOT NULL REFERENCES encounter_audio(id),
      participant_id TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('AGREED','REFUSED','WITHDRAWN')),
      actor_id TEXT NOT NULL REFERENCES users(id), occurred_at TEXT NOT NULL,
      statement_version TEXT NOT NULL CHECK(statement_version='FICTIONAL_AUDIO_V1'),
      provenance TEXT NOT NULL CHECK(provenance='AUTHENTICATED_DEMO_SELF_ATTESTATION')
    );
    CREATE TABLE IF NOT EXISTS audio_events (
      id TEXT PRIMARY KEY, audio_id TEXT NOT NULL REFERENCES encounter_audio(id),
      actor_id TEXT NOT NULL, action TEXT NOT NULL, occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audio_encounter_idx ON encounter_audio(encounter_id);
    CREATE INDEX IF NOT EXISTS audio_expiry_idx ON encounter_audio(expires_at);
  `);
  function gate() { if (!enabled) throw error(403, 'Synthetic audio demo is disabled'); }
  function tx(fn) { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  function event(u, row, action) {
    db.prepare('INSERT INTO audio_events VALUES (?,?,?,?,?)').run(uid(), row.id, u.id, action, clock());
    audit(db, u, action, 'encounter_audio', row.id);
  }
  function encounter(u, id) {
    gate();
    const e = db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(id, u.org_id);
    if (!e) throw error(404, 'Encounter not found');
    if (!(u.role === 'PHYSICIAN' && e.clinician_id === u.id) && !(u.role === 'PATIENT' && e.patient_id === u.patient_id)) throw error(403, 'Audio access denied');
    return e;
  }
  function get(u, id) {
    gate();
    const r = db.prepare('SELECT * FROM encounter_audio WHERE id=? AND org_id=?').get(id, u.org_id);
    if (!r) throw error(404, 'Audio not found');
    const e = encounter(u, r.encounter_id);
    if (e.patient_id !== r.patient_id || e.clinician_id !== r.clinician_id) throw error(403, 'Audio assignment changed');
    return r;
  }
  function physician(u) { if (u.role !== 'PHYSICIAN') throw error(403, 'Assigned physician required'); }
  function valid(r) {
    if (terminal.has(r.state)) throw error(409, 'Audio is no longer available');
    if (r.expires_at <= clock()) throw error(410, 'Audio expired');
  }
  function update(u, r, state, action) {
    db.prepare('UPDATE encounter_audio SET state=?,updated_at=? WHERE id=?').run(state, clock(), r.id);
    event(u, r, action);
  }
  function consentRows(id) { return db.prepare('SELECT participant_id,decision,actor_id,occurred_at,statement_version,provenance FROM audio_consents WHERE audio_id=? ORDER BY rowid').all(id); }
  function agreed(r) {
    const latest = new Map(consentRows(r.id).map(c => [c.participant_id, c.decision]));
    return [r.patient_id, r.clinician_id].every(id => latest.get(id) === 'AGREED');
  }
  function view(r) {
    const { storage_key, ...metadata } = r;
    return { ...metadata, fictional: true, participants: [r.patient_id, r.clinician_id], consents: consentRows(r.id), available: ['DRAFT','APPROVED','PUBLISHED'].includes(r.state) && r.expires_at > clock() };
  }
  // First commit a tombstone to deny reads; physical deletion can then be retried safely.
  function requestDelete(u, r, reason, finalState = 'DELETED') {
    tx(() => {
      db.prepare('UPDATE encounter_audio SET state=?,deletion_reason=?,updated_at=? WHERE id=?').run('DELETION_PENDING', reason, clock(), r.id);
      event(u, r, 'AUDIO_DELETE_REQUESTED');
    });
    try { if (r.storage_key) remove(join(dir, r.storage_key)); }
    catch (e) { if (e.code !== 'ENOENT') return view(get(u, r.id)); }
    tx(() => {
      db.prepare('UPDATE encounter_audio SET state=?,storage_key=NULL,bytes=0,sha256=NULL,deleted_at=?,updated_at=? WHERE id=?').run(finalState, clock(), clock(), r.id);
      event(u, r, 'AUDIO_DELETED');
    });
    return view(get(u, r.id));
  }
  return {
    create(u, encounterId, b) {
      object(b); const e = encounter(u, encounterId); physician(u);
      if (e.status !== 'OPEN') throw error(409, 'Open encounter required');
      if (b.fictional !== true || Object.keys(b).some(k => k !== 'fictional')) throw error(400, 'Only the fixed fictional two-participant demo is supported');
      // Restrict to the repository's seeded specimen, never arbitrary clinical records.
      if (e.id !== 'enc-001' || e.patient_id !== 'patient-001' || e.clinician_id !== 'doctor-001' || e.org_id !== 'demo-clinic') throw error(403, 'Only the seeded fictional encounter supports audio');
      return tx(() => {
        if (db.prepare("SELECT id FROM encounter_audio WHERE encounter_id=? AND state NOT IN ('REFUSED','STOPPED','DELETED')").get(e.id)) throw error(409, 'An active audio attempt already exists');
        const id = uid(), at = clock(), expires = new Date(Date.parse(at) + 7 * 86400000).toISOString();
        db.prepare(`INSERT INTO encounter_audio (id,encounter_id,org_id,patient_id,clinician_id,created_by,state,source,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,'CONSENT_PENDING','SYNTHETIC_TONE_V1',?,?,?)`).run(id,e.id,u.org_id,e.patient_id,e.clinician_id,u.id,at,at,expires);
        const r = get(u,id); event(u,r,'AUDIO_CREATED'); return view(r);
      });
    },
    list(u, id) {
      encounter(u,id);
      return tx(() => db.prepare('SELECT * FROM encounter_audio WHERE encounter_id=? ORDER BY created_at').all(id).map(r => { get(u,r.id); event(u,r,'AUDIO_METADATA_VIEW'); return view(r); }));
    },
    consent(u, id, b) {
      object(b); const r = get(u,id); valid(r);
      const participant = u.role === 'PATIENT' ? u.patient_id : u.id;
      if (!['AGREED','REFUSED','WITHDRAWN'].includes(b.decision) || b.statement_version !== 'FICTIONAL_AUDIO_V1' || Object.keys(b).some(k => !['decision','statement_version'].includes(k))) throw error(400, 'Invalid consent decision or statement');
      if (b.decision === 'AGREED' && !['CONSENT_PENDING','READY'].includes(r.state)) throw error(409, 'Consent is locked after start');
      if (u.role === 'PATIENT' && ['DRAFT','APPROVED'].includes(r.state) && b.decision === 'REFUSED') throw error(409, 'Use WITHDRAWN to revoke consent');
      tx(() => {
        db.prepare('INSERT INTO audio_consents VALUES (?,?,?,?,?,?,?,?)').run(uid(),r.id,participant,b.decision,u.id,clock(),'FICTIONAL_AUDIO_V1','AUTHENTICATED_DEMO_SELF_ATTESTATION');
        event(u,r,'AUDIO_CONSENT_' + b.decision);
        if (b.decision === 'AGREED') update(u,r,agreed(r) ? 'READY' : 'CONSENT_PENDING','AUDIO_CONSENT_UPDATED');
        else db.prepare("UPDATE encounter_audio SET state='DELETION_PENDING',deletion_reason=?,updated_at=? WHERE id=?").run(b.decision,clock(),r.id);
      });
      return b.decision === 'AGREED' ? view(get(u,id)) : requestDelete(u,get(u,id),b.decision,'REFUSED');
    },
    action(u, id, action, b = {}) {
      object(b); const r = get(u,id); physician(u);
      if (Object.keys(b).length) throw error(400, 'Audio input and extra fields are forbidden');
      if (action === 'delete') return r.state === 'DELETED' ? view(r) : requestDelete(u,r,'PHYSICIAN_DELETE');
      valid(r);
      if (action === 'stop') {
        if (!['CONSENT_PENDING','READY','RECORDING'].includes(r.state)) throw error(409, 'Only an unfinished attempt can be stopped; delete saved audio instead');
        return requestDelete(u,r,'STOPPED','STOPPED');
      }
      const transitions = { start:['READY','RECORDING'], complete:['RECORDING','DRAFT'], approve:['DRAFT','APPROVED'], publish:['APPROVED','PUBLISHED'] };
      const transition = transitions[action];
      if (!transition) throw error(404, 'Unknown audio action');
      if (r.state !== transition[0] || !agreed(r)) throw error(409, 'Invalid audio transition or missing consent');
      if (action === 'start' && db.prepare('SELECT status FROM encounters WHERE id=?').get(r.encounter_id).status !== 'OPEN') throw error(409, 'Open encounter required');
      let key;
      try {
        return tx(() => {
          if (action === 'complete') {
            if (Date.parse(clock()) - Date.parse(r.started_at) > 60000) throw error(409, 'Synthetic attempt timed out; stop and retry');
            const bytes = syntheticWav(); key = uid();
            writeFileSync(join(dir,key),bytes,{flag:'wx',mode:0o600,flush:true});
            db.prepare('UPDATE encounter_audio SET storage_key=?,bytes=?,sha256=?,completed_at=? WHERE id=?').run(key,bytes.length,createHash('sha256').update(bytes).digest('hex'),clock(),id);
          }
          if (action === 'start') db.prepare('UPDATE encounter_audio SET started_at=? WHERE id=?').run(clock(),id);
          if (action === 'approve') db.prepare('UPDATE encounter_audio SET approved_by=?,approved_at=? WHERE id=?').run(u.id,clock(),id);
          if (action === 'publish') db.prepare('UPDATE encounter_audio SET published_by=?,published_at=? WHERE id=?').run(u.id,clock(),id);
          update(u,r,transition[1],'AUDIO_' + action.toUpperCase()); return view(get(u,id));
        });
      } catch (e) { if (key) { try { remove(join(dir,key)); } catch { /* orphan sweep below */ } } throw e; }
    },
    read(u, id, download = false) {
      const r = get(u,id); valid(r);
      if (!['DRAFT','APPROVED','PUBLISHED'].includes(r.state) || u.role === 'PATIENT' && r.state !== 'PUBLISHED') throw error(403, 'Audio has not been released to this user');
      const data = readFileSync(join(dir,r.storage_key));
      if (createHash('sha256').update(data).digest('hex') !== r.sha256) throw error(500, 'Audio integrity check failed');
      tx(() => event(u,r,download ? 'AUDIO_DOWNLOAD' : 'AUDIO_PLAYBACK'));
      return { data, mime:r.mime };
    },
    events(u,id) { const r = get(u,id); physician(u); return tx(() => { event(u,r,'AUDIO_AUDIT_VIEW'); return db.prepare('SELECT actor_id,action,occurred_at FROM audio_events WHERE audio_id=? ORDER BY rowid').all(id); }); },
    sweep() {
      gate();
      let processed = 0;
      for (const r of db.prepare("SELECT * FROM encounter_audio WHERE state='DELETION_PENDING' OR (state NOT IN ('DELETED','REFUSED','STOPPED') AND (expires_at<=? OR (state='RECORDING' AND started_at<=?)))").all(clock(),new Date(Date.parse(clock())-60000).toISOString())) {
        const u = { id:r.clinician_id,org_id:r.org_id,role:'PHYSICIAN' };
        // No reassignment check in maintenance: expiry must still erase inaccessible files.
        tx(() => { db.prepare("UPDATE encounter_audio SET state='DELETION_PENDING',deletion_reason=COALESCE(deletion_reason,?),updated_at=? WHERE id=?").run(r.expires_at<=clock()?'RETENTION_EXPIRED':'INTERRUPTED_ATTEMPT',clock(),r.id); event(u,r,'AUDIO_DELETE_REQUESTED'); });
        try { if (r.storage_key) remove(join(dir,r.storage_key)); } catch (e) { if (e.code !== 'ENOENT') continue; }
        tx(() => { db.prepare("UPDATE encounter_audio SET state='DELETED',storage_key=NULL,bytes=0,sha256=NULL,deleted_at=?,updated_at=? WHERE id=?").run(clock(),clock(),r.id); event(u,r,'AUDIO_DELETED'); });
        processed++;
      }
      // A crash between file creation and the SQLite commit may leave an orphan.
      // Only UUID-named regular files older than a minute are eligible; linked files
      // and unrelated files are never touched. Use one server per storage volume.
      const linked = new Set(db.prepare('SELECT storage_key FROM encounter_audio WHERE storage_key IS NOT NULL').all().map(r => r.storage_key));
      let orphans = 0;
      for (const name of readdirSync(dir)) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(name) || linked.has(name)) continue;
        try {
          const path = join(dir,name), stat = lstatSync(path);
          if (stat.isFile() && stat.mtimeMs < Date.parse(clock()) - 60000) { remove(path); orphans++; }
        } catch { /* Retry on the next maintenance pass. */ }
      }
      return { processed, orphans };
    }
  };
}
