import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seed } from '../src/db.js';
import { recordService } from '../src/appointment-coding.js';
import { draftAuthorization, authorizationDrafts } from '../src/authorization-planning.js';

const service = { source_section_id:'plan', category:'MEDICATION', state:'ORDERED', description:'Fictional planned medication, not administered', indication:'Fictional documented indication', drug:'Sample medication', dose:'Sample dose from source note', route:'Sample route', reviewed:true };
const context = { encounter_id:'enc-001', proposed_service_date:'2026-10-18', plan_reference:'Fictional exact plan', procedure_system:'HCPCS', procedure_code:'J3301', diagnosis_code:'M54.50', units:1, modifier:'', place_of_service:'11', reviewed:true };
function fixture(t){t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-18T12:00:00Z')});const db=openDb(':memory:');seed(db);t.after(()=>db.close());db.exec("UPDATE encounters SET date_of_service='2026-10-18' WHERE id='enc-001'; INSERT INTO clinical_sections VALUES ('plan','enc-001','PLAN','Fictional planned medication; not administered.','doctor-001','2026-10-18T00:00:00Z')");const doctor={id:'doctor-001',org_id:'demo-clinic'},biller={id:'biller-001',org_id:'demo-clinic'};return {db,doctor,biller,patient:{id:'portal-001',org_id:'demo-clinic'},s:recordService(db,doctor,'enc-001',service)}}
test('planned-service worksheet preserves source evidence and codes without implying approval, AI extraction, performance or submission',t=>{
  const f=fixture(t),draft=draftAuthorization(f.db,f.biller,{...context,service_id:f.s.id});
  assert.equal(draft.requirement,'UNKNOWN_PAYER_CHECK_REQUIRED');assert.equal(draft.decision,'NOT_REQUESTED');
  assert.equal(draft.transmitted,false);assert.equal(draft.official_payer_form,false);assert.equal(draft.ai_model_connected,false);
  assert.equal(draft.service.source_section_id,'plan');assert.equal(draft.service.state,'ORDERED');
  assert.equal(draft.professional_review_required,true);assert.ok(draft.missing_information.some(s=>s.includes('payer form')));
  assert.equal(f.db.prepare('SELECT count(*) n FROM claims').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM authorizations').get().n,0);
  assert.equal(authorizationDrafts(f.db,f.doctor,'enc-001').drafts[0].stale,false);
  assert.throws(()=>f.db.exec('DELETE FROM authorization_drafts'),/immutable/);
  assert.throws(()=>f.db.exec("UPDATE authorization_drafts SET snapshot_json='{}'"),/immutable/);
  recordService(f.db,f.doctor,'enc-001',{...service,state:'CANCELED',supersedes_id:f.s.id});
  assert.equal(authorizationDrafts(f.db,f.biller,'enc-001').drafts[0].stale,true);
  assert.throws(()=>draftAuthorization(f.db,f.biller,{...context,service_id:f.s.id}),/current clinician-documented order/);
});
test('authorization planning requires active staff, reviewed current orders and valid dated codes with tenant isolation',t=>{
  const f=fixture(t),b={...context,service_id:f.s.id};
  for(const changed of [{reviewed:false},{procedure_code:'ABCDE'},{procedure_system:'CPT',procedure_code:'00000'},{service_id:'foreign'}])assert.throws(()=>draftAuthorization(f.db,f.biller,{...b,...changed}));
  assert.throws(()=>draftAuthorization(f.db,f.patient,b),/permission/);assert.throws(()=>authorizationDrafts(f.db,f.patient,'enc-001'),/permission/);
  f.db.exec("INSERT INTO organizations VALUES ('other','Other'); INSERT INTO users(id,org_id,email,name,role,password_hash) VALUES ('other','other','other@test','Other','BILLER','x')");
  assert.throws(()=>authorizationDrafts(f.db,{id:'other',org_id:'other'},'enc-001'),/not found/);
  f.db.exec("UPDATE users SET active=0 WHERE id='biller-001'");assert.throws(()=>draftAuthorization(f.db,f.biller,b),/permission/);
});
