const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function mountVitals(target, encounter, me, api, message) {
  if (!['PHYSICIAN', 'PATIENT'].includes(me.role)) return;
  const path = `/encounters/${encodeURIComponent(encounter.id)}/vitals`;
  const data = await api(path);
  if (!target.isConnected) return;
  const write = me.role === 'PHYSICIAN' && encounter.status === 'OPEN';
  const localTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  target.innerHTML = `<h3>Blood pressure & heart rate</h3><p class="notice">${escape(data.notice)}</p>
    ${data.history.length ? `<div class="scroll"><table><thead><tr><th>Measured</th><th>Blood pressure · mmHg</th><th>Heart rate · beats/min</th><th>Source & provenance</th><th>Record</th></tr></thead><tbody>${data.history.map(v => `<tr><td>${escape(v.measured_at)}</td><td>${v.systolic == null ? 'Not recorded' : `${v.systolic} / ${v.diastolic}`}</td><td>${v.heart_rate ?? 'Not recorded'}</td><td>${escape(v.source)}<br>${escape(v.source_reference)}<br>${escape(v.position)} · ${escape(v.arm)}<br>${escape(v.notes)}</td><td>${v.current ? 'Current' : 'Corrected; retained'}<br>${escape(v.recorded_by)}<br>${escape(v.recorded_at)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No observations recorded.</p>'}
    ${write ? `<form data-vitals><div class="grid"><label>Systolic pressure · mmHg<input name="systolic" type="number" min="20" max="350" step="1"></label><label>Diastolic pressure · mmHg<input name="diastolic" type="number" min="10" max="250" step="1"></label><label>Pulse · beats/min<input name="heart_rate" type="number" min="10" max="300" step="1"></label><label>Measured at · your local time<input name="measured_at" type="datetime-local" value="${escape(localTime)}" required></label><label>Measurement source / device label<input name="source_reference" placeholder="Fictional manual reading from sample cuff" maxlength="300" required></label><label>Position<select name="position"><option>SEATED</option><option>STANDING</option><option>LYING</option><option>UNSPECIFIED</option></select></label><label>Arm<select name="arm"><option>LEFT</option><option>RIGHT</option><option>UNSPECIFIED</option></select></label></div><label>Record type<select name="supersedes_id"><option value="">New observation</option>${data.history.filter(v => v.current).map(v => `<option value="${escape(v.id)}">Correct ${escape(v.measured_at)} · ${v.systolic ?? '—'}/${v.diastolic ?? '—'} · pulse ${v.heart_rate ?? '—'}</option>`).join('')}</select></label><label>Notes / correction reason<textarea name="notes" maxlength="1000"></textarea></label><label class="check-row"><input type="checkbox" name="reviewed" required> I checked these fictional values, units, patient and measurement time.</label><button>Save blood pressure and pulse</button></form>
      <button class="secondary" type="button" data-sample-vitals>Generate fixed sample readings · 118/76 · pulse 72</button>` : '<p>Only the assigned physician can add observations before signing.</p>'}`;
  const save = async (b, button) => {
    button.disabled = true;
    try { await api(path, { method: 'POST', body: JSON.stringify(b) }); await mountVitals(target, encounter, me, api, message); }
    catch (err) { message(err); button.disabled = false; }
  };
  target.querySelector('[data-vitals]')?.addEventListener('submit', ev => {
    ev.preventDefault(); const b = Object.fromEntries(new FormData(ev.target));
    for (const key of ['systolic', 'diastolic', 'heart_rate']) b[key] = b[key] === '' ? null : Number(b[key]);
    b.measured_at = new Date(b.measured_at).toISOString(); b.reviewed = b.reviewed === 'on'; b.source = 'MANUAL';
    save(b, ev.target.querySelector('button'));
  });
  target.querySelector('[data-sample-vitals]')?.addEventListener('click', ev => save({ source: 'SIMULATED_DEVICE', reviewed: true }, ev.target));
}
