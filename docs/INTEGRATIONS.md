# Payer integration contract

The `AWAITING_CONNECTOR` state is the explicit handoff after local checkout. No mock acknowledgment is promoted to a live payer status. The repository now includes a persistent test-only outbox worker and deterministic fictional adapter, documented in [CLEARINGHOUSE_FOUNDATION.md](CLEARINGHOUSE_FOUNDATION.md). Real claim status stays `AWAITING_CONNECTOR`; separate staff-only `SIMULATED_*` projections never represent actual insurer responses. A future authorized live adapter still needs an interface like:

```ts
interface ClearinghouseAdapter {
  submit837(claim: ValidatedClaim, idempotencyKey: string): Promise<{transmissionId: string}>;
  requestStatus276(claim: Claim): Promise<{requestId: string}>;
  receiveAcknowledgment(payload: Uint8Array): Promise<NormalizedEvent>;
  receiveRemittance(payload: Uint8Array): Promise<NormalizedPayment[]>;
  requestPriorAuthorization(request: AuthorizationRequest): Promise<{externalId: string}>;
}
```

Future live transitions require authenticated connector responses: `AWAITING_CONNECTOR → TRANSMITTING → SUBMITTED` after transport acceptance; separate 999/277CA rejection/acceptance events and payer adjudication; `DENIED`, `PAID`, or `PARTIAL` after verified payer response/835 reconciliation. Keep raw payloads encrypted with restricted access and retention rules. Store idempotency keys, retry counts, external IDs, timestamps, payer routing, and immutable events. Do not conflate transport acknowledgment, claim acceptance, and payment.

Before building a connector, identify whether each claim is professional (837P) or institutional (837I), the contracted clearinghouse and payer enrollment, service location, billing/rendering provider credentials, NPI/taxonomy, policy and member details, diagnosis pointers, units, modifiers, place of service, attachments, and authorization requirements. Validate against current official code sets and licensed CPT data. Review clinical/coding decisions with qualified personnel. Prior authorization is not a guarantee of payment.

This repo has no insurer credentials, clearinghouse contract, X12 formatter/parser, 270/271 eligibility, 278 prior authorization, 276/277 status transport, 835 remittance, or live submission. Integrations must be tested in a partner sandbox before production.
