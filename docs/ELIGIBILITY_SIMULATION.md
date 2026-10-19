# Fictional electronic eligibility and benefits

This development workflow runs in the authenticated local app, enabled by `npm run demo:complete`. It executes a deterministic local adapter, persists the result and attaches an exact-context projection to the existing coverage-review screen. **No real patient data, payer request, X12 270/271 transaction, authenticated insurer response or coverage/payment guarantee is involved.**

## Try it

1. Run `npm run demo:complete` with Node 24+. Sign in as `biller@example.test`, password `DemoOnly!ChangeMe123`, and open **Billing**.
2. Select Jordan Sample's encounter. Enter plan `Fictional group A PPO`, HCPCS `J3301`, documented diagnosis `M54.50`, one unit, no modifier, place of service `11`. These are demonstration inputs, not a clinical recommendation or a complete billable claim.
3. Under **Electronic eligibility simulation**, review the read-only fictional member, payer, provider and encounter date. Confirm fictional data and choose a scenario. Click **Run simulated eligibility request**.
4. Inspect the separate member eligibility, general benefit categories, provider network, supplied deductible/copay amounts, authorization indicators, limitations, exclusions and missing-information sections. Procedure coverage remains `NOT_ESTABLISHED`; payment remains `NOT_ADJUDICATED`.
5. In immutable history, append a staff review with the missing information or acknowledge review of the simulation. This review never establishes real coverage. Change a diagnosis, modifier, units, plan, place of service, provider, service date, payer or member and the simulation stops matching the coverage context. Historical snapshots remain available under **View immutable eligibility history**.

The existing staff-reviewed portal, phone and plan-document evidence form remains available. Simulations do not insert into `coverage_reviews`, replace manual evidence, create approved authorizations, change claims or post payments. A manual result and a simulated result may disagree; they remain separate labeled sources. A valid code or member number alone never changes `Coverage not verified`.

## Inputs and fixtures

Request context includes patient/encounter, exact plan, actual assigned provider ID, service date, procedure system/code, documented diagnosis, modifier, units and place of service. The member and payer snapshots are derived from the scoped patient. The UI supplies fixed `DEMO-MEMBER-001`, `EXAMPLE-HEALTH-TEST` and `DEMO-PROVIDER-001` identifiers and a matching date. Execution is restricted to `demo-clinic` / `patient-001` / `enc-001` / active `doctor-001`; client overrides or other patients/providers are rejected.

| Scenario | Deterministic result |
| --- | --- |
| `ACTIVE_BENEFITS` | Active specimen with general office-visit and imaging benefits; sample in-network deductible and copay values |
| `INACTIVE` | Inactive specimen, no active benefit categories; no procedure conclusion |
| `PARTIAL` | Active specimen, network/cost-sharing/authorization details unknown; absent amounts remain null |
| `EXCLUSIONS` | General category includes a fictional cosmetic-service exclusion requiring service-specific review |
| `TIMEOUT` | Recorded simulated timeout; no response and no eligibility conclusion |
| `UNAVAILABLE` | Recorded simulated unavailable-service failure |
| `INVALID_RESPONSE` | Invalid fixture is rejected by normalization, retained as a failure without benefits |

Amounts are arbitrary fictional examples, in USD cents. The general categories are not a diagnosis/procedure mapping or an exhaustive plan definition. Sample benefit/network effective dates span the requested service-date year. Creation/receipt timestamps are server generated; a fixed one-day demo recheck interval is shown separately from benefit effective dates. Expired/recheck-due responses remain visible with `stale: true`. This interval is a test rule, not a real insurer freshness standard.

## Persistence, permissions and failures

- `eligibility_requests` stores one terminal request/response or failure snapshot per attempt, actor, timestamps, effective dates in the response, local correlation ID, adapter/version/scenario provenance and SHA-256 fingerprints of the normalized request and response. There is no asynchronous transport or external callback.
- Organization-scoped idempotency keys replay the same saved attempt. Reusing a key with changed input returns 409. A recorded failed attempt stays failed; an explicit retry uses a new key and appends an attempt. If the browser loses the HTTP reply it retains the key for retry. There is no automatic payer retry or inference from transport success.
- `eligibility_reviews` appends attributable staff notes and a `NEEDS_INFORMATION` or `REVIEWED_SIMULATION_ONLY` disposition. Both retain the procedure-review hold. Unknown procedure coverage cannot be approved through this test workflow.
- Active BILLER/ADMIN may execute requests and append reviews. Active BILLER/ADMIN/PHYSICIAN may inspect matching results and encounter history within their organization. Patients cannot access these staff APIs. Sessions, CSRF checks on writes and database-level tenant/actor/encounter foreign keys apply. No caller-supplied role is trusted.
- SQLite triggers reject updates/deletion of requests, responses, reviews and the existing shared audit log. Writes and audit records commit atomically; audit failure rolls back the attempted change. History reads, exact-context coverage reads, request replay, successful responses, failures and staff reviews produce audit records without member IDs or payload content in log fields.
- A later failed attempt becomes the current exact-context attempt; an earlier successful fixture is not silently used. Missing/null values are displayed as unknown, never zero. Raw fictional snapshots remain private to authenticated APIs, not static assets.

These controls are development safeguards, not a complete HIPAA security program. They do not prevent an operator with unrestricted SQLite/file access from replacing a database. Existing production-readiness requirements still apply.

## Runtime and future adapter boundary

The default is `FICTIONAL_ELIGIBILITY_DEMO=false`. Opt-in requires nonproduction plus `SEED_DEMO=true`. The complete local launcher enables it explicitly. `LIVE_ELIGIBILITY_ENABLED=true` or any `ELIGIBILITY_ADAPTER` value other than `none` aborts startup. This implementation has no credential fields, HTTP transport, X12 generator/parser, live response ingestion route or connection to the fictional claims adapter. Setting environment credentials cannot activate a transport.

`src/eligibility-adapter.js` is the separate request-to-normalized-response boundary. A future authorized implementation must replace it through a reviewed change; there is intentionally no runtime switch to a live vendor. That work requires executed agreements/BAA as applicable, payer and provider enrollment, supported transaction scope, protected server-side credentials, authenticated transport, transaction correlation, timeout reconciliation, retry/idempotency policy, response validation, encryption/retention, partner testing and professional coverage review. Eligibility and general benefits may still leave procedure-specific coverage unknown after a real integration.

See [API](API.md), [payer integration contract](INTEGRATIONS.md), [manual coverage review](CODES_AND_COVERAGE.md), and [production gates](PRODUCTION_READINESS.md).
