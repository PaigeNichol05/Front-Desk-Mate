const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function mountBillingMaintenance(target, me, api, message) {
  const d = await api('/billing/maintenance');
  if (!target.isConnected) return;
  target.innerHTML = `<div class="card"><h2>Billing code updates & policy audits</h2>
    <p class="notice">${escape(d.notice)}</p>
    <p><b>Automatic checks: ${d.scheduled ? 'enabled · every five days while this server is running' : 'disabled'}</b><br>${d.scheduled ? 'Next due: ' + escape(d.next_due) + '. Failed source checks retry after one hour.' : 'Enable BILLING_AUDIT_ENABLED on the application server to run scheduled checks.'}</p>
    <button type="button" data-run-billing-audit ${d.running ? 'disabled' : ''}>${d.running ? 'Audit running · refresh to check results' : 'Check official billing sources now'}</button>
    <button type="button" class="secondary" data-refresh-audits>Refresh audit status</button>
    <h3>Installed catalogs for ${escape(d.installed[0]?.checked_for_date || 'today')}</h3>
    <div class="scroll"><table><thead><tr><th>Code system</th><th>Installed release</th><th>Available entries</th><th>Review status</th></tr></thead><tbody>${d.installed.map(c => `<tr><td>${escape(c.system)}</td><td>${escape(c.source?.version || 'No dated source installed')}</td><td>${c.count ?? 0}</td><td>${escape(c.status)}</td></tr>`).join('')}</tbody></table></div>
    <p>Installed does not mean independently verified as the latest release. Missing, deleted and future-effective codes need review for the encounter date. CPT requires licensed content.</p>
    <details><summary>Official source directory · service-specific policies</summary><p>Search the applicable payer’s index by service or code. One policy can address many services. Public indexes do not include every plan, employer exception or portal-only instruction. The monitor fingerprints these specific pages/documents; it does not independently check every linked document.</p><ul>${d.sources.map(s => `<li><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a> · ${escape(s.kind)}</li>`).join('')}</ul></details>
    <h3>Audit history</h3>${d.history.length ? d.history.map((run, i) => `<details ${i === 0 ? 'open' : ''}><summary>${escape(run.completed_at)} · ${escape(run.outcome)}</summary><p>${escape(run.trigger_kind)} · ${escape(run.actor_id)}</p><div class="scroll"><table><thead><tr><th>Source</th><th>Result</th><th>Follow-up</th></tr></thead><tbody>${run.results.map(r => `<tr><td>${escape(d.sources.find(s => s.id === r.id)?.title || r.id)}</td><td>${escape(r.status)}${r.error_code ? '<br>' + escape(r.error_code) : ''}</td><td>${r.status === 'CHECK_FAILED' ? 'Unknown; source access/retry required' : r.status === 'SOURCE_CHANGED_REVIEW_REQUIRED' ? 'Inspect publisher changes before updating codes or policy rules' : 'Fingerprint only; no code or coverage conclusion'}${r.new_release_links?.length ? `<details><summary>${r.new_release_links.length} newly observed release links</summary><ul>${r.new_release_links.map(link => `<li><a href="${escape(link)}" target="_blank" rel="noopener noreferrer">${escape(link)}</a></li>`).join('')}</ul></details>` : ''}<br><small>${escape(r.sha256 || '')}</small></td></tr>`).join('')}</tbody></table></div></details>`).join('') : '<p>No source audit has completed. No freshness assertion is available.</p>'}
    <h3>Reviewed code releases</h3><p>Updates are staged separately from active codes. Publication selects a complete release by service date for new lookups; earlier signed reviews and claims retain their snapshots. Publisher/source and licensing rights are attested by your administrator.</p>
    ${d.releases.length ? d.releases.map(r => `<details><summary>${escape(r.system)} ${escape(r.version)} · ${escape(r.status)}</summary><p>${escape(r.starts_on)} – ${escape(r.ends_on)} · ${r.summary.count} codes<br>Compared at ${escape(r.summary.comparison_date)}: ${r.summary.added} added · ${r.summary.removed} removed · ${r.summary.changed} changed<br>${escape(r.summary.notice)}<br>Source: <a href="${escape(r.source_url)}" target="_blank" rel="noopener noreferrer">${escape(r.source_url)}</a><br>Data SHA-256: ${escape(r.data_sha256)}</p>${r.published_at ? `<p>Published by ${escape(r.published_by)} · ${escape(r.published_at)}</p>` : me.role === 'ADMIN' ? `<form data-publish-release="${escape(r.id)}"><label>Review notes<textarea name="notes" maxlength="3000" required></textarea></label><label class="check-row"><input type="checkbox" name="reviewed" required> I checked the complete source data, changes, licensing and effective dates.</label><button>Publish reviewed code release</button></form>` : '<p>An administrator must review and publish this release.</p>'}</details>`).join('') : '<p>No additional releases staged. Bundled catalogs and existing licensed CPT imports remain in use where date-valid.</p>'}
    ${me.role === 'ADMIN' ? `<details><summary>Stage an authorized complete code release</summary><p>Upload normalized JSON from a verified publisher/vendor source: system, version, starts_on, ends_on, source_url, source_sha256 and codes [{code, description, starts_on, ends_on}]. CPT also requires license_reference. This does not download or authenticate the source file for you. Maximum 100,000 codes and 24 MB. Use a complete release, never a partial patch.</p><form data-stage-release><label>Complete normalized JSON release<input name="file" type="file" accept="application/json,.json" required></label><label class="check-row"><input name="complete_release" type="checkbox" required> This is the complete release for the specified system and dates.</label><label class="check-row"><input name="rights_attested" type="checkbox" required> I verified source provenance and our rights to use/display this content.</label><button>Stage code release for review</button></form></details>` : ''}
  </div>`;
  const reload = () => mountBillingMaintenance(target, me, api, message);
  target.querySelector('[data-refresh-audits]').onclick = () => reload().catch(message);
  target.querySelector('[data-run-billing-audit]').onclick = async ev => {
    const button = ev.target; button.disabled = true; button.textContent = 'Checking public sources…';
    try { await api('/billing/maintenance/run', { method: 'POST', body: '{}' }); await reload(); }
    catch (error) { message(error); if (button.isConnected) { button.disabled = false; button.textContent = 'Check official billing sources now'; } }
  };
  target.querySelector('[data-stage-release]')?.addEventListener('submit', async ev => {
    ev.preventDefault(); const f = new FormData(ev.target), file = f.get('file'), button = ev.target.querySelector('button');
    button.disabled = true;
    try {
      if (file.size > 24000000) throw Error('Maximum file size is 24 MB');
      const b = JSON.parse(await file.text());
      await api('/billing/catalog-releases', { method: 'POST', body: JSON.stringify({ ...b, complete_release: f.get('complete_release') === 'on', rights_attested: f.get('rights_attested') === 'on' }) });
      await reload();
    } catch (error) { message(error); button.disabled = false; }
  });
  target.querySelectorAll('[data-publish-release]').forEach(f => f.onsubmit = async ev => {
    ev.preventDefault(); const values = Object.fromEntries(new FormData(f)), r = d.releases.find(r => r.id === f.dataset.publishRelease), button = f.querySelector('button');
    button.disabled = true;
    try { await api(`/billing/catalog-releases/${encodeURIComponent(r.id)}/publish`, { method: 'POST', body: JSON.stringify({ ...values, reviewed: values.reviewed === 'on', data_sha256: r.data_sha256 }) }); await reload(); }
    catch (error) { message(error); button.disabled = false; }
  });
}
