export const BILLING_SOURCES = Object.freeze([
  { id: 'CMS_HCPCS', kind: 'CODE_RELEASE_INDEX', title: 'CMS HCPCS Level II quarterly releases', url: 'https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update', type: 'HTML' },
  { id: 'CMS_ICD10', kind: 'CODE_RELEASE_INDEX', title: 'CMS ICD-10 releases and guidelines', url: 'https://www.cms.gov/medicare/coding-billing/icd-10-codes', type: 'HTML' },
  { id: 'AMA_CPT', kind: 'LICENSED_CODE_NOTICES', title: 'AMA CPT notices; licensed data feed still required', url: 'https://www.ama-assn.org/practice-management/cpt', type: 'HTML' },
  { id: 'UHC_REIMBURSEMENT', kind: 'PAYER_POLICY_INDEX', title: 'UnitedHealthcare commercial/exchange reimbursement policies', url: 'https://www.uhcprovider.com/en/policies-protocols/commercial-policies/commercial-reimbursement-policies.html', type: 'HTML' },
  { id: 'UHC_ANESTHESIA', kind: 'PAYER_POLICY_DOCUMENT', title: 'UnitedHealthcare professional anesthesia policy', url: 'https://www.uhcprovider.com/content/dam/provider/docs/public/policies/comm-reimbursement/COMM-Anesthesia-Policy.pdf', type: 'PDF' },
  { id: 'AETNA_MEDICAL', kind: 'PAYER_POLICY_INDEX', title: 'Aetna medical clinical policy bulletins', url: 'https://www.aetna.com/health-care-professionals/clinical-policy-bulletins/medical-clinical-policy-bulletins.html', type: 'HTML' },
  { id: 'CIGNA_COVERAGE', kind: 'PAYER_POLICY_INDEX', title: 'Cigna provider coverage and reimbursement policies', url: 'https://www.cigna.com/health-care-providers/coverage-and-claims/policies', type: 'HTML' },
  { id: 'CMS_NCCI_PTP', kind: 'CODING_EDIT_INDEX', title: 'Medicare NCCI procedure-pair edits', url: 'https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-procedure-procedure-ptp-edits', type: 'HTML' },
  { id: 'CMS_NCCI_MUE', kind: 'CODING_EDIT_INDEX', title: 'Medicare NCCI unit edits', url: 'https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-medically-unlikely-edits-mues', type: 'HTML' },
  { id: 'CMS_DRUG_WASTE', kind: 'BILLING_POLICY_INDEX', title: 'Medicare Part B discarded drugs and JW/JZ guidance', url: 'https://www.cms.gov/medicare/payment/part-b-drugs/discarded-drugs', type: 'HTML' },
  { id: 'UHC_MEDICAL', kind: 'PAYER_POLICY_INDEX', title: 'UnitedHealthcare medical policy and protocol indexes', url: 'https://www.uhcprovider.com/en/policies-protocols.html', type: 'HTML' },
  { id: 'HUMANA_MEDICAL', kind: 'PAYER_POLICY_INDEX', title: 'Humana medical and pharmacy coverage policy index', url: 'https://mcp.humana.com/tad/TAD_New/Home.aspx', type: 'HTML' },
  { id: 'MOLINA_MEDICAL', kind: 'PAYER_POLICY_INDEX', title: 'Molina clinical policy index', url: 'https://www.molinahealthcare.com/providers/resources/policies/clinical', type: 'HTML' },
  { id: 'AMBETTER_POLICIES', kind: 'PAYER_POLICY_INDEX', title: 'Ambetter clinical and payment policies; exact state/product review required', url: 'https://www.ambetterhealth.com/en/employers/pharmacy-resources/clinical-payment-policies/', type: 'HTML' },
  { id: 'KAISER_CO', kind: 'REGIONAL_PROVIDER_INDEX', title: 'Kaiser Permanente Colorado community-provider resources; other regions unresolved', url: 'https://healthy.kaiserpermanente.org/colorado/community-providers', type: 'HTML' },
  { id: 'BCBS_COMPANIES', kind: 'PAYER_DISCOVERY_DIRECTORY', title: 'BCBS local company directory; individual company policies require separate sources', url: 'https://www.bcbs.com/about-us/blue-cross-blue-shield-system/state-health-plan-companies', type: 'HTML' },
  { id: 'MEDICAID_STATES', kind: 'PROGRAM_DISCOVERY_DIRECTORY', title: 'CMS state Medicaid and CHIP profiles; state/MCO policies require separate sources', url: 'https://www.medicaid.gov/state-overviews-0', type: 'HTML' },
  { id: 'TRICARE_SERVICES', kind: 'PROGRAM_POLICY_INDEX', title: 'TRICARE covered-service index; plan and contractor verification required', url: 'https://www.tricare.mil/CoveredServices', type: 'HTML' },
  { id: 'VA_CLAIMS', kind: 'PROGRAM_POLICY_INDEX', title: 'VA community-care provider claims; authorization and program verification required', url: 'https://department.va.gov/vha/community-care/provider-claims/', type: 'HTML' },
  { id: 'STEDI_DIRECTORY', kind: 'TRANSACTION_DISCOVERY_DIRECTORY', title: 'Stedi supported-payer and enrollment documentation; no account connected', url: 'https://www.stedi.com/docs/healthcare/supported-payers', type: 'HTML' },
  { id: 'AVAILITY_DIRECTORY', kind: 'TRANSACTION_DISCOVERY_DIRECTORY', title: 'Availity payer/transaction directory; no account connected', url: 'https://essentials.availity.com/static/public/onb/onboarding-ui-apps/payer-list-ui/', type: 'HTML', html_marker: 'Eligibility and Benefits' },
].map(source => Object.freeze(source)));

