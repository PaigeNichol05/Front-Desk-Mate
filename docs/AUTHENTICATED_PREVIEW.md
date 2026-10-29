# Front Desk Mate authenticated fictional preview

This is the actual Node 24 / SQLite application, based on merged main commit `09b4dba858c01c56a6abc1a5b901b03cbd6a3ff0`, with an isolated evaluation launcher, fixture set and guide. It is a shared demonstration, not a clinical system or an insurer connection. Do not enter real patient information. Typed fields remain editable for evaluation; the software cannot identify and remove PHI someone types.

## Start locally

Extract the complete package first. Install Node.js 24 or newer. Double-click `Start-Front-Desk-Mate-Preview.command` on Mac or `Start-Front-Desk-Mate-Preview.bat` on Windows. Alternatively run:

```bash
npm run demo:preview
```

No dependency install is needed. The browser opens the loopback address printed in the terminal. Keep that terminal open. Ctrl+C stops the application. On Mac, if your system does not permit double-clicking a downloaded command file, use the terminal command above from the extracted folder.

| Workspace | Email | Sample account password |
| --- | --- | --- |
| Physician | doctor@example.test | DemoOnly!ChangeMe123 |
| Patient | patient@example.test | DemoOnly!ChangeMe123 |
| Billing | biller@example.test | DemoOnly!ChangeMe123 |

These shared sample identities are suitable only behind the hosted preview gate or on loopback. Sign out to change roles. Changes persist in `.preview/current`, independent of the existing `data/clinic.db`. A new session logs everyone out after server restart; chart and billing records persist.

For another clean evaluation, run `npm run demo:preview:fresh`. This creates a new ignored session directory without deleting earlier results. Never point this launcher at an existing clinical/application database. Its storage marker rejects nonempty unrelated folders and unexpected organizations. It does not import an old database. If initialization is interrupted before the fixture version is committed, start a fresh dataset instead of reusing that incomplete folder.

## Evaluate the workflow

The Today page offers three scenario buttons. All service dates are fixed at October 9, 2026, within the bundled HCPCS 2026-Q4 and ICD-10-CM FY2027 catalog periods. They are historical fictional visits; the app is not inferring that services happened today. No clinician signatures, code reviews, coverage approvals or claims are pre-completed.

1. **Medication to claim:** as physician, open the medication scenario. Inspect its assessment, plan and source-linked performed-service record. Add fictional documentation if desired, then sign. In the performed-service review, select HCPCS `J3301`, diagnosis `M54.50`, four billing units and a fictional rationale; explicitly attest review. These test values demonstrate matching, not a treatment or coding recommendation. Select the reviewed line and enter a fictional charge per billing unit to create a claim. For example, $1 per unit yields a $4 test claim; this is not a fee schedule or reimbursement estimate.
2. **Coverage review:** as biller, open the same scenario. Enter `FICTIONAL-PLAN-001`, HCPCS `J3301`, `M54.50`, four units, POS `11`, and no modifier. With no evidence the result is **Coverage not verified**. Optionally record a clearly fictional PLAN_DOCUMENT reference with CONDITIONAL or UNKNOWN status, UNKNOWN eligibility/network/enrollment, current checked date and an unexpired recheck date. It remains **Plan policy only — member coverage not verified**. No payer requirements, deductible, authorization or payment amount are established by the fixture. Changing the exact context invalidates the match. This merged foundation does not enforce complete payer-specific coverage or authorization prerequisites at checkout; checkout success is not an adjudication or a payer-ready assessment.
3. **Simulated claims:** as biller, open Billing, then the created claim. Choose an explicitly simulated paid, rejected or denied scenario and process it. Inspect outbox and event history. A rejection occurs before adjudication; a denial after simulated adjudication. The real claim remains `AWAITING_CONNECTOR`. Simulated remittance is not a real payment and is separate from manual practice payment records. The original merged correction/retry controls are available; nothing is transmitted.
4. **Detailed Botox record:** inspect brand/ingredient/type, fictional NDC/lot/expiry, preparation reference, concentration arithmetic, site-by-site injection counts/units, indication/history, consent reference, guidance, adverse events and discard references. The arithmetic is 200 opened = 150 administered + 50 discarded, zero remaining/other use. Sign before coding review. For the test use `J0585`, `M54.50`, separate ADMINISTERED 150 and DISCARDED 50 components, `OTHER_PAYER_REVIEWED`, and a clearly fictional applicability reference. This specimen does not assert that M54.50 supports Botox or insurance coverage. No clinical dose, injection protocol, payer policy or modifier choice is recommended. A medical claim may need additional supported procedure/administration lines; licensed CPT data is not bundled. Brand potency units are not interchangeable.
5. **Outside CT order:** inspect the source note and ORDERED service. It was not performed in this clinic and cannot receive a performed-service billing review. Imaging CPT selection stays unavailable until an appropriately licensed CPT catalog is imported. No fabricated catalog, diagnosis or coverage is added.
6. **Patient portal:** sign in as patient to view Jordan Sample’s own visits and generic practice-processing claim status. The separate Alex Example chart is available only to practice staff. Patients cannot sign, review billing codes, view internal simulation/denial events or access another patient’s chart.

