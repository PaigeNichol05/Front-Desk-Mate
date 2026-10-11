const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const loads=new WeakMap();
export async function mountClearinghouse(target,id,api,message) {
  const loadId=Symbol();loads.set(target,loadId);
  const data=await api(`/claims/${encodeURIComponent(id)}/transmissions`),job=data.transmissions[0];
  if(loads.get(target)!==loadId||!target.isConnected)return;
  const row=document.querySelector(`[data-claim="${CSS.escape(id)}"]`)?.closest('tr');
  if(row&&job)row.querySelector('.pill').textContent=job.label;
  target.innerHTML=`<div class="card"><h2>Test clearinghouse transmission</h2><p class="notice"><b>${escape(data.notice)}</b></p>
    <p>Real transmission: <b>Disabled</b>. Fictional adapter: <b>${data.simulation_enabled?'Enabled for bundled sample patient only':'Disabled'}</b>.</p>
    ${job?`<p><span class="pill">${escape(job.label)}</span></p><p>Outbox: ${escape(job.state)} · Attempts: ${job.attempts} · Revision: ${job.revision}</p>
    <p>Submission identifier: <code>${escape(job.idempotency_key)}</code></p>
    ${job.last_error?`<p class="error">${escape(job.last_error)}. ${job.state==='EXHAUSTED'?'Retry limit reached; staff investigation required.':'Automatic retry waits for the next eligible attempt.'}</p>`:''}
    ${job.pending_response_count?'<p class="notice">Responses arrived early. Displayed status waits for preceding acknowledgments.</p>':''}
    ${data.simulation_enabled&&!job.scenario?`<form id="simulation-form"><label>Fictional outcome<select name="scenario"><option value="PAID">Accepted, adjudicated, fictional payment</option><option value="REJECTED">Clearinghouse rejection before adjudication</option><option value="DENIED">Payer denial after adjudication</option></select></label><button>Queue fictional simulation</button></form>`:''}
    ${data.simulation_enabled&&job.scenario&&['QUEUED','RETRY','PROCESSING'].includes(job.state)?'<button id="process-simulation">Process due fictional transmission</button>':''}
    ${job.status==='SIMULATED_DENIED'?'<p class="notice"><b>Denial requires billing review.</b> The fictional payer adjudicated this claim. Review the stated reason and supporting records before deciding on a correction or appeal. This demo does not automatically resubmit denials or send appeals.</p>':''}
    ${data.simulation_enabled&&job.status==='SIMULATED_REJECTED'&&job.state==='DONE'?`<form id="correction-form"><h3>Review a fictional rejection correction</h3><p>Change the sample line values that need correction. This creates a new revision and submission identifier; prior evidence remains unchanged. These checks do not verify code validity or coverage.</p>
    ${job.reviewed_lines.map((l,i)=>`<fieldset><legend>Sample line ${i+1}</legend><label>Procedure system<select name="system-${i}"><option ${l.procedure_system==='CPT'?'selected':''}>CPT</option><option ${l.procedure_system==='HCPCS'?'selected':''}>HCPCS</option></select></label><label>Procedure code<input name="procedure-${i}" value="${escape(l.procedure_code)}" required></label><label>Diagnosis code<input name="diagnosis-${i}" value="${escape(l.diagnosis_code)}" required></label><label>Modifier<input name="modifier-${i}" value="${escape(l.modifier)}"></label><label>Units<input name="units-${i}" type="number" min="1" step="1" value="${l.units}" required></label><label>Charge per unit in cents<input name="charge-${i}" type="number" min="0" step="1" value="${l.charge_cents}" required></label><label>Approved authorization ID (if required)<input name="authorization-${i}" value="${escape(l.authorization_id)}"></label></fieldset>`).join('')}
    <label>Reason for the correction<input name="reason" maxlength="500" required></label><label class="check-row"><input name="reviewed" type="checkbox" required> I reviewed these fictional correction values and supporting documentation.</label><button>Queue reviewed fictional correction</button></form>`:''}
    <h3>Fictional response history</h3>${data.transmissions.map(j=>`<h4>Revision ${j.revision} · ${escape(j.label)}</h4><ol>${j.events.map(e=>`<li><b>${escape(e.event_type.replaceAll('_',' '))}</b> — simulation only<p>${escape(e.payload.data.reason||'')}${e.event_type==='REMITTANCE'?`Fictional amount: $${(e.payload.data.amount_cents/100).toFixed(2)}. No real payment.`:''}</p><small>Received ${escape(e.received_at)}</small></li>`).join('')}</ol>`).join('')}`:'<p>No queued transmission record.</p>'}</div>`;
  if(data.simulation_enabled&&job?.scenario&&['QUEUED','RETRY','PROCESSING'].includes(job.state))setTimeout(()=>{if(target.isConnected&&loads.get(target)===loadId)mountClearinghouse(target,id,api,message).catch(message)},1500);
  const refresh=()=>mountClearinghouse(target,id,api,message);
  const action=async(fn)=>{try{await fn();await refresh()}catch(e){message(e)}};
  target.querySelector('#simulation-form')?.addEventListener('submit',e=>{e.preventDefault();const scenario=new FormData(e.target).get('scenario');action(()=>api(`/claims/${id}/simulate`,{method:'POST',body:JSON.stringify({scenario})}))});
  target.querySelector('#process-simulation')?.addEventListener('click',()=>action(()=>api(`/claims/${id}/process-simulation`,{method:'POST'})));
  // Reuse this key after a lost HTTP response; changed form values get a new correction identity.
  let requestKey=crypto.randomUUID();
  const form=target.querySelector('#correction-form');
  form?.addEventListener('input',()=>{requestKey=crypto.randomUUID()});
  form?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(form),lines=job.reviewed_lines.map((l,i)=>({
    procedure_system:f.get(`system-${i}`),procedure_code:f.get(`procedure-${i}`).trim().toUpperCase(),diagnosis_code:f.get(`diagnosis-${i}`).trim().toUpperCase(),
    modifier:f.get(`modifier-${i}`).trim().toUpperCase(),units:Number(f.get(`units-${i}`)),charge_cents:Number(f.get(`charge-${i}`)),authorization_id:f.get(`authorization-${i}`).trim()||null
  }));action(()=>api(`/claims/${id}/correct-simulation`,{method:'POST',body:JSON.stringify({lines,reason:f.get('reason'),reviewed:f.get('reviewed')==='on',request_key:requestKey})}))});
}
