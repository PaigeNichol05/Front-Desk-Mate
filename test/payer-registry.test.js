import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDb,seed} from '../src/db.js';
import {createPayerRegistry,JURISDICTIONS,POLICY_CHECKS,TRANSACTION_CHECKS} from '../src/payer-registry.js';
const identity={payer_name:'Fictional Payer',group_id:'MEDICAID',product:'Fictional CO product',jurisdiction:'CO',vendor:'Fictional Directory',payer_id:'00540',provider_context:'Fictional practice',service_scope:'Fictional outpatient imaging; identifiers only',reviewed:true};
const evidence={kind:'POLICY',category:'MEDICAL',status:'CHECKED',source_url:'https://example.test/policy',source_reference:'Fictional fixture v1',published_on:'2026-11-01',effective_from:'2026-11-01',notes:'Fictional conditional criteria only',reviewed:true,request_key:'one',expected_latest_id:null};
function setup(t){
  const dir=mkdtempSync(join(tmpdir(),'payer-registry-')),path=join(dir,'db');let db=openDb(path);seed(db);let time=Date.parse('2026-11-24T12:00:00Z');
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
  return {get db(){return db},get service(){return createPayerRegistry(db,{clock:()=>time})},biller:{id:'biller-001',org_id:'demo-clinic'},setTime(v){time=v},restart(){db.close();db=openDb(path)}};
}
test('all jurisdictions remain explicit census gaps; IDs preserve leading zeroes and namespaces',t=>{
  const f=setup(t),s=f.service;
  const {mapping:m}=s.create(f.biller,identity);
  assert.equal(m.payer_id,'00540');assert.equal(m.outstanding.length,14);
  assert.equal(s.create(f.biller,identity).duplicate,true);
  assert.notEqual(s.create(f.biller,{...identity,vendor:'Other directory'}).mapping.id,m.id);
  const v=s.view(f.biller);assert.equal(JURISDICTIONS.length,56);assert.equal(new Set(JURISDICTIONS).size,56);
  assert.equal(v.jurisdictions.find(j=>j.jurisdiction==='CO').mapping_count,2);
  assert(v.jurisdictions.every(j=>j.mco_inventory==='CENSUS_NOT_VERIFIED'));
  assert.equal(v.all_payers_complete,false);assert.equal(v.live_connection,'DISABLED');
});
test('latest failures override positives; retries deduplicate and conflicting edits reject',t=>{
  const f=setup(t),s=f.service,id=s.create(f.biller,identity).mapping.id;
  const first=s.record(f.biller,id,evidence);assert.equal(s.record(f.biller,id,evidence).duplicate,true);
  assert.throws(()=>s.record(f.biller,id,{...evidence,notes:'Changed'}),e=>e.status===409);
  assert.throws(()=>s.record(f.biller,id,{...evidence,request_key:'new'}),e=>e.status===409);
  s.record(f.biller,id,{...evidence,request_key:'failure',expected_latest_id:first.id,status:'INACCESSIBLE'});
  assert.equal(s.view(f.biller).mappings[0].policies[0].status,'INACCESSIBLE');
  f.restart();assert.equal(f.service.view(f.biller).mappings[0].history.length,2);
  assert.equal(f.service.view(f.biller).mappings[0].policies[0].resolved,false);
});
test('future policies preserve historical applicability, and observations expire after five days',t=>{
  const f=setup(t),s=f.service,id=s.create(f.biller,identity).mapping.id;
  const first=s.record(f.biller,id,{...evidence,effective_until:'2026-12-31'});
  s.record(f.biller,id,{...evidence,request_key:'future',expected_latest_id:first.id,effective_from:'2027-01-01',notes:'Future version'});
  assert.equal(s.view(f.biller,{service_date:'2026-12-01'}).mappings[0].policies[0].review.notes,evidence.notes);
  assert.equal(s.view(f.biller,{service_date:'2027-01-01'}).mappings[0].policies[0].review.notes,'Future version');
  f.setTime(Date.parse('2026-11-29T12:00:00Z'));
  assert.equal(s.view(f.biller).mappings[0].policies[0].status,'STALE');
});
test('scoped reviews never become coverage or live connections; enrollment remains separate',t=>{
  const f=setup(t),s=f.service,id=s.create(f.biller,identity).mapping.id;
  for(const category of POLICY_CHECKS)s.record(f.biller,id,{...evidence,category,request_key:category});
  for(const category of TRANSACTION_CHECKS)s.record(f.biller,id,{...evidence,kind:'TRANSACTION',category,status:'SUPPORTED',enrollment_status:'UNKNOWN',request_key:'txn'+category});
  const m=s.view(f.biller).mappings[0];assert.equal(m.status,'SCOPED_REVIEWS_RECORDED');assert.equal(m.enrollment_gaps.length,7);
  assert.equal(m.live_connection,'DISABLED');assert.equal(m.member_benefits,'NOT_VERIFIED');
  assert.throws(()=>s.record(f.biller,id,{...evidence,kind:'TRANSACTION',category:'CLAIMS',status:'ENROLLMENT_REQUIRED',enrollment_status:'NOT_REQUIRED',request_key:'conflict'}),/conflicts/);
  assert.throws(()=>s.record(f.biller,id,{...evidence,kind:'TRANSACTION',category:'CLAIMS',status:'SUPPORTED',enrollment_status:'STAFF_CONFIRMED',request_key:'missing'}),/enrollment_reference/);
});
test('fixed monitored source failures and byte changes reopen review holds',t=>{
  const f=setup(t),s=f.service,id=s.create(f.biller,identity).mapping.id;
  const record=(key,status,sha)=>f.db.prepare('INSERT INTO billing_audit_runs VALUES (?,?,?,?,?,?,?,?,?)').run(key,'demo-clinic','biller-001','STAFF_REQUEST','2026-11-24','2026-11-24','TEST',JSON.stringify([{id:'CMS_HCPCS',status,sha256:sha,checked_at:'2026-11-24T12:00:00Z'}]),'[]');
  record('a','BASELINE_RECORDED','a'.repeat(64));
  s.record(f.biller,id,{...evidence,source_url:'https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update'});
  assert.equal(s.view(f.biller).mappings[0].policies[0].monitor,'FINGERPRINT_MATCH');
  record('b','CHECK_FAILED',undefined);assert.equal(s.view(f.biller).mappings[0].policies[0].monitor,'SOURCE_INACCESSIBLE');
  record('c','SOURCE_CHANGED_REVIEW_REQUIRED','b'.repeat(64));assert.equal(s.view(f.biller).mappings[0].policies[0].resolved,false);
  assert.equal(s.view(f.biller).mappings[0].policies[0].monitor,'SOURCE_CHANGED_REVIEW_REQUIRED');
});
test('active billing authorization, tenant isolation and immutable records are enforced',t=>{
  const f=setup(t),s=f.service,id=s.create(f.biller,identity).mapping.id;
  s.record(f.biller,id,evidence);
  f.db.exec("INSERT INTO organizations VALUES ('other','Other'); INSERT INTO users(id,org_id,email,name,role,password_hash) VALUES ('other','other','other@test','Other','BILLER','x')");
  const other={id:'other',org_id:'other'};assert.equal(s.view(other).mappings.length,0);
  assert.throws(()=>s.record(other,id,evidence),e=>e.status===404);
  for(const user of [{id:'portal-001',org_id:'demo-clinic'},{id:'doctor-001',org_id:'demo-clinic'},{...f.biller,role:'ADMIN',org_id:'other'}])assert.throws(()=>s.view(user),e=>e.status===403);
  for(const table of ['payer_mappings','payer_mapping_reviews']){
    assert.throws(()=>f.db.exec(`DELETE FROM ${table}`),/immutable/);
    assert.throws(()=>f.db.exec(`UPDATE ${table} SET created_by='other'`),/immutable/);
  }
  f.db.exec("UPDATE users SET active=0 WHERE id='biller-001'");assert.throws(()=>s.view(f.biller),e=>e.status===403);
});
test('unsafe references and malformed or unknown fields cannot introduce credentials or automatic transmission',t=>{
  const f=setup(t),s=f.service,id=s.create(f.biller,identity).mapping.id;
  for(const source_url of ['javascript:alert(1)','https://user:pass@example.test/','https://example.test/?token=secret','https://example.test/#token'])assert.throws(()=>s.record(f.biller,id,{...evidence,source_url}),e=>e.status===400);
  assert.throws(()=>s.record(f.biller,id,{...evidence,live_connection:true}),/Unexpected/);
  assert.throws(()=>s.record(f.biller,id,{...evidence,effective_until:'2020-01-01'}),/interval/);
  assert.throws(()=>s.create(f.biller,{...identity,payer_id:540}),/payer_id/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM payer_mapping_reviews').get().n,0);
});
test('failed audit writes roll back the review as one transaction',t=>{
  const f=setup(t),s=f.service,id=s.create(f.biller,identity).mapping.id;
  f.db.exec("CREATE TRIGGER stop_payer_review BEFORE INSERT ON audit_log WHEN NEW.action='RECORD_PAYER_REVIEW' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  assert.throws(()=>s.record(f.biller,id,evidence),/audit unavailable/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM payer_mapping_reviews').get().n,0);
});
