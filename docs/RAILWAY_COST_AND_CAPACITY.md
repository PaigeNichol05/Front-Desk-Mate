# Railway cost and capacity decision · September 2026

## Separate environments

The Railway service for the concept demo runs `npm run demo:host` from `railway.json`. It contains only fictional browser-side state, no database, no POST endpoint, no uploads, and no payer connection. It is **not** the working clinical API in `src/server.js` and is not suitable for patient information.

Railway's public pricing currently lists a 30-day trial with $5 credit and no credit card required, Hobby at $5 minimum monthly usage, Pro at $20 minimum monthly usage, and a HIPAA BAA tier with a **$1,000 minimum monthly committed spend**. Railway says committed-spend pricing goes toward usage. Additional resource use can increase charges. Verify the account's actual plan and the agreement's term with Railway before any paid commitment. A full 12 months at the listed minimum would be $12,000; this is arithmetic, **not** a claim that the contract has a 12-month term.

Railway documentation describes HIPAA as a shared responsibility model. A signed BAA must be in effect before the service creates, receives, maintains, or transmits ePHI. The practice or platform operator still needs its own risk analysis, policies, access controls, audit and incident procedures, backup/restore plan, and vendor review. The current application has not passed those gates.

## How many users?

There is no defensible fixed number for the current app. The read-only concept can be viewed by multiple people, but it has not been load tested. The local API uses SQLite, process-local sessions, and local files. It supports only a single server instance coherently and should be regarded as a small prototype, not a measured practice-wide capacity.

For production, replace those with a managed transactional database, shared durable session or identity service, private object storage, a job queue and payer workers, monitoring, load testing, and a scaling policy. Then test target scenarios: concurrent staff chart edits, patient portal logins, image uploads, checkout bursts, claim batches, and payer status imports. Publish a supported capacity figure only after measuring response time and error rate at defined workloads. Railway's plan limits describe infrastructure ceilings, not how many patients this code safely supports.

## Sources

- [Railway pricing](https://railway.com/pricing)
- [Railway compliance and HIPAA BAA](https://docs.railway.com/enterprise/compliance)
- [HHS cloud BAA FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/may-a-hipaa-covered-entity-or-business-associate-use-cloud-service-to-store-or-process-ephi/index.html)
