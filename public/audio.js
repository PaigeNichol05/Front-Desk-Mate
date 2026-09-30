const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountAudio(target, encounter, user, api, message) {
  if (!target || !['PHYSICIAN','PATIENT'].includes(user.role)) return;
  try {
    const config = await api('/audio/config');
    if (!config.enabled) { target.innerHTML = '<p class="notice">Durable synthetic audio is disabled. No microphone recording is available.</p>'; return; }
    const refresh = async () => {
      if (!target.isConnected) return;
      const rows = await api(`/encounters/${encounter.id}/audio`);
      if (!target.isConnected) return;
      const physician = user.role === 'PHYSICIAN';
      const action = (r, name, label) => `<button type="button" data-id="${escape(r.id)}" data-action="${name}">${label}</button>`;
      const terminal = r => ['REFUSED','STOPPED','DELETED','DELETION_PENDING'].includes(r.state);
      const expired = r => r.expires_at <= new Date().toISOString();
      target.innerHTML = `<h3>Durable visit audio · synthetic demonstration</h3><button type="button" class="secondary" id="refresh-audio">Refresh consent and release status</button><p class="notice">Generated tone only. No microphone, audio uploads, real visits, or transcription. Stored consent is simulated.</p><p>${escape(config.statement)}</p>${physician && encounter.status === 'OPEN' && !rows.some(r => !['REFUSED','STOPPED','DELETED'].includes(r.state)) ? '<button type="button" id="create-audio">Create fictional audio attempt</button>' : ''}${rows.map(r => {
        const playable = r.available && (physician || r.state === 'PUBLISHED');
        return `<div class="item"><p><b>${escape(r.state)}</b> · created ${escape(r.created_at)} · expires ${escape(r.expires_at)}</p><p>Consent history: ${r.consents.map(c => `${escape(c.participant_id)}: ${escape(c.decision)} (${escape(c.occurred_at)})`).join('; ') || 'Both participants pending'}</p><div>${!terminal(r) && !expired(r) ? `${['CONSENT_PENDING','READY'].includes(r.state) ? action(r,'agree','Agree as my signed-in sample participant') + action(r,'refuse','Refuse · discard attempt') : action(r,'withdraw','Withdraw my consent · remove audio')}${physician ? ({READY:action(r,'start','Start synthetic attempt'),RECORDING:action(r,'complete','Finish and save generated tone') + action(r,'stop','Stop · discard attempt'),DRAFT:action(r,'approve','I reviewed this synthetic draft · approve'),APPROVED:action(r,'publish','Release approved tone to patient portal')}[r.state] || '') : ''}${physician && ['CONSENT_PENDING','READY'].includes(r.state) ? action(r,'stop','Cancel · no audio saved') : ''}` : ''}${physician && r.state !== 'DELETED' ? action(r,'delete','Delete · revoke access') : ''}${physician ? action(r,'events','View audio audit events') : ''}</div>${playable ? `<p><audio controls preload="none" src="/api/audio/${encodeURIComponent(r.id)}/content"></audio></p><a href="/api/audio/${encodeURIComponent(r.id)}/content?download=1">Download fictional tone</a>` : '<p>No playable audio for this view.</p>'}<div data-events="${escape(r.id)}" aria-live="polite"></div></div>`;
      }).join('') || '<p>No audio attempts. Patient consent is documented after the physician creates one.</p>'}`;
      target.querySelector('#refresh-audio')?.addEventListener('click',()=>refresh().catch(message));
      target.querySelector('#create-audio')?.addEventListener('click', async event => {
        event.target.disabled = true;
        try { await api(`/encounters/${encounter.id}/audio`, {method:'POST',body:JSON.stringify({fictional:true})}); await refresh(); } catch (e) { message(e); event.target.disabled = false; }
      });
      target.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const id = button.dataset.id, action = button.dataset.action;
          if (action === 'events') {
            const events = await api(`/audio/${id}/events`);
            target.querySelector(`[data-events="${id}"]`).innerHTML = events.map(e => `<p>${escape(e.occurred_at)} · ${escape(e.actor_id)} · ${escape(e.action)}</p>`).join('');
            button.disabled = false; return;
          }
          if (['agree','refuse','withdraw'].includes(action)) await api(`/audio/${id}/consent`, {method:'POST',body:JSON.stringify({decision:{agree:'AGREED',refuse:'REFUSED',withdraw:'WITHDRAWN'}[action],statement_version:config.statement_version})});
          else if (action === 'delete') await api(`/audio/${id}`, {method:'DELETE'});
          else await api(`/audio/${id}/${action}`, {method:'POST',body:'{}'});
          await refresh();
        } catch (e) { message(e); button.disabled = false; }
      }));
    };
    await refresh();
  } catch (e) { message(e); }
}
