const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountAuthorizationPlanning(target,api,message,getContext,validateContext){
  let generation=0;
  const refresh=async()=>{
    const generationNow=++generation,id=getContext().encounter_id;
    if(!id){target.textContent='Select an encounter to review planned services.';return;}
    const [services,history]=await Promise.all([api(`/encounters/${encodeURIComponent(id)}/services`),api(`/encounters/${encodeURIComponent(id)}/authorization-drafts`)]);
    if(!target.isConnected||generationNow!==generation||getContext().encounter_id!==id)return;
    const planned=services.services.filter(s=>s.state==='ORDERED');
    target.innerHTML=`<h3>Before the procedure · authorization planning</h3><p class="notice">${esc(history.notice)}</p><p>Use the exact plan, code, diagnosis, provider and service date above. This creates a source-linked internal worksheet. Staff must verify whether authorization is required with the payer before elective care. A planned order is never billed as performed.</p>
      ${planned.length?`<form data-auth-draft><label>Clinician-documented planned service<select name="service_id">${planned.map(s=>`<option value="${esc(s.id)}">${esc(s.category)} · ${esc(s.details.description)}</option>`).join('')}</select></label><label>Proposed procedure date · may differ from this consultation<input name="proposed_service_date" type="date" required></label><label class="check-row"><input type="checkbox" name="reviewed" required> I checked that the selected code, diagnosis, proposed date and provider match this documented plan; this is not authorization approval.</label><button>Prepare authorization review worksheet</button></form>`:'<p>No current ordered services. The clinician must document and record the planned order first under “What happened at this appointment?”</p>'}
      ${history.drafts.map(d=>`<details><summary>${esc(d.created_at)} · ${esc(d.service.details.description)} · ${d.stale?'STALE · recheck required':'DRAFT · payer review required'}</summary><p>Plan ${esc(d.context.plan_reference)} · provider ${esc(d.context.provider_id)} · ${esc(d.context.service_date)}<br>${esc(d.context.procedure_system)} ${esc(d.context.procedure_code)} · ${esc(d.selected_codes.procedure.description)}<br>Diagnosis ${esc(d.context.diagnosis_code)} · ${d.context.units} units · modifier ${esc(d.context.modifier||'none')} · POS ${esc(d.context.place_of_service)}</p><p><b>Source note</b><br>${esc(d.service.source_text)}</p><p>Authorization requirement: ${esc(d.requirement)}<br>Decision: ${esc(d.decision)} · not submitted</p><b>Still required</b><ul>${d.missing_information.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details>`).join('')}`;
    target.querySelector('[data-auth-draft]')?.addEventListener('submit',async ev=>{
      ev.preventDefault();if(!validateContext())return;const button=ev.target.querySelector('button');button.disabled=true;
      try{const f=Object.fromEntries(new FormData(ev.target));await api('/billing/authorization-drafts',{method:'POST',body:JSON.stringify({...getContext(),...f,reviewed:f.reviewed==='on'})});await refresh()}catch(e){message(e);button.disabled=false}
    });
  };
  await refresh();
  return ()=>{target.innerHTML='';refresh().catch(message)};
}
