const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=values=>values.map(v=>`<option value="${esc(v)}">${esc(v.replaceAll('_',' '))}</option>`).join('');
const input=(name,label,max=200)=>`<label>${label}<input name="${name}" maxlength="${max}" required></label>`;
export async function mountPayerRegistry(target,api,message,serviceDate='') {
  const d=await api('/billing/payer-registry'+(serviceDate?'?service_date='+encodeURIComponent(serviceDate):''));
  if(!target.isConnected)return;
  target.innerHTML=`<h3>Exact payer and plan review worklist</h3><p class="notice">${esc(d.notice)}</p>
    <p>Each mapping applies only to its named payer, product, jurisdiction, provider context and service scope. “Scoped reviews recorded” means staff recorded the listed checks; it is not coverage approval or a live connection.</p>
    <form data-date><label>Inspect policies for service date<input name="service_date" type="date" value="${esc(serviceDate)}" required></label><button>Inspect dated versions</button></form>
    <details><summary>Add an exact payer / plan mapping</summary><form data-create>
      ${input('payer_name','Legal payer / affiliate name')}
      <label>Payer group<select name="group_id">${d.groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></label>
      ${input('product','Exact product / employer plan reference')}
      <label>Jurisdiction<select name="jurisdiction">${options(['NATIONAL',...d.jurisdictions.map(j=>j.jurisdiction)])}</select></label>
      ${input('vendor','Directory vendor or official payer namespace')}${input('payer_id','Payer ID (keep leading zeroes)',100)}
      ${input('provider_context','Practice / provider context (no credentials)')}${input('service_scope','Services, code identifiers, units, modifiers and setting covered by this review',1000)}
      <label><input name="reviewed" type="checkbox" required>I reviewed this exact identity and scope.</label><button>Save mapping</button>
    </form></details>
    <label>Find a mapped payer<input type="search" data-search placeholder="Payer, plan, state, service or provider context"></label>
    <p data-empty ${d.mappings.length?'hidden':''}>No matching mappings. Unlisted plans remain unmapped; no member benefits are assumed.</p>
    ${d.mappings.map(m=>`<details data-mapping><summary>${esc(m.payer_name)} · ${esc(m.product)} · ${esc(m.jurisdiction)} · ${esc(m.status)}</summary>
      <p>${esc(m.vendor)} / ${esc(m.payer_id)} · ${esc(m.provider_context)}<br>Review scope: ${esc(m.service_scope)}<br>Service date: ${esc(m.service_date)}<br>Unresolved policy/transaction checks: ${m.outstanding.length}; enrollment follow-ups: ${m.enrollment_gaps.length}. Live connection: disabled. Member benefits: not verified.</p>
      <div class="scroll"><table><thead><tr><th>Check</th><th>Current evidence</th><th>Source / applicability</th></tr></thead><tbody>${[['Policy',m.policies],['Transaction',m.transactions]].flatMap(([kind,checks])=>checks.map(c=>`<tr><td>${kind}: ${esc(c.category)}</td><td>${esc(c.status)}<br>${esc(c.monitor)}${c.review?'<br>'+esc(c.review.enrollment_status||''):''}</td><td>${c.review?`<a href="${esc(c.review.source_url)}" target="_blank" rel="noopener noreferrer">${esc(c.review.source_reference)}</a><br>${esc(c.review.effective_from||'Effective date not recorded')} ${esc(c.review.effective_until||'')}<br>${esc(c.review.notes)}`:'Staff review required'}</td></tr>`)).join('')}</tbody></table></div>
      <details><summary>Record a policy review or failed check</summary>${reviewForm(m,'POLICY',d.policy_categories)}</details>
      <details><summary>Record directory support and practice enrollment separately</summary>${reviewForm(m,'TRANSACTION',d.transaction_categories)}</details>
      <details><summary>Immutable evidence history (${m.history.length})</summary>${m.history.map(r=>`<p>${esc(r.created_at)} · ${esc(r.created_by)} · ${esc(r.kind)} / ${esc(r.category)} · ${esc(r.status)}<br>${esc(r.notes)}<br>${esc(r.source_url)}<br>Published: ${esc(r.published_on||'not stated')}; applies: ${esc(r.effective_from||'unknown')} – ${esc(r.effective_until||'not stated')}</p>`).join('')||'<p>No observations recorded.</p>'}</details>
    </details>`).join('')}
    <details><summary>Medicaid / CHIP jurisdiction inventory — ${d.jurisdictions.length} worklists</summary><p>50 states, DC and five territories are enumerated as discovery tasks. Agency programs, CHIP arrangements and managed-care organizations still require individual reconciliation. A mapping count never establishes a complete census.</p><table><thead><tr><th>Jurisdiction</th><th>Mappings</th><th>Agency / MCO census</th></tr></thead><tbody>${d.jurisdictions.map(j=>`<tr><td>${esc(j.jurisdiction)}</td><td>${j.mapping_count}</td><td>Not verified / not verified</td></tr>`).join('')}</tbody></table></details>
    <details><summary>Payer group census gaps</summary><ul>${d.groups.map(g=>`<li>${esc(g.name)}: ${g.mapping_count} exact mappings; census not verified</li>`).join('')}</ul></details>`;
  const reload=()=>mountPayerRegistry(target,api,message,serviceDate);
  target.querySelector('[data-date]').onsubmit=e=>{e.preventDefault();mountPayerRegistry(target,api,message,new FormData(e.target).get('service_date')).catch(message);};
  target.querySelector('[data-search]').oninput=e=>{let count=0;target.querySelectorAll('[data-mapping]').forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(e.target.value.trim().toLowerCase());if(!el.hidden)count++;});target.querySelector('[data-empty]').hidden=count>0;};
  target.querySelector('[data-create]').onsubmit=async e=>{
    e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.reviewed=b.reviewed==='on';const button=e.target.querySelector('button');button.disabled=true;
    try{await api('/billing/payer-registry',{method:'POST',body:JSON.stringify(b)});await reload()}catch(error){message(error);button.disabled=false;}
  };
  target.querySelectorAll('[data-review]').forEach(form=>form.onsubmit=async e=>{
    e.preventDefault();const b=Object.fromEntries(new FormData(form)),m=d.mappings.find(m=>m.id===form.dataset.mappingId);
    b.kind=form.dataset.review;b.reviewed=b.reviewed==='on';b.request_key=form.dataset.requestKey;
    b.expected_latest_id=m.history.find(r=>r.kind===b.kind&&r.category===b.category)?.id||null;
    const button=form.querySelector('button');button.disabled=true;
    try{await api(`/billing/payer-registry/${encodeURIComponent(m.id)}/reviews`,{method:'POST',body:JSON.stringify(b)});await reload()}catch(error){message(error);button.disabled=false;}
  });
}
function reviewForm(m,kind,categories) {
  return `<form data-review="${kind}" data-mapping-id="${esc(m.id)}" data-request-key="${crypto.randomUUID()}">
    <label>Category<select name="category">${options(categories)}</select></label>
    <label>Observation<select name="status">${options(kind==='POLICY'?['NOT_CHECKED','CHECKED','CHANGED','INACCESSIBLE','UNMAPPED']:['UNKNOWN','SUPPORTED','NOT_SUPPORTED','ENROLLMENT_REQUIRED','INACCESSIBLE'])}</select></label>
    ${input('source_url','Official source URL / public evidence reference (HTTPS, no query or token)',1500)}${input('source_reference','Document title / version or authorized internal reference',500)}
    <label>Publication date (leave blank if unstated)<input name="published_on" type="date"></label>
    ${kind==='POLICY'?'<label>Effective from (required for checked / changed)<input name="effective_from" type="date"></label><label>Effective through (optional)<input name="effective_until" type="date"></label>':`<label>Practice transaction enrollment<select name="enrollment_status">${options(['UNKNOWN','REQUIRED_PENDING','NOT_REQUIRED','STAFF_CONFIRMED'])}</select></label><label>Enrollment evidence reference (required if staff confirmed)<input name="enrollment_reference" maxlength="500"></label>`}
    <label>Findings, code identifiers, units/modifiers, deadline trigger and exceptions — no patient data or licensed descriptions<textarea name="notes" maxlength="3000" required></textarea></label>
    <label><input type="checkbox" name="reviewed" required>I reviewed this observation and its applicability. It does not verify individual benefits.</label><button>Append dated review</button></form>`;
}
