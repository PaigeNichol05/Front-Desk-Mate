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

## Office specialties and clinician profiles

The product must be configurable per practice and location, with multiple specialties supported in the same organization. For the initial practice, use pain management as the primary specialty and spine care as the secondary specialty. Keep orthopedics available as an additional configurable specialty and make specialty templates extensible. This interpretation treats the owner's phrase “main management” as pain management; confirm that label during practice setup. Specialty configuration controls relevant code search filters, favorites, documentation templates, and review checklists; it does not change an official code descriptor or establish coverage. Unsupported specialties or unverified rules must be labeled as such rather than claiming universal office support.

Create a profile for each physician (MD/DO), nurse practitioner (NP), and physician assistant (PA). Store individual NPI, professional role, taxonomy/specialties, practice locations, state licensure/scope information, payer enrollment/credentialing, and effective dates. Track group/billing entity identifiers separately. A profile is not proof of credentialing; verification provenance and review are required.

Each encounter/claim must identify the actual rendering clinician, billing entity/practitioner, and supervising clinician when applicable. Changing the rendering clinician triggers a new provider/payer review and invalidates earlier readiness checks. Do not substitute a physician NPI merely because an NP or PA works in the office. Do not assign a different service code solely because the clinician is an NP or PA: select the code for the documented service, then evaluate provider eligibility, applicable billing arrangement, modifiers, supervision/documentation, and payer rules.

Direct billing, incident-to, and split/shared arrangements require distinct, service-date and payer-specific rule checks. Do not infer eligibility from a role selection or physician signature. Capture the required evidence and hold unresolved cases for a qualified reviewer. Medicare rules must not be applied automatically to commercial insurers or other settings. Keep provider-rule versions and reviewer decisions with the submitted claim snapshot.

For example, an orthopedic office can prioritize its relevant service templates while a pain-management office uses different templates. The same pain-management service performed by a physician, NP, or PA still requires review of that specific clinician's eligibility, the documented service, setting, and insurer policy. The app must explain which checks changed when the clinician changes, without promising a particular code or reimbursement result.

Practice customization is permission-controlled and audited. Templates may add internal guidance but cannot override authoritative code meanings or mandatory payer requirements. Separate organizations cannot read each other's clinician profiles, credentials, settings, or claim data.

## Pre-submission review

Validate applicable eligibility for the service date, provider identity/enrollment, member and payer routing identifiers, code validity, diagnosis support, modifiers, units, place of service, authorization, required documents, and filing deadlines. Apply relevant code-pair and unit edits with versioned sources. Medicare NCCI rules are not automatically the rules for every commercial payer. Record exceptions and professional review rather than labeling unknown checks as passed.

The production submit path must hold a claim with unresolved required checks. Existing checkout checks remain structural demo checks; they do not establish valid coding, coverage, or payment eligibility.

## Contracted clearinghouse

Evaluate a legitimate healthcare clearinghouse against the practice's payer list, professional versus institutional claims, eligibility and authorization needs, enrollment, acknowledgments, remittances, fees, support, agreements, and security requirements. Stedi is an API-oriented candidate for evaluation, not a selected or connected vendor. Its documentation describes professional claims, payer enrollment, claim acknowledgments, and remittance workflows. Verify coverage for the actual insurers and transaction types before purchase or implementation.

Before live operation: select the vendor; execute applicable service agreements and BAA; enroll the practice/providers for required payer transactions; obtain protected credentials; complete sandbox and trading-partner testing; and satisfy the repository's production-readiness gates. Do not put credentials in source control or expose them to the browser. Keep the public fictional demo isolated from any production account and PHI.

Implementation must provide server-side claim submission, idempotency, durable transmission receipts, authenticated response ingestion, duplicate/replay protection, reconciliation, and a rejection work queue. Handle ambiguous timeouts by reconciling with the vendor before resubmitting. Correlate vendor and payer identifiers with the original claim and preserve rejection codes and explanatory text.

Show distinct states: queued locally, transmitted, clearinghouse rejected/accepted, payer rejected/accepted for processing, pending adjudication, denied, and paid/partially paid. Interpret 999 and 277CA acknowledgments according to their actual scope; use adjudication/remittance information for payment outcomes. HTTP success or clearinghouse acceptance is not payer approval or payment. Never manufacture an acknowledgment.

## Denial correction, chart search, and payer forms

Requested workflow: when a claim is rejected or denied, help billing staff identify the problem, retrieve existing supporting material from that patient's authorized chart, prepare the required correction/reconsideration/appeal, and notify the clinician of missing evidence. Use the same verified requirements before the first submission to reduce avoidable problems. This is planned functionality; existing denial records and draft appeal fields do not implement automated chart retrieval, official form filling, or payer submission.

