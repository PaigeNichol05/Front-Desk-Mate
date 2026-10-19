import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateEligibility, eligibilityHash } from '../src/eligibility-adapter.js';
import { eligibilitySummary } from '../public/eligibility.js';

const request = { context: { service_date: '2026-10-17', procedure_code: 'J3301', diagnosis_code: 'M54.50', units: 1 }, provider_reference: 'DEMO-PROVIDER-001', scenario: 'PARTIAL' };
test('eligibility display distinguishes missing costs, general benefits, review hold and lack of authorization or payment', () => {
  const response = simulateEligibility(request);
  const html = eligibilitySummary({ id: 'sample-request', outcome: 'SIMULATED_RESPONSE', response, response_hash: eligibilityHash(response), created_at: '2026-10-17T12:00:00.000Z', recheck_on: '2026-10-18', stale: true });
  for (const text of ['Member eligibility', 'ACTIVE', 'Specific procedure coverage', 'NOT_ESTABLISHED', 'General plan benefit categories', 'Not supplied', 'NOT_REQUESTED', 'NOT_ADJUDICATED', 'Professional review required', 'needs rechecking', '2026-01-01', '2026-12-31', 'SHA-256']) assert.ok(html.includes(text), text);
  assert.equal(html.includes('$0.00'), false);
  assert.match(eligibilitySummary({ outcome: 'FAILED', error: { code: 'TIMEOUT', message: 'Fictional failure' } }), /No benefit response is available/);
});
test('eligibility display escapes saved review notes, provenance and error content', () => {
  const html = eligibilitySummary({ id: '<script>bad</script>', error: { code: 'TIMEOUT', message: '<img src=x onerror=bad()>' }, reviews: [{ disposition: 'NEEDS_INFORMATION', notes: '<script>bad</script>', reviewed_by: 'Staff', reviewed_at: 'date' }] });
  assert.equal(html.includes('<script>'), false); assert.equal(html.includes('<img'), false);
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&lt;img'));
});
