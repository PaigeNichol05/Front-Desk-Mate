# Production-readiness gates for PHI

**Current state:** This repository is a functional development foundation with fictional data. It does not have a live clearinghouse, a production identity service, a complete security program, or a HIPAA compliance determination. No real patient information may be loaded into this version. A hosted demo and a live practice system must be separate environments.

## Before real patient use

| Gate | Current state | Completion evidence |
| --- | --- | --- |
| Entity and contracts | Unknown practice ownership and vendor relationships | Identify covered entity/business associate roles; executed BAAs with every vendor that creates, receives, maintains, or transmits PHI as needed, including hosting, file storage, monitoring, email/SMS, AI, and clearinghouse |
| Risk analysis and policies | Not done | Document data flow, asset inventory, threats, risk treatment, workforce procedures, incident/breach response, contingency plan, training, periodic review, and assigned security officer |
| Hosting | Local SQLite and file directory | Approved PHI environment with BAA, private networking, managed database and object storage, encryption at rest/in transit, managed keys, backups and restore tests, separation of demo/prod |
| Identity and access | Demo accounts, in-memory sessions, broad staff access | Per-person accounts, MFA, secure recovery and offboarding, least-privilege care-team access, patient identity proofing, session revocation, access reviews, rate limiting, protected admin controls |
| Audit and retention | Basic app audit rows | Tamper-resistant access and mutation logs, alerts, retention and review procedure, export and incident investigation; avoid PHI in logs |
| Clinical integrity | Editable draft sections, simple sign lock | Versioned amendments/addenda, clinician attribution, signatures, order/results workflows, patient record access/export and correction processes, clinical safety review |
| Files and messaging | Local upload and no malware scanning | Private object storage, malware/type scanning, file limits, image processing controls, backup/retention, secure patient communications, consent and release rules |
| Billing and payer exchange | Claim queue only | Licensed/current terminology, coding review, payer edits, provider credential data, clearinghouse/837P or 837I integration, eligibility and auth, 999/277CA/276/277/835 handling, idempotency, remittance reconciliation, appeal submission |
| Quality and verification | Three checkout tests, local HTTP smoke check | Migration/rollback plan, authorization and tenant isolation tests, threat modeling, penetration testing, accessibility and clinical usability testing, disaster recovery exercise |

No vendor's BAA alone makes the application compliant. The organization must document and operate its own administrative, physical, and technical safeguards. Have qualified legal/compliance, security, clinical, and revenue-cycle reviewers sign off on their areas before PHI onboarding.

## Hosting decision

Railway's current documentation says HIPAA BAAs are an add-on with a paid monthly spend threshold. Its pricing page currently shows a $1,000 committed spend tier for HIPAA BAAs. Confirm the current terms with Railway and execute the BAA before any PHI deployment. A lower-cost non-PHI demo on Railway is possible as a separate project, but this starter's local demo credentials and in-memory sessions must be replaced or tightly gated before a public URL is exposed.

If that commitment is unsuitable, design production on another provider whose eligible services, BAA, cost, and operational responsibilities fit the practice. Do not move patient data to a vendor before these facts and the data flow are reviewed.

## Official references checked September 2026

- [HHS Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)
- [HHS cloud BAA FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/2075/may-a-hipaa-covered-entity-or-business-associate-use-cloud-service-to-store-or-process-ephi/index.html)
- [HHS risk analysis guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html)
- [Railway compliance documentation](https://docs.railway.com/enterprise/compliance) and [pricing](https://railway.com/pricing)
