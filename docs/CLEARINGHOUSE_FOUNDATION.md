# Durable test clearinghouse foundation

Completed checkout now commits the claim, reviewed line snapshot, queued event, audit entry and persistent `claim_outbox` row in one SQLite transaction. The real claim status remains `AWAITING_CONNECTOR`. This implementation has no external network transport, insurer credentials, X12 writer/parser, eligibility transport, insurer webhook, or real electronic remittance posting.

## Run the fictional workflow

Use Node.js 24 or newer and `npm run demo:complete`. The local launcher enables both the existing synthetic audio demo and `FICTIONAL_CLEARINGHOUSE_DEMO=true`. Ordinary startup defaults the clearinghouse feature to disabled. Explicit opt-in requires `SEED_DEMO=true` and `NODE_ENV` other than `production`. Only claims for the bundled `demo-clinic`, `patient-001`, `Example Health Plan`, `DEMO-MEMBER-001` fixture can be simulated. Do not enter real patient data.

1. Sign in as `doctor@example.test` with the documented sample password. Add fictional assessment and plan documentation, sign the encounter, and validate/check out sample lines. Checkout creates a queued outbox record; it does not send anything.
2. Sign in as `biller@example.test`, open Billing, and select the claim. Choose a fictional paid, rejected, or denied outcome and click **Queue fictional simulation**. The fictional worker processes configured jobs every second; **Process due fictional transmission** runs one due attempt immediately. The claim panel polls during processing.
3. Read each separately labeled event: transport acknowledgment, clearinghouse acceptance/rejection, payer acceptance, adjudication, denial or fictional remittance. All transmission labels, event records and API response envelopes identify simulation. Transport acknowledgment never means payer acceptance or payment.
4. For a completed rejection, change the sample line values, state the correction reason, attest to review, and queue a reviewed fictional correction. This creates a new revision with a new submission identifier; the original lines and history remain unchanged. The correction demo uses the fictional paid scenario.
5. For a denial, the panel explains the need for staff review. No automatic denial resubmission or appeal transmission exists. The existing manually entered denial/appeal records remain a separate local workflow.

The public Railway `demo:host` service still serves its read-only concept demo. This new foundation runs in the authenticated `src/server.js` application and local complete-demo launcher; it does not change the Railway deployment configuration.

## Persistence and failure behavior

Each outbox record owns an immutable snapshot, organization, claim ID, revision, idempotency UUID and creation time. The scenario can be selected once and then is immutable. Only processing metadata changes: state, attempt count, next eligible attempt, lease token, lease deadline and sanitized failure code. Retries reuse the same payload and identifier; reviewed corrections use new ones. Correction request keys are unique per organization and replay the same result only for the same claim, scenario, reviewed line values and correction reason.

The worker acquires one eligible job under `BEGIN IMMEDIATE`, increments its attempt count and issues a lease token. It commits this lease before calling the adapter. Response ingestion and completion recheck the current token and expiry. An interrupted process leaves a recoverable lease; a restarted worker resumes after expiry. Responses are committed individually, so partial progress survives a restart. Stable response IDs and unique transmission/sequence pairs make replay a no-op, with no duplicate payment or audit side effects. A crash after the last response is finalized without sending again, even at the attempt limit.

Default lease lifetime is 30 seconds. Failed attempts use one-second exponential backoff (1s, 2s) and stop after three attempts. Exhaustion is visible to staff and requires investigation; there is deliberately no one-click reset that could accidentally duplicate a submission. Retrying a due job before its backoff or active lease expires does nothing. Late workers cannot modify the attempt owned by a replacement worker.

Out-of-order responses are retained immediately, but the displayed claim status uses only the contiguous verified event sequence. For example, a remittance received before transport acknowledgment and acceptance does not show a paid state. Missing predecessors are surfaced as pending responses. The deterministic adapter has fixed coherent scenarios; it does not model partial payments, reversals, multiple adjudications, line-level adjustments or payer-specific appeal policy.

Store `DATABASE_PATH` on a persistent private volume, preserve the SQLite database and WAL together with SQLite-aware backups, and use one application owner for this demo. Ephemeral disk cannot provide restart durability. Foreign keys bind each outbox to the claim's organization. Existing queued claims are backfilled on server startup, without any invented response history. Repeat startup does not duplicate transmissions. Append-only SQLite triggers protect local claim events, simulation events, immutable snapshots and audit records from application SQL updates/deletes. These triggers do not provide tamper-proof storage against a database administrator, encryption at rest, or production compliance.

## Adapter and authentication boundary

`src/clearinghouse-adapter.js` defines the future adapter shape and implements only `FictionalClearinghouseAdapter`. Its deterministic in-process events include source, simulation flag, organization, transmission identity, sequence, stable response ID and event data. Ingestion accepts only an exact expected fictional envelope for the currently leased job; forged source, mismatched correlation, changed amounts and conflicting responses are rejected. This verifies the trusted fixture boundary, not an insurer's identity. There is no external response ingestion endpoint.

A future live adapter must separately implement partner-authenticated transport, signature/credential verification, tenant-specific routing, claim correlation, replay prevention, encrypted payload retention, outbound X12 validation and idempotency/reconciliation behavior agreed with the partner. Do not reuse the fictional source label or credential-free envelope validation for a live connector. Responses must explicitly distinguish transport acknowledgment, clearinghouse acknowledgment, payer receipt/adjudication and reconciliation. `liveClearinghouseAdapter()` always throws, and `LIVE_CLEARINGHOUSE_ENABLED=true` fails server startup. Arbitrary adapter injection is not exposed by the HTTP API.

## Access and audit

Only current active `BILLER` or `ADMIN` accounts can inspect/configure/process/correct transmissions. Service methods re-read the account and enforce its organization; HTTP mutation routes also require the existing session and CSRF token. Cross-organization claims return 404. Patients and physicians cannot view internal transmission history. Patient claim status stays `PRACTICE_PROCESSING`; fictional denials and remittances are stored only in `simulated_claim_events`, never in real/manual `denials` or `payments`. Consequently patients cannot mistake simulated activity for an actual payment.

Configuration, correction, list/detail reads, worker attempts, newly received responses, retries, completion and recovery append audit records with organization, actor, resource and server time. Worker actors use `system:fictional-worker`; migration uses `system:outbox-migration`. Unauthenticated/denied requests are rejected, but this foundation does not introduce a security monitoring pipeline for them. The existing process-local sessions are still demo-only and require shared durable session management before production.

## Release boundary and tests

Real transmission remains disabled until a clearinghouse agreement, verified provider and payer enrollment, required coding and eligibility checks, and professional compliance review are complete. Those prerequisites do not automatically unlock this code: an independently reviewed live implementation and partner sandbox testing are still necessary. This foundation is not a claim of HIPAA compliance or insurance acceptance.

Run `npm test`. The suite covers transactional rollback, default-disabled behavior, all fictional scenarios, role/tenant/CSRF checks, invalid responses, duplicate responses and correction requests, out-of-order events, retries/backoff/exhaustion, partial processing and durable database reopen, stale workers, last-response crash recovery, immutable history and startup gates. No tests contact an insurer or clearinghouse.
