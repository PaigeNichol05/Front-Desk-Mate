import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, seed } from '../src/db.js';
import { recordVitals, vitalHistory } from '../src/vitals.js';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'vitals-')), path = join(dir, 'db');
  let db = openDb(path); seed(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { get db() { return db; }, restart() { db.close(); db = openDb(path); },
    doctor: { id: 'doctor-001', org_id: 'demo-clinic' }, patient: { id: 'portal-001', org_id: 'demo-clinic' }, biller: { id: 'biller-001', org_id: 'demo-clinic' } };
}
const manual = () => ({ source: 'MANUAL', systolic: 121, diastolic: 78, heart_rate: 74, measured_at: new Date().toISOString(), source_reference: 'Fictional sample cuff A', position: 'SEATED', arm: 'LEFT', reviewed: true });
test('historical open encounters accept dated fictional samples after restart without changing the recording time', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-17T14:30:00.000Z') });
  const f = setup(t);
  t.mock.timers.setTime(Date.parse('2026-10-18T12:00:00.000Z'));
  f.restart();
  const result = recordVitals(f.db, f.doctor, 'enc-001', {
    source: 'SIMULATED_DEVICE', reviewed: true, measured_at: '2099-01-01T00:00:00.000Z',
    systolic: 250, source_reference: 'Not an actual connected device'
  });
  const view = vitalHistory(f.db, f.patient, 'enc-001'), [sample] = view.history;
  assert.equal(result.simulated, true);
  assert.equal(sample.measured_at, '2026-10-17T00:00:00.000Z');
  assert.equal(sample.recorded_at, '2026-10-18T12:00:00.000Z');
  assert.equal(sample.source, 'SIMULATED_DEVICE');
  assert.equal(sample.source_reference, 'FIXED_VITALS_FIXTURE_V1');
  assert.deepEqual([sample.systolic, sample.diastolic, sample.heart_rate], [118, 76, 72]);
  assert.equal(view.device_connected, false);
  assert.equal(view.continuous_monitoring, false);
  assert.match(view.notice, /fixed fictional values/);
  assert.equal(f.db.prepare("SELECT occurred_at FROM audit_log WHERE action='RECORD_VITALS'").get().occurred_at, sample.recorded_at);
});
test('same-day fictional samples remain valid at UTC midnight and the end of the day', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-18T00:00:00.000Z') });
  const f = setup(t);
  for (const time of ['2026-10-18T00:00:00.000Z', '2026-10-18T23:59:59.999Z']) {
    t.mock.timers.setTime(Date.parse(time));
    const result = recordVitals(f.db, f.doctor, 'enc-001', { source: 'SIMULATED_DEVICE', reviewed: true });
    const sample = vitalHistory(f.db, f.doctor, 'enc-001').history.find(v => v.id === result.id);
    assert.equal(sample.measured_at, '2026-10-18T00:00:00.000Z');
    assert.equal(sample.recorded_at, time);
  }
});
test('fictional samples still reject future encounter dates and impossible calendar dates without writes', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-18T12:00:00.000Z') });
  const f = setup(t);
  for (const date of ['2026-10-19', '2026-02-30']) {
    f.db.prepare("UPDATE encounters SET date_of_service=? WHERE id='enc-001'").run(date);
    assert.throws(() => recordVitals(f.db, f.doctor, 'enc-001', { source: 'SIMULATED_DEVICE', reviewed: true }),
      err => err.status === 400 && /valid measurement timestamp, not in the future/.test(err.message));
  }
  assert.equal(f.db.prepare('SELECT count(*) n FROM vital_observations').get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_log WHERE action='RECORD_VITALS'").get().n, 0);
});
test('manual measurements preserve supplied values and historical time while date and future-time validation remain enforced', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-18T12:00:00.000Z') });
  const f = setup(t), measuredAt = '2026-10-17T09:15:30.123Z';
  f.db.exec("UPDATE encounters SET date_of_service='2026-10-17' WHERE id='enc-001'");
  const result = recordVitals(f.db, f.doctor, 'enc-001', { ...manual(), measured_at: measuredAt });
  const [reading] = vitalHistory(f.db, f.doctor, 'enc-001').history;
  assert.equal(result.simulated, false);
  assert.equal(reading.source, 'MANUAL');
  assert.equal(reading.source_reference, 'Fictional sample cuff A');
  assert.equal(reading.measured_at, measuredAt);
  assert.equal(reading.recorded_at, '2026-10-18T12:00:00.000Z');
  assert.deepEqual([reading.systolic, reading.diastolic, reading.heart_rate], [121, 78, 74]);
  assert.throws(() => recordVitals(f.db, f.doctor, 'enc-001', manual()),
    err => err.status === 400 && /Measurement date must match/.test(err.message));
  f.db.exec("UPDATE encounters SET date_of_service='2026-10-18' WHERE id='enc-001'");
  assert.throws(() => recordVitals(f.db, f.doctor, 'enc-001', { ...manual(), measured_at: '2026-10-18T12:00:00.001Z' }),
    err => err.status === 400 && /not in the future/.test(err.message));
  assert.throws(() => recordVitals(f.db, f.doctor, 'enc-001', { ...manual(), source: 'LIVE_DEVICE' }),
    err => err.status === 400 && /their source/.test(err.message));
  assert.equal(f.db.prepare('SELECT count(*) n FROM vital_observations').get().n, 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_log WHERE action='RECORD_VITALS'").get().n, 1);
});
test('historical signed and checked-out encounters reject manual and fictional additions and corrections', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-18T12:00:00.000Z') });
  const f = setup(t), measuredAt = '2026-10-17T09:00:00.000Z';
  f.db.exec("UPDATE encounters SET date_of_service='2026-10-17' WHERE id='enc-001'");
  const first = recordVitals(f.db, f.doctor, 'enc-001', { ...manual(), measured_at: measuredAt });
  for (const status of ['SIGNED', 'CHECKED_OUT']) {
    f.db.prepare("UPDATE encounters SET status=? WHERE id='enc-001'").run(status);
    for (const source of ['MANUAL', 'SIMULATED_DEVICE']) {
      for (const supersedes_id of [undefined, first.id]) {
        assert.throws(() => recordVitals(f.db, f.doctor, 'enc-001', {
          ...manual(), source, measured_at: measuredAt, supersedes_id, notes: 'Fictional correction'
        }), err => err.status === 409 && /locked/.test(err.message));
      }
    }
    assert.equal(vitalHistory(f.db, f.patient, 'enc-001').history.length, 1);
  }
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_log WHERE action IN ('RECORD_VITALS','CORRECT_VITALS')").get().n, 1);
});
test('blood pressure and pulse preserve units, source, time, immutable corrections and own-patient visibility after restart', t => {
  const f = setup(t), first = recordVitals(f.db, f.doctor, 'enc-001', manual());
  const second = recordVitals(f.db, f.doctor, 'enc-001', { ...manual(), systolic: 119, supersedes_id: first.id, notes: 'Corrected fictional transcription.' });
  assert.throws(() => recordVitals(f.db, f.doctor, 'enc-001', { ...manual(), supersedes_id: first.id, notes: 'Stale correction' }), /current observation/);
  assert.throws(() => f.db.exec('DELETE FROM vital_observations'), /immutable/);
  assert.throws(() => f.db.exec('UPDATE vital_observations SET systolic=1'), /immutable/);
  f.restart();
  const d = vitalHistory(f.db, f.patient, 'enc-001');
  assert.equal(d.history.length, 2);
  assert.equal(d.history.find(v => v.id === second.id).current, 1);
  assert.equal(d.history.find(v => v.id === first.id).current, 0);
  assert.equal(d.history.find(v => v.id === first.id).systolic, 121);
  assert.equal(d.blood_pressure_unit, 'mmHg');
  assert.equal(d.heart_rate_unit, 'beats/min');
  assert.equal(d.device_connected, false);
  assert.equal(d.continuous_monitoring, false);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_log WHERE action='CORRECT_VITALS'").get().n, 1);
});
test('partial observations, invalid readings, timestamp and correction validation never fabricate missing values', t => {
  const f = setup(t);
  for (const bad of [{ reviewed: false }, { systolic: null }, { heart_rate: 0 }, { systolic: '121' }, { diastolic: 140 }, { measured_at: '2026-02-30T00:00:00.000Z' }, { measured_at: '2099-01-01T00:00:00.000Z' }, { position: 'unknown' }, { source: 'LIVE_DEVICE' }]) assert.throws(() => recordVitals(f.db, f.doctor, 'enc-001', { ...manual(), ...bad }));
  recordVitals(f.db, f.doctor, 'enc-001', { ...manual(), systolic: null, diastolic: null });
  const d = vitalHistory(f.db, f.doctor, 'enc-001');
  assert.equal(d.history[0].systolic, null);
  assert.equal(d.history[0].heart_rate, 74);
  assert.throws(() => recordVitals(f.db, f.doctor, 'enc-001', { ...manual(), supersedes_id: d.history[0].id }), /reason/);
  recordVitals(f.db, f.doctor, 'enc-001', { source: 'SIMULATED_DEVICE', reviewed: true, systolic: 250 });
  const sample = vitalHistory(f.db, f.doctor, 'enc-001').history.find(v => v.source === 'SIMULATED_DEVICE');
  assert.equal(sample.systolic, 118); assert.equal(sample.heart_rate, 72);
  assert.equal(sample.source_reference, 'FIXED_VITALS_FIXTURE_V1');
});
test('only assigned active clinician can write in open encounter; organization, patient and signed-chart boundaries apply', t => {
  const f = setup(t);
  for (const u of [f.patient, f.biller]) assert.throws(() => recordVitals(f.db, u, 'enc-001', manual()), /permission/);
  assert.throws(() => vitalHistory(f.db, f.biller, 'enc-001'), /permission/);
  f.db.exec("INSERT INTO patients VALUES ('patient-2','demo-clinic','Other sample','1990-01-01','DEMO-2',NULL,NULL); INSERT INTO encounters(id,org_id,patient_id,clinician_id,date_of_service) VALUES ('enc-2','demo-clinic','patient-2','doctor-001','2026-10-17');");
  assert.throws(() => vitalHistory(f.db, f.patient, 'enc-2'), /Only this patient/);
  const first = recordVitals(f.db, f.doctor, 'enc-001', manual());
  assert.throws(() => recordVitals(f.db, f.doctor, 'enc-2', { ...manual(), supersedes_id: first.id }), /current observation|Measurement date/);
  f.db.exec("INSERT INTO organizations VALUES ('other','Other'); INSERT INTO users(id,org_id,email,name,role,password_hash) VALUES ('other','other','other@test','Other','PHYSICIAN','x');");
  assert.throws(() => vitalHistory(f.db, { id: 'other', org_id: 'other' }, 'enc-001'), /not found/);
  const original = f.db.prepare('SELECT * FROM vital_observations WHERE id=?').get(first.id);
  const forged = { ...original, id: 'cross-vital', org_id: 'other', recorded_by: 'other' };
  assert.throws(() => f.db.prepare(`INSERT INTO vital_observations (${Object.keys(forged).join(',')}) VALUES (${Object.keys(forged).map(() => '?').join(',')})`).run(...Object.values(forged)), /FOREIGN KEY/);
  f.db.exec("UPDATE encounters SET status='SIGNED' WHERE id='enc-001'");
  assert.throws(() => recordVitals(f.db, f.doctor, 'enc-001', manual()), /locked/);
  assert.equal(vitalHistory(f.db, f.patient, 'enc-001').history.length, 1);
  f.db.exec("UPDATE users SET active=0 WHERE id='doctor-001'");
  assert.throws(() => vitalHistory(f.db, f.doctor, 'enc-001'), /permission/);
});