1. Preserve the original claim, payer claim number, line-level response, rejection/denial codes, explanatory text, EOB/ERA or correspondence, and receipt date. Determine whether the action is a correction of claim data, an attachment response, a reconsideration, or an appeal. Do not automatically resubmit every denial as a new original claim. Uncertain classifications require billing review.
2. Resolve the insurer and exact applicable plan/product, member/group identifiers, coverage dates, service date, network/provider status, and relevant benefit/policy documents. A plan's marketing tier or metal level alone is not enough to determine coverage or documentation requirements. Eligibility responses may not contain all benefit exclusions or clinical policies; show missing or unverified information explicitly. Verify the applicable plan documents and insurer instructions rather than inventing a universal checklist.
3. Select a versioned official form or supported electronic workflow for that payer/product, jurisdiction, action type, and deadline. Some payers require portal/API submission rather than a paper form. Record the source, version, effective dates, destination, required signatures/representation authority, and verified deadline calculation. If no supported form/workflow exists, show manual instructions and a review hold. Do not describe an app-generated cover letter as an official payer form.
4. Search only records authorized for that staff member and linked to the claim's patient and encounter/service. Search structured notes, signed procedure/visit reports, authorizations, referrals, test/imaging reports, prior treatment records, and permitted uploaded documents. OCR/search indexing for scanned files must run within the approved protected environment; the current app has no OCR integration. Search results must identify the source document, date, author/signature status, relevant excerpt/page, and whether it actually supports the requested requirement. Do not treat a filename or keyword match as proof. Restrict unrelated encounters and specially restricted records according to access policy.
5. Prepare a reviewable packet using verified claim fields and selected chart evidence. Show each auto-filled field's provenance and each attachment in a manifest. Leave unsupported facts blank and mark them for review. Do not fabricate clinical findings, signatures, authorization, or retrospectively imply that care occurred. Preserve signed originals; clinical additions require the clinician's dated, attributable addendum workflow.
6. Send the assigned clinician a specific missing-documentation task: applicable policy/source, requirement, what was found, what remains missing, and the deadline. The clinician may identify existing evidence, clarify an accurate record, or determine that the service does not meet the requirement. Billing staff review claim changes and the draft packet before authorized submission. Apply the actual rendering physician/NP/PA rules separately.
7. Submit only through a configured authorized channel, retaining the original claim relationship and required correction indicators or payer reference. Save the approved packet version, reviewer, submission receipt, and response. Prevent duplicate submissions and reconcile uncertain delivery. If no electronic integration supports the action, export a clearly labeled reviewed packet for staff submission; export alone must not mark it submitted.

Audit chart searches, document accesses, draft changes, reviewer approvals, exports, and transmissions. Recheck authorization for every document and generated packet download. Include only necessary supporting records and keep packets/private indexes outside public storage. No real chart may be sent to an external AI/OCR tool without the approved service arrangement and security review. Fictional demonstrations remain isolated from production systems.

Use confirmed outcomes to propose future pre-submission checks scoped to the same payer/product, policy, service, and clinician context. A billing/clinical reviewer must approve a new rule with an authoritative source and effective dates. One denial must not become a universal rule or a guarantee. Keep correction/appeal deadlines and unresolved cases visible in the work queue, and distinguish overturned denials, upheld denials, payment, and closure.

## Acceptance tests for implementation

- Correct service-date catalog/policy version and exact authorized descriptor; unknown/deleted code and missing licensed content never appear verified.
- Orthopedics, pain management, and mixed-specialty offices use isolated, configurable templates; internal customization never replaces authoritative descriptors.
- Physician, NP, and PA profiles retain separate rendering/billing identities; changed clinicians or expired/unverified credentials trigger review. Incident-to and split/shared arrangements require applicable evidence, not a role-based default.
- Different payer/plan rules remain separate; unavailable or outdated policy produces a review hold.
- Documentation, modifier, units, authorization, and applicable edit failures block production submission; review is attributable and auditable.
- Staff-only configuration/review/submission with organization boundaries; no credentials in responses or logs; fictional demo cannot reach production transport.
- Idempotent submissions, timeout reconciliation, authenticated duplicate callbacks, correct claim correlation, and preserved rejection reasons.
- Clearinghouse acceptance, payer acceptance, denial, and remittance/payment remain distinct; no acceptance or payment guarantee is displayed.
- Denial reason routes to the correct correction/attachment/reconsideration/appeal workflow and current payer form or electronic channel; unknown plan/rules produce a hold, not a fabricated form or deadline.
- Search never crosses patient, organization, or restricted-record authorization boundaries; retrieved evidence is attributable, and missing evidence creates a clinician task rather than invented documentation.
- Auto-filled forms and packet manifests trace to verified sources; unsigned evidence is identified, original records remain intact, and changes require review.
- Export is distinct from transmission; original claim identifiers, correction indicators, receipts, duplicate prevention, deadline tracking, and outcome history survive retries.
- Proposed preventive checks from denial outcomes require sourced, scoped professional approval before activation.

## Primary references

Reviewed October 4, 2026; revalidate before implementation and whenever source versions change.

- [AMA CPT licensing FAQ](https://www.ama-assn.org/practice-management/cpt/cpt-licensing-frequently-asked-questions-faqs)
- [AMA CPT Developer Program](https://www.ama-assn.org/practice-management/cpt/cpt-developer-program)
- [CMS NCCI](https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits)
- [Stedi professional claim submission](https://www.stedi.com/docs/healthcare/submit-professional-claims)
- [Stedi acknowledgments and remittances](https://www.stedi.com/docs/healthcare/claim-responses-overview)
- [Stedi test claim workflows](https://www.stedi.com/docs/healthcare/test-claims-workflow)
- [CMS advanced practice registered nurses](https://www.cms.gov/medicare/payment/fee-schedules/physician-fee-schedule/advanced-practice-non-physician-practitioners/advanced-practice-registered-nurses-aprns)
- [CMS physician assistants](https://www.cms.gov/medicare/payment/fee-schedules/physician-fee-schedule/advanced-practice-non-physician-practitioners/physician-assistants-pas)
- [UnitedHealthcare claims, billing and payments](https://www.uhcprovider.com/en/claims-payments-billing.html)
- [Aetna disputes and appeals overview](https://www.aetna.com/health-care-professionals/disputes-appeals/disputes-appeals-overview.html)
