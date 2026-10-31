# Front Desk Mate · practice-management foundation

A runnable, dependency-free Node 24 and SQLite starter for one unified patient/physician/billing workflow. The local demo links patient charts, encounters, code review, checkout, and claim tracking. **It is a development prototype, not an EHR certified for clinical use, a HIPAA compliance certification, or a live payer connection. Do not enter real patient information.**

**Front Desk Mate** is the patient-facing product name. “Managing patient care” describes its purpose, not its name. The existing repository and Railway demo address remain in place. See the [care CRM, scheduling, reminders and on-call design](docs/MPC_CARE_CRM.md). The public demo simulates these features; the local API does not yet implement the new booking, reminder or chatbot services.

## Open the authenticated fictional demonstration

With Node.js 24+ installed, double-click `Start-Front-Desk-Mate.command` on Mac or `Start-Front-Desk-Mate.bat` on Windows. Alternatively run `npm run demo:complete`. The launcher opens the authenticated app, enables the fixed synthetic-audio specimen and test-only clearinghouse simulation, selects an available local port, and preserves files/database in this project folder. It binds only to `127.0.0.1`; no configuration editing or npm dependency install is required. Keep its terminal open during use. See [START-HERE.txt](START-HERE.txt) for accounts and the [demo walkthrough](docs/DEMO_WALKTHROUGH.md) for code lookup, source-linked billing and simulated claim processing. The launcher is strictly for local fictional demonstrations and is not a hosted production configuration.

### Choose the right demonstration

| Capability | Authenticated local application (`npm run demo:complete` / `npm start`) | Browser-only concept (`npm run demo:host`) |
| --- | --- | --- |
| Access and storage | Sample login, organization/patient access checks, SQLite and private local files; sessions end on restart | Browser role switches, fixed sample data and in-memory interactions; no login or database |
| Codes and documentation | Official dated CMS HCPCS/ICD-10-CM lookup, private licensed CPT import, clinician-entered service/medication facts and source-linked coding review | Fixed example codes and scripted visit/denial forms; no official catalog or source-linked coding API |
| Coverage | Immutable staff-entered evidence for an exact patient/plan/service context; no authenticated member eligibility response | Fictional benefit/authorization examples only |
| Claims | Persistent outbox and opt-in, explicitly labeled fictional responses, retry/restart handling and reviewed rejection corrections | Scripted claim/denial/resubmission previews in browser memory |
| Real insurer exchange or clinical deployment | No live insurer connection, X12 transport, eligibility response or production-ready clinical deployment | No live insurer connection or clinical deployment |

