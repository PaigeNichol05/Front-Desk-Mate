# Broad payer support and remaining connections

Product scope: support the full U.S. health-payer market, including national and regional commercial insurers, local Blue plans, Original Medicare and Medicare Advantage, every state Medicaid/CHIP program and managed-care plan, employer/self-funded plans and TPAs, TRICARE, VA/CHAMPVA and other applicable benefit types. This is a target scope, not a statement that all insurers are configured or connected. No exhaustive payer census or percentage-complete claim is supplied.

## Current source monitoring

`src/billing-sources.js` defines 21 fixed public URLs and 14 research groups. The authenticated Billing maintenance screen displays these groups, current source observations, missing product/state/affiliate details and a search field. Groups are not transaction-routing identities. A national carrier group must not merge distinct payer IDs, affiliates, plans, state rules or employer exceptions.

The five-day worker in PR #3 monitors all configured URLs, including additions for Medicare NCCI pair/unit edits and drug waste; UHC medical policies; Humana; Molina; Ambetter; a Kaiser Colorado provider index; BCBS local-company discovery; state Medicaid/CHIP discovery; TRICARE; VA community-care claims; and Stedi/Availity transaction-directory information. Existing CMS, AMA, Aetna, Cigna and UHC sources remain. Reading a directory only checks that directory URL. It does not recursively monitor its linked insurers, all states, every procedure or all policy PDFs. Index changes do not prove a policy change; an unchanged index does not prove downstream documents are unchanged.

Each public URL is checked with the existing fixed-registry reader: HTTPS, same-host redirects, no cookies/credentials, timeout and response-size limits. A source may block access, change format, redirect to another host, use a dynamic search or require a login; the failure remains unknown and the worker retries. This release does not bypass those restrictions. Public-source access is not authenticated patient-benefit access.

The group projection uses newest observations from that organization's immutable history. A newer failed check overrides older success; observations expire after five days. No observation begins as verified. Every group continues to report `member_benefits: NOT_VERIFIED` and `transaction_connection: NOT_CONNECTED`, even if every listed URL was read successfully. Empty recovery records cannot erase previous observations. Groups with no sources show `SOURCES_NOT_CONFIGURED` rather than a successful audit. Discovery-only groups still require individual company/state/product sources.

## Work required for actual payer connections

1. Select and contract with a healthcare clearinghouse/data vendor, complete applicable agreements and security/compliance review, and obtain authorized credentials outside the public demo. Compare supported transactions against the actual payer inventory. This change does not select, purchase or connect a vendor.
2. Ingest a licensed/authorized payer directory using stable vendor-scoped identifiers, primary routing IDs and aliases as strings, preserving leading zeroes. Store provenance, timestamps and versions. Reconcile additions, mergers, renamed plans and removed routes without changing historical claim snapshots. A transaction directory is not an insurer's complete clinical-policy database or a list of member benefits.
3. For every exact payer/product/jurisdiction, track eligibility, claim submission, acknowledgments, status, remittance, authorization and attachments separately. Record supported, unsupported, unknown and enrollment-required status per transaction. Separately verify the practice/provider's enrollment: network participation and clearinghouse transaction enrollment are different checks. A directory entry never means every transaction is available.
4. Map the official medical, reimbursement, coding, prior-authorization, documentation, filing/appeal and program sources to exact plans and service dates. Authenticated portals/feeds and employer benefit documents may be necessary. Store scope, publication/effective dates, last verified dates, reviewer and required follow-up. Unknown/unavailable policy is a review hold.
5. Verify individual eligibility/benefits near the planned service date and before the procedure when needed. Match the documented proposed service, diagnosis, provider, setting and units. A five-day policy audit cannot replace that check or an authorization decision. Neither eligibility nor authorization guarantees payment.
6. Use additional contracted routes or documented staff workflows for gaps. Real claim/authorization transmission remains disabled until the repository's live-connection gates are met.

The separate ChatGPT audit is research reporting. Updating its payer scope does not deploy this feature, connect an insurer, publish a code catalog or activate a reimbursement rule.

## Primary directory references

- Stedi supported-payer/transaction/enrollment documentation: https://www.stedi.com/docs/healthcare/supported-payers
- Availity payer directory, filterable by transaction and enrollment: https://essentials.availity.com/static/public/onb/onboarding-ui-apps/payer-list-ui/
- Local Blue-company directory: https://www.bcbs.com/about-us/blue-cross-blue-shield-system/state-health-plan-companies
- CMS Medicaid/CHIP state profiles: https://www.medicaid.gov/state-overviews-0

Stedi recommends refreshing a cached transaction directory at least daily. Preserve the requested five-day billing-policy audit cadence separately; a future authorized directory synchronization needs its own freshness policy. Neither synchronization is live in this test foundation.
