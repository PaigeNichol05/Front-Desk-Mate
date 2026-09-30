import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, statSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, seed } from '../src/db.js';
import { createAudioService, syntheticWav } from '../src/audio.js';
function setup(t, options={}) {
  const dir=mkdtempSync(join(tmpdir(),'fictional-audio-')),path=join(dir,'db.sqlite'),db=openDb(path);seed(db);
  const doctor=db.prepare("SELECT * FROM users WHERE id='doctor-001'").get(), patient=db.prepare("SELECT * FROM users WHERE id='portal-001'").get(),biller=db.prepare("SELECT * FROM users WHERE id='biller-001'").get();
  let at='2026-09-30T12:00:00.000Z';
  const clock=()=>at,service=createAudioService(db,join(dir,'audio'),{enabled:true,clock,...options});
  t.after(()=>{try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})});
  const create=()=>service.create(doctor,'enc-001',{fictional:true});
  const agree=(u,id,decision='AGREED')=>service.consent(u,id,{decision,statement_version:'FICTIONAL_AUDIO_V1'});
  const draft=()=>{const r=create();agree(patient,r.id);agree(doctor,r.id);service.action(doctor,r.id,'start');service.action(doctor,r.id,'complete');return r};
  return {db,dir,path,doctor,patient,biller,service,create,agree,draft,clock,setTime:value=>{at=value}};
}
const status=n=>e=>e.status===n;
test('full lifecycle: both authenticated participants, review, release, audit, durable restart',t=>{
  const s=setup(t),r=s.create();
  assert.throws(()=>s.service.action(s.doctor,r.id,'start'),status(409));
  s.agree(s.patient,r.id);assert.equal(s.service.list(s.doctor,'enc-001')[0].state,'CONSENT_PENDING');s.agree(s.doctor,r.id);
  s.service.action(s.doctor,r.id,'start');s.service.action(s.doctor,r.id,'complete');
  assert.throws(()=>s.service.read(s.patient,r.id),status(403));
  assert.throws(()=>s.service.action(s.doctor,r.id,'publish'),status(409));
  assert.deepEqual(s.service.read(s.doctor,r.id).data,syntheticWav());
  s.service.action(s.doctor,r.id,'approve');s.service.action(s.doctor,r.id,'publish');
  s.db.close();const db=openDb(s.path);t.after(()=>db.close());const service=createAudioService(db,join(s.dir,'audio'),{enabled:true,clock:s.clock});
  assert.deepEqual(service.read(s.patient,r.id,true).data,syntheticWav());
  const meta=service.list(s.patient,'enc-001')[0];assert.equal(meta.state,'PUBLISHED');assert.equal(meta.storage_key,undefined);assert.equal(meta.consents.length,2);assert.equal(meta.approved_by,s.doctor.id);assert.equal(meta.published_by,s.doctor.id);
  assert.equal(statSync(join(s.dir,'audio')).mode&0o777,0o700);assert.equal(statSync(join(s.dir,'audio',readdirSync(join(s.dir,'audio'))[0])).mode&0o777,0o600);
  const events=service.events(s.doctor,r.id);for(const action of ['AUDIO_CREATED','AUDIO_CONSENT_AGREED','AUDIO_START','AUDIO_COMPLETE','AUDIO_APPROVE','AUDIO_PUBLISH','AUDIO_PLAYBACK','AUDIO_DOWNLOAD'])assert(events.some(e=>e.action===action));
  assert(db.prepare("SELECT count(*) n FROM audit_log WHERE resource='encounter_audio'").get().n>=events.length);
});
test('authorization denies biller/admin, unrelated patient/physician and other organization',t=>{
  const s=setup(t),r=s.draft();s.service.action(s.doctor,r.id,'approve');s.service.action(s.doctor,r.id,'publish');
  for(const user of [s.biller,{...s.doctor,role:'ADMIN'},{...s.patient,patient_id:'other'},{...s.doctor,id:'other'},{...s.patient,org_id:'other'}]) {
    for(const fn of [()=>s.service.list(user,'enc-001'),()=>s.service.read(user,r.id),()=>s.service.consent(user,r.id,{decision:'WITHDRAWN',statement_version:'FICTIONAL_AUDIO_V1'}),()=>s.service.action(user,r.id,'delete'),()=>s.service.events(user,r.id)])assert.throws(fn,e=>[403,404].includes(e.status));
  }
  assert.throws(()=>s.service.action(s.patient,r.id,'delete'),status(403));
  assert.throws(()=>s.service.events(s.patient,r.id),status(403));
  assert.throws(()=>s.service.create(s.patient,'enc-001',{fictional:true}),status(403));
});
test('strict fixture boundary, opt in and no arbitrary participant/audio input',t=>{
  const s=setup(t);
  const disabled=createAudioService(s.db,join(s.dir,'disabled'));
  assert.throws(()=>disabled.create(s.doctor,'enc-001',{fictional:true}),status(403));
  for(const b of [{},{fictional:false},{fictional:true,data:'speech'},{fictional:true,participants:['outsider']}])assert.throws(()=>s.service.create(s.doctor,'enc-001',b),status(400));
  s.db.prepare("INSERT INTO encounters (id,org_id,patient_id,clinician_id,date_of_service) VALUES ('other','demo-clinic','patient-001','doctor-001','2026-09-30')").run();
  assert.throws(()=>s.service.create(s.doctor,'other',{fictional:true}),status(403));
  const r=s.create();assert.throws(()=>s.create(),status(409));
  assert.throws(()=>s.service.consent(s.doctor,r.id,{decision:'AGREED',statement_version:'FICTIONAL_AUDIO_V1',participant_id:s.patient.patient_id}),status(400));
  assert.throws(()=>s.service.action(s.doctor,r.id,'complete',{data:'speech'}),status(400));
});
test('refusal never creates a file; stopped attempts cannot complete; withdrawal erases published content',t=>{
  const s=setup(t),r=s.create();s.agree(s.patient,r.id,'REFUSED');assert.equal(s.service.list(s.patient,'enc-001')[0].state,'REFUSED');assert.equal(readdirSync(join(s.dir,'audio')).length,0);assert.throws(()=>s.agree(s.patient,r.id),status(409));
  const r2=s.create();s.agree(s.patient,r2.id);s.agree(s.doctor,r2.id);s.service.action(s.doctor,r2.id,'start');s.service.action(s.doctor,r2.id,'stop');assert.throws(()=>s.service.action(s.doctor,r2.id,'complete'),status(409));
  const r3=s.draft();s.service.action(s.doctor,r3.id,'approve');s.service.action(s.doctor,r3.id,'publish');s.agree(s.patient,r3.id,'WITHDRAWN');assert.throws(()=>s.service.read(s.patient,r3.id),status(409));assert.equal(readdirSync(join(s.dir,'audio')).length,0);
});
test('retention and interrupted attempt sweep fail closed and remain idempotent',t=>{
  const s=setup(t),r=s.draft();s.service.action(s.doctor,r.id,'approve');s.service.action(s.doctor,r.id,'publish');s.setTime('2026-10-07T12:00:00.000Z');assert.throws(()=>s.service.read(s.patient,r.id),status(410));assert.equal(s.service.sweep().processed,1);assert.equal(s.service.sweep().processed,0);assert.equal(readdirSync(join(s.dir,'audio')).length,0);
  const r2=s.create();s.agree(s.patient,r2.id);s.agree(s.doctor,r2.id);s.service.action(s.doctor,r2.id,'start');s.setTime('2026-10-07T12:01:01.000Z');assert.throws(()=>s.service.action(s.doctor,r2.id,'complete'),status(409));assert.equal(s.service.sweep().processed,1);
});
test('failed physical deletion denies playback and retries without losing its storage key',t=>{
  let failing=true;const s=setup(t),r=s.draft();
  const service=createAudioService(s.db,join(s.dir,'audio'),{enabled:true,clock:s.clock,remove:path=>{if(failing)throw Object.assign(new Error('disk failure'),{code:'EACCES'});rmSync(path)}});
  const deleted=service.action(s.doctor,r.id,'delete');assert.equal(deleted.state,'DELETION_PENDING');assert.equal(readdirSync(join(s.dir,'audio')).length,1);assert.throws(()=>service.read(s.doctor,r.id),status(409));assert.equal(service.sweep().processed,0);failing=false;assert.equal(service.sweep().processed,1);assert.equal(readdirSync(join(s.dir,'audio')).length,0);
  assert.equal(service.action(s.doctor,r.id,'delete').state,'DELETED');
});
test('signed encounter blocks start and reassignment blocks stale access but not expiry deletion',t=>{
  const s=setup(t),r=s.create();s.agree(s.patient,r.id);s.agree(s.doctor,r.id);s.db.prepare("UPDATE encounters SET status='SIGNED' WHERE id='enc-001'").run();assert.throws(()=>s.service.action(s.doctor,r.id,'start'),status(409));
  s.db.prepare("UPDATE encounters SET status='OPEN' WHERE id='enc-001'").run();s.service.action(s.doctor,r.id,'start');s.service.action(s.doctor,r.id,'complete');s.db.prepare("UPDATE encounters SET clinician_id=NULL WHERE id='enc-001'").run();assert.throws(()=>s.service.read(s.patient,r.id),status(403));s.setTime('2026-10-08T12:00:00.000Z');assert.equal(s.service.sweep().processed,1);
});

