# Connecting the unified billing workflow

Front Desk Mate already has the test-only clearinghouse foundation, immutable claim snapshots, worker retries, response history and correction simulations. Version 0.3.0 adds source maintenance and pre-service authorization worksheets around that foundation. **No real clearinghouse is connected.** Live-enablement flags still fail startup, no insurer credentials are accepted and no production claim or authorization is transmitted.

## Required connection capabilities

| Workflow | Required live integration | Current behavior |
| --- | --- | --- |
| Member eligibility/benefits | Authorized eligibility query and authenticated response, commonly 270/271 | Separate deterministic eligibility simulation |
| Prior-authorization requirements | Exact member/plan, proposed code, provider, facility/date/units; supported payer requirements source | Internal source-linked worksheet; requirement unknown |
| Prior-authorization submission/decision | Supported vendor/payer channel, official form/data contract, evidence attachments, receipts and decision tracking | No submission or decision adapter |
| Provider claim | Reviewed actual performed service, licensed dated codes, required fields, supported professional/institutional transaction | Local claim queue and fictional clearinghouse |
| Acceptance/rejection and status | Authenticated clearinghouse/payer acknowledgments and status checks, correlated to original claim | Fictional acceptance/rejection states only |
| Payment/denial | Authenticated remittance/ERA, line-level adjustments and patient-responsibility reconciliation | Separate fictional remittance; never posted as real payment |

A payer accepting a claim for processing is not payment approval. An authorization reference field in a claims API does not mean that API can obtain authorization. Do not assume one vendor supports every transaction or every payer. Keep the source date, transport receipt, payer decision and adjudication separate.

Stedi remains an API-oriented candidate for evaluation, not a selected vendor or an active account. Its current public documentation describes eligibility, professional/institutional claims, claim status, acknowledgments, remittance and transaction enrollment. Its professional-claim endpoint can generate a CMS-1500 PDF, but using it requires the real API/account integration. Verify actual payer coverage, transaction scope, authorization support, terms, costs and operational fit directly before selecting it. Other clearinghouses may also be suitable.

## Work that must precede live enablement

1. Identify the practice's legal billing entity, actual payers/plans, claim types, rendering and billing providers, NPIs/taxonomies, locations and provider enrollment. Do not put patient data or credentials in the public repository.
2. Select the authorized vendor, execute applicable service agreements/BAA and payer transaction enrollments, establish protected server-side credential storage and validate the allowed use of patient data.
3. Implement the real adapter, strict request/response normalization, external identifiers, idempotency, authenticated callback/report ingestion, replay protection, timeout reconciliation, retention and audited access. Do not repurpose fictional receipts as payer responses.
4. Test synthetic vendor-sandbox transactions and payer-specific cases, including missing benefits, authorization scope/date/unit mismatches, rejected claims, denials, corrections, duplicate callbacks and remittance reconciliation. Require professional clinical/coding/billing validation.
5. Complete the application's existing production security, clinical safety and operational readiness gates before any real patient use. Enable only the reviewed transaction/payer combinations. Preserve manual review when a live response is incomplete.

## Historical code photographs

For a 2025 code list, record its publisher, edition and any effective dates. Identify CPT, HCPCS Level II, ICD-10-CM, modifiers, revenue codes or other fields rather than treating every printed number as a procedure code. Compare each code against the official/licensed release for the actual service date. A code might remain active, be revised, be deleted, or be valid only for particular dates; current-year codes must not silently replace correct historical coding. The new publication model can retain historical releases, but the bundled app does not currently include a full 2025 catalog.

Code validity, correct clinical use, payer policy, member coverage, authorization and final reimbursement are separate findings. Code pictures alone cannot determine all of them. AI may help extract and organize candidate data, with source evidence and qualified review; it must not invent treatment, authorization or a payable diagnosis.

References reviewed October 18, 2026: [Stedi developer documentation](https://www.stedi.com/docs/healthcare), [professional claims](https://www.stedi.com/docs/healthcare/submit-professional-claims), [supported payers and enrollment](https://www.stedi.com/docs/providers/providers-supported-payers), [CMS HCPCS release dates](https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update), [CMS HCPCS coverage distinction](https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/level-ii-coding-process).
