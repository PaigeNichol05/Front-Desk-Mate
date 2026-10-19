import { createHash } from 'node:crypto';
import { uid, now, audit } from './db.js';
import { date, publicCatalog } from './code-coverage.js';

const fail = (status, message) => Object.assign(Error(message), { status });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cache = new Map();
export function migrateCatalogUpdates(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_releases (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), system TEXT NOT NULL,
    version TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
    source_url TEXT NOT NULL, source_sha256 TEXT NOT NULL, license_reference TEXT NOT NULL,
    codes_json TEXT NOT NULL, data_sha256 TEXT NOT NULL, summary_json TEXT NOT NULL, baseline_hash TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(org_id,system,version), UNIQUE(id,org_id),
    FOREIGN KEY(created_by,org_id) REFERENCES users(id,org_id)
  );
  CREATE TABLE IF NOT EXISTS catalog_publications (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), release_id TEXT NOT NULL UNIQUE,
    notes TEXT NOT NULL, published_by TEXT NOT NULL, published_at TEXT NOT NULL,
    FOREIGN KEY(release_id,org_id) REFERENCES catalog_releases(id,org_id),
    FOREIGN KEY(published_by,org_id) REFERENCES users(id,org_id)
  );
  CREATE INDEX IF NOT EXISTS release_scope ON catalog_releases(org_id,system,starts_on,ends_on);`);
  for (const table of ['catalog_releases', 'catalog_publications']) for (const op of ['UPDATE', 'DELETE']) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_${op.toLowerCase()} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Catalog history is immutable'); END;`);
  }
}
function staff(db, user, admin = false) {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND org_id=? AND active=1').get(user.id, user.org_id);
  if (!u || !(admin ? ['ADMIN'] : ['ADMIN', 'BILLER', 'PHYSICIAN']).includes(u.role)) throw fail(403, 'Catalog staff permission required');
  return u;
}
function text(v, name, max = 500) {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)) throw fail(400, `Invalid ${name}`);
  return v.trim();
}
function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = work(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
export function publishedCatalog(db, orgId, system, serviceDate) {
  const row = db.prepare('SELECT r.*,p.published_by,p.published_at FROM catalog_releases r JOIN catalog_publications p ON p.release_id=r.id AND p.org_id=r.org_id WHERE r.org_id=? AND r.system=? AND r.starts_on<=? AND r.ends_on>=? ORDER BY p.rowid DESC LIMIT 1').get(orgId, system, serviceDate, serviceDate);
  if (!row) return null;
  const key = `${row.org_id}:${row.id}:${row.data_sha256}`;
  let codes = cache.get(key);
  if (!codes) {
    codes = JSON.parse(row.codes_json);
    if (hash(codes) !== row.data_sha256) throw fail(503, 'Published catalog integrity failure; code lookup unavailable');
    if (cache.size >= 4) cache.delete(cache.keys().next().value);
    cache.set(key, codes);
  }
  return { codes: codes.filter(c => c.starts_on <= serviceDate && c.ends_on >= serviceDate), source: {
    system: row.system, version: row.version, source_url: row.source_url, source_sha256: row.source_sha256,
    sha256: row.data_sha256, release_id: row.id, starts_on: row.starts_on, ends_on: row.ends_on,
    published_by: row.published_by, published_at: row.published_at,
    provenance: 'ADMIN_ATTESTED_SOURCE; publication does not independently authenticate publisher content',
  } };
}
function baseline(db, orgId, system, serviceDate) {
  const published = publishedCatalog(db, orgId, system, serviceDate);
  const codes = published ? published.codes : system === 'CPT' ? db.prepare('SELECT code,description,starts_on,ends_on FROM licensed_codes WHERE org_id=? AND starts_on<=? AND ends_on>=? ORDER BY code').all(orgId, serviceDate, serviceDate) : publicCatalog(system).filter(c => c.starts_on <= serviceDate && c.ends_on >= serviceDate);
  return { codes, fingerprint: hash({ release: published?.source.release_id || 'BASE_INSTALL', codes }) };
}
export function stageCatalog(db, user, body) {
  const u = staff(db, user, true);
  if (!body || !['HCPCS', 'ICD10CM', 'CPT'].includes(body.system) || body.complete_release !== true || body.rights_attested !== true) throw fail(400, 'Select a code system and attest to a complete, authorized release');
  const system = body.system, starts = date(body.starts_on), ends = date(body.ends_on);
  if (starts > ends) throw fail(400, 'Invalid release dates');
  const version = text(body.version, 'release version', 100), urlText = text(body.source_url, 'source URL', 1000);
  let source;
  try { source = new URL(urlText); } catch { throw fail(400, 'Valid HTTPS publisher/source URL required'); }
  if (source.protocol !== 'https:' || source.username || source.password || (system !== 'CPT' && source.hostname !== 'www.cms.gov')) throw fail(400, 'Public catalogs require a CMS HTTPS source; CPT requires an authorized HTTPS source');
  if (typeof body.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.source_sha256)) throw fail(400, 'Source-file SHA-256 is required');
  const license = system === 'CPT' ? text(body.license_reference, 'CPT license reference', 1000) : '';
  if (!Array.isArray(body.codes) || !body.codes.length || body.codes.length > 100000) throw fail(400, 'Supply 1–100000 entries from a complete normalized release');
  const seen = new Set(), pattern = system === 'HCPCS' ? /^[A-CE-Z][0-9]{4}$/ : system === 'CPT' ? /^([0-9]{5}|[0-9]{4}[FTU])$/ : /^[A-Z][0-9][A-Z0-9](\.[A-Z0-9]{1,4})?$/;
  const codes = body.codes.map(c => {
    if (!c || typeof c.code !== 'string' || !pattern.test(c.code) || seen.has(c.code)) throw fail(400, 'Invalid or duplicate code in release');
    seen.add(c.code);
    const from = date(c.starts_on), to = date(c.ends_on);
    if (from > to || from < starts || to > ends) throw fail(400, 'Code dates must be within release dates');
    return { code: c.code, description: text(c.description, 'code description', 2000), starts_on: from, ends_on: to };
  }).sort((a, b) => a.code.localeCompare(b.code));
  return transaction(db, () => {
    const duplicate = db.prepare('SELECT id,data_sha256 FROM catalog_releases WHERE org_id=? AND system=? AND version=?').get(u.org_id, system, version);
    if (duplicate) throw fail(409, 'This release version already exists; use a distinct correction version');
    const before = baseline(db, u.org_id, system, starts), old = new Map(before.codes.map(c => [c.code, c])), next = new Map(codes.map(c => [c.code, c]));
    const summary = { added: codes.filter(c => !old.has(c.code)).length, removed: before.codes.filter(c => !next.has(c.code)).length,
      changed: codes.filter(c => old.has(c.code) && JSON.stringify(c) !== JSON.stringify(old.get(c.code))).length,
      count: codes.length, baseline_count: before.codes.length, comparison_date: starts,
      notice: 'Diff against the currently selected catalog on release start date. Administrative source/rights attestations are not independent source verification.' };
    const id = uid(), digest = hash(codes);
    db.prepare('INSERT INTO catalog_releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, u.org_id, system, version, starts, ends, source.href, body.source_sha256, license, JSON.stringify(codes), digest, JSON.stringify(summary), before.fingerprint, u.id, now());
    audit(db, u, 'STAGE_CODE_CATALOG', 'catalog_release', id);
    return { id, data_sha256: digest, summary, status: 'PENDING_REVIEW' };
  });
}
export function publishCatalog(db, user, id, body) {
  const u = staff(db, user, true);
  return transaction(db, () => {
    const r = db.prepare('SELECT * FROM catalog_releases WHERE id=? AND org_id=?').get(id, u.org_id);
    if (!r) throw fail(404, 'Catalog release not found');
    if (body?.reviewed !== true || body.data_sha256 !== r.data_sha256) throw fail(400, 'Confirm review of this exact catalog fingerprint');
    const notes = text(body.notes, 'publication review notes', 3000);
    if (db.prepare('SELECT 1 FROM catalog_publications WHERE release_id=? AND org_id=?').get(id, u.org_id)) { audit(db,u,'REPLAY_CATALOG_PUBLICATION','catalog_release',id); return { id, duplicate: true }; }
    if (baseline(db, u.org_id, r.system, r.starts_on).fingerprint !== r.baseline_hash) throw fail(409, 'Catalog baseline changed; stage a new version for review');
    const codes = JSON.parse(r.codes_json);
    if (hash(codes) !== r.data_sha256) throw fail(503, 'Catalog integrity failure');
    db.prepare('INSERT INTO catalog_publications VALUES (?,?,?,?,?,?)').run(uid(), u.org_id, id, notes, u.id, now());
    audit(db, u, 'PUBLISH_CODE_CATALOG', 'catalog_release', id);
    return { id, status: 'PUBLISHED', notice: 'Selected by service date for new lookups. Existing signed reviews and claim snapshots are unchanged. Coverage and payment remain separate.' };
  });
}
export function catalogReleases(db, user) {
  const u = staff(db, user);
  const rows = db.prepare('SELECT r.id,r.system,r.version,r.starts_on,r.ends_on,r.source_url,r.source_sha256,r.data_sha256,r.summary_json,r.created_by,r.created_at,p.published_by,p.published_at FROM catalog_releases r LEFT JOIN catalog_publications p ON p.release_id=r.id AND p.org_id=r.org_id WHERE r.org_id=? ORDER BY r.rowid DESC').all(u.org_id);
  audit(db, u, 'VIEW_CATALOG_RELEASES', 'organization', u.org_id);
  return rows.map(({ summary_json, ...r }) => ({ ...r, summary: JSON.parse(summary_json), status: r.published_at ? 'PUBLISHED' : 'PENDING_REVIEW' }));
}