test('invalid JSON values are rejected and failed DB commit removes new media',t=>{
  const s=setup(t);
  for(const b of [null,[],42,'speech'])assert.throws(()=>s.service.create(s.doctor,'enc-001',b),status(400));
  const r=s.create();s.agree(s.patient,r.id);s.agree(s.doctor,r.id);s.service.action(s.doctor,r.id,'start');
  s.db.exec("CREATE TRIGGER reject_audio_complete BEFORE INSERT ON audio_events WHEN NEW.action='AUDIO_COMPLETE' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.throws(()=>s.service.action(s.doctor,r.id,'complete'),/test failure/);
  assert.equal(s.service.list(s.doctor,'enc-001')[0].state,'RECORDING');assert.equal(readdirSync(join(s.dir,'audio')).length,0);
  assert.throws(()=>s.service.consent(s.patient,r.id,null),status(400));assert.throws(()=>s.service.action(s.doctor,r.id,'complete',null),status(400));
});


test('maintenance erases crashed orphan files, preserves linked media and unrelated files',t=>{
  const s=setup(t),r=s.draft();
  const dir=join(s.dir,'audio'),orphan=join(dir,'11111111-1111-1111-1111-111111111111'),other=join(dir,'operator-notes.txt');
  writeFileSync(orphan,syntheticWav());writeFileSync(other,'test');utimesSync(orphan,new Date('2026-09-29'),new Date('2026-09-29'));
  assert.equal(s.service.sweep().orphans,1);assert.equal(readdirSync(dir).length,2);assert.deepEqual(s.service.read(s.doctor,r.id).data,syntheticWav());
  const linked=s.db.prepare('SELECT storage_key FROM encounter_audio WHERE id=?').get(r.id).storage_key;
  writeFileSync(join(dir,linked),'corrupt');assert.throws(()=>s.service.read(s.doctor,r.id),status(500));
});
