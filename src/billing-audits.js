import { createHash } from 'node:crypto';
import { uid, audit } from './db.js';
import { catalogManifest, searchCodes } from './code-coverage.js';
import { catalogReleases } from './catalog-updates.js';
import { BILLING_SOURCES, payerMonitoringCoverage } from './billing-sources.js';

export const BILLING_AUDIT_INTERVAL = 5 * 86400000;
export { BILLING_SOURCES } from './billing-sources.js';
const fail = (status, message) => Object.assign(Error(message), { status });
const iso = ms => new Date(ms).toISOString();
const fingerprint = data => createHash('sha256').update(data).digest('hex');
const notice = 'Public source monitoring and reviewed catalog updates only. A changed page/PDF is not proof of a code or coverage change. Policy indexes do not verify every linked policy, patient benefit or payer rule. No patient information is transmitted.';

export function migrateBillingAudits(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS billing_audit_state (
    org_id TEXT PRIMARY KEY REFERENCES organizations(id), next_due_ms INTEGER NOT NULL,
    lease_token TEXT, lease_until_ms INTEGER, started_at TEXT
  );
  CREATE TABLE IF NOT EXISTS billing_audit_runs (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), actor_id TEXT NOT NULL,
    trigger_kind TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT NOT NULL,
    outcome TEXT NOT NULL, results_json TEXT NOT NULL, installed_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS audit_run_scope ON billing_audit_runs(org_id);
  CREATE TRIGGER IF NOT EXISTS billing_runs_no_update BEFORE UPDATE ON billing_audit_runs BEGIN SELECT RAISE(ABORT,'Billing audit history is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS billing_runs_no_delete BEFORE DELETE ON billing_audit_runs BEGIN SELECT RAISE(ABORT,'Billing audit history is immutable'); END;`);
}
function staff(db, user) {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND org_id=? AND active=1').get(user.id, user.org_id);
  if (!u || !['BILLER', 'ADMIN'].includes(u.role)) throw fail(403, 'Billing audit staff permission required');
  return u;
}
function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = work(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
// Fixed public registry only. Caller-supplied URLs, patient data and credentials are never accepted.
export async function readBillingSource(source, fetcher = globalThis.fetch) {
  if (!BILLING_SOURCES.includes(source)) throw fail(400, 'Unsupported billing source');
  const signal = AbortSignal.timeout(8000);
  let url = new URL(source.url);
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetcher(url.href, { redirect: 'manual', signal, credentials: 'omit', headers: { Accept: source.type === 'PDF' ? 'application/pdf' : 'text/html' } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw Object.assign(Error('Source redirect unavailable'), { code: 'SOURCE_REDIRECT' });
      const next = new URL(location, url);
      if (next.protocol !== 'https:' || next.hostname !== new URL(source.url).hostname || next.port || next.username || next.password) throw Object.assign(Error('Unapproved source redirect'), { code: 'SOURCE_REDIRECT' });
      url = next; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(Error('Public source unavailable'), { code: [401, 403].includes(response.status) ? 'ACCESS_REQUIRED' : 'SOURCE_HTTP_ERROR' }); }
    const contentType = response.headers.get('content-type') || '';
    if (!(source.type === 'PDF' ? /application\/pdf/i : /text\/html/i).test(contentType)) { await response.body?.cancel(); throw Object.assign(Error('Unexpected source format'), { code: 'SOURCE_FORMAT' }); }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) throw Object.assign(Error('Source response too large'), { code: 'SOURCE_TOO_LARGE' });
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (!bytes.length || (source.type === 'PDF' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))) throw Object.assign(Error('Invalid source content'), { code: 'SOURCE_FORMAT' });
    const content = bytes.toString('utf8');
    if (source.html_marker && !content.includes(source.html_marker)) throw Object.assign(Error('Directory data not present in public response'), { code: 'SOURCE_FORMAT' });
    if (source.type === 'HTML' && (/type\s*=\s*["']password/i.test(content) || /<title[^>]*>[^<]*(?:sign in|log in|access denied|verify you are human|just a moment)/i.test(content))) throw Object.assign(Error('Source requires access or verification'), { code: 'ACCESS_REQUIRED' });
    const links = source.kind === 'CODE_RELEASE_INDEX' ? [...content.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => {
      try { const u = new URL(m[1].replaceAll('&amp;', '&'), url); return u.protocol === 'https:' && u.hostname === 'www.cms.gov' && /\.(zip|xlsx|txt|csv)(?:\?|$)/i.test(u.href) ? u.href : null; } catch { return null; }
    }).filter(Boolean) : [];
    return { sha256: fingerprint(bytes), bytes: bytes.length, retrieved_url: url.href, release_links: [...new Set(links)].sort().slice(0, 250) };
  }
  throw Object.assign(Error('Too many source redirects'), { code: 'SOURCE_REDIRECT' });
}
function installed(db, orgId, day) {
  // Service lookups use the same selection path. No refresh can silently change these snapshots.
  const user = db.prepare("SELECT id,org_id FROM users WHERE org_id=? AND active=1 AND role IN ('ADMIN','BILLER') ORDER BY id LIMIT 1").get(orgId);
  if (!user) return [{ status: 'NO_ACTIVE_BILLING_STAFF' }];
  return ['HCPCS', 'ICD10CM', 'CPT'].map(system => {
    const r = searchCodes(db, user, { system, service_date: day, q: '' });
    return { system, available_for_date: r.available, checked_for_date: day, count: r.total, source: r.source,
      status: r.available ? 'INSTALLED_VERSION_REVIEW_FRESHNESS' : system === 'CPT' ? 'LICENSED_IMPORT_REQUIRED' : 'NO_CATALOG_FOR_DATE' };
  });
}
export function createBillingAudits(db, { scheduled = false, reader = readBillingSource, clock = Date.now } = {}) {
  const seedStates = () => {
    for (const org of db.prepare('SELECT id FROM organizations').all()) db.prepare('INSERT OR IGNORE INTO billing_audit_state(org_id,next_due_ms) VALUES (?,?)').run(org.id, clock());
  };
  seedStates();
  async function run(orgId, actorId, triggerKind) {
    const started = clock(), token = uid(), actor = { id: actorId, org_id: orgId };
    transaction(db, () => {
      const state = db.prepare('SELECT * FROM billing_audit_state WHERE org_id=?').get(orgId);
      if (state.lease_token && state.lease_until_ms > started) throw fail(409, 'A billing-source audit is already running');
      if (state.lease_token) {
        db.prepare('INSERT INTO billing_audit_runs VALUES (?,?,?,?,?,?,?,?,?)').run(state.lease_token, orgId, 'SYSTEM_BILLING_AUDIT', 'RECOVERY', state.started_at, iso(started), 'INTERRUPTED', '[]', '[]');
        audit(db, { id: 'SYSTEM_BILLING_AUDIT', org_id: orgId }, 'RECOVER_INTERRUPTED_BILLING_AUDIT', 'billing_audit_run', state.lease_token);
      }
      db.prepare('UPDATE billing_audit_state SET lease_token=?,lease_until_ms=?,started_at=? WHERE org_id=?').run(token, started + 120000, iso(started), orgId);
      audit(db, actor, 'START_BILLING_SOURCE_AUDIT', 'billing_audit_run', token);
    });
    const previous = new Map();
    for (const row of db.prepare('SELECT results_json FROM billing_audit_runs WHERE org_id=? ORDER BY rowid DESC').all(orgId)) {
      for (const result of JSON.parse(row.results_json)) if (result.sha256 && !previous.has(result.id)) previous.set(result.id, result);
      if (previous.size === BILLING_SOURCES.length) break;
    }
    const results = await Promise.all(BILLING_SOURCES.map(async source => {
      try {
        const observation = await reader(source);
        if (!observation || !/^[a-f0-9]{64}$/.test(observation.sha256)) throw Object.assign(Error('Source fingerprint missing'), { code: 'SOURCE_FORMAT' });
        const before = previous.get(source.id), links = observation.release_links || [];
        return { id: source.id, ...observation, status: !before ? 'BASELINE_RECORDED' : before.sha256 === observation.sha256 ? 'UNCHANGED_FINGERPRINT' : 'SOURCE_CHANGED_REVIEW_REQUIRED',
          previous_sha256: before?.sha256 || null, new_release_links: links.filter(link => !(before?.release_links || []).includes(link)), checked_at: iso(clock()) };
      } catch (error) {
        return { id: source.id, status: 'CHECK_FAILED', checked_at: iso(clock()), error_code: ['ACCESS_REQUIRED', 'SOURCE_REDIRECT', 'SOURCE_HTTP_ERROR', 'SOURCE_FORMAT', 'SOURCE_TOO_LARGE'].includes(error.code) ? error.code : error.name === 'TimeoutError' || error.name === 'AbortError' ? 'TIMEOUT' : 'SOURCE_UNAVAILABLE', notice: 'Not verified. Staff follow-up required; no update conclusion is available.' };
      }
    }));
    const completed = clock(), failed = results.some(r => r.status === 'CHECK_FAILED');
    return transaction(db, () => {
      const state = db.prepare('SELECT * FROM billing_audit_state WHERE org_id=?').get(orgId);
      if (state.lease_token !== token || state.lease_until_ms <= completed) throw fail(409, 'Billing-audit lease expired; results were not published');
      if (actorId !== 'SYSTEM_BILLING_AUDIT') staff(db, actor);
      const snapshots = installed(db, orgId, iso(completed).slice(0, 10));
      const outcome = failed ? 'INCOMPLETE_REVIEW_REQUIRED' : results.some(r => r.status === 'SOURCE_CHANGED_REVIEW_REQUIRED') ? 'SOURCE_CHANGES_REVIEW_REQUIRED' : 'CHECKED_NO_CODE_ACTIVATION';
      db.prepare('INSERT INTO billing_audit_runs VALUES (?,?,?,?,?,?,?,?,?)').run(token, orgId, actorId, triggerKind, iso(started), iso(completed), outcome, JSON.stringify(results), JSON.stringify(snapshots));
      db.prepare('UPDATE billing_audit_state SET lease_token=NULL,lease_until_ms=NULL,next_due_ms=? WHERE org_id=? AND lease_token=?').run(completed + (failed ? 3600000 : BILLING_AUDIT_INTERVAL), orgId, token);
      audit(db, actor, 'COMPLETE_BILLING_SOURCE_AUDIT', 'billing_audit_run', token);
      return { id: token, outcome, results, installed: snapshots, notice };
    });
  }
  return {
    async run(user) { const u = staff(db, user); seedStates(); return run(u.org_id, u.id, 'STAFF_REQUEST'); },
    async tick() {
      if (!scheduled) return { scheduled: false };
      seedStates(); let completed = 0;
      for (const row of db.prepare('SELECT org_id FROM billing_audit_state WHERE next_due_ms<=? AND (lease_token IS NULL OR lease_until_ms<=?) ORDER BY org_id').all(clock(), clock())) {
        try { await run(row.org_id, 'SYSTEM_BILLING_AUDIT', 'SCHEDULED'); completed++; } catch (error) { if (error.status !== 409) throw error; }
      }
      return { completed };
    },
    view(user) {
      const u = staff(db, user); seedStates();
      const state = db.prepare('SELECT * FROM billing_audit_state WHERE org_id=?').get(u.org_id);
      const history = db.prepare('SELECT * FROM billing_audit_runs WHERE org_id=? ORDER BY rowid DESC LIMIT 20').all(u.org_id)
        .map(({ results_json, installed_json, ...r }) => ({ ...r, results: JSON.parse(results_json), installed: JSON.parse(installed_json) }));
      audit(db, u, 'VIEW_BILLING_SOURCE_AUDITS', 'organization', u.org_id);
      return { scheduled, interval_days: 5, next_due: iso(state.next_due_ms), running: !!state.lease_token && state.lease_until_ms > clock(), sources: BILLING_SOURCES,
        payer_monitoring: payerMonitoringCoverage(history, clock()),
        installed: installed(db, u.org_id, iso(clock()).slice(0, 10)), bundled_releases: catalogManifest, releases: catalogReleases(db, u), history, notice };
    },
  };
}
