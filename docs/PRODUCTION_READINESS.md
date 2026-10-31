# Production-readiness gates for PHI

**Current state:** This repository is a functional development foundation with fictional data. It does not have a live clearinghouse, a production identity service, a complete security program, or a HIPAA compliance determination. No real patient information may be loaded into this version. A hosted demo and a live practice system must be separate environments.

## Before real patient use

| Gate | Current state | Completion evidence |
| --- | --- | --- |
| Entity and contracts | Unknown practice ownership and vendor relationships | Identify covered entity/business associate roles; executed BAAs with every vendor that creates, receives, maintains, or transmits PHI as needed, including hosting, file storage, monitoring, email/SMS, AI, and clearinghouse |
| Risk analysis and policies | Not done | Document data flow, asset inventory, threats, risk treatment, workforce procedures, incident/breach response, contingency plan, training, periodic review, and assigned security officer |
| Hosting | Local SQLite and file directory | Approved PHI environment with BAA, private networking, managed database and object storage, encryption at rest/in transit, managed keys, backups and restore tests, separation of demo/prod |
| Identity and access | Demo accounts, in-memory sessions, broad staff access | Per-person accounts, MFA, secure recovery and offboarding, least-privilege care-team access, patient identity proofing, session revocation, access reviews, rate limiting, protected admin controls |
| Audit and retention | Local audit rows and immutable service, coverage and simulated-transmission histories; not tamper-proof against a database administrator | Tamper-resistant access and mutation logs, alerts, retention and review procedure, export and incident investigation; avoid PHI in logs |
| Clinical integrity | Draft sections, signed-record lock, source-linked service facts and detailed fictional toxin records; no signed-record amendment workflow | Versioned amendments/addenda, clinician attribution, signatures, order/results workflows, patient record access/export and correction processes, clinical safety review |
| Files and messaging | Local upload and no malware scanning | Private object storage, malware/type scanning, file limits, image processing controls, backup/retention, secure patient communications, consent and release rules |
| Billing and payer exchange | Dated official CMS lookup, private licensed CPT import controls, source-linked human review, staff coverage evidence and durable test-only outbox/fictional lifecycle; no live payer or authenticated member eligibility response | Maintained/licensed terminology, validated coding/payer edits, verified provider credentials/enrollment, contracted 837P/837I integration and partner testing, authenticated eligibility/auth/999/277CA/276/277/835 handling, live idempotency/reconciliation, appeal submission |
| Quality and verification | Automated checkout, catalog, coverage, source-coding, toxin, audio and test-worker suites, including access/tenant/CSRF and restart checks; not clinical or production certification | Migration/rollback plan, production authorization and tenant isolation review, threat modeling, penetration testing, accessibility and clinical usability testing, disaster recovery exercise |

No vendor's BAA alone makes the application compliant. The organization must document and operate its own administrative, physical, and technical safeguards. Have qualified legal/compliance, security, clinical, and revenue-cycle reviewers sign off on their areas before PHI onboarding.

For implemented scope and remaining gaps, see [codes and coverage](CODES_AND_COVERAGE.md), [appointment coding](APPOINTMENT_CODING.md), [toxin documentation](BOTULINUM_ADMINISTRATION.md), [test clearinghouse foundation](CLEARINGHOUSE_FOUNDATION.md) and [integrations](INTEGRATIONS.md). These capabilities belong to the authenticated application. The separate browser-only concept has fixed sample codes and scripted workflows, without those server-backed controls or an official catalog.

## Hosting decision

Railway's current documentation says HIPAA BAAs are an add-on with a paid monthly spend threshold. Its pricing page currently shows a $1,000 committed spend tier for HIPAA BAAs. Confirm the current terms with Railway and execute the BAA before any PHI deployment. A lower-cost non-PHI demo on Railway is possible as a separate project, but this starter's local demo credentials and in-memory sessions must be replaced or tightly gated before a public URL is exposed.

If that commitment is unsuitable, design production on another provider whose eligible services, BAA, cost, and operational responsibilities fit the practice. Do not move patient data to a vendor before these facts and the data flow are reviewed.

## Official references checked September 2026

- [HHS Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)
- [HHS cloud BAA FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/2075/may-a-hipaa-covered-entity-or-business-associate-use-cloud-service-to-store-or-process-ephi/index.html)
- [HHS risk analysis guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html)
- [Railway compliance documentation](https://docs.railway.com/enterprise/compliance) and [pricing](https://railway.com/pricing)
