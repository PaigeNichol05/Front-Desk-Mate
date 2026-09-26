# Demo walkthrough · fictional records only

Run the app using the root README, then open the local URL. This demo is intended for product review and must not receive actual patient information.

1. Sign in as `doctor@example.test` with `DemoOnly!ChangeMe123`. On **Today**, see tomorrow's appointment and the callback task. Open **Patients → Jordan Sample → Open** to view the seeded encounter.
2. Add an **ASSESSMENT** and **PLAN** section with fictional text, such as “Demo only: example assessment” and “Demo only: example follow-up plan.” You can also add symptoms, medications, exam, lab, consent, call, and dictation text sections. Upload a synthetic PNG, JPEG, or PDF in **Files**.
3. Add a manual code suggestion with a rationale. Suggestions are candidates for professional review, not automatic coding. Click **Sign encounter**.
4. In **Checkout & billing**, enter a reviewed procedure code, diagnosis code, units, and charge. For software-flow testing only, the automated test uses specimen values `99213` and `M54.50`; they are not recommendations for any visit. Click **Validate & check out**. Missing assessment/plan or an invalid authorization reference stops checkout with specific issues.
5. The claim appears in **Billing** with status `AWAITING_CONNECTOR`. Open its activity to see the queue event. No insurer submission or payer status occurs in the demo.
6. Sign out and sign in as `patient@example.test` using the same demo password. The patient sees only Jordan's appointment, record, files, claim status, and authorization information. The patient cannot sign a physician encounter.
7. Sign in as `biller@example.test` to see the practice claim worklist, track a prior authorization request, record a denial or payment through the API, and create a draft appeal linked to a denial. Those records are manual demo entries, not imported payer responses.

For a hosted fictional-data demonstration, isolate the environment, keep it separate from eventual production, restrict access, and avoid using any real identifiers or documents. There is no production user onboarding in this starter.
