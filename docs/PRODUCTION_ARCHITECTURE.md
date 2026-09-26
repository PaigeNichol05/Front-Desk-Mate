# Full replacement architecture · decision recorded September 2026

**Product decision:** Front Desk Mate is intended to replace both the practice's EHR/practice-management system and its billing workflow. The patient portal is part of that system. Patients may hold an optional personal copy, but the practice must retain an accessible official chart and revenue-cycle record. The deployed Railway concept demo is deliberately separate and has no PHI.

## Target topology

```text
Patient portal / staff workspace
  → identity, MFA, session and consent boundary
  → practice API with tenant and care-team authorization
  → clinical database + private file store + immutable audit
  → durable job queue / outbox
  → clearinghouse / payer integrations
```

The staff workspace keeps the requested **Today, Patients, Schedule, Inbox, Billing** navigation. A visit moves from intake and scheduling to structured documentation, signed chart, code review, authorization check, checkout, claim submission, acknowledgment, status, remittance, denial, and appeal. The patient portal shows appointments, records, files, messages, coverage, and claim status without exposing staff-only billing details. Patient-controlled export is an additional feature, not the source of truth.

## Data and service boundaries

| Boundary | Production behavior |
| --- | --- |
| Identity | Individual staff and patient accounts; MFA for staff; role, organization, care-team and purpose checks; session revocation and access reviews |
| Clinical | Versioned encounter sections, signed notes and addenda, allergies, medications, orders/results, consent, tasks, referrals and messages; attribution and timestamps |
| Images/files | Private object storage, per-object authorization, malware scanning, metadata stripping/retention policy as appropriate, download audit and backup recovery |
| Billing | Reviewed code sets, charge capture, coverage/eligibility, prior authorization matching, claim edits, 837P/837I preparation, acknowledgments, 276/277 status, 835 remittance, denial/appeal worklists |
| Transactions | Durable outbox and idempotency keys so checkout and transmission are recoverable and cannot silently create duplicate claims |
| Audit | Tamper-evident access and change events, monitored security logs, accounting/export support, no PHI in routine application logs |
| Patient copy | Patient-directed export and sharing with local encryption and recovery choices; practice record remains available if patient device is lost or offline |

## Deployment environments

1. **Concept demo:** current Railway project; fictional browser-only state, no PHI, no server writes.
2. **Production preparation:** [lower-cost hosting plan](AFFORDABLE_HOSTING_PLAN.md) evaluates Google Cloud; create a separate private project and managed database/object storage. No real PHI until written BAAs cover the actual services/subprocessors, the practice's risk analysis and controls are completed, and security/clinical/billing validation passes. Confirm every component is within the agreed BAA scope.
3. **Production:** per-practice onboarding and payer enrollment, monitored deployment, backups and restore drill, incident plan, support process, go-live acceptance by the practice and appropriate reviewers.

Railway currently lists a $1,000 minimum monthly commitment for its HIPAA BAA tier and says it requires a year commitment paid monthly (a $12,000 listed minimum over that year). The owner declined that production cost. No agreement or spend commitment has been made. The practice and platform operator should have qualified counsel determine their respective covered-entity/business-associate roles and contract terms before PHI is moved.

## Delivery sequence and acceptance gates

| Stage | Deliverable | Exit criterion |
| --- | --- | --- |
| 1. Security foundation | Production database migrations, identity/MFA, scoped API, audit, encrypted private storage, backup/restore and alerting | Cross-tenant and patient isolation tests; threat model and restore exercise |
| 2. Clinical workflow | Intake, scheduling, chart, notes/addenda, files, labs/referrals/tasks, patient access/export | Clinician usability review and record integrity/access tests |
| 3. Revenue cycle | Licensed/current coding catalogs, payer rules, eligibility, authorization, charge review, claim edits | Qualified coding/billing review with synthetic cases |
| 4. Exchange | Contracted clearinghouse, 837, acknowledgments, 276/277, 835 and appeals | Partner sandbox certification, idempotent retry and reconciliation tests |
| 5. Go-live | BAAs, risk analysis, policies, penetration test, incident and support runbooks, payer enrollments | Written operational sign-off; limited pilot with monitored production traffic |

The current repository implements a **development foundation**, not these exit criteria. It must not be switched to a PHI deployment merely by changing an environment variable. Check whether the target practices participate in programs that require certified EHR technology; certification is required for certain CMS programs, not automatically for every software use.

## Decisions needed to progress

- Estimate the Google Cloud alternative and obtain the exact BAA scope before production PHI hosting; Railway's current BAA tier is outside the budget.
- Identify the first practice, specialty, locations, user roles, current data sources, and migration requirements.
- Select a clearinghouse and confirm contracts, payer enrollment, transaction types, and test access.
- Determine which CMS programs and state-specific clinical/retention requirements apply to the first practice.

## Official references

- [HHS cloud BAA FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/may-a-hipaa-covered-entity-or-business-associate-use-cloud-service-to-store-or-process-ephi/index.html)
- [Railway committed-spend tiers](https://docs.railway.com/pricing/committed-spend)
- [HHS risk analysis guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html)
- [CMS adopted electronic transaction standards](https://www.cms.gov/priorities/key-initiatives/burden-reduction/administrative-simplification/hipaa/adopted-standards-operating-rules)
- [ONC CEHRT and CMS program reference](https://healthit.gov/resources/cms-ehr-certification-id-quick-reference-for-health-it-developers-and-cms-program-participants/)
