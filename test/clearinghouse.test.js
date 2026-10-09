import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, seed, now } from '../src/db.js';
import { checkout } from '../src/billing.js';
import { createClearinghouseService, backfillQueuedClaims } from '../src/clearinghouse.js';
import { fictionalResponses, liveClearinghouseAdapter } from '../src/clearinghouse-adapter.js';

const line={procedure_system:'CPT',procedure_code:'99213',diagnosis_code:'M54.50',units:1,charge_cents:15000};
function setup(t,path=':memory:',options={}) {
  let db=openDb(path);seed(db);t.after(()=>{if(db.isOpen)db.close()});
  const doctor=db.prepare("SELECT * FROM users WHERE role='PHYSICIAN'").get(),biller=db.prepare("SELECT * FROM users WHERE role='BILLER'").get();
  for(const kind of ['ASSESSMENT','PLAN'])db.prepare('INSERT INTO clinical_sections VALUES (?,?,?,?,?,?)').run(kind,'enc-001',kind,'Fictional test documentation',doctor.id,now());
  db.prepare("UPDATE encounters SET status='SIGNED',signed_at=? WHERE id='enc-001'").run(now());
  const claim=checkout(db,doctor,'enc-001',[line]);
  const service=createClearinghouseService(db,{enabled:true,...options});
  return {db,doctor,biller,claim,service};
}
const latest=(s)=>s.service.status(s.biller,s.claim.id).transmissions[0];

