import { createHash } from 'node:crypto';

export const SOURCE='FICTIONAL_CLEARINGHOUSE_V1';
export const SCENARIOS=['PAID','REJECTED','DENIED'];
export const NOTICE='SIMULATION ONLY — no clearinghouse or insurer was contacted. No real payment occurred.';
/** Future adapter contract:
 * submit({snapshot, idempotencyKey}) -> {transmissionId};
 * authenticatedResponses(transmissionId) -> normalized, correlated event envelopes.
 * A live adapter must verify partner signatures/authentication, tenant routing and replay
 * identity before ingestion. There is deliberately no live registration or webhook route.
 */
export function fictionalResponses(job) {
  const snapshot=JSON.parse(job.snapshot);
  const stages=[['TRANSPORT_ACKNOWLEDGED',{transmission_id:`fictional:${job.idempotency_key}`}]];
  if(job.scenario==='REJECTED') stages.push(['CLEARINGHOUSE_REJECTED',{reason_code:'DEMO_FORMAT',reason:'Fictional pre-adjudication rejection; review and correct the submission.'}]);
  else {
    stages.push(['CLEARINGHOUSE_ACCEPTED',{}],['PAYER_ACCEPTED',{}]);
    if(job.scenario==='DENIED') stages.push(['ADJUDICATED',{outcome:'DENIED'}],['DENIED',{reason_code:'DEMO_REVIEW',reason:'Fictional adjudicated denial; staff review is required. No automatic resubmission.'}]);
    else stages.push(['ADJUDICATED',{outcome:'PAYABLE'}],['REMITTANCE',{amount_cents:snapshot.total_cents,adjustment_cents:0,reference:`fictional-remittance:${job.idempotency_key}`}]);
  }
  return stages.map(([event_type,data],i)=>({
    id:createHash('sha256').update(`${SOURCE}:${job.idempotency_key}:${i+1}`).digest('hex'),
    outbox_id:job.id, org_id:job.org_id, idempotency_key:job.idempotency_key,
    sequence:i+1,event_type,source:SOURCE,simulated:true,data
  }));
}
/** Runtime interface. A future authorized connector must supply both transport and
 * verified normalization. submit() may return immediate acknowledgments; delayed
 * responses require a separately reviewed authenticated ingestion path.
 * @typedef {{id:string, org_id:string, idempotency_key:string, snapshot:string}} Transmission
 */
export class ClearinghouseAdapter {
  /** @param {Transmission} job */
  async submit(job){ throw new Error('Clearinghouse transport is not implemented'); }
  /** Verify source authentication and routing before returning a normalized event. */
  verifyAndNormalizeResponse(job,response){ throw new Error('Authenticated response normalization is not implemented'); }
}
export class FictionalClearinghouseAdapter extends ClearinghouseAdapter {
  constructor(){ super(); this.source=SOURCE; this.simulated=true; }
  async submit(job){ return fictionalResponses(job); }
  verifyAndNormalizeResponse(job,response){
    const expected=fictionalResponses(job).find(e=>e.sequence===response?.sequence);
    if(!expected||JSON.stringify(response)!==JSON.stringify(expected))throw new Error('Invalid fictional response or correlation');
    return expected;
  }
}
export function liveClearinghouseAdapter() {
  throw new Error('Real payer transmission is disabled in this foundation. Contracts, enrollment, coding/eligibility checks and professional compliance review are required before a separately reviewed live implementation.');
}
