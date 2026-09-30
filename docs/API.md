# API surface (JSON)

Login `POST /api/login`, session `GET /api/session`, logout `POST /api/logout`. Mutations after login require `X-CSRF-Token` returned by login/session. Cookies are HttpOnly and SameSite=Strict. All routes are same-origin. No public signup or API tokens.

| Endpoint | Roles | Purpose |
| --- | --- | --- |
| `GET /api/dashboard`, `/patients`, `/encounters?patientId=` | All | Role-filtered worklist and chart list |
| `GET/POST /api/encounters/:id/sections` | All read; physician/admin write | Structured note sections |
| `POST /api/encounters/:id/sign` | Assigned physician | Lock and sign encounter |
| `POST /api/encounters/:id/checks` | Practice staff | Preview documentation/claim-line checks |
| `POST /api/encounters/:id/checkout` | Assigned physician | Validate and queue exactly one claim |
| `GET/POST /api/suggestions` | All read; practice staff write | Manual candidate codes with rationale |
| `GET/POST /api/authorizations` | All read; biller/admin write | Track requests; approval update is intentionally absent |
| `GET /api/claims`, `/claims/:id/events` | All | Role-filtered claims and history |
| `GET/POST /api/claims/:id/denials`, `/payments` | All read; biller/admin write | Record payer outcomes and payments |
| `POST /api/appeals` | Biller/admin | Draft appeal linked to denial |
| `GET/POST /api/files`, `GET /api/files/:id` | Authorized chart users | Upload and fetch PNG/JPEG/PDF, max 4 MB |

Patient users can access only records linked to their `patient_id`; staff are bounded by `org_id`. This is a starter authorization matrix that needs a finer care-team and break-glass policy before production. API errors use `{error, issues?}`. Checkout body: `{"lines":[{"procedure_system":"CPT","procedure_code":"...","diagnosis_code":"...","modifier":"","units":1,"charge_cents":10000,"authorization_id":null}]}`. Amounts use integer cents.

## Synthetic encounter audio (fictional local demo only)

Opt-in requires **all** of `FICTIONAL_AUDIO_DEMO=true`, `SEED_DEMO=true`, and a nonproduction runtime. Production rejects audio opt-in at startup. These routes never accept audio bytes, filenames, storage keys, external URLs, transcripts, or additional participants. Only the seeded `enc-001` encounter with `patient-001`, `doctor-001`, and `demo-clinic` supports creation. Source is always `SYNTHETIC_TONE_V1`: one second of generated 440 Hz tone, WAV/PCM, 8 kHz mono. Audio tables are added on app startup; this does not change existing file-table constraints.

Audio authorization is stricter than the general starter chart matrix: only the current assigned physician and the encounter's own patient account in the same organization may access audio metadata or consent. Only the assigned physician creates, starts, finishes, stops, approves, publishes, deletes, or reads audit events. Billers and admins have no audio access. Patient draft/status metadata supports consent withdrawal; draft **content** is physician-only. Clinician reassignment invalidates access to the earlier record for both accounts. Cross-org IDs return 404; unauthorized same-org requests return 403. All mutation routes use the existing session and CSRF checks.