// Research starting points, not payer IDs, plan mappings or an exhaustive insurer census.
// A discovery directory never becomes evidence of a downstream payer policy or member benefit.
export const PAYER_MONITORING_GROUPS = Object.freeze([
  { id: 'UHC', name: 'UnitedHealthcare / UMR / Surest / Oxford', source_ids: ['UHC_MEDICAL', 'UHC_REIMBURSEMENT', 'UHC_ANESTHESIA'], gap: 'Exact product, affiliate, state, linked policies and portal requirements need mapping.' },
  { id: 'AETNA', name: 'Aetna', source_ids: ['AETNA_MEDICAL'], gap: 'Medicare, Medicaid/Better Health, commercial and employer exceptions need separate mapping.' },
  { id: 'CIGNA', name: 'Cigna', source_ids: ['CIGNA_COVERAGE'], gap: 'Exact product, delegated administrator and employer benefit documents need mapping.' },
  { id: 'HUMANA', name: 'Humana', source_ids: ['HUMANA_MEDICAL'], gap: 'Exact product, state, reimbursement and authorization rules need mapping.' },
  { id: 'MOLINA', name: 'Molina', source_ids: ['MOLINA_MEDICAL'], gap: 'State, program, product and linked policy documents need mapping.' },
  { id: 'CENTENE', name: 'Centene / Ambetter / Wellcare', source_ids: ['AMBETTER_POLICIES'], gap: 'Ambetter is an index starting point; other affiliates and all state/product rules remain unresolved.' },
  { id: 'KAISER', name: 'Kaiser Permanente', source_ids: ['KAISER_CO'], gap: 'Only a Colorado provider index is listed; every region and exact plan still needs mapping.' },
  { id: 'BCBS', name: 'Blue Cross / Blue Shield / Anthem and regional Blue plans', source_ids: ['BCBS_COMPANIES'], gap: 'Company discovery only; individual local-company and product policies are not monitored by this directory.' },
  { id: 'MEDICARE', name: 'Original Medicare', source_ids: ['CMS_DRUG_WASTE', 'CMS_NCCI_PTP', 'CMS_NCCI_MUE'], gap: 'Selected national sources only; applicable MAC/LCD/article, setting and service-date rules need mapping. Medicare Advantage is plan-specific.' },
  { id: 'MEDICAID', name: 'Every state Medicaid / CHIP program and managed-care plan', source_ids: ['MEDICAID_STATES'], gap: 'State discovery only; each state agency, MCO, product and provider manual needs separate source mapping.' },
  { id: 'TRICARE', name: 'TRICARE', source_ids: ['TRICARE_SERVICES'], gap: 'Exact plan, region, contractor, enrollment and authorization rules need verification.' },
  { id: 'VA', name: 'VA community care / CHAMPVA', source_ids: ['VA_CLAIMS'], gap: 'VA community-care index only; CHAMPVA, contractors and authorization/billing arrangements need separate verification.' },
  { id: 'TPA', name: 'Self-funded employer plans / third-party administrators', source_ids: [], gap: 'Exact employer plan and administrator sources are not configured.' },
  { id: 'OTHER', name: 'Other regional insurers / dental / vision / workers’ compensation / auto medical', source_ids: [], gap: 'Individual payer, jurisdiction, benefit type and supported workflow sources are not configured.' },
].map(group => Object.freeze({ ...group, source_ids: Object.freeze(group.source_ids) })));

