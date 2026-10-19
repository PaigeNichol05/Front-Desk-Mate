const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => v == null ? 'Not supplied' : `$${(v / 100).toFixed(2)} USD`;
const list = items => items?.length ? `<ul>${items.map(x => `<li>${escape(x)}</li>`).join('')}</ul>` : '<p>None supplied; completeness is not established.</p>';
export function eligibilitySummary(d) {
  if (!d) return '<p>No matching eligibility simulation. Coverage remains unverified.</p>';
  const r = d.response;
  return `<div class="item"><h3>Simulated eligibility · ${escape(d.outcome)}</h3>
    <p class="notice"><b>Professional review required.</b> Procedure coverage is not established. No authorization or payment decision was obtained.${d.stale ? ' This response needs rechecking.' : ''}</p>
    <p>Received ${escape(d.created_at)} · recheck after ${escape(d.recheck_on)}<br>Request ${escape(d.id)}</p>
    ${d.error ? `<p class="error">${escape(d.error.code)}: ${escape(d.error.message)}</p>` : ''}
    ${r ? `<div class="scroll"><table><tbody>
      <tr><th>Member eligibility</th><td>${escape(r.member_eligibility.status)} · ${escape(r.member_eligibility.starts_on)} – ${escape(r.member_eligibility.ends_on)}</td></tr>
      <tr><th>Provider network</th><td>${escape(r.network.status)} · ${escape(r.network.provider_reference)} · ${escape(r.network.starts_on)} – ${escape(r.network.ends_on)}</td></tr>
      <tr><th>Specific procedure coverage</th><td>${escape(r.service_coverage.status)} · ${escape(r.service_coverage.reason)}</td></tr>
      <tr><th>Authorization</th><td>${escape(r.authorization.requirement)} · decision ${escape(r.authorization.decision)}</td></tr>
      <tr><th>Payment</th><td>${escape(r.payment.decision)} · no guarantee</td></tr>
    </tbody></table></div>
    <h4>General plan benefit categories</h4>${r.plan_benefits.length ? r.plan_benefits.map(b => `<div class="item"><b>${escape(b.category)}</b> · ${escape(b.status)}<br>Effective ${escape(b.starts_on)} – ${escape(b.ends_on)}
      <p>Individual deductible: ${money(b.deductible?.individual_cents)} · remaining: ${money(b.deductible?.remaining_cents)}<br>${escape(b.deductible ? `${b.deductible.period} · ${b.deductible.scope}` : 'Deductible period and network scope not supplied')}<br>Copayment: ${money(b.copayment?.amount_cents)} · ${escape(b.copayment ? `${b.copayment.basis} · ${b.copayment.scope}` : 'Copayment basis not supplied')}<br>Coinsurance: ${b.coinsurance_percent == null ? 'Not supplied' : escape(b.coinsurance_percent) + '%'}<br>Authorization indicator: ${escape(b.authorization_indicator)}</p>
      <b>Limitations</b>${list(b.limitations)}<b>Exclusions</b>${list(b.exclusions)}</div>`).join('') : '<p>No active benefit categories supplied.</p>'}
    <h4>Missing information</h4>${list(r.missing_information)}
    <p><small>${escape(r.provenance.source)} · ${escape(r.provenance.adapter)} ${escape(r.provenance.version)}<br>Correlation: ${escape(r.provenance.correlation_id)}<br>Response SHA-256: ${escape(d.response_hash)}</small></p>` : '<p>No benefit response is available. A failed request establishes no eligibility, coverage or patient cost.</p>'}
    ${d.reviews?.length ? `<h4>Staff review history</h4>${d.reviews.map(v => `<p>${escape(v.disposition)} · ${escape(v.reviewed_by)} · ${escape(v.reviewed_at)}<br>${escape(v.notes)}</p>`).join('')}` : ''}
    <p class="muted">${escape(d.notice)}</p></div>`;
}