The root `railway.json` selects the browser-only concept. `railway-app-demo.json` is a separate authenticated-demo configuration; its presence does not establish that an authenticated service has been deployed. The implementation summary below describes merged `main`. As checked October 31, 2026, [PR #3](https://github.com/PaigeNichol05/Front-Desk-Mate/pull/3) is unmerged: its eligibility simulation, vital signs, five-day billing-source audits, catalog-publication workflow and authorization-planning worksheets are not features of `main`.

## Run locally

```bash
cp .env.example .env
# Set SESSION_SECRET to a new random value of at least 32 characters.
set -a; . ./.env; set +a
npm start
```

Open `http://127.0.0.1:3000`. Requires Node 24 or later; `npm install` is unnecessary. `npm test` runs billing, audio lifecycle, authorization, durability, and HTTP integration tests. `SEED_DEMO=true` works only outside production and seeds fictional users:

| Role | Email | Password |
| --- | --- | --- |
| Physician | `doctor@example.test` | `DemoOnly!ChangeMe123` |
| Patient | `patient@example.test` | `DemoOnly!ChangeMe123` |
| Biller | `biller@example.test` | `DemoOnly!ChangeMe123` |

## What works in the authenticated local application

- Role-specific Today, Patients, Schedule, Inbox, Files, and Billing screens. Patients can see only their own chart metadata, appointments, file list, claims, and authorizations. Practice users are restricted to their organization; clinician signing/checkout is limited to the assigned physician.
- Structured sections for symptoms, history, medication, allergies, exam, assessment, plan, lab, consent, calls, messages, and dictation text. Signed encounters lock clinical sections in this starter. Images and PDFs are stored outside the public directory and downloaded only after authorization checks.
- **Official CMS code lookup:** search by code or description and date of service in **Billing → Billing codes & insurance coverage**, or inside a clinician encounter. Bundled releases contain 7,448 non-dental HCPCS Level II codes for October–December 2026 and 74,879 billable FY2027 ICD-10-CM codes for October 1, 2026–September 30, 2027. Results include descriptions, effective dates and source provenance; catalog hashes are checked at startup. Dates outside installed releases report unavailable. Lookup does not establish correct coding, medical necessity or insurance coverage. See [codes and coverage](docs/CODES_AND_COVERAGE.md).
- **CPT import, not bundled CPT:** an active organization ADMIN can privately import appropriately licensed codes with descriptions, effective dates, source and license attestation. The app neither supplies nor validates licensing rights. The three seeded accounts do not include an ADMIN. Imaging, visit and procedure lookup generally requires that licensed content; a manual specimen is not a verified catalog result. Manual code/modifier suggestions remain available for human review.
- **Documented services and source-linked coding:** the assigned clinician records service facts against a source note before signing, distinguishing discussed, ordered/referred, performed here, performed elsewhere and canceled services. Limited phrase highlights only prompt clarification; they do not infer diagnoses, orders or billable care. After signing, an assigned clinician or billing staff can review codes against date-valid catalogs, with rationale and immutable source links retained in claim lines and outbox snapshots. Only documented in-house performed services qualify for this workflow. Legacy encounters without service records retain limited manual checkout. See [appointment coding](docs/APPOINTMENT_CODING.md).
- **Medication administration:** service records capture drug/formulation, documented dose, route and performance reference. The detailed [botulinum-toxin workflow](docs/BOTULINUM_ADMINISTRATION.md) also records actual brand/ingredient/type, individual vial NDC/lot/expiry/preparation, injection sites and units, medical-necessity/history/response, consent and guidance, and administered/discarded/remaining/other-use totals. It reconciles units and calculates product-specific HCPCS billing quantities without converting potency between brands. Administered and discarded drug components receive separate reviews; limited JW/JZ checks require explicit payer/setting review. No dose, complete medication-administration system or universal payer acceptance is supplied.
- **Patient-specific coverage evidence:** every new context starts unverified. Billers/admins can append source-referenced plan-document, insurer-portal or insurer-call reviews matching organization, patient/member/payer, exact plan, encounter/provider/date, procedure, diagnosis, modifier, units and place of service. General policy remains separate from member benefits; expired or mismatched evidence cannot project current coverage. Portal/call entries are staff assertions, never authenticated electronic insurer responses. Coverage is a separate review, not a comprehensive checkout gate; benefits and authorization do not guarantee payment.
- **Checkout and durable outbox:** signed assessment/plan, payer/member identifiers, line structure, source reviews when required, and any supplied authorization reference are checked. One transaction creates the claim, lines, queued event, audit entry and immutable transmission snapshot. The underlying claim starts at `AWAITING_CONNECTOR`, meaning no real transmission. Payer/member fields alone do not verify coverage.
- **Test-only claim lifecycle:** authorized billing staff can exercise fictional transport acknowledgment, clearinghouse acceptance/rejection, payer acceptance, adjudication, denial and remittance. The persistent worker includes idempotency, retries, restart recovery and reviewed rejection revisions. Staff see separate `SIMULATED_*` projections; simulation does not advance the underlying claim or post patient payments. See [clearinghouse foundation](docs/CLEARINGHOUSE_FOUNDATION.md).
- Biller APIs separately track manual authorization requests, denials, draft appeals and payment entries. These are local records, not payer responses or submitted appeals. Patient claim lists omit member IDs, return `PRACTICE_PROCESSING`, and exclude internal denial/transmission history. No real insurer connection, authenticated member eligibility response, payer-rule engine or automatic dictation-to-code assignment is available.

## Architecture and boundaries

```text
Browser (patient / physician / biller)
  → same-origin HTTP API + session cookie + CSRF token
  → org and patient authorization checks
  → SQLite clinical, revenue, audit models
  → private local uploads
  → persistent claim outbox + test-only fictional clearinghouse adapter
  → live payer transport disabled (no insurer connection)
```

Schema starts in [src/db.js](src/db.js); checkout validation and transaction are in [src/billing.js](src/billing.js); code lookup/coverage, service review and the fictional worker are in [src/code-coverage.js](src/code-coverage.js), [src/appointment-coding.js](src/appointment-coding.js) and [src/clearinghouse.js](src/clearinghouse.js). API/auth/file access lives in [src/server.js](src/server.js); the authenticated UI is in `public/`, separate from the concept in `demo/`. [Integrations](docs/INTEGRATIONS.md) maps live-connection gaps; [API.md](docs/API.md) and the feature guides above describe endpoints. Additive feature tables exist, but there is no production migration system. No patient data is transmitted to an insurer by either demo.

Follow [the fictional-data demo walkthrough](docs/DEMO_WALKTHROUGH.md) to see the physician, patient, and billing flow. Read [production-readiness gates](docs/PRODUCTION_READINESS.md) before planning any real patient use.

`npm run demo:host` starts a separate interactive concept on port 3000. Its server only serves static assets; interactions use browser memory. The root `railway.json` selects this concept by default. It has no database, login, server-side forms, uploads, official code lookup or insurer connection. Use `npm run demo:complete` for the authenticated fictional billing workflow. The local app can also run with `npm start` and configured environment variables; it must not be deployed for PHI until the production gates are met.

See [Railway cost and capacity](docs/RAILWAY_COST_AND_CAPACITY.md) before selecting a BAA tier or setting a real-patient launch target.

The Railway BAA tier is outside the owner's budget. Review the [affordable hosting plan](docs/AFFORDABLE_HOSTING_PLAN.md) and [try the fictional demo](https://front-desk-mate-demo-production.up.railway.app/) before any paid production decision.

The [patient-controlled data analysis](docs/PATIENT_CONTROLLED_DATA.md) explains how patients can keep personal copies and why those copies cannot replace the practice's official chart and billing records.

The selected product direction is a [full EHR and billing replacement](docs/PRODUCTION_ARCHITECTURE.md). Patient-controlled copies remain an optional portal feature. The Railway concept demo and the local API foundation do not satisfy the production gates in that document.

### Checkout and payer submission

The implemented local flow is `document service facts → sign → human code review → checkout → persistent outbox → optional fictional lifecycle`. Source-linked reviews preserve service and catalog evidence; checkout does not verify member eligibility or all payer requirements. The test worker separates transport acknowledgment, clearinghouse acceptance/rejection, payer acceptance, adjudication and fictional remittance. Correcting a completed fictional rejection creates a reviewed new revision; adjudicated denials require staff review and cannot be automatically resubmitted. The current correction form handles legacy manual lines; source-linked/toxin corrections require the API to retain reviewed provenance, as explained in the [foundation guide](docs/CLEARINGHOUSE_FOUNDATION.md). Simulated remittances never create patient payment entries.

Live `837P/837I → acknowledgments → 276/277 status → 835 remittance` remains future work. The existing retry/idempotency/recovery controls are test-only, not a connected transport. Contracts, enrollment and provider verification, payer-specific edits, partner sandbox testing, X12 generation/parsing, authenticated response ingestion and real reconciliation are still required. No queued or `SIMULATED_*` state means a claim reached an insurer. See [INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Environment

See [.env.example](.env.example). `SESSION_SECRET` is required. `DATABASE_PATH` and `UPLOAD_DIR` must point to private persistent storage. `PAYER_ADAPTER=none` documents the absence of a live integration. Ordinary `npm start` defaults the fictional clearinghouse to off; opt in with `FICTIONAL_CLEARINGHOUSE_DEMO=true`, `SEED_DEMO=true` and a nonproduction runtime. Only the bundled sample patient/payer can be simulated. The complete-demo launcher sets these flags automatically. `LIVE_CLEARINGHOUSE_ENABLED=true` fails startup; it cannot enable real transmission. Production rejects demo seeding and simulation opt-in. The in-memory session map is demo-only: restarting logs users out, and multiple replicas do not share sessions.

## Deploy a non-PHI demonstration

1. Make the existing GitHub repository **private** before adding production infrastructure or nonpublic operational details. Never commit `.env`, `data/`, or `uploads/` (already ignored).
2. Provision a Node 24 runtime with persistent disk. Set `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT` to the platform port, `SESSION_SECRET` to a generated secret, `SEED_DEMO=false`, `DATABASE_PATH` and `UPLOAD_DIR` to persistent private paths. Start with `npm start`.
3. For a useful hosted demo, create separate fictional accounts via a controlled seed/admin workflow; the sample login only exists with `SEED_DEMO=true` in development. Do not expose the sample password publicly.
4. Before any real PHI or live payer exchange, replace demo authentication/session storage, complete risk analysis and vendor agreements, implement encryption/key management, backups and restore drills, malware scanning for uploads, retention controls, granular chart access and audit review, migrations, consent/privacy workflows, secure monitoring, incident response, and clearinghouse certification/testing. Have counsel/compliance and clinical billing specialists review the implementation.

The production target is being reevaluated for cost. The default Railway configuration selects the fictional concept demo. Do not deploy this API for PHI to Railway or any other host until the production gates and agreements are complete.

## Reference points

- [HHS Security Rule overview](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) for access, audit, transmission, and organizational safeguards.
- [CMS electronic claim status 276/277](https://www.cms.gov/medicare/coding-billing/electronic-billing/claim-status-request-response) for claim-status transaction context.
- [CMS ICD-10 updates](https://www.cms.gov/medicare/coding-billing/ICD-10-codes) and [HCPCS overview](https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system) for maintained code sets. CPT is maintained by the AMA and needs appropriate licensing for a product catalog.

## Roadmap

The [billing code and clearinghouse plan](docs/BILLING_CODE_AND_CLEARINGHOUSE_PLAN.md) describes the broader production target. CMS lookup, licensed CPT import controls, staff coverage evidence, source-linked service review, detailed toxin records and the fictional clearinghouse foundation are already merged. Production payer-policy interpretation, specialty configuration and verified physician/NP/PA billing profiles remain planned; the concept's role switches do not implement them. Claim acceptance for processing and payment are already separate in the fictional lifecycle, with live equivalents still unavailable.

Remaining priorities: durable authentication and migrations; appointments/check-in and patient intake; maintained/licensed terminology and validated coding/payer rules beyond lookup; live eligibility and prior authorization; a contracted live clearinghouse adapter and authenticated response inbox; real remittance reconciliation; appeal submission and document packages; full document imaging, comparison, communication, and clinical decision support. AI output should stay reviewable and attributable to a human professional. Unmerged pull-request work is not part of this implementation summary.

The billing plan also specifies production denial correction with authorized patient-chart search, payer/plan-specific official forms or electronic workflows, clinician documentation tasks, reviewed packets and approved preventive checks. The browser concept demonstrates fixed sample chart search, tasks and a form preview; the authenticated application has source-linked service evidence and a test rejection-correction path. Neither implements live automated chart retrieval, official payer-form filling or real resubmission. Missing facts must never be generated as clinical evidence.

## Multi-patient demo and clinician handoff

The public demo contains three fictional patient charts. Open **Patients** or **Care board** to switch charts, then **Schedule** to book and review the physician handoff. The physician can keep an eligible follow-up or reassign it to a sample PA or NP. The patient view hides both clinician name and role until the appointment day. Staff can use **Preview appointment day** in the fictional walkthrough. The physician can record a sample care plan from the chart. These browser-only controls are not production access control or clinical credential checks. See [care CRM specification](docs/MPC_CARE_CRM.md).

The Schedule demo accepts a broad visit type with **optional** additional details. Office injections and office surgery with local anesthesia use office days; surgery-center surgery uses Friday requests. Surgical slots require staff confirmation in the sample flow. These scheduling labels do not suggest billing codes.

The public physician chart includes a typed **Dictation** draft for visit reason and steps taken, with a fixed fictional example. Microphone dictation and browser speech recognition are disabled. No external transcription service is connected. Physician review remains necessary; sample transcripts never automatically create codes or signed notes.

The public concept demo generates a one-second synthetic tone after separate **simulated** patient and physician approvals. It holds that tone only in browser memory and can release it to the fictional Files view. Reloading erases it. Role toggles are not authentication, and the concept demo never calls the durable audio API. The Railway start command remains `npm run demo:host`.

## Server-backed synthetic visit audio

The authenticated local app (`npm start`) now supports durable encounter-linked audio metadata in SQLite and private filesystem storage. **This feature generates a fixed tone, never records a person. It is not PHI-ready, real-patient recording, or legally sufficient consent.** Arbitrary audio uploads, microphone capture, additional participants and external transcription are unsupported. Only the seeded `enc-001` / `patient-001` / `doctor-001` specimen is allowed.

To opt in, set `NODE_ENV=development`, `SEED_DEMO=true`, and `FICTIONAL_AUDIO_DEMO=true`. `AUDIO_DIR` defaults to `data/private-audio`; keep it and `DATABASE_PATH` on the same private persistent volume. Audio opt-in is rejected in production or without demo seeding. It defaults off. Existing SQLite databases gain additive audio tables when the app opens; existing chart/file rows are unchanged.

1. Sign in as the physician, open **Patients → encounter**, and create a fictional audio attempt.
2. Sign in as the sample patient, open that encounter, read the displayed simulated-consent statement and agree or refuse. Sign back in as physician and agree as that participant. Each decision records the authenticated actor, participant, server timestamp, statement version, and provenance. Neither account can consent for the other. Exactly those two fictional participants are supported.
3. Start the synthetic attempt, then finish to save the generated tone as a private draft. **Stop** discards an unfinished attempt. No microphone starts at any stage. Unfinished starts expire after 60 seconds.
4. Replay the draft, explicitly approve it as the assigned physician, then release it to the patient portal. Patients can see consent/status metadata and withdraw during review, but can play/download only a published tone. Billers, admins, other physicians, other patients and other organizations cannot access audio. Reassignment invalidates access to the earlier clinician-bound record.
5. Refuse/withdraw or delete to revoke server access and erase the stored file. Withdrawal remains available after publication. Deletion retains a metadata tombstone, consent provenance and audit history. Previously downloaded copies cannot be recalled.

See [API contract and state rules](docs/API.md) and [audio lifecycle implementation](src/audio.js). Metadata reads, consent decisions, lifecycle changes, playback/download requests, audit reads and deletion events are recorded without storing spoken content in logs. Playback events mean an authorized full-file request was served, not proof anyone listened. No range streaming or public storage URLs are provided.

The fixed seven-day **demo** retention period starts when an attempt is created and cannot be extended by publication. Expired content is immediately inaccessible. Startup and a 30-second maintenance loop retry pending deletion, remove expired audio, and clean up interrupted starts. `npm run audio:maintain` runs the same retention/retry hook offline using the same environment and persistent paths. UUID-named unlinked files older than one minute are swept to cover a crash between file creation and metadata commit. Run a single server/maintenance owner per volume. If file deletion fails, a durable `DELETION_PENDING` tombstone blocks reads and retains the private key for retry.

The private directory uses mode `0700`, files use `0600`, filenames are server-generated UUIDs, and SHA-256 verifies content before serving it. Files are flushed before committing metadata; failed database writes roll back and remove the new file. These files are **not application-encrypted**, and the demo has no storage key management, hardened session infrastructure, legal-consent review, clinical retention policy, backup erasure, or PHI security certification. Metadata/consent/audit tombstones remain until an operator resets the fictional dataset; the seven-day rule removes media, not those records. Do not deploy this workflow for real visits.

## Hosted authenticated fictional demo on Railway

To configure a separate authenticated demonstration, use `railway-app-demo.json`; the original `railway.json` selects the public concept. These are configuration instructions, not confirmation of a deployed authenticated service. Configure one replica, `NODE_ENV=development`, `SEED_DEMO=true`, `FICTIONAL_AUDIO_DEMO=true`, `FICTIONAL_CLEARINGHOUSE_DEMO=true`, `COOKIE_SECURE=true`, `HOST=0.0.0.0`, and a generated `SESSION_SECRET`. Mount private persistent storage at `/data`, with `DATABASE_PATH=/data/clinic.db`, `UPLOAD_DIR=/data/uploads`, and `AUDIO_DIR=/data/private-audio`. `GET /health` checks SQLite availability without exposing chart data. The nonproduction runtime is intentional: this configuration accepts fictional demonstrations only and makes no PHI-ready claim. HTTPS session cookies are Secure, HttpOnly and SameSite=Strict. Restart logs users out while encounter metadata/files persist. The three seeded accounts are shared fictional walkthrough identities; do not use them for real patient information.

## Fictional denial-correction walkthrough

With `npm run demo:host`, open `/billing-demo`. The fixed pain-management/spine scenario lets billing staff search Jordan Sample’s chart, create a missing-evidence task, switch to the assigned physician to load a fictional dated addendum, and prepare/review a packet. Another sample patient’s document is excluded. Rendering-provider or attachment changes reset packet review. No official code catalog, payer policy, real form, OCR, or transmission is connected. The packet is an app-generated preview, not an official insurer form or submission. Browser roles are not authentication. Reload resets all steps.

The concept walkthrough also includes **Denials & resubmissions** in its main navigation, a visible fictional form preview, simulated denial history in Files, written sample clinician requests, and billing-documentation draft prompts. Q&A remains scripted; no live AI, official payer form, or real resubmission is connected. Visit completion follows check-in, rooming, provider assessment, plan, signing, and checkout.

The concept also demonstrates an **assessment-to-care-plan draft** from one fixed fictional assessment, with source matching, explicit clinician review, and separate signing. It does not process recorded assessments or use live AI; real transcription and clinical drafting remain production requirements.

Visit activities in the concept support multiple independent selections. Denial records and forms are staff-only; patient claim-list API responses use a generic workflow status and deny access to internal denial/event endpoints. The sample correction form auto-fills fixed fields and supports a reviewed **simulated** resubmission receipt. Real automatic resubmission is not connected.
