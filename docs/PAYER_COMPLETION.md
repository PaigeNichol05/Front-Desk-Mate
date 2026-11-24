# Completing payer mappings and review work

Implementation date: November 24, 2026. This follow-up builds on PR #3; it is not deployed or connected to insurers by creating a commit.

## Staff workflow

Open Billing → Billing code updates & policy audits → Exact payer and plan review worklist. Active BILLER and ADMIN users can:

1. Add a specific legal payer/affiliate, exact product or employer-plan reference, jurisdiction, directory vendor/namespace, payer ID, practice/provider context and service scope. Include applicable code identifiers, units, modifiers and setting in the scope. Preserve leading zeroes in payer IDs. A shared parent name must not collapse distinct products, employers, jurisdictions, providers or vendor IDs. Use a new mapping to correct an identity; original records remain preserved.
2. Record separate dated observations for medical, reimbursement, coding, authorization, documentation, filing and appeals. Explain the rule, exact applicability, exceptions and affected code identifiers in the notes, without copying licensed descriptors. For deadlines record the triggering event, calendar/business-day convention and exceptions. Record publication dates when stated, effective start/end dates, source version/reference and review notes. Missing publication dates remain unknown. A changed policy remains a hold until staff appends a checked review.
3. Record support separately for eligibility, claims, acknowledgments, claim status, remittance, authorization and attachments. Distinguish supported, unsupported, enrollment required, inaccessible and unknown. Record practice transaction enrollment independently, with an evidence reference for staff-confirmed enrollment. Provider network status and member eligibility remain separate external checks; these records do not certify them.
4. Inspect a proposed service date. Future policy versions do not replace the version applicable to an earlier date. Every revision, failure and reviewer remains in immutable history. An unavailable source supersedes an older successful observation. Staff observations expire for freshness after five days, independently of their policy effective dates.
5. Resolve each review hold. “Scoped reviews recorded” means only that current observations exist for those 14 checks and that exact scope. Enrollment follow-ups can still remain. Unsupported transactions count as documented findings, not available connections. The application always reports live connections disabled, member benefits not verified and the universal payer census unverified.

The 56 Medicaid/CHIP jurisdiction rows (50 states, DC, AS/GU/MP/PR/VI) are discovery worklists, not assertions that each jurisdiction has the same program structure. Each agency, CHIP arrangement and MCO still requires separate discovery and reconciliation. The 14 broad payer groups likewise remain explicitly census-unverified, even after adding mappings. No percentage of all U.S. insurers is invented.

## Monitoring and evidence

The fixed source monitor expands from 21 to 29 URLs: CMS TAVR CR14657; Kaiser Washington notices; Premera updates and assistant-at-surgery PDF; Pennsylvania Health & Wellness updates; Iowa Total Care payment transition notice; and two Molina Kentucky policy PDFs. Indexes do not prove inspection of all linked documents or affiliates. Fetch failures remain unknown and follow the worker's hourly retry schedule.

When staff records evidence referencing an exact fixed source URL, the current successful fingerprint is attached if available. A later failure, changed fingerprint or expired observation reopens a hold until staff reviews it. References outside the fixed registry are **manual evidence references only**. They are not fetched, recursively crawled, authenticated or automatically monitored. Add newly approved public monitoring targets through a reviewed fixed-registry code change; a source needs review even when its URL does not change. No automated content interpretation, licensed feed or full policy-rule engine is implemented.

## Access and persistence

SQLite stores tenant-scoped mappings and append-only evidence. Creation/review/read actions write audit records. Database-level tenant/actor foreign keys and immutability triggers prevent cross-organization association and historical rewriting. Duplicate request keys replay without creating another observation; conflicting payloads or stale review versions reject with HTTP 409. Review and audit writes commit atomically. Both APIs recheck active billing roles; writes also require the existing authenticated session's CSRF token.

`GET /api/billing/payer-registry?service_date=YYYY-MM-DD` returns the exact mappings, history, unresolved checks and jurisdiction/group worklists. `POST /api/billing/payer-registry` creates an identity. `POST /api/billing/payer-registry/:id/reviews` appends reviewed evidence with a unique `request_key` and the category's `expected_latest_id` (null for its first record). Source URLs require HTTPS without credentials, query strings or fragments, and are never fetched by these APIs. Supply public source references and non-secret internal evidence references; do not enter patient data, passwords or tokens.

## Remaining external completion requirements

- Reconcile the practice's actual payer/product inventory against authorized directories and all applicable jurisdiction/program/affiliate lists. Obtain applicable employer-plan documents and portal-only instructions through authorized staff. An enumerable jurisdiction list cannot establish an exhaustive insurer census.
- Contract with a clearinghouse, execute required agreements, verify provider and transaction enrollments and authorized access, and complete professional coding, clinical and compliance review before enabling a future production integration. No enrollment or credentials are created here.
- Verify member-specific benefits, medical necessity, authorization, network status and service-date requirements through approved workflows. Neither a public policy nor eligibility/authorization guarantees payment.
- Review and publish new code catalogs separately. Signed clinical evidence and claim snapshots retain historical versions. This feature does not activate code/rule changes, submit claims or change simulation labels.

References: [CMS state discovery](https://www.medicaid.gov/state-overviews-0), [BCBS local-company discovery](https://www.bcbs.com/about-us/blue-cross-blue-shield-system/state-health-plan-companies), [Stedi transaction and enrollment documentation](https://www.stedi.com/docs/healthcare/supported-payers). Stedi recommends daily cached directory refresh, separate from the five-day policy-review cadence. No authenticated directory synchronization is implemented here.

## Verification

Automated tests exercise restart persistence, duplicate/conflicting submissions, stale-review rejection, failures overriding success, future/historical applicability, monitored-source changes, enrollment separation, tenant boundaries, active roles, CSRF, immutability and audit rollback. A local browser launch was attempted but Chromium exited before opening a page; visual layout remains unverified. HTTP asset delivery and the public renderer are tested separately.
