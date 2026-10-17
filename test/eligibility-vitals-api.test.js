import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openDb } from '../src/db.js';

const baseEnv = { NODE_ENV: 'development', SEED_DEMO: 'true', FICTIONAL_AUDIO_DEMO: 'false', FICTIONAL_CLEARINGHOUSE_DEMO: 'false', LIVE_CLEARINGHOUSE_ENABLED: 'false', FICTIONAL_ELIGIBILITY_DEMO: 'true', ELIGIBILITY_ADAPTER: 'none', LIVE_ELIGIBILITY_ENABLED: 'false', SESSION_SECRET: 'test-eligibility-secret-with-at-least-32-characters', HOST: '127.0.0.1', PORT: '0' };
async function start(t, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'eligibility-http-')), path = join(dir, 'db');
  const child = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, ...baseEnv, DATABASE_PATH: path, UPLOAD_DIR: join(dir, 'uploads'), ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } rmSync(dir, { recursive: true, force: true }); });
  let output = '', errors = '';
  child.stderr.on('data', d => errors += d);
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Startup timeout: ' + errors)), 10000);
    child.once('exit', () => { clearTimeout(timer); reject(Error(errors)); });
    child.stdout.on('data', d => { output += d; const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output); if (match) { clearTimeout(timer); resolve(match[0]); } });
  });
  async function request(path, { user, method = 'GET', body, csrf = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) { headers.Cookie = user.cookie; if (csrf) headers['X-CSRF-Token'] = user.csrf; }
    return fetch(url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function login(email) {
    const r = await request('/api/login', { method: 'POST', body: { email, password: 'DemoOnly!ChangeMe123' } });
    assert.equal(r.status, 200);
    return { cookie: r.headers.get('set-cookie').split(';')[0], ...await r.json() };
  }
  return { path, request, login };
}
const context = { encounter_id: 'enc-001', plan_reference: 'Fictional PPO plan', procedure_system: 'HCPCS', procedure_code: 'J3301', diagnosis_code: 'M54.50', modifier: '', units: 1, place_of_service: '11' };
const payload = () => ({ ...context, service_date: new Date().toISOString().slice(0, 10), member_id: 'DEMO-MEMBER-001', payer_id: 'EXAMPLE-HEALTH-TEST', provider_reference: 'DEMO-PROVIDER-001', fictional_confirmed: true, scenario: 'ACTIVE_BENEFITS', request_key: 'http-request-0001' });

test('authenticated eligibility API enforces session, CSRF, permissions and organization while preserving manual coverage', async t => {
  const s = await start(t), biller = await s.login('biller@example.test'), doctor = await s.login('doctor@example.test'), patient = await s.login('patient@example.test');
  const url = '/api/billing/eligibility', history = '/api/encounters/enc-001/eligibility';
  assert.equal((await s.request(url, { method: 'POST', body: payload() })).status, 401);
  assert.equal((await s.request(url, { user: biller, method: 'POST', csrf: false, body: payload() })).status, 403);
  for (const user of [doctor, patient]) assert.equal((await s.request(url, { user, method: 'POST', body: payload() })).status, 403);
  assert.equal((await s.request(history, { user: patient })).status, 403);
  for (const body of [null, [], 3, { ...payload(), service_date: '2026-02-30' }]) assert.equal((await s.request(url, { user: biller, method: 'POST', body })).status, 400 + (body?.service_date ? 22 : 0));
  const response = await s.request(url, { user: biller, method: 'POST', body: payload() });
  assert.equal(response.status, 201);
  const d = await response.json();
  assert.equal(d.response.member_eligibility.status, 'ACTIVE');
  assert.equal(d.live_transmission_enabled, false);
  const duplicates = await Promise.all(Array.from({ length: 3 }, async () => (await s.request(url, { user: biller, method: 'POST', body: payload() })).json()));
  for (const duplicate of duplicates) { assert.equal(duplicate.id, d.id); assert.equal(duplicate.duplicate, true); }
  const viewPath = '/api/billing/coverage?' + new URLSearchParams(context);
  const view = await (await s.request(viewPath, { user: biller })).json();
  assert.equal(view.status, 'NOT_VERIFIED'); assert.equal(view.simulated_eligibility.id, d.id);
  const reviewPath = `/api/billing/eligibility/${d.id}/reviews`, review = { disposition: 'NEEDS_INFORMATION', notes: 'Fictional procedure policy still needed.', reviewed: true };
  assert.equal((await s.request(reviewPath, { user: patient, method: 'POST', body: review })).status, 403);
  assert.equal((await s.request(reviewPath, { user: biller, method: 'POST', csrf: false, body: review })).status, 403);
  assert.equal((await s.request(reviewPath, { user: biller, method: 'POST', body: review })).status, 201);
  assert.equal((await (await s.request(history, { user: doctor })).json()).history[0].reviews.length, 1);
  const db = openDb(s.path), hash = db.prepare("SELECT password_hash FROM users WHERE id='biller-001'").get().password_hash;
  db.exec("INSERT INTO organizations VALUES ('other','Other')");
  db.prepare('INSERT INTO users(id,org_id,email,name,role,password_hash) VALUES (?,?,?,?,?,?)').run('other', 'other', 'other@example.test', 'Other', 'BILLER', hash); db.close();
  const other = await s.login('other@example.test');
  assert.equal((await s.request(history, { user: other })).status, 404);
  assert.equal((await s.request(url, { user: other, method: 'POST', body: payload() })).status, 404);
  assert.equal((await s.request(reviewPath, { user: other, method: 'POST', body: review })).status, 404);
  assert.equal((await s.request('/api/eligibility/responses', { user: biller, method: 'POST', body: { active: true } })).status, 404);
  assert.equal((await s.request('/eligibility.js')).status, 200);
  assert.equal((await s.request('/vitals.js')).status, 200);
});

test('disabled simulation still allows manual review and historical reads', async t => {
  const s = await start(t, { FICTIONAL_ELIGIBILITY_DEMO: 'false' }), biller = await s.login('biller@example.test');
  const config = await (await s.request('/api/billing/eligibility/config', { user: biller })).json();
  assert.equal(config.simulation_enabled, false); assert.equal(config.live_transmission_enabled, false);
  assert.equal((await s.request('/api/billing/eligibility', { user: biller, method: 'POST', body: payload() })).status, 403);
  const today = new Date().toISOString().slice(0, 10);
  const evidence = { reviewed: true, source_kind: 'PLAN_DOCUMENT', source_reference: 'Fictional manual fixture', status: 'CONDITIONAL', checked_on: today, expires_on: today, eligibility: 'UNKNOWN', network: 'UNKNOWN', provider_enrollment: 'UNKNOWN', requirements: 'Unknown', cost_sharing: 'Unknown' };
  assert.equal((await s.request('/api/billing/coverage', { user: biller, method: 'POST', body: { ...context, evidence } })).status, 201);
  const view = await (await s.request('/api/billing/coverage?' + new URLSearchParams(context), { user: biller })).json();
  assert.equal(view.status, 'POLICY_ONLY'); assert.equal(view.simulated_eligibility, null);
});

test('vital-sign HTTP access is clinical, encounter-scoped and read-only after signing', async t => {
  const s = await start(t), biller = await s.login('biller@example.test'), doctor = await s.login('doctor@example.test'), patient = await s.login('patient@example.test');
  const path = '/api/encounters/enc-001/vitals', body = { source: 'SIMULATED_DEVICE', reviewed: true };
  assert.equal((await s.request(path)).status, 401);
  assert.equal((await s.request(path, { user: biller })).status, 403);
  assert.equal((await s.request(path, { user: patient, method: 'POST', body })).status, 403);
  assert.equal((await s.request(path, { user: doctor, method: 'POST', body, csrf: false })).status, 403);
  assert.equal((await s.request(path, { user: doctor, method: 'POST', body })).status, 201);
  const d = await (await s.request(path, { user: patient })).json();
  assert.equal(d.history[0].systolic, 118); assert.equal(d.device_connected, false);
  assert.equal((await s.request('/api/encounters/enc-001/sign', { user: doctor, method: 'POST', body: {} })).status, 200);
  assert.equal((await s.request(path, { user: doctor, method: 'POST', body })).status, 409);
  assert.equal((await s.request(path, { user: patient })).status, 200);
});

test('production/unseeded simulation and all attempted live adapters fail closed at startup', async () => {
  for (const extra of [{ NODE_ENV: 'production', SEED_DEMO: 'false' }, { SEED_DEMO: 'false' }, { LIVE_ELIGIBILITY_ENABLED: 'true', FICTIONAL_ELIGIBILITY_DEMO: 'false' }, { ELIGIBILITY_ADAPTER: 'live', FICTIONAL_ELIGIBILITY_DEMO: 'false' }]) {
    const dir = mkdtempSync(join(tmpdir(), 'eligibility-startup-'));
    try {
      const child = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, ...baseEnv, DATABASE_PATH: join(dir, 'db'), UPLOAD_DIR: join(dir, 'uploads'), ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
      let error = ''; child.stderr.on('data', d => error += d);
      const [code] = await once(child, 'exit');
      assert.notEqual(code, 0); assert.match(error, /Fictional eligibility requires|Real eligibility transmission and credentials are disabled/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
