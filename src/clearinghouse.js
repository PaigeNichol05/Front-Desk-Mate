import { randomUUID } from 'node:crypto';
import { audit, now, uid } from './db.js';
import { documentationChecks } from './billing.js';
import { FictionalClearinghouseAdapter, fictionalResponses, SCENARIOS, SOURCE, NOTICE } from './clearinghouse-adapter.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const transaction=(db,fn)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
export function queueClaim(db,claim,lines,{revision=1,requestKey=null,scenario=null,correctionReason=null}={}) {
  // Caller owns the transaction so checkout, claim lines, audit and outbox commit together.
  const snapshot=JSON.stringify({claim_id:claim.id,org_id:claim.org_id,encounter_id:claim.encounter_id,
    patient_id:claim.patient_id,payer_name:claim.payer_name,member_id:claim.member_id,
    correction_reason:correctionReason,total_cents:lines.reduce((sum,l)=>sum+l.units*l.charge_cents,0),lines:lines.map(l=>({
      procedure_system:l.procedure_system||'CPT',procedure_code:l.procedure_code,diagnosis_code:l.diagnosis_code,
      modifier:l.modifier||null,units:l.units,charge_cents:l.charge_cents,authorization_id:l.authorization_id||null
    }))});
  const id=uid();
  db.prepare(`INSERT INTO claim_outbox (id,org_id,claim_id,revision,idempotency_key,request_key,snapshot,scenario,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id,claim.org_id,claim.id,revision,randomUUID(),requestKey,snapshot,scenario,now());
  return id;
}
export function backfillQueuedClaims(db) {
  transaction(db,()=>{
    const claims=db.prepare(`SELECT * FROM claims c WHERE c.status='AWAITING_CONNECTOR'
      AND NOT EXISTS(SELECT 1 FROM claim_outbox o WHERE o.claim_id=c.id)`).all();
    for(const c of claims){queueClaim(db,c,db.prepare('SELECT * FROM claim_lines WHERE claim_id=? ORDER BY id').all(c.id));
      audit(db,{id:'system:outbox-migration',org_id:c.org_id},'MIGRATE_QUEUED_CLAIM','claim',c.id)}
  });
}
function staff(db,user) {
  if(!user?.id||!user?.org_id)throw fail(403,'Authorized billing staff required');
  const current=db.prepare('SELECT * FROM users WHERE id=? AND org_id=? AND active=1').get(user?.id,user?.org_id);
  if(!current||!['BILLER','ADMIN'].includes(current.role))throw fail(403,'Authorized billing staff required');
  return current;
}
function claimFor(db,user,id) {
  const claim=db.prepare('SELECT * FROM claims WHERE id=? AND org_id=?').get(id,user.org_id);
  if(!claim)throw fail(404,'Claim not found');return claim;
}
function projection(db,job) {
  const events=db.prepare('SELECT * FROM simulated_claim_events WHERE outbox_id=? ORDER BY sequence').all(job.id);
  // Retain early responses, but project only the contiguous verified sequence.
  const contiguous=[];
  for(const event of events){if(event.sequence!==contiguous.length+1)break;contiguous.push(event);}
  const types=new Set(contiguous.map(e=>e.event_type));
  let status='QUEUED';
  if(types.has('TRANSPORT_ACKNOWLEDGED'))status='SIMULATED_TRANSMITTED';
  if(types.has('CLEARINGHOUSE_ACCEPTED'))status='SIMULATED_CLEARINGHOUSE_ACCEPTED';
  if(types.has('PAYER_ACCEPTED'))status='SIMULATED_PAYER_ACCEPTED';
  if(types.has('ADJUDICATED'))status='SIMULATED_ADJUDICATED';
  if(types.has('CLEARINGHOUSE_REJECTED'))status='SIMULATED_REJECTED';
  if(types.has('DENIED'))status='SIMULATED_DENIED';
  if(types.has('REMITTANCE'))status='SIMULATED_PAID';
  const labels={QUEUED:'Queued — no real transmission',SIMULATED_TRANSMITTED:'Simulated transmitted (transport only)',
    SIMULATED_CLEARINGHOUSE_ACCEPTED:'Simulated clearinghouse accepted',SIMULATED_PAYER_ACCEPTED:'Simulated payer accepted',
    SIMULATED_ADJUDICATED:'Simulated adjudicated',SIMULATED_REJECTED:'Simulated rejected — before adjudication',
    SIMULATED_DENIED:'Simulated denied — after adjudication',SIMULATED_PAID:'Simulated paid — fictional remittance'};
  return {id:job.id,revision:job.revision,idempotency_key:job.idempotency_key,status,label:labels[status],
    state:job.state,attempts:job.attempts,next_attempt_ms:job.next_attempt_ms,last_error:job.last_error,
    reviewed_lines:JSON.parse(job.snapshot).lines,total_cents:JSON.parse(job.snapshot).total_cents,
    scenario:job.scenario,pending_response_count:events.length-contiguous.length,simulated:true,notice:NOTICE,events:events.map(e=>({...e,payload:JSON.parse(e.payload),simulated:true}))};
}
export function createClearinghouseService(db,{enabled=false,clock=Date.now,leaseMs=30000,maxAttempts=3}={}) {
  const adapter=new FictionalClearinghouseAdapter();
  const requireEnabled=()=>{if(!enabled)throw fail(403,'Fictional clearinghouse simulation is disabled');};
  const latest=id=>db.prepare('SELECT * FROM claim_outbox WHERE claim_id=? ORDER BY revision DESC LIMIT 1').get(id);
  const fictionalOnly=claim=>{
    // Only the bundled fixture may enter this demo adapter, never arbitrary patient records.
    if(claim.org_id!=='demo-clinic'||claim.patient_id!=='patient-001'||claim.payer_name!=='Example Health Plan'||claim.member_id!=='DEMO-MEMBER-001')
      throw fail(403,'Only the bundled fictional patient and payer may be simulated');
  };
  function status(user,id){user=staff(db,user);claimFor(db,user,id);audit(db,user,'VIEW_TRANSMISSION','claim',id);
    return {live_transmission_enabled:false,simulation_enabled:enabled,notice:NOTICE,
      transmissions:db.prepare('SELECT * FROM claim_outbox WHERE claim_id=? AND org_id=? ORDER BY revision DESC').all(id,user.org_id).map(j=>projection(db,j))};}
  function list(user){user=staff(db,user);audit(db,user,'VIEW_BILLING_TRANSMISSIONS','organization',user.org_id);
    return db.prepare('SELECT * FROM claims WHERE org_id=? ORDER BY created_at DESC').all(user.org_id).map(c=>{
      const job=latest(c.id);return {...c,transmission:job?projection(db,job):null,live_transmission_enabled:false};});}
  function configure(user,id,{scenario}={}) {
    requireEnabled();user=staff(db,user);const claim=claimFor(db,user,id);fictionalOnly(claim);
    if(!SCENARIOS.includes(scenario))throw fail(400,'Choose a fictional PAID, REJECTED or DENIED scenario');
    transaction(db,()=>{const job=latest(id);if(!job)throw fail(409,'Claim has no queued transmission');
      if(job.scenario===scenario)return;
      if(job.scenario||job.attempts)throw fail(409,'This transmission already has a simulation scenario');
      db.prepare('UPDATE claim_outbox SET scenario=? WHERE id=?').run(scenario,job.id);audit(db,user,'CONFIGURE_FICTIONAL_TRANSMISSION','claim',id);
    });return status(user,id);
  }
  function correct(user,id,{lines,request_key,reason,reviewed,scenario='PAID'}={}) {
    requireEnabled();user=staff(db,user);const claim=claimFor(db,user,id);fictionalOnly(claim);
    if(reviewed!==true||typeof reason!=='string'||!reason.trim()||reason.length>500||
      typeof request_key!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(request_key)||
      !Array.isArray(lines)||!lines.length||lines.length>20||lines.some(l=>!l||typeof l!=='object')||!SCENARIOS.includes(scenario))
      throw fail(400,'Reviewed lines, correction reason and a stable request_key are required');
    const encounter=db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(claim.encounter_id,user.org_id);
    const issues=documentationChecks(db,encounter,lines);
    if(issues.length)throw Object.assign(fail(422,'Correction failed documentation checks'),{issues});
    return transaction(db,()=>{
      const existing=db.prepare('SELECT * FROM claim_outbox WHERE org_id=? AND request_key=?').get(user.org_id,request_key);
      if(existing){if(existing.claim_id!==id||existing.scenario!==scenario||JSON.parse(existing.snapshot).correction_reason!==reason.trim()||JSON.stringify(JSON.parse(existing.snapshot).lines)!==JSON.stringify(normalizeLines(lines)))throw fail(409,'request_key was already used for a different correction');
        return {outbox_id:existing.id,duplicate:true,simulated:true,notice:NOTICE};}
      const job=latest(id);
      if(!job||job.state!=='DONE'||projection(db,job).status!=='SIMULATED_REJECTED')throw fail(409,'Only a completed fictional rejection can be corrected here. Denials require staff review, not automatic resubmission.');
      if(JSON.stringify(JSON.parse(job.snapshot).lines)===JSON.stringify(normalizeLines(lines)))throw fail(422,'At least one reviewed claim-line value must change');
      const outboxId=queueClaim(db,claim,lines,{revision:job.revision+1,requestKey:request_key,scenario,correctionReason:reason.trim()});
      db.prepare('INSERT INTO claim_events VALUES (?,?,?,?,?)').run(uid(),id,'SIMULATED_CORRECTION_QUEUED',`Simulation only. Staff-reviewed correction: ${reason.trim()}`,now());
      audit(db,user,'QUEUE_FICTIONAL_CORRECTION','claim',id);
      return {outbox_id:outboxId,duplicate:false,simulated:true,notice:NOTICE};
    });
  }
  function acquire(orgId,claimId) {
    requireEnabled();return transaction(db,()=>{
      const time=clock();
      const job=db.prepare(`SELECT * FROM claim_outbox WHERE org_id=? AND (? IS NULL OR claim_id=?) AND scenario IS NOT NULL
        AND ((state IN ('QUEUED','RETRY') AND next_attempt_ms<=?) OR (state='PROCESSING' AND lease_until_ms<=?))
        ORDER BY created_at,revision LIMIT 1`).get(orgId,claimId||null,claimId||null,time,time);
      if(!job)return null;
      fictionalOnly(claimFor(db,{org_id:orgId},job.claim_id));
      // A crash after the final response must not resend or exhaust an already complete job.
      if(db.prepare('SELECT count(*) n FROM simulated_claim_events WHERE outbox_id=?').get(job.id).n===fictionalResponses(job).length){
        db.prepare("UPDATE claim_outbox SET state='DONE',lease_token=NULL,lease_until_ms=NULL,last_error=NULL WHERE id=?").run(job.id);
        audit(db,{id:'system:fictional-worker',org_id:orgId},'RECOVER_COMPLETED_FICTIONAL_TRANSMISSION','claim',job.claim_id);return null;
      }
      if(job.attempts>=maxAttempts){db.prepare("UPDATE claim_outbox SET state='EXHAUSTED',lease_token=NULL,lease_until_ms=NULL,last_error='SIMULATED_RETRY_LIMIT' WHERE id=?").run(job.id);
        audit(db,{id:'system:fictional-worker',org_id:orgId},'FICTIONAL_RETRY_EXHAUSTED','claim',job.claim_id);return null;}
      const token=uid();db.prepare("UPDATE claim_outbox SET state='PROCESSING',attempts=attempts+1,lease_token=?,lease_until_ms=? WHERE id=?").run(token,time+leaseMs,job.id);
      audit(db,{id:'system:fictional-worker',org_id:orgId},'ATTEMPT_FICTIONAL_TRANSMISSION','claim',job.claim_id);
      return db.prepare('SELECT * FROM claim_outbox WHERE id=?').get(job.id);
    });
  }
  function leased(job) {
    const current=db.prepare("SELECT * FROM claim_outbox WHERE id=? AND org_id=? AND state='PROCESSING' AND lease_token=? AND lease_until_ms>?").get(job.id,job.org_id,job.lease_token,clock());
    if(!current)throw fail(409,'Transmission lease expired or was replaced');return current;
  }
  function receive(job,event) {
    requireEnabled();return transaction(db,()=>{
      const current=leased(job);
      // In-process fixture authentication/correlation only. Arbitrary external input is never accepted.
      try{adapter.verifyAndNormalizeResponse(current,event)}catch{throw fail(400,'Invalid fictional response or correlation')}
      const payload=JSON.stringify(event);
      const previous=db.prepare('SELECT * FROM simulated_claim_events WHERE id=? OR (outbox_id=? AND sequence=?)').get(event.id,current.id,event.sequence);
      if(previous){if(previous.payload!==payload)throw fail(409,'Conflicting duplicate response');return {duplicate:true};}
      db.prepare('INSERT INTO simulated_claim_events VALUES (?,?,?,?,?,?,?)').run(event.id,current.id,event.sequence,event.event_type,payload,SOURCE,now());
      audit(db,{id:'system:fictional-worker',org_id:current.org_id},`RECEIVE_SIMULATED_${event.event_type}`,'claim',current.claim_id);
      return {duplicate:false};
    });
  }
  function finish(job){transaction(db,()=>{const current=leased(job);
    const received=db.prepare('SELECT count(*) n FROM simulated_claim_events WHERE outbox_id=?').get(job.id).n;
    if(received!==fictionalResponses(current).length)throw fail(409,'Responses are incomplete');
    db.prepare("UPDATE claim_outbox SET state='DONE',lease_token=NULL,lease_until_ms=NULL,last_error=NULL WHERE id=?").run(job.id);
    audit(db,{id:'system:fictional-worker',org_id:job.org_id},'COMPLETE_FICTIONAL_TRANSMISSION','claim',job.claim_id);
  });}
  async function processOne(orgId,claimId) {
    const job=acquire(orgId,claimId);if(!job)return {processed:false,simulated:true,notice:NOTICE};
    try{const events=await adapter.submit(job);for(const event of events)receive(job,event);finish(job);
      return {processed:true,simulated:true,notice:NOTICE};
    }catch(e){
      transaction(db,()=>{const current=db.prepare("SELECT * FROM claim_outbox WHERE id=? AND state='PROCESSING' AND lease_token=?").get(job.id,job.lease_token);
        if(!current)return; // A recovered worker owns this attempt; the stale worker cannot change it.
        db.prepare('UPDATE claim_outbox SET state=?,next_attempt_ms=?,lease_token=NULL,lease_until_ms=NULL,last_error=? WHERE id=?').run(
          current.attempts>=maxAttempts?'EXHAUSTED':'RETRY',clock()+1000*2**(current.attempts-1),'SIMULATED_ATTEMPT_FAILED',job.id);
        audit(db,{id:'system:fictional-worker',org_id:job.org_id},'RETRY_FICTIONAL_TRANSMISSION','claim',job.claim_id);
      });
      return {processed:false,retry:true,simulated:true,notice:NOTICE};
    }
  }
  async function process(user,id){requireEnabled();user=staff(db,user);claimFor(db,user,id);audit(db,user,'RUN_FICTIONAL_TRANSMISSION','claim',id);return processOne(user.org_id,id);}
  return {status,list,configure,correct,process,processOne,acquire,receive,finish,adapter};
}
function normalizeLines(lines){return lines.map(l=>({procedure_system:l.procedure_system||'CPT',procedure_code:l.procedure_code,
  diagnosis_code:l.diagnosis_code,modifier:l.modifier||null,units:l.units,charge_cents:l.charge_cents,authorization_id:l.authorization_id||null}));}
