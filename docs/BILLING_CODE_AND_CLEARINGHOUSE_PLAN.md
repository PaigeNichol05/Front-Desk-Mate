# Billing code review and clearinghouse plan

Requested product direction: show the exact billing code, authoritative description, and applicable documentation and payer requirements when staff request or review a code, then check the claim before submission to a contracted healthcare clearinghouse. This document is a planned feature specification, not an implemented integration or a promise of acceptance/payment. The fictional app still uses `PAYER_ADAPTER=none` and queues claims as `AWAITING_CONNECTOR`; no claims leave the app.

## Code request and review panel

Place a lookup beside code suggestions and checkout, before a claim can be submitted. Require the service date, code system, code, payer/plan, and relevant service setting. Do not choose a higher-paying code or generate documentation to satisfy a code. Match the code to the service actually documented; a qualified clinician/coder reviews it.

Display these separately:

| Field | Required behavior |
| --- | --- |
| Exact code and official description | Use an authorized, versioned terminology source. Distinguish the official descriptor from a plain-language explanation. Include system, release, effective dates, and active/deleted status for the service date. Do not invent a descriptor when unavailable. |
| Code reporting requirements | Show applicable time, service components, units, setting, provider type, modifier instructions, and exclusions from authoritative guidance, with source/version. Not every field applies to every code. |
| Payer-specific policy | Identify payer, product/plan, jurisdiction where relevant, policy title/identifier, source link, effective dates, and last verified date. Show coverage, medical-necessity, diagnosis, prior-authorization, frequency, and other applicable restrictions separately from the code descriptor. |
| Supporting documentation | List required evidence and link to existing chart sections. Mark missing evidence explicitly. Never rewrite a chart to imply a service occurred. |
| Review outcome | Distinguish verified, missing documentation, incompatible code/modifier, stale policy, and unknown/unavailable. An unavailable policy must not become a passing check. Save the reviewer and reviewed versions with the claim. |

Exact CPT content requires appropriate AMA licensing for the intended electronic product and distribution. A development license is not assumed to permit public or production distribution. Use official dated ICD-10-CM and HCPCS sources within their terms, and separately licensed coding guidance where necessary. Do not scrape or bundle copyrighted catalogs from websites. Payer wording comes from that payer's applicable policy; there is no universal insurer wording that ensures payment. Preserve provenance and comply with the source's permitted display rights.

## Pre-submission review

Validate applicable eligibility for the service date, provider identity/enrollment, member and payer routing identifiers, code validity, diagnosis support, modifiers, units, place of service, authorization, required documents, and filing deadlines. Apply relevant code-pair and unit edits with versioned sources. Medicare NCCI rules are not automatically the rules for every commercial payer. Record exceptions and professional review rather than labeling unknown checks as passed.

The production submit path must hold a claim with unresolved required checks. Existing checkout checks remain structural demo checks; they do not establish valid coding, coverage, or payment eligibility.

## Contracted clearinghouse

Evaluate a legitimate healthcare clearinghouse against the practice's payer list, professional versus institutional claims, eligibility and authorization needs, enrollment, acknowledgments, remittances, fees, support, agreements, and security requirements. Stedi is an API-oriented candidate for evaluation, not a selected or connected vendor. Its documentation describes professional claims, payer enrollment, claim acknowledgments, and remittance workflows. Verify coverage for the actual insurers and transaction types before purchase or implementation.

Before live operation: select the vendor; execute applicable service agreements and BAA; enroll the practice/providers for required payer transactions; obtain protected credentials; complete sandbox and trading-partner testing; and satisfy the repository's production-readiness gates. Do not put credentials in source control or expose them to the browser. Keep the public fictional demo isolated from any production account and PHI.

Implementation must provide server-side claim submission, idempotency, durable transmission receipts, authenticated response ingestion, duplicate/replay protection, reconciliation, and a rejection work queue. Handle ambiguous timeouts by reconciling with the vendor before resubmitting. Correlate vendor and payer identifiers with the original claim and preserve rejection codes and explanatory text.

Show distinct states: queued locally, transmitted, clearinghouse rejected/accepted, payer rejected/accepted for processing, pending adjudication, denied, and paid/partially paid. Interpret 999 and 277CA acknowledgments according to their actual scope; use adjudication/remittance information for payment outcomes. HTTP success or clearinghouse acceptance is not payer approval or payment. Never manufacture an acknowledgment.

## Acceptance tests for implementation

- Correct service-date catalog/policy version and exact authorized descriptor; unknown/deleted code and missing licensed content never appear verified.
- Different payer/plan rules remain separate; unavailable or outdated policy produces a review hold.
- Documentation, modifier, units, authorization, and applicable edit failures block production submission; review is attributable and auditable.
- Staff-only configuration/review/submission with organization boundaries; no credentials in responses or logs; fictional demo cannot reach production transport.
- Idempotent submissions, timeout reconciliation, authenticated duplicate callbacks, correct claim correlation, and preserved rejection reasons.
- Clearinghouse acceptance, payer acceptance, denial, and remittance/payment remain distinct; no acceptance or payment guarantee is displayed.

## Primary references

Reviewed October 4, 2026; revalidate before implementation and whenever source versions change.

- [AMA CPT licensing FAQ](https://www.ama-assn.org/practice-management/cpt/cpt-licensing-frequently-asked-questions-faqs)
- [AMA CPT Developer Program](https://www.ama-assn.org/practice-management/cpt/cpt-developer-program)
- [CMS NCCI](https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits)
- [Stedi professional claim submission](https://www.stedi.com/docs/healthcare/submit-professional-claims)
- [Stedi acknowledgments and remittances](https://www.stedi.com/docs/healthcare/claim-responses-overview)
- [Stedi test claim workflows](https://www.stedi.com/docs/healthcare/test-claims-workflow)
