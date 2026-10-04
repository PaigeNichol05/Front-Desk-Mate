# Front Desk Mate · practice-management foundation

A runnable, dependency-free Node 24 and SQLite starter for one unified patient/physician/billing workflow. The local demo links patient charts, encounters, code review, checkout, and claim tracking. **It is a development prototype, not an EHR certified for clinical use, a HIPAA compliance certification, or a live payer connection. Do not enter real patient information.**

**Front Desk Mate** is the patient-facing product name. “Managing patient care” describes its purpose, not its name. The existing repository and Railway demo address remain in place. See the [care CRM, scheduling, reminders and on-call design](docs/MPC_CARE_CRM.md). The public demo simulates these features; the local API does not yet implement the new booking, reminder or chatbot services.

## Open the completed fictional demonstration

With Node.js 24+ installed, double-click `Start-Front-Desk-Mate.command` on Mac or `Start-Front-Desk-Mate.bat` on Windows. Alternatively run `npm run demo:complete`. The launcher opens the authenticated app, enables the fixed synthetic-audio specimen, selects an available local port, and preserves files/database in this project folder. It binds only to `127.0.0.1`; no configuration editing or npm dependency install is required. Keep its terminal open during use. See `START-HERE.txt` for accounts and the physician/patient walkthrough. The launcher is strictly for local fictional demonstrations and is not a hosted production configuration.

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

## What works in the demo

- Role-specific Today, Patients, Schedule, Inbox, Files, and Billing screens. Patients can see only their own chart metadata, appointments, file list, claims, and authorizations. Practice users are restricted to their organization; clinician signing/checkout is limited to the assigned physician.
- Structured sections for symptoms, history, medication, allergies, exam, assessment, plan, lab, consent, calls, messages, and dictation text. Signed encounters lock clinical sections in this starter. Images and PDFs are stored outside the public directory and downloaded only after authorization checks.
- Manual ICD-10-CM, CPT, HCPCS, and modifier **suggestions for review**. The checkout form accepts reviewed procedure/diagnosis/modifier entries. The example code in the test is a specimen, not a coding recommendation. There is no AI code inference, official code catalog, payer rule engine, or licensed CPT dataset included.
- At checkout, required signed documentation, assessment, plan, demographic coverage, line structure, and any linked approved authorization are checked. A transaction creates the claim and lines once, marks the encounter checked out, and records an event. Status is `AWAITING_CONNECTOR`, explicitly meaning **not transmitted**.
- Biller APIs for authorization requests, recorded denials, draft appeals, payment posting, claim events, and claim status. Patient claim view omits member IDs. External acknowledgments and remittances require an integration.

## Architecture and boundaries

```text
Browser (patient / physician / biller)
  → same-origin HTTP API + session cookie + CSRF token
  → org and patient authorization checks
  → SQLite clinical, revenue, audit models
  → private local uploads
  → clearinghouse adapter boundary (unimplemented)
```

Schema lives in `src/db.js`; checkout validation and transaction in `src/billing.js`; API/auth/file access in `src/server.js`; UI in `public/`. `docs/INTEGRATIONS.md` maps the payer lifecycle and production gates. `docs/API.md` lists endpoints. The SQLite schema is a starting model, not a migration system. No external data is shared by the demo.

Follow [the fictional-data demo walkthrough](docs/DEMO_WALKTHROUGH.md) to see the physician, patient, and billing flow. Read [production-readiness gates](docs/PRODUCTION_READINESS.md) before planning any real patient use.

`npm run demo:host` starts a separate, read-only interactive concept on port 3000. The root `railway.json` deliberately deploys this concept demo by default. It has no database, server-side forms, uploads, or insurer connection. The working local app remains `npm start` and must not be deployed for PHI until the production gates are met.

See [Railway cost and capacity](docs/RAILWAY_COST_AND_CAPACITY.md) before selecting a BAA tier or setting a real-patient launch target.

The Railway BAA tier is outside the owner's budget. Review the [affordable hosting plan](docs/AFFORDABLE_HOSTING_PLAN.md) and [try the fictional demo](https://front-desk-mate-demo-production.up.railway.app/) before any paid production decision.

The [patient-controlled data analysis](docs/PATIENT_CONTROLLED_DATA.md) explains how patients can keep personal copies and why those copies cannot replace the practice's official chart and billing records.