export function payerMonitoringCoverage(history, nowMs = Date.now()) {
  const latest = new Map();
  // History is newest first. A new failure overrides a previous successful observation.
  for (const run of history) for (const result of run.results || []) {
    if (!latest.has(result.id)) latest.set(result.id, result);
  }
  const valid = new Set(['BASELINE_RECORDED', 'UNCHANGED_FINGERPRINT', 'SOURCE_CHANGED_REVIEW_REQUIRED']);
  return {
    scope: 'LISTED_PUBLIC_SOURCES_ONLY', all_insurers_verified: false,
    transaction_connection: 'NOT_CONNECTED', member_benefits: 'NOT_VERIFIED',
    configured_source_count: BILLING_SOURCES.length,
    notice: 'Payer groups are research starting points. A checked index or directory does not mean every insurer, plan, linked policy or service is monitored. Live transactions and member benefits are not connected.',
    groups: PAYER_MONITORING_GROUPS.map(group => {
      const sources = group.source_ids.map(id => {
        const r = latest.get(id), age = r ? nowMs - Date.parse(r.checked_at) : NaN;
        const status = !r ? 'NOT_CHECKED' : r.status === 'CHECK_FAILED' ? 'CHECK_FAILED'
          : !valid.has(r.status) || !Number.isFinite(age) || age < 0 || age >= 5 * 86400000 ? 'STALE_OR_UNKNOWN'
          : r.status === 'SOURCE_CHANGED_REVIEW_REQUIRED' ? 'CHANGE_REVIEW_REQUIRED' : 'PUBLIC_SOURCE_OBSERVED';
        return { id, status, checked_at: r?.checked_at || null };
      });
      const status = !sources.length ? 'SOURCES_NOT_CONFIGURED'
        : sources.some(s => s.status === 'CHECK_FAILED') ? 'SOURCE_CHECK_FAILED'
        : sources.some(s => ['NOT_CHECKED', 'STALE_OR_UNKNOWN'].includes(s.status)) ? 'SOURCE_CHECKS_INCOMPLETE'
        : sources.some(s => s.status === 'CHANGE_REVIEW_REQUIRED') ? 'SOURCE_CHANGE_REVIEW_REQUIRED'
        : 'LISTED_SOURCES_OBSERVED_PLAN_REVIEW_REQUIRED';
      return { ...group, status, sources, member_benefits: 'NOT_VERIFIED', transaction_connection: 'NOT_CONNECTED' };
    }),
  };
}