test('checkout and outbox are atomic, migration is repeatable, default is queued and no live adapter exists',t=>{
  const s=setup(t);assert.equal(latest(s).status,'QUEUED');assert.equal(latest(s).scenario,null);
  assert.equal(s.db.prepare('SELECT status FROM claims').get().status,'AWAITING_CONNECTOR');
  for(let i=0;i<2;i++)backfillQueuedClaims(s.db);
  assert.equal(s.db.prepare('SELECT count(*) n FROM claim_outbox').get().n,1);
  assert.throws(liveClearinghouseAdapter,/disabled/);
  const disabled=createClearinghouseService(s.db);assert.throws(()=>disabled.configure(s.biller,s.claim.id,{scenario:'PAID'}),e=>e.status===403);
});
test('failure to insert outbox rolls back checkout, claim, lines, event and audit',t=>{
  const db=openDb(':memory:');seed(db);t.after(()=>db.close());const doc=db.prepare("SELECT * FROM users WHERE role='PHYSICIAN'").get();
  for(const kind of ['ASSESSMENT','PLAN'])db.prepare('INSERT INTO clinical_sections VALUES (?,?,?,?,?,?)').run(kind,'enc-001',kind,'Fictional test',doc.id,now());
  db.prepare("UPDATE encounters SET status='SIGNED',signed_at=? WHERE id='enc-001'").run(now());
  db.exec("CREATE TRIGGER reject_outbox BEFORE INSERT ON claim_outbox BEGIN SELECT RAISE(ABORT,'injected database fault'); END");
  assert.throws(()=>checkout(db,doc,'enc-001',[line]),/injected database fault/);
  for(const table of ['claims','claim_lines','claim_events','audit_log'])assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
  assert.equal(db.prepare("SELECT status FROM encounters WHERE id='enc-001'").get().status,'SIGNED');
});
for(const [scenario,status] of [['PAID','SIMULATED_PAID'],['REJECTED','SIMULATED_REJECTED'],['DENIED','SIMULATED_DENIED']])test(`deterministic ${scenario} events are separate, fictional and never posted as real remittance`,async t=>{
  const s=setup(t);s.service.configure(s.biller,s.claim.id,{scenario});const job=s.db.prepare('SELECT * FROM claim_outbox').get();
  assert.deepEqual(fictionalResponses(job),fictionalResponses(job));assert.notEqual(fictionalResponses(job)[0].event_type,'PAYER_ACCEPTED');
  assert.equal((await s.service.process(s.biller,s.claim.id)).processed,true);
  const transmission=latest(s);assert.equal(transmission.status,status);assert.equal(transmission.state,'DONE');assert.equal(transmission.attempts,1);
  assert(transmission.events.every(e=>e.simulated&&e.source==='FICTIONAL_CLEARINGHOUSE_V1'));
  assert.match(transmission.notice,/no clearinghouse or insurer/);
  assert.equal(s.db.prepare('SELECT count(*) n FROM payments').get().n,0);assert.equal(s.db.prepare('SELECT count(*) n FROM denials').get().n,0);
  assert.equal(s.db.prepare('SELECT status FROM claims').get().status,'AWAITING_CONNECTOR');
  if(scenario==='PAID')assert.deepEqual(transmission.events.map(e=>e.event_type),['TRANSPORT_ACKNOWLEDGED','CLEARINGHOUSE_ACCEPTED','PAYER_ACCEPTED','ADJUDICATED','REMITTANCE']);
  if(scenario==='DENIED')assert.throws(()=>s.service.correct(s.biller,s.claim.id,{lines:[{...line,units:2}],reviewed:true,reason:'Review',request_key:'denial-correction'}),e=>e.status===409);
});
test('out-of-order responses are retained but status waits for prerequisite events; duplicate acknowledgments are no-ops',t=>{
  const s=setup(t);s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});const job=s.service.acquire(s.biller.org_id,s.claim.id),events=fictionalResponses(job);
  s.service.receive(job,events.at(-1));assert.equal(latest(s).status,'QUEUED');assert.equal(latest(s).pending_response_count,1);
  for(const event of events.slice(0,-1))s.service.receive(job,event);
  const count=s.db.prepare('SELECT count(*) n FROM audit_log').get().n;
  assert.deepEqual(s.service.receive(job,events[0]),{duplicate:true});assert.equal(s.db.prepare('SELECT count(*) n FROM audit_log').get().n,count);
  assert.equal(latest(s).status,'SIMULATED_PAID');s.service.finish(job);
  assert.equal(s.db.prepare('SELECT count(*) n FROM simulated_claim_events').get().n,5);
});
test('forged, mismatched and conflicting responses are rejected; incomplete processing cannot finish',t=>{
  const s=setup(t);s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});const job=s.service.acquire(s.biller.org_id),events=fictionalResponses(job);
  for(const changed of [{...events[0],org_id:'other'},{...events[0],idempotency_key:'wrong'},{...events[0],simulated:false},{...events[0],source:'PAYER'},{...events[0],data:{transmission_id:'real'}}])assert.throws(()=>s.service.receive(job,changed),e=>e.status===400);
  s.service.receive(job,events[0]);assert.throws(()=>s.service.receive(job,{...events[0],data:{}}),e=>e.status===400);
  assert.throws(()=>s.service.finish(job),e=>e.status===409);
  assert.equal(s.db.prepare('SELECT count(*) n FROM simulated_claim_events').get().n,1);
});
test('retries use the same identity and snapshot, persist partial responses, back off and stop at the limit',async t=>{
  let time=100;const s=setup(t,':memory:',{clock:()=>time,maxAttempts:3});s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});
  const identities=[];s.service.adapter.submit=async job=>{identities.push([job.idempotency_key,job.snapshot]);s.service.receive(job,fictionalResponses(job)[0]);throw new Error('private payload must never appear in last_error')};
  await s.service.process(s.biller,s.claim.id);assert.equal(latest(s).state,'RETRY');assert.equal(latest(s).next_attempt_ms,1100);
  assert.equal((await s.service.process(s.biller,s.claim.id)).processed,false);assert.equal(latest(s).attempts,1);
  time=1100;await s.service.process(s.biller,s.claim.id);time=3100;await s.service.process(s.biller,s.claim.id);
  assert.equal(latest(s).state,'EXHAUSTED');assert.equal(latest(s).attempts,3);assert.equal(new Set(identities.map(x=>JSON.stringify(x))).size,1);
  assert.equal(latest(s).events.length,1);assert.equal(latest(s).last_error,'SIMULATED_ATTEMPT_FAILED');
  time=100000;assert.equal((await s.service.process(s.biller,s.claim.id)).processed,false);
});
test('restart recovers expired lease and replayed responses without duplicate effects',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'clearinghouse-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let time=100;
  const s=setup(t,join(dir,'db.sqlite'),{clock:()=>time,leaseMs:1000});s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});
  const first=s.service.acquire(s.biller.org_id);s.service.receive(first,fictionalResponses(first)[0]);
  s.db.close();const reopened=openDb(join(dir,'db.sqlite'));t.after(()=>reopened.close());
  const recovered=createClearinghouseService(reopened,{enabled:true,clock:()=>time,leaseMs:1000});
  assert.equal(recovered.acquire(s.biller.org_id),null);time=1101;
  assert.equal((await recovered.process(s.biller,s.claim.id)).processed,true);
  const job=recovered.status(s.biller,s.claim.id).transmissions[0];assert.equal(job.status,'SIMULATED_PAID');assert.equal(job.attempts,2);
  assert.equal(job.idempotency_key,first.idempotency_key);assert.equal(job.events.length,5);
  assert.throws(()=>recovered.receive(first,fictionalResponses(first)[1]),e=>e.status===409);
});
test('a late worker cannot overwrite successful lease recovery',async t=>{
  let time=100;const s=setup(t,':memory:',{clock:()=>time,leaseMs:10});s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});
  let release;const original=s.service.adapter.submit.bind(s.service.adapter);
  s.service.adapter.submit=job=>new Promise(resolve=>{release=()=>resolve(fictionalResponses(job))});
  const interrupted=s.service.process(s.biller,s.claim.id);time=111;s.service.adapter.submit=original;
  assert.equal((await s.service.process(s.biller,s.claim.id)).processed,true);release();await interrupted;
  assert.equal(latest(s).state,'DONE');assert.equal(latest(s).attempts,2);assert.equal(latest(s).events.length,5);
});
test('only authorized active billing staff may access simulation; tenants cannot read or mutate other claims',async t=>{
  const s=setup(t),patient=s.db.prepare("SELECT * FROM users WHERE role='PATIENT'").get();
  s.db.prepare('INSERT INTO organizations VALUES (?,?)').run('other','Other org');
  s.db.prepare('INSERT INTO users (id,org_id,email,name,role,password_hash) VALUES (?,?,?,?,?,?)').run('other-biller','other','other@example.test','Other','BILLER',s.biller.password_hash);
  const other=s.db.prepare("SELECT * FROM users WHERE id='other-biller'").get();
  for(const user of [patient,s.doctor,{...s.biller,org_id:'other'}]){
    assert.throws(()=>s.service.status(user,s.claim.id),e=>e.status===403);
    assert.throws(()=>s.service.configure(user,s.claim.id,{scenario:'PAID'}),e=>e.status===403);
    await assert.rejects(()=>s.service.process(user,s.claim.id),e=>e.status===403);
  }
  assert.throws(()=>s.service.status(other,s.claim.id),e=>e.status===404);assert.equal(s.service.list(other).length,0);
  assert.throws(()=>s.service.configure(other,s.claim.id,{scenario:'PAID'}),e=>e.status===404);
  s.db.prepare('UPDATE users SET active=0 WHERE id=?').run(s.biller.id);assert.throws(()=>s.service.status(s.biller,s.claim.id),e=>e.status===403);
});
test('fixtures are restricted and simulation cannot be configured twice with different outcomes',t=>{
  const s=setup(t);s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});
  assert.throws(()=>s.service.configure(s.biller,s.claim.id,{scenario:'DENIED'}),e=>e.status===409);
  s.db.prepare("UPDATE claims SET member_id='REAL' WHERE id=?").run(s.claim.id);
  assert.throws(()=>s.service.acquire(s.biller.org_id),e=>e.status===403);
});
test('rejection correction requires review and changed valid lines; duplicate HTTP retries reuse a new revision',async t=>{
  const s=setup(t);s.service.configure(s.biller,s.claim.id,{scenario:'REJECTED'});await s.service.process(s.biller,s.claim.id);
  const correction={lines:[{...line,units:2}],reason:'Reviewed fictional unit correction',reviewed:true,request_key:'test-correction-1'};
  assert.throws(()=>s.service.correct(s.biller,s.claim.id,{...correction,reviewed:false}),e=>e.status===400);
  assert.throws(()=>s.service.correct(s.biller,s.claim.id,{...correction,lines:[line]}),e=>e.status===422);
  assert.throws(()=>s.service.correct(s.biller,s.claim.id,{...correction,lines:[{...line,units:-1}]}),e=>e.status===422);
  const original=latest(s),result=s.service.correct(s.biller,s.claim.id,correction);
  assert.equal(result.duplicate,false);assert.equal(s.service.correct(s.biller,s.claim.id,correction).duplicate,true);
  assert.throws(()=>s.service.correct(s.biller,s.claim.id,{...correction,lines:[{...line,units:3}]}),e=>e.status===409);
  assert.equal(latest(s).revision,2);assert.notEqual(latest(s).idempotency_key,original.idempotency_key);
  await s.service.process(s.biller,s.claim.id);assert.equal(latest(s).status,'SIMULATED_PAID');assert.equal(latest(s).total_cents,30000);
  assert.equal(s.db.prepare('SELECT count(*) n FROM claim_outbox').get().n,2);
  assert.equal(s.db.prepare('SELECT count(*) n FROM claim_events WHERE event_type=?').get('SIMULATED_CORRECTION_QUEUED').n,1);
  assert.equal(s.db.prepare('SELECT units FROM claim_lines').get().units,1);
});
test('snapshots, scenario, event history and audits reject mutation and deletion',async t=>{
  const s=setup(t);s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});await s.service.process(s.biller,s.claim.id);
  for(const table of ['simulated_claim_events','claim_events','audit_log']){
    assert.throws(()=>s.db.exec(`DELETE FROM ${table}`),/immutable/);
    const column=table==='audit_log'?'action':table==='claim_events'?'detail':'payload';assert.throws(()=>s.db.exec(`UPDATE ${table} SET ${column}='changed'`),/immutable/);
  }
  assert.throws(()=>s.db.exec("UPDATE claim_outbox SET snapshot='{}'"),/immutable/);
  assert.throws(()=>s.db.exec("UPDATE claim_outbox SET scenario='DENIED'"),/immutable/);
  assert.throws(()=>s.db.exec('DELETE FROM claim_outbox'),/immutable/);
  assert(s.db.prepare('SELECT action FROM audit_log').all().some(a=>a.action==='RECEIVE_SIMULATED_REMITTANCE'));
});