The selected product direction is a [full EHR and billing replacement](docs/PRODUCTION_ARCHITECTURE.md). Patient-controlled copies remain an optional portal feature. The Railway concept demo and the local API foundation do not satisfy the production gates in that document.

### Checkout and payer submission

The intended flow is `Finish & Sign → code and documentation review → authorization match → checkout → claim queue → clearinghouse 837P/837I → payer acknowledgment/rejection → 276/277 status → remittance/payment → denial and appeal`. The starter implements through the claim queue. A contracted clearinghouse, enrollment, provider identifiers, trading-partner testing, payer-specific edits, transmission retry/idempotency, X12 generation/parsing, and secure status/remittance ingestion must be added before transmission. Do not relabel queued claims as submitted.

## Environment

See `.env.example`. `SESSION_SECRET` is required. `DATABASE_PATH` and `UPLOAD_DIR` must point to private persistent storage. `PAYER_ADAPTER=none` documents the inactive integration. Production rejects demo seeding. The in-memory session map is local-demo-only: restarting logs users out, and multiple replicas do not share sessions.

## Deploy a non-PHI demonstration

1. Make the existing GitHub repository **private** before adding production infrastructure or nonpublic operational details. Never commit `.env`, `data/`, or `uploads/` (already ignored).
2. Provision a Node 24 runtime with persistent disk. Set `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT` to the platform port, `SESSION_SECRET` to a generated secret, `SEED_DEMO=false`, `DATABASE_PATH` and `UPLOAD_DIR` to persistent private paths. Start with `npm start`.
3. For a useful hosted demo, create separate fictional accounts via a controlled seed/admin workflow; the sample login only exists with `SEED_DEMO=true` in development. Do not expose the sample password publicly.
4. Before any real PHI or live payer exchange, replace demo authentication/session storage, complete risk analysis and vendor agreements, implement encryption/key management, backups and restore drills, malware scanning for uploads, retention controls, granular chart access and audit review, migrations, consent/privacy workflows, secure monitoring, incident response, and clearinghouse certification/testing. Have counsel/compliance and clinical billing specialists review the implementation.

The production target is being reevaluated for cost. The current Railway service is only the fictional concept demo. Do not deploy this API for PHI to Railway or any other host until the production gates and agreements are complete.

## Reference points

- [HHS Security Rule overview](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) for access, audit, transmission, and organizational safeguards.
- [CMS electronic claim status 276/277](https://www.cms.gov/medicare/coding-billing/electronic-billing/claim-status-request-response) for claim-status transaction context.
- [CMS ICD-10 updates](https://www.cms.gov/medicare/coding-billing/ICD-10-codes) and [HCPCS overview](https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system) for maintained code sets. CPT is maintained by the AMA and needs appropriate licensing for a product catalog.

## Roadmap

The [billing code and clearinghouse plan](docs/BILLING_CODE_AND_CLEARINGHOUSE_PLAN.md) specifies an authoritative code-description panel, service-date and payer-specific requirements, documentation checks, and a contracted clearinghouse integration. These are planned production features; the fictional demo has no official code catalog or live claim transmission. Claim acceptance for processing and payment will be tracked separately.

Priority: durable authentication and migrations; appointments/check-in and patient intake; coded terminology and professional review controls; eligibility and prior authorization connector; claims clearinghouse worker and webhook inbox; remittance reconciliation; appeal submission and document packages; full document imaging, comparison, communication, and clinical decision support. AI output should stay reviewable and attributable to a human professional.

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

The separate authenticated demonstration uses `railway-app-demo.json`; the original `railway.json` still serves the public concept. Configure one replica, `NODE_ENV=development`, `SEED_DEMO=true`, `FICTIONAL_AUDIO_DEMO=true`, `COOKIE_SECURE=true`, `HOST=0.0.0.0`, and a generated `SESSION_SECRET`. Mount private persistent storage at `/data`, with `DATABASE_PATH=/data/clinic.db`, `UPLOAD_DIR=/data/uploads`, and `AUDIO_DIR=/data/private-audio`. `GET /health` checks SQLite availability without exposing chart data. The nonproduction runtime is intentional: this deployment accepts fictional demonstrations only and makes no PHI-ready claim. HTTPS session cookies are Secure, HttpOnly and SameSite=Strict. Restart logs users out while encounter metadata/files persist. The three seeded accounts are shared fictional walkthrough identities; do not use them for real patient information.
