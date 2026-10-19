import { createHash } from 'node:crypto';

export const ELIGIBILITY_SCENARIOS = ['ACTIVE_BENEFITS', 'INACTIVE', 'PARTIAL', 'EXCLUSIONS', 'TIMEOUT', 'UNAVAILABLE', 'INVALID_RESPONSE'];
export const eligibilityHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Deliberately has no HTTP client, credentials, X12 serializer or live-adapter switch.
// The same normalized input always produces the same fixture, including failures.
export function simulateEligibility(request) {
  if (!ELIGIBILITY_SCENARIOS.includes(request.scenario)) throw Error('Unsupported eligibility fixture');
  if (['TIMEOUT', 'UNAVAILABLE'].includes(request.scenario)) {
    throw Object.assign(Error('Fictional eligibility service failure'), { code: request.scenario });
  }
  if (request.scenario === 'INVALID_RESPONSE') return { simulated: true };
  const partial = request.scenario === 'PARTIAL', inactive = request.scenario === 'INACTIVE';
  const year = request.context.service_date.slice(0, 4);
  const effective = { starts_on: `${year}-01-01`, ends_on: `${year}-12-31` };
  return {
    simulated: true,
    authenticated_insurer_response: false,
    provenance: {
      adapter: 'FICTIONAL_ELIGIBILITY_V1', version: '1.0', scenario: request.scenario,
      source: 'Local deterministic fixture; no insurer communication',
      correlation_id: `SIM-${eligibilityHash(request).slice(0, 24)}`,
    },
    member_eligibility: { status: inactive ? 'INACTIVE' : 'ACTIVE', ...effective },
    network: { status: partial ? 'UNKNOWN' : 'IN_NETWORK', provider_reference: request.provider_reference, ...effective },
    plan_benefits: inactive ? [] : [
      { category: 'OFFICE_VISIT', status: 'GENERAL_BENEFIT_REPORTED', ...effective,
        deductible: partial ? null : { individual_cents: 150000, remaining_cents: 75000, currency: 'USD', period: 'CALENDAR_YEAR', scope: 'IN_NETWORK' },
        copayment: partial ? null : { amount_cents: 3500, currency: 'USD', basis: 'PER_VISIT', scope: 'IN_NETWORK' },
        coinsurance_percent: null,
        authorization_indicator: partial ? 'UNKNOWN' : 'NOT_INDICATED_FOR_GENERAL_CATEGORY',
        limitations: ['General category only; does not establish coverage for the documented procedure or units.'],
        exclusions: request.scenario === 'EXCLUSIONS' ? ['Fixture reports a cosmetic-service exclusion; applicability to this service requires review.'] : [],
      },
      { category: 'DIAGNOSTIC_IMAGING', status: 'GENERAL_BENEFIT_REPORTED', ...effective,
        deductible: null, copayment: null, coinsurance_percent: null,
        authorization_indicator: partial ? 'UNKNOWN' : 'REQUIRED_FOR_SOME_SERVICES',
        limitations: ['Service-specific policy, frequency limits and approved authorization are not supplied.'], exclusions: [] },
    ],
    service_coverage: { status: 'NOT_ESTABLISHED', ...request.context,
      reason: 'A general eligibility/benefits fixture cannot establish coverage of this diagnosis, procedure, modifier and units.' },
    authorization: { requirement: 'SERVICE_SPECIFIC_REVIEW_REQUIRED', decision: 'NOT_REQUESTED' },
    payment: { decision: 'NOT_ADJUDICATED', guaranteed: false },
    missing_information: [
      'Applicable procedure-level medical-necessity policy and exclusions',
      'Provider enrollment and service-specific network confirmation',
      'Authorization/referral applicability and approval, if required',
      'Procedure-specific patient responsibility and reimbursement',
      ...(partial ? ['Deductible, copayment, coinsurance and network details not supplied'] : ['Coinsurance not supplied']),
      ...(inactive ? ['Active benefits for the requested service date are not established'] : []),
    ],
    professional_review_required: true,
  };
}

// Fail closed. A future adapter must have its own reviewed normalization contract.
export function validateSimulatedEligibility(response) {
  if (response?.simulated !== true || response.authenticated_insurer_response !== false ||
      response.provenance?.adapter !== 'FICTIONAL_ELIGIBILITY_V1' ||
      !['ACTIVE', 'INACTIVE'].includes(response.member_eligibility?.status) ||
      !Array.isArray(response.plan_benefits) || !Array.isArray(response.missing_information) ||
      response.service_coverage?.status !== 'NOT_ESTABLISHED' ||
      response.professional_review_required !== true || response.payment?.guaranteed !== false) {
    throw Object.assign(Error('Invalid fictional adapter response'), { code: 'INVALID_ADAPTER_RESPONSE' });
  }
  return response;
}
