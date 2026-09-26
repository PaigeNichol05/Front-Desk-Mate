# Affordable path after the demo

**Decision (September 2026):** The owner cannot take on Railway's $1,000/month, one-year BAA tier. Keep the existing Railway service as a fictional, browser-only walkthrough. Do not deploy PHI or the local clinical API there under the current plan. No paid production host has been selected or purchased.

## First, review the product

Open the [fictional demo](https://front-desk-mate-demo-production.up.railway.app/). It needs no login. Tap **Open patient chart**, record the sample assessment and plan, sign, then open **Billing**. Review the displayed example CPT `99213`, ICD-10-CM `M54.50`, and modifier options. Try requiring authorization to see checkout remain blocked until a simulated approval. Review the documentation checks, check out, then step through acknowledgment, payer review, denial, appeal draft, and resolution. Change **View as** to Patient to see that side. **Reset demo** starts over. Everything is in browser memory; no payer receives a claim. The local API in the repository is a deeper development foundation, but it is not the hosted demo.

## Lower-cost production candidate: Google Cloud

Google Cloud says its covered HIPAA services use the same product pricing as other customers. Its Cloud Run service bills by resource use. That avoids Railway's published $1,000/month BAA entry commitment, but **it does not make a complete EHR cheap or compliant by itself**. The total bill would include a suitable database, private file storage, backups, logs, networking, authentication, monitoring, security operations, support, and clearinghouse fees. A budget requires an actual design and estimated workload; set spending alerts and limits before launching resources.

The first candidate design uses Cloud Run for the API and web app, Cloud SQL for PostgreSQL, private Cloud Storage for files, an approved identity service, a durable queue/outbox, and restricted audit logs. Verify **each** service against Google's current covered-products list and the signed BAA. Configure the application and organization controls, restore tests, access review, risk analysis, and vendor contracts before any PHI. The current SQLite/local-file/in-memory-session prototype needs substantial changes for this topology.

AWS is another pay-as-you-go candidate with an AWS Artifact BAA for eligible services, but AWS says a HIPAA-designated account upgrades from its free account plan to paid. Neither provider's BAA is a certification of this application. Supabase's HIPAA add-on requires at least its Team plan plus a signed BAA and additional controls; obtain an actual quote before treating it as the cheaper option.

## Gates before a real-patient pilot

1. Use the free fictional demo and gather concrete usability changes from the first practice.
2. Obtain a bounded Google Cloud cost estimate for its expected staff, patients, image volume, and claim volume. Confirm BAA availability and exact covered services; no contract or payment until reviewed.
3. Build and test the production clinical and revenue-cycle system, security controls, migrations, backups, patient access, clearinghouse enrollment and payer transactions.
4. Complete practice-specific legal/compliance and clinical/billing review, execute agreements, and run a monitored pilot before replacing the incumbent EHR and billing workflow.

## Vendor references

- [Google Cloud HIPAA guidance and covered products](https://cloud.google.com/security/compliance/hipaa)
- [Google Cloud Run pricing](https://cloud.google.com/run/pricing)
- [AWS Artifact FAQ](https://aws.amazon.com/artifact/faq/)
- [AWS Free Tier account-plan rules](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html)
- [Supabase HIPAA projects](https://supabase.com/docs/guides/platform/hipaa-projects)
- [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html)
