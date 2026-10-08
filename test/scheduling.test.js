import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb,seed } from '../src/db.js';
import { createScheduling } from '../src/scheduling.js';
const user={id:'doctor-001',org_id:'demo-clinic',role:'PHYSICIAN'};
function setup(t){const dir=mkdtempSync(join(tmpdir(),'schedule-'));const db=openDb(join(dir,'db'));seed(db);t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true})});return {db,s:createScheduling(db)};}
function booking(extra={}){return {patient_id:'patient-001',clinician_id:'doctor-001',starts_at:new Date(Date.now()+7*86400000).toISOString(),duration_minutes:30,visit_type:'Follow-up',...extra};}
test('booking is persisted; overlap blocked; reschedule then cancel retained with audit',t=>{
 const {db,s}=setup(t),b=booking(),a=s.save(user,b);
 assert.equal(createScheduling(db).list(user).find(x=>x.id===a.id).duration_minutes,30);
 assert.throws(()=>s.save(user,b),e=>e.status===409);
 s.save(user,{...b,starts_at:new Date(Date.parse(b.starts_at)+3600000).toISOString()},a.id);
 s.transition(user,a.id,'cancel');
 assert.equal(s.list(user).find(x=>x.id===a.id).status,'CANCELLED');
 assert.equal(db.prepare('SELECT count(*) n FROM audit_log WHERE resource_id=?').get(a.id).n,3);
 assert.throws(()=>s.save(user,b,a.id),e=>e.status===409);
});
test('check-in creates one linked encounter and prevents duplicate or out-of-order actions',t=>{
 const {db,s}=setup(t),a=s.save(user,booking());
 assert.throws(()=>s.transition(user,a.id,'room'),e=>e.status===409);
 const checked=s.transition(user,a.id,'check-in');assert(checked.encounter_id);
 assert.throws(()=>s.transition(user,a.id,'check-in'),e=>e.status===409);
 assert.equal(db.prepare('SELECT count(*) n FROM encounters WHERE appointment_id=?').get(a.id).n,1);
 s.transition(user,a.id,'room');assert.equal(s.list(user).find(x=>x.id===a.id).status,'ROOMED');
});
test('patients cannot alter schedule; other organizations cannot read or change appointments',t=>{
 const {s}=setup(t),a=s.save(user,booking()),other={...user,org_id:'other'};
 assert.deepEqual(s.list(other),[]);
 assert.throws(()=>s.transition(other,a.id,'cancel'),e=>e.status===404);
 assert.throws(()=>s.save(other,booking()),e=>e.status===400);
 assert.throws(()=>s.list({...user,role:'PATIENT'}),e=>e.status===403);
 assert.throws(()=>s.save({...user,role:'PATIENT'},booking()),e=>e.status===403);
});
test('invalid time, duration, visit type and nonclinical provider rejected without writes',t=>{
 const {s}=setup(t),before=s.list(user).length;
 for(const change of [{starts_at:'invalid'},{starts_at:'2030-01-01T10:00'},{duration_minutes:0},{duration_minutes:30.5},{visit_type:'Made up'},{clinician_id:'biller-001'}])assert.throws(()=>s.save(user,booking(change)),e=>e.status===400);
 assert.equal(s.list(user).length,before);
});
