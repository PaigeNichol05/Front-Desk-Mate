# Billing codes and member coverage review

Billing staff can search real codes under **Billing → Billing codes & insurance coverage**. Clinicians have the same lookup inside an encounter; selecting a result fills the coverage context and, for the matching service date, the checkout code field. Codes must describe documented care. No code or diagnosis is automatically recommended because it could obtain coverage.

## Installed public releases

- CMS October 2026 non-dental HCPCS Level II: 7,448 codes, effective within October 1–December 31, 2026, respecting individual effective and termination dates. Source: https://www.cms.gov/files/zip/october-2026-alpha-numeric-hcpcs-file.zip
- CMS FY2027 ICD-10-CM: 74,879 billable diagnosis codes, effective October 1, 2026–September 30, 2027. Source: https://www.cms.gov/files/zip/2027-code-descriptions-tabular-order.zip

Catalog lookup returns up to 30 code/description matches, effective dates and source provenance. Dates outside installed releases return catalog unavailable, not an assertion that a code is invalid. The application checks compressed catalog hashes at startup. This is description lookup, not a complete coding validator: tabular instructions, guidelines, modifiers, bundling/NCCI edits, units, medical necessity and coverage still need professional review.

CMS sources are pinned in `resources/codes/manifest.json`. HCPCS dental CDT entries and modifiers are excluded. Medicare coverage indicators are intentionally excluded: they cannot establish another plan's member benefits. To rebuild, extract the HCPCS ZIP into `hcpcs/` and the ICD ZIP into `icd/` under a local source directory, install Python `openpyxl`, then run `python scripts/build-code-catalogs.py <source-directory>`. The script validates source-file hashes. Do not silently substitute another release; review provenance, counts, dates and tests when updating versions. The runtime needs no Python or network access.

## CPT licensed import

CPT is not bundled. An active organization ADMIN can import licensed data through the Billing interface or `POST /api/billing/codes/import`. The importer records a license attestation, license reference, source reference, actor and audit event. Attestation does not obtain or validate licensing rights. The operator must ensure the license permits this product, users, deployment and display. Private data is organization-scoped and must not be committed to the public repository.

Body: `license_attested: true`, `license_reference`, `source_reference`, and `codes` array containing `{code, description, starts_on, ends_on}`. Maximum 10,000 entries per request; split a larger licensed release into nonoverlapping batches. Overlapping date versions for the same code are rejected atomically. Tests use only synthetic identifiers and descriptions, not licensed CPT content.

## Coverage evidence

No insurer is connected and no real member benefits are supplied. Every new context begins **Coverage not verified**. Staff can record reviewed plan-document, insurer-portal or insurer-call evidence, with source reference, review date, expiry/recheck date, benefit status, eligibility, network, provider enrollment, requirements/limits/exclusions and cost sharing. A general plan document cannot establish member coverage: it displays **Plan policy only · member coverage not verified** even when it includes an exclusion. Portal/call evidence is a staff assertion, clearly distinct from an authenticated electronic payer response. Neither benefits nor prior authorization guarantee payment.

Each immutable review matches organization, patient, encounter, payer/member snapshots, exact plan/product reference, assigned provider, service date, procedure system/code, documented diagnosis, modifier, units and place of service. Changing any context produces an unverified result. Expired evidence is retained for history but does not project current coverage. A later UNKNOWN review supersedes a prior positive assertion. Staff can append corrections or rechecks; they cannot overwrite/delete prior evidence. Only current matching evidence is displayed by this first interface.

Read access: active BILLER/ADMIN/PHYSICIAN in the same organization. Review writes: active BILLER/ADMIN. Imports: active ADMIN. Patients have no access to these staff endpoints in this foundation. HTTP writes require session and CSRF. Review writes and reads are audited. Sources, dates and authenticated-response=false remain explicit.

Endpoints: `GET /api/billing/codes?system=HCPCS&q=J3301&service_date=2026-10-09`; `GET /api/billing/coverage` with the encounter/context fields; `POST /api/billing/coverage` with the same context and `evidence` object. The service date/provider/member come from the scoped encounter/patient, not arbitrary client overrides.

## Remaining integration work

This review does not query eligibility, verify enrollment, interpret policies automatically or calculate payments. Exact insurer/product identifiers and authorized member-specific sources are needed to populate actual benefits. No CPT license, insurer credentials, authenticated eligibility transport, NCCI engine, provider enrollment registry or payer-specific diagnosis-to-procedure coverage rules are supplied. Real payer transmission remains disabled. Completion still requires the clearinghouse agreement, verified provider enrollment, coding/eligibility checks and professional compliance review described in INTEGRATIONS.md.
