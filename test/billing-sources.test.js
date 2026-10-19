import test from 'node:test';
import assert from 'node:assert/strict';
import { BILLING_SOURCES, PAYER_MONITORING_GROUPS, payerMonitoringCoverage } from '../src/billing-sources.js';

const now = Date.parse('2026-10-19T16:00:00Z');
const history = (status = 'UNCHANGED_FINGERPRINT', time = now) => [{ results: BILLING_SOURCES.map(s => ({ id: s.id, status, checked_at: new Date(time).toISOString() })) }];
const group = (view, id) => view.groups.find(g => g.id === id);

test('successful source observations never assert universal payer access or member coverage', () => {
  const view = payerMonitoringCoverage(history(), now);
  assert.equal(view.all_insurers_verified, false);
  assert.equal(view.transaction_connection, 'NOT_CONNECTED');
  assert.equal(view.member_benefits, 'NOT_VERIFIED');
  assert.equal(group(view, 'BCBS').status, 'LISTED_SOURCES_OBSERVED_PLAN_REVIEW_REQUIRED');
  assert.match(group(view, 'BCBS').gap, /Company discovery only/);
  assert.equal(group(view, 'TPA').status, 'SOURCES_NOT_CONFIGURED');
  assert.equal(group(view, 'OTHER').status, 'SOURCES_NOT_CONFIGURED');
  assert.ok(view.groups.every(g => g.member_benefits === 'NOT_VERIFIED' && g.transaction_connection === 'NOT_CONNECTED'));
});

test('a latest failure, missing observation and expired observation remain unresolved after earlier successes', () => {
  const failed = [{ results: [{ id: 'UHC_MEDICAL', status: 'CHECK_FAILED', checked_at: new Date(now).toISOString() }] }, ...history()];
  assert.equal(group(payerMonitoringCoverage(failed, now), 'UHC').status, 'SOURCE_CHECK_FAILED');
  assert.equal(group(payerMonitoringCoverage([], now), 'UHC').status, 'SOURCE_CHECKS_INCOMPLETE');
  assert.equal(group(payerMonitoringCoverage(history('UNCHANGED_FINGERPRINT', now - 5 * 86400000), now), 'UHC').status, 'SOURCE_CHECKS_INCOMPLETE');
  assert.equal(group(payerMonitoringCoverage(history('UNCHANGED_FINGERPRINT', now + 1000), now), 'UHC').status, 'SOURCE_CHECKS_INCOMPLETE');
  assert.equal(group(payerMonitoringCoverage([{ results: [{ id: 'UHC_MEDICAL', status: 'BASELINE_RECORDED', checked_at: 'invalid' }] }], now), 'UHC').status, 'SOURCE_CHECKS_INCOMPLETE');
});

test('changed sources require review and empty interruption records do not erase observations', () => {
  const result = payerMonitoringCoverage([{ results: [] }, ...history('SOURCE_CHANGED_REVIEW_REQUIRED')], now);
  assert.equal(group(result, 'AETNA').status, 'SOURCE_CHANGE_REVIEW_REQUIRED');
  assert.equal(result.all_insurers_verified, false);
});

test('registry references only fixed HTTPS sources and keeps discovery separate from payer policies', () => {
  const ids = new Set(BILLING_SOURCES.map(s => s.id));
  assert.equal(ids.size, BILLING_SOURCES.length);
  assert.equal(new Set(PAYER_MONITORING_GROUPS.map(g => g.id)).size, PAYER_MONITORING_GROUPS.length);
  for (const s of BILLING_SOURCES) { const u = new URL(s.url); assert.equal(u.protocol, 'https:'); assert.equal(u.username, ''); assert.equal(u.password, ''); assert.ok(Object.isFrozen(s)); }
  for (const g of PAYER_MONITORING_GROUPS) for (const id of g.source_ids) assert.ok(ids.has(id), id);
  assert.equal(BILLING_SOURCES.find(s => s.id === 'STEDI_DIRECTORY').kind, 'TRANSACTION_DISCOVERY_DIRECTORY');
  assert.equal(BILLING_SOURCES.find(s => s.id === 'BCBS_COMPANIES').kind, 'PAYER_DISCOVERY_DIRECTORY');
});