export async function mountEligibility(target, me, api, message, getContext, encounters, onUpdate) {
  const config = await api('/billing/eligibility/config');
  if (!target.isConnected) return () => {};
  const writer = ['BILLER', 'ADMIN'].includes(me.role);
  target.innerHTML = `<h3>Electronic eligibility simulation</h3><p class="notice">${escape(config.notice)}</p>
    <p>Uses the patient, exact plan, provider and documented service context selected above. Simulation supports only Jordan Sample’s bundled encounter.</p>
    ${writer ? `<form data-eligibility-request><div class="grid">
      <label>Fictional member identifier<input name="member_id" value="${escape(config.fixture.member_id)}" readonly></label>
      <label>Fictional payer routing identifier<input name="payer_id" value="${escape(config.fixture.payer_id)}" readonly></label>
      <label>Fictional provider reference<input name="provider_reference" value="${escape(config.fixture.provider_reference)}" readonly></label>
      <label>Encounter service date<input name="service_date" type="date" readonly required></label>
      <label>Test response scenario<select name="scenario">${config.scenarios.map(s => `<option>${escape(s)}</option>`).join('')}</select></label>
    </div><label class="check-row"><input name="fictional_confirmed" type="checkbox" required> I am using the fictional test specimen.</label>
    <button ${config.simulation_enabled ? '' : 'disabled'}>Run simulated eligibility request</button>
    ${config.simulation_enabled ? '' : '<p>Simulation is disabled. Use the local demo launcher to enable it.</p>'}</form>` : '<p>Billing staff can run a simulation and record professional review. You can inspect its history.</p>'}
    <button class="secondary" type="button" data-refresh-eligibility>View immutable eligibility history</button>
    <div data-eligibility-history aria-live="polite"></div>`;
  const form = target.querySelector('[data-eligibility-request]');
  let pending = null;
  const sync = () => {
    pending = null;
    if (form) form.elements.service_date.value = encounters.find(e => e.id === getContext().encounter_id)?.date_of_service || '';
    target.querySelector('[data-eligibility-history]').innerHTML = '';
  };
  const history = async () => {
    const id = getContext().encounter_id;
    if (!id) return;
    const data = await api(`/encounters/${encodeURIComponent(id)}/eligibility`);
    if (!target.isConnected || getContext().encounter_id !== id) return;
    const slot = target.querySelector('[data-eligibility-history]');
    slot.innerHTML = data.history.length ? data.history.map((d, i) => `<details ${i === 0 ? 'open' : ''}><summary>${escape(d.created_at)} · ${escape(d.request.scenario)} · ${escape(d.outcome)} · saved context</summary>
      <p>Plan ${escape(d.request.context.plan_reference)} · service ${escape(d.request.context.service_date)} · ${escape(d.request.context.procedure_code)} · diagnosis ${escape(d.request.context.diagnosis_code)} · ${d.request.context.units} units · modifier ${escape(d.request.context.modifier || 'none')} · POS ${escape(d.request.context.place_of_service)}<br>Historical snapshot; only an exact current-context match appears in the coverage summary.</p>
      ${eligibilitySummary(d)}${writer ? `<form data-review-request="${escape(d.id)}"><label>Review disposition<select name="disposition"><option>NEEDS_INFORMATION</option><option>REVIEWED_SIMULATION_ONLY</option></select></label><label>Review notes and outstanding verification<textarea name="notes" maxlength="3000" required></textarea></label><label class="check-row"><input type="checkbox" name="reviewed" required> I reviewed this simulation; real procedure coverage remains unverified.</label><button>Save immutable eligibility review</button></form>` : ''}</details>`).join('') : '<p>No eligibility attempts recorded for this encounter.</p>';
    slot.querySelectorAll('[data-review-request]').forEach(f => f.onsubmit = async ev => {
      ev.preventDefault(); const button = f.querySelector('button'); button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(f));
        await api(`/billing/eligibility/${encodeURIComponent(f.dataset.reviewRequest)}/reviews`, { method: 'POST', body: JSON.stringify({ ...values, reviewed: values.reviewed === 'on' }) });
        await history(); await onUpdate();
      } catch (err) { message(err); button.disabled = false; }
    });
  };
  form?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const values = Object.fromEntries(new FormData(form)), context = getContext();
    if (!context.plan_reference || !context.procedure_code || !context.diagnosis_code || !context.place_of_service) { message('Complete the coverage context above first.'); return; }
    const fingerprint = JSON.stringify({ context, values });
    if (pending?.fingerprint !== fingerprint) pending = { fingerprint, key: crypto.randomUUID() };
    const button = form.querySelector('button'); button.disabled = true;
    try {
      await api('/billing/eligibility', { method: 'POST', body: JSON.stringify({ ...context, ...values, fictional_confirmed: values.fictional_confirmed === 'on', request_key: pending.key }) });
      pending = null; // A recorded failure is terminal; an explicit new click creates a new attempt.
      await history(); await onUpdate();
    } catch (err) { message(err); } finally { if (button.isConnected) button.disabled = false; }
  });
  target.querySelector('[data-refresh-eligibility]').onclick = () => history().catch(message);
  sync();
  return sync;
}
