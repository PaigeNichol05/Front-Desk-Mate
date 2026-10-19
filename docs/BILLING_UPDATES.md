# Billing-source audits and reviewed code updates

Version 0.3.0 adds **Billing → Billing code updates & policy audits** to the authenticated app. The workflow checks a fixed public source directory, records changes or failures, and supports staging/review/publication of complete authorized catalogs. It does not claim that a webpage fingerprint is a code update, that all payer policies are monitored, or that an installed code establishes coverage.

## Finding a policy for a service

Policies commonly group many services or codes. Begin with the payer's official medical-policy index, reimbursement policies, authorization requirements and provider manual. Match the exact payer/product, plan, service/code, provider, location, jurisdiction and proposed service date; some information requires provider-portal access or a direct payer inquiry. A public document is not member-specific benefit verification, and a requirement search is not an authorization request or decision.

The source directory now includes 21 fixed public URLs across CMS/AMA references, named national payers, selected program/region indexes, local Blue-company and Medicaid/CHIP discovery, and Stedi/Availity transaction-directory information. The maintenance screen shows 14 payer research groups and explicit source, plan and connection gaps. See [PAYER_MONITORING.md](PAYER_MONITORING.md) for exact scope and the remaining path to broad payer connections. This is not every insurer or every service. Index-page monitoring cannot detect every change to a linked document whose URL remains unchanged. Additional policy documents and authorized portal/feed integrations need an explicit reviewed implementation; arbitrary user-supplied URLs are never fetched.

Code photographs can help staff identify a code system and locate authoritative information. They are not automatically imported as a current complete catalog, and code recognition from an image is not proof of performed care or benefits. OCR/AI processing is not connected to this app.

## Five-day source audits

Set `BILLING_AUDIT_ENABLED=true` on the authenticated server. The complete local demo launcher enables it by default; set the variable to `false` to disable its background checks. The normal `.env.example` remains opt-in. The separate public Railway concept does not run this worker.

On startup, the worker catches up on due work and then checks the durable schedule every minute. A successful run schedules the next check five days later. If any source check fails, the run is explicitly incomplete and retries after one hour. The server must remain running with a persistent SQLite database; this is not an independent cloud scheduler or personal ChatGPT reminder. Restart preserves the due time. **Check official billing sources now** runs the same monitor for authenticated BILLER/ADMIN users.

Each organization has isolated immutable run history and a lease to prevent overlapping work. Interrupted leases produce a recovery record; a late worker cannot overwrite recovered results. Audits retain source IDs, timestamps, URLs, SHA-256 fingerprints, observed CMS release links, comparisons with the last successful observation, installed-catalog snapshots and failure codes. No raw payer document, code file, patient/member/provider detail or credential is sent to an external AI service. Public requests contain only fixed source URLs and format headers.

Results mean:

| Status | Meaning |
| --- | --- |
| `BASELINE_RECORDED` | First successful fingerprint; no previous observation to compare |
| `UNCHANGED_FINGERPRINT` | Same bytes at this monitored URL; does not prove every code or linked policy is current |
| `SOURCE_CHANGED_REVIEW_REQUIRED` | Different bytes; staff must determine what changed and when it applies |
| `CHECK_FAILED` | No freshness conclusion; source access, network, format, redirect, size or timeout issue |
| `NO_CATALOG_FOR_DATE` | No selected public catalog covers today's lookup date |
| `LICENSED_IMPORT_REQUIRED` | No applicable CPT content is installed; an authorized licensed import is required |

The reader uses an eight-second total fetch timeout, a 2 MiB per-source cap, a fixed URL registry, same-host HTTPS-only redirects and no cookies/credentials. It does not bypass sign-in or verification walls. CMS file links are discovered as references, not downloaded or activated as code content. Dynamic page elements can change fingerprints and create review work without changing coding rules. A source failure never appears as "up to date."

## Stage, review and publish a complete catalog

Only an active organization ADMIN may stage or publish; active billing staff can inspect release metadata and audit history. An admin role is not seeded in the public demonstration accounts. Use a controlled administrative setup rather than promoting accounts through a public endpoint.

1. Obtain the applicable official public CMS release or an authorized licensed CPT/vendor release. Normalize it in a controlled preparation process. Preserve the source file and calculate its SHA-256. The app does not fetch, parse or independently authenticate that original code file.
2. Upload normalized JSON under **Stage an authorized complete code release**. Required fields: `system` (`HCPCS`, `ICD10CM`, `CPT`), distinct `version`, `starts_on`, `ends_on`, `source_url`, `source_sha256`, and complete `codes` array of `{code, description, starts_on, ends_on}`. CPT additionally requires `license_reference`. Attest `complete_release: true` and `rights_attested: true`.
3. The server validates schema, dates, duplicate codes and system-specific formats, computes a normalized-content hash, and reports additions/removals/changed descriptions or effective dates against the selected catalog at the new release's start date. It accepts up to 100,000 codes / 25 MB HTTP JSON (24 MB upload file). Partial patches must be normalized into a complete release; otherwise omitted codes would disappear on publication.
4. Review the complete input, source rights, diff and dates. Publish with explicit confirmation, notes and the exact `data_sha256`. If the baseline changed during review, stage a fresh correction version. Source and licensing attestations do not obtain a license or independently verify the publisher's content.
5. New code lookups select the most recently published organization release that contains the requested service date, then the code's own effective dates. Missing codes do not fall back to an older overlapping release. Dates outside a published release retain the bundled/legacy licensed lookup behavior. Signed documentation, prior code reviews, authorization worksheets and claim snapshots retain their original evidence; publication does not rewrite them or automatically recode/resubmit claims.

Complete catalogs, publication records and audit history are append-only with database-level tenant/actor relationships. A correction is a new version/publication. The original CPT licensed importer remains available as a legacy path; once a published full release covers a date it takes precedence. These are terminology updates, not a complete NCCI/modifier/medical-necessity/authorization-rule engine. Future authenticated terminology feeds and full payer-policy mapping still require licensed/authorized integrations.

## Verification

Regression tests cover five-day due times, persisted schedules, hourly failure retries, leases/recovery, unknown-source states, no automatic code activation, source-boundary checks, reviewed date-specific publication, removed codes, stale-baseline rejection, licensing, tenant boundaries, CSRF, immutable records and audit rollback. A live reader smoke check on October 18, 2026 retrieved six of seven configured sources; the UHC reimbursement index timed out in this environment. That check did not import any code release or establish clinical coverage. Browser layout verification remains outstanding because local browser access was declined earlier.

Official references: [CMS HCPCS releases](https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update), [CMS ICD-10](https://www.cms.gov/medicare/coding-billing/icd-10-codes), [AMA CPT licensing](https://www.ama-assn.org/practice-management/cpt/cpt-licensing-frequently-asked-questions-faqs), [UnitedHealthcare prior authorization](https://www.uhcprovider.com/en/prior-auth-advance-notification.html), [Cigna precertification](https://www.cigna.com/health-care-providers/coverage-and-claims/precertification).