test('crash after last response is finalized without another send even at the retry limit',t=>{
  let time=100;const s=setup(t,':memory:',{clock:()=>time,leaseMs:10,maxAttempts:1});s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});
  const job=s.service.acquire(s.biller.org_id);for(const event of fictionalResponses(job))s.service.receive(job,event);
  time=111;assert.equal(s.service.acquire(s.biller.org_id),null);assert.equal(latest(s).state,'DONE');assert.equal(latest(s).attempts,1);
});
test('backfill preserves old queued claims and never invents historical payer activity',t=>{
  const s=setup(t);s.db.prepare("INSERT INTO encounters (id,org_id,patient_id,date_of_service,status,signed_at) VALUES (?,?,?,?,?,?)").run('legacy-enc',s.biller.org_id,'patient-001','2026-10-01','CHECKED_OUT',now());
  s.db.prepare('INSERT INTO claims VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('legacy-claim',s.biller.org_id,'legacy-enc','patient-001','Example Health Plan','DEMO-MEMBER-001','AWAITING_CONNECTOR',15000,null,now(),now());
  s.db.prepare('INSERT INTO claim_lines VALUES (?,?,?,?,?,?,?,?,?)').run('legacy-line','legacy-claim','CPT','99213',null,'M54.50',1,15000,null);
  backfillQueuedClaims(s.db);backfillQueuedClaims(s.db);const job=s.service.status(s.biller,'legacy-claim').transmissions[0];
  assert.equal(job.status,'QUEUED');assert.equal(job.attempts,0);assert.equal(job.events.length,0);assert.equal(job.scenario,null);
});
test('claim/outbox tenant association is enforced by database constraint',t=>{
  const s=setup(t),job=s.db.prepare('SELECT * FROM claim_outbox').get();
  assert.throws(()=>s.db.prepare('INSERT INTO claim_outbox (id,org_id,claim_id,revision,idempotency_key,snapshot,created_at) VALUES (?,?,?,?,?,?,?)').run('foreign-outbox','other',s.claim.id,2,'foreign-key',job.snapshot,now()),/FOREIGN KEY/);
});

test('transport, clearinghouse acceptance, payer acceptance, adjudication and paid project independently',t=>{
  const s=setup(t);s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});const job=s.service.acquire(s.biller.org_id),events=fictionalResponses(job);
  const statuses=['SIMULATED_TRANSMITTED','SIMULATED_CLEARINGHOUSE_ACCEPTED','SIMULATED_PAYER_ACCEPTED','SIMULATED_ADJUDICATED','SIMULATED_PAID'];
  events.forEach((event,i)=>{s.service.receive(job,event);assert.equal(latest(s).status,statuses[i])});s.service.finish(job);
});
test('transient partial failure retries successfully with one response per stage',async t=>{
  let time=100;const s=setup(t,':memory:',{clock:()=>time});s.service.configure(s.biller,s.claim.id,{scenario:'PAID'});
  const original=s.service.adapter.submit.bind(s.service.adapter);s.service.adapter.submit=async job=>{s.service.receive(job,fictionalResponses(job)[0]);throw Error('temporary')};
  await s.service.process(s.biller,s.claim.id);const initial=latest(s);assert.equal(initial.state,'RETRY');
  time=1100;s.service.adapter.submit=original;await s.service.process(s.biller,s.claim.id);
  const final=latest(s);assert.equal(final.state,'DONE');assert.equal(final.status,'SIMULATED_PAID');assert.equal(final.idempotency_key,initial.idempotency_key);assert.equal(final.events.length,5);assert.equal(final.attempts,2);
});
test('organization administrator can inspect and configure the fixture without impersonating another user',t=>{
  const s=setup(t);s.db.prepare('INSERT INTO users (id,org_id,email,name,role,password_hash) VALUES (?,?,?,?,?,?)').run('admin-001',s.biller.org_id,'admin@example.test','Admin','ADMIN',s.biller.password_hash);
  const admin=s.db.prepare("SELECT * FROM users WHERE id='admin-001'").get();s.service.configure(admin,s.claim.id,{scenario:'DENIED'});
  assert.equal(s.service.status(admin,s.claim.id).transmissions[0].scenario,'DENIED');assert(s.db.prepare("SELECT actor_id FROM audit_log WHERE action='CONFIGURE_FICTIONAL_TRANSMISSION'").all().some(a=>a.actor_id===admin.id));
});
