# Patient-controlled storage option

## The key distinction

Patients can hold a personal copy of their records on their own device and explicitly share selected information with a clinician. That may support a separate direct-to-consumer personal health record (PHR). HHS gives examples where an independently chosen app is not the provider's business associate merely because the patient imports records or sends a report to the provider.

Front Desk Mate's stated goal also includes the physician's chart, checkout, billing, prior authorization, claim status, denials, and appeals. When the practice contracts for an app to perform those functions, the app operator may be a business associate. The provider's medical and billing records remain part of its designated record set. A patient-held copy does not replace the provider's reliable record, payer transaction history, or required safeguards. Exact legal roles depend on contracts and actual data flow and need counsel review.

| Component | Patient-controlled model | Practice system model |
| --- | --- | --- |
| Personal history and imported records | Stored on the patient's device; explicit sharing | Practice receives a copy when clinically relevant |
| Clinician notes, orders, results | Patient can receive a copy | Official record in the practice's approved EHR/data environment |
| Claim, authorization, denial, appeal | Patient sees status/copies | Practice and clearinghouse process identified billing data |
| Railway deployment | Static UI with no PHI requests, logs, or storage may be possible without a Railway BAA for **that hosting role** | Railway processes or maintains ePHI: execute BAA and implement safeguards before use |
| App operator | Independent consumer app may fall outside HIPAA business-associate role, but other privacy/security law may apply | Contracted practice-management/billing app likely requires business-associate analysis and a BAA |

## Alternative considered for cost control

1. Serve only static interface files from Railway. Do not put patient IDs, clinical details, tokens, images, or claim contents in Railway URLs, logs, analytics, support tickets, or server requests.
2. The optional patient PHR stores local encrypted data with device-based access, export, and explicit patient sharing. Design backup and recovery carefully so losing a phone does not silently erase the sole usable copy. Treat minors, proxies, and revoked access as separate workflows.
3. The practice workspace reads and writes the official chart and billing records through a separately contracted HIPAA-appropriate EHR/clearinghouse environment. The provider must be able to access records without relying on the patient's device being online.
4. Authenticate and authorize staff and patients independently. Track who shared what, when, and with whom. Review where browser caches, crash reports, telemetry, and third-party scripts could expose data.
5. Verify each vendor's role and agreement with counsel. If Railway receives or maintains provider ePHI, even encrypted without the key, HHS still treats a no-view cloud provider as a business associate. Do not use client-side encryption as a BAA workaround.

This alternative could avoid the **Railway-specific** $1,000/month BAA tier only if Railway genuinely stays outside the PHI path. It does **not** eliminate the cost or obligations of a compliant record and billing backend. A direct-to-consumer PHR may instead have FTC Health Breach Notification Rule obligations. No production deployment or legal classification is approved yet.

## Product decision

The owner selected Front Desk Mate as the practice's replacement EHR and revenue-cycle system with a patient portal. Therefore the hybrid alternative above is a cost/design comparison, not the current implementation plan. The practice's official chart and billing system require a compliant production environment; see [production architecture](PRODUCTION_ARCHITECTURE.md).

## Official sources

- [HHS app developer scenarios](https://www.hhs.gov/sites/default/files/ocr-health-app-developer-scenarios-2-2016.pdf)
- [HHS patient-designated app FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-a-covered-entity-to-enter-into-a-business-associate-agreement.html)
- [HHS no-view cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html)
- [HHS right of access to medical and billing records](https://www.hhs.gov/hipaa/for-professionals/faq/what-personal-health-information-do-individuals/index.html)
- [FTC Health Breach Notification Rule guidance](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0)