| Endpoint | Method / body | Result |
| --- | --- | --- |
| `/api/audio/config` | GET, signed-in | Enabled flag, source, consent statement and version; no encounter data |
| `/api/encounters/:id/audio` | GET | Authorized metadata and append-only consent history; excludes private storage key; audited per record |
| `/api/encounters/:id/audio` | POST `{"fictional":true}` | Create `CONSENT_PENDING`; requires open seeded encounter, no other active attempt |
| `/api/audio/:id/consent` | POST `{"decision":"AGREED","statement_version":"FICTIONAL_AUDIO_V1"}` | Decision may also be `REFUSED` or `WITHDRAWN`; authenticated actor can decide only for themselves |
| `/api/audio/:id/start` | POST `{}` | `READY` → `RECORDING`; open encounter required; no microphone or media capture |
| `/api/audio/:id/complete` | POST `{}` | `RECORDING` → `DRAFT`; generate/store fixed WAV; must complete within 60 seconds |
| `/api/audio/:id/stop` | POST `{}` | Pending, ready or unfinished recording → `STOPPED`; discard attempt without saving partial audio |
| `/api/audio/:id/approve` | POST `{}` | `DRAFT` → `APPROVED`; explicit physician review attestation, recorded actor/time |
| `/api/audio/:id/publish` | POST `{}` | `APPROVED` → `PUBLISHED`; release to patient, recorded actor/time |
| `/api/audio/:id/content` | GET; optional `?download=1` | Full private WAV; physician draft/released access or own patient published access; playback/download audit |
| `/api/audio/:id/events` | GET | Assigned physician-only event history; the audit read itself is logged |
| `/api/audio/:id` | DELETE, no body | Physician deletion, immediately revoke access; file erasure or durable retry tombstone |

Consent provenance fields are `participant_id`, `decision`, `actor_id`, `occurred_at` (server UTC), `statement_version=FICTIONAL_AUDIO_V1`, and `provenance=AUTHENTICATED_DEMO_SELF_ATTESTATION`. The displayed versioned statement covers synthetic-only generation, physician review/release, refusal/withdrawal, and seven-day expiry. These are **simulated** patient/physician decisions, not a recording of a real consent discussion or legal sufficiency claim. This version supports exactly the seeded patient and physician; neither may add an observer or attest for another participant. Agreement is locked once started; either participant may withdraw throughout review/publication. Refusal/withdrawal removes availability and requests file deletion. A new attempt needs new decisions; prior consent never transfers.

State sequence: `CONSENT_PENDING → READY → RECORDING → DRAFT → APPROVED → PUBLISHED`. Both participants must agree to reach `READY`. Start/finish/approval/publication recheck consent; skipping or repeating these transitions returns 409. Signed/checked-out encounters cannot create/start attempts, but previously created drafts may still be reviewed or withdrawn. Stop is discard-only; saved drafts require deletion or withdrawal. Refused/stopped attempts are terminal; retry creates a new ID. Errors use `{error}`; unsupported fields/inputs return 400, disabled feature/role errors 403, invalid state 409, expired content 410. Unknown methods return 405.

Metadata includes source, encounter/patient/clinician/creator IDs, state, MIME, byte count and SHA-256, server timestamps, review/publication actors, expiry and deletion reason/time. SHA-256 and byte count are cleared after deletion. Responses never reveal `storage_key`. `available` means media exists and is unexpired; patient UI additionally requires `PUBLISHED`. Audio GETs return `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, fixed filename `fictional-tone.wav`, and inline/attachment disposition. Content requests are authenticated on every fetch; no signed/public URLs, range requests, arbitrary uploads, or transcription endpoints exist. Successful fetch events record requests served, not listening completion. HTTP denial/failed fetches are not claimed as successful access events.

Seven-day retention starts at creation, not publication. Expiry immediately denies reads, even before the sweep. Refusal/withdrawal/deletion commits `DELETION_PENDING` before touching disk; storage failures remain inaccessible and retryable. Successful erasure records a tombstone (`REFUSED`, `STOPPED`, or `DELETED`); retry sweeps finalize as `DELETED` with the original deletion reason. Metadata, consent provenance and audit history remain in SQLite; media erasure does not delete those records or remote copies/backups. Startup and every 30 seconds while enabled run the retention hook; `npm run audio:maintain` can run it offline with the same nonproduction opt-in and persistent paths. Interrupted starts older than 60 seconds are swept. UUID-named orphan files older than a minute are removed, covering a crash before metadata commit. Use one owner per volume.

Private storage is `AUDIO_DIR` (default `data/private-audio`) with directory mode 0700 and file mode 0600, outside served assets. It needs a persistent volume for restart durability; ephemeral hosts lose both SQLite and files. This is not encrypted clinical storage or a PHI-ready authorization/consent/retention design. The public `demo/` server and its role toggle never call these endpoints; Railway continues to run that separate concept demo.