## Deploy separately on Railway

Hosting verification attempted October 29, 2026 (America/Denver): the Railway connection returned `UNAUTHORIZED` with “This app connection requires reauthentication. Reconnect the app and try again.” Current service state could not be inspected. No Railway service, variable, domain or deployment was modified. This package does not claim a new live URL.

After restoring authorized Railway access:

1. Inspect the project, environments, service source commit, variables, domains and any pending changes. Identify the existing public concept service and leave it unchanged. Reuse an intended authenticated-preview service only after confirming its isolation; otherwise create a separate service named `front-desk-mate-authenticated-preview`.
2. Connect **only the separate service** to the reviewed preview commit/branch. Pin the commit for a stable evaluation. Set its Railway config file path to `/railway-app-demo.json`. That config starts `npm run demo:preview` and checks `/health`. The root `/railway.json` continues to start `npm run demo:host`; do not change the original service’s source, command, domain or config path.
3. Use Node 24+, **one replica**, and a new private persistent volume mounted at `/data`. Do not attach the concept’s storage or any patient/production volume. Keep public asset/CDN caching off for this service.
4. Set `PREVIEW_HOSTED=true`, `PREVIEW_DATA_DIR=/data/front-desk-mate-preview`, `PREVIEW_ACCESS_USER` to a private reviewer username, `PREVIEW_ACCESS_PASSWORD` to a new cryptographically random value of at least 24 characters, and `SESSION_SECRET` to a distinct random value of at least 48 characters. Generate each separately using `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Put them directly in the service’s private variables, never Git or this package. Send reviewer credentials privately through your chosen channel. No production credentials are required or accepted by the launcher’s inherited environment allowlist. See `.env.preview.example` for variable names; it is not automatically loaded.
5. Railway supplies `PORT`. The launcher forces binding to `0.0.0.0`, secure cookies, development-only fixture seeding, disabled audio, disabled live clearinghouse and `PAYER_ADAPTER=none`. The hosted gate is mandatory and startup fails without it. Development mode is deliberate for the existing fictional adapter, not a production security assertion.
6. Deploy the separate pinned source, inspect build/runtime results, and generate a separate HTTPS domain. Before sharing, check: unauthenticated `/`, assets and API routes return 401; `GET /health` returns only readiness; correct reviewer access reveals the application login; role logins work; session cookies are Secure/HttpOnly/SameSite=Strict; the portal and billing restrictions above hold. Recheck the original concept URL still works. Do not expose an HTTP endpoint or publish the gate credentials in a public page.

The reviewer gate uses HTTP Basic over platform HTTPS, followed by the application’s role-based session and CSRF checks. Basic credentials can remain cached by the browser: **Sign out ends the app session, not the browser’s reviewer authorization**. Close the private browsing session or rotate reviewer access to revoke that cache. The public health endpoint exposes no patient information. Restart invalidates app sessions; multiple replicas are unsupported. Shared fixture identities do not isolate one reviewer’s edits from another reviewer; deploy a separate service/volume per evaluator if that separation is needed.

For another hosted dataset, stop the service and choose a new dedicated child directory on its private volume; never delete or reuse unrelated data. Store no real documents: upload API and upload UI are disabled in preview mode. There is no remote reset, new account or device ingestion endpoint.

## Stable boundaries

PR #3 remains separate and is not included: its eligibility simulation, vital signs, five-day source audits, staged catalog publication and authorization-planning worksheets require their own resolved review and merge. The existing merged staff coverage-evidence review and basic authorization-request tracker are available. Neither is live eligibility or authorization submission. No actual insurer transmission, device capture, microphone recording, external AI, production credentials or clinical-compliance certification is enabled.

The package retains `npm run demo:host` (public browser concept) and `npm run demo:complete` (original local app). `npm start` retains the normal app entry point. Only `/railway-app-demo.json` selects the new gated preview launcher.

## Validation for this package

`npm test`: **69 passed, zero failed** with Node 24.22.1. Preview integration checks cover the hosted gate, secure cookies, missing credentials/unsafe runtime flags, unrelated storage rejection, upload blocking, patient privacy, assigned-clinician documentation, CSRF, source-code review, coverage remaining unverified/policy-only, checkout, simulated denial and persistence across restart. Existing coverage tests now use a fixed October 9 test clock, retaining the real stale-evidence assertions. `git diff --check` and JavaScript syntax checks passed. The public concept files and root `railway.json` have no changes.

A managed browser preview started, but the browser could not reach the returned URL (`ERR_CONNECTION_REFUSED`). Browser layout and interactive visual verification are **unverified**. HTTP/API integration tests ran against actual server processes; they do not replace browser or post-deployment verification. Railway deployment and domain checks remain blocked by reauthentication.
