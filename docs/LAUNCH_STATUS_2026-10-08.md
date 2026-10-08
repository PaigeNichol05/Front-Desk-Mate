# Front Desk Mate — launch status, October 8, 2026

## Current decision

Real patient onboarding and live insurance submission remain blocked. This is an implementation checkpoint, not a HIPAA compliance attestation or a finished EHR. The existing Railway concept demo is live; the separate authenticated app and its volume were still staged when inspected. No new paid services, contracts, credentials or deployment were activated during this update.

## Implemented in this change

- Persistent appointment booking, rescheduling, cancellation history, duration and visit type.
- Conflict checks for overlapping appointments for either the clinician or patient; organization validation and active clinician checks.
- Separate Scheduling and Check-In navigation. Check-in creates one linked encounter; rooming follows check-in. Checkout completes the linked appointment and queues the claim without representing it as transmitted.
- Patient search by name or medical record number on every signed-in screen. Results use the existing authorized patient list. Full record/content search is not yet implemented.
- Plain-language buttons and visible success/error messages. Billing explicitly labels the disconnected clearinghouse state.
- Scheduling mutations recorded in the existing audit log; patients cannot access staff scheduling endpoints. This is not a tamper-resistant audit system.

Scheduling currently supports the existing PHYSICIAN, BILLER and ADMIN staff model. Dedicated front-desk, NP and PA permissions, recurring availability, resource/room reservations, calendar views, waitlists, external reminders and clinic-specific routing remain to be built. Appointment times display in the browser's local timezone; the encounter date uses PRACTICE_TIMEZONE (default America/Denver).

## Real launch blockers

| Area | Observed state | Required next step |
| --- | --- | --- |
| Hosting and storage | Demo SQLite/local files; no executed BAA verified | Select affordable approved production hosting, execute applicable BAAs, configure database/storage encryption, backups and tested restores |
| Staff identity | Shared sample identities; in-memory sessions | Individual accounts, MFA, secure recovery, session controls, least-privilege roles and care-team restrictions |
| Clearinghouse | No adapter, credentials or practice enrollment | Verify contracted clearinghouse and BAA, provider/payer enrollment, test transactions, build durable submission and response handling |
| Clinical AI | Typed notes and fixed synthetic audio | Select BAA-covered transcription/AI services; implement provenance, human review and signed amendments; clinical validation |
| Coding | Format checks and manually reviewed entries | Authoritative licensed/current code sets and payer/date-specific rules; verified split/bundling logic |
| Rejections/denials | Basic recorded denials and draft appeals; fictional concept walkthrough | Actual payer responses, verified forms, evidence-linked corrections, deadlines and reviewed submission transport |
| Security operations | Prototype controls only | Risk analysis, policies, training, incident procedures, access audit, security testing and named accountable owners |

No universal payer form or guaranteed payment can be promised. Clearinghouse acceptance, payer acceptance and adjudicated payment must remain separate statuses. An ambiguous network outcome must be reconciled before retrying a claim to prevent duplicate submission.

## Information needed from the owner

1. Which medical practice is the first pilot (legal entity and specialty)?
2. Does it already have a clearinghouse account? If so, which provider? Supply credentials through secure configuration, never chat or the repository.
3. What monthly operating budget is approved? Earlier project documents rule out Railway's previous $1,000/month BAA commitment; do not assume this changed.

The actual agreements, provider enrollment and security sign-off require authorized practice/vendor participation. Code changes alone do not complete these steps.

## Verification

Automated tests cover appointment conflicts, rescheduling/cancellation history, check-in encounter creation, repeated/out-of-order actions, tenant/role restrictions, CSRF, invalid inputs, and existing billing/audio workflows. JavaScript syntax checks pass. Browser UI verification was attempted but unavailable: no Chromium executable was installed and its download failed. Visual/accessibility review remains outstanding.

## Official references checked

- https://docs.railway.com/enterprise/compliance — BAA add-on and shared responsibility.
- https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html — cloud BAAs and risk analysis.
- https://www.stedi.com/docs/healthcare/submit-professional-claims — 837P integration and acknowledgment/remittance handling.
- https://www.stedi.com/docs/healthcare/test-claims-workflow — test mode does not send claims to payers; account eligibility must be confirmed.
