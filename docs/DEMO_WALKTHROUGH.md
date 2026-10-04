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

## Durable synthetic audio walkthrough

Before signing or checking out the seeded encounter, opt in with `FICTIONAL_AUDIO_DEMO=true`, `SEED_DEMO=true`, and `NODE_ENV=development`; keep the database and `AUDIO_DIR` on private persistent storage. Sign in as physician, open the encounter and create a fictional attempt. Agree as the physician, then sign in as patient and agree separately. Return to the physician encounter, refresh consent status, start and finish the synthetic attempt. Replay the generated tone, approve review, and release to the portal. The patient can replay/download it in **Files** or the encounter view, or withdraw consent to remove access and erase the file. Stop an unfinished attempt to discard it. No microphone is used, no real audio can be uploaded, and no speech service is connected. See [API.md](API.md) for authorization, expiry, audit and deletion rules. The Railway concept demo remains separate and keeps its synthetic sample only in browser memory.

## Denial correction concept

Open `/billing-demo` on the concept server. As Billing staff select **Search Jordan’s sample chart**, then **Request missing documentation**. Switch to Assigned physician and **Load reviewed fictional addendum**. Switch back to Billing staff, **Prepare sample packet**, and **Mark packet reviewed**. Deselect the addendum to see the evidence hold; change provider to reset packet review; switch to Patient to see the limited status view. All policies and data are fictional fixtures, not live insurer requirements. No resubmission occurs.

## Visit order in the concept preview

Select Physician or Medical assistant and open Patients. Record check-in, then taken back/rooming. The physician records provider assessment, assessment documentation, and the visit care plan, then signs and checks out after billing review. Care-plan completion and reviewed visit-draft saving are disabled before the provider-seen milestone; an MA cannot complete or sign the clinical plan. Pre-visit preparation is separate from documenting completed care. These browser milestones are simulated; the authenticated API does not yet persist or enforce this arrival workflow, and role switching is not authentication.

## Visible denial form and clinician contact

The concept navigation now includes **Denials & resubmissions**, embedding the fixed Jordan Sample case with a visible denial record and prefilled reconsideration-form preview before chart search. The preview is not an official payer form and cannot transmit. Simulated claim denials appear in the staff view of the selected chart’s Documents screen until reset; they are hidden in the patient view. In Messages/Inbox, enter fictional text in **Write a question for the doctor**; the physician can acknowledge the request in Inbox. No live AI, messaging, or server persistence is provided for these concept controls.

The clinician draft includes reason, findings, assessment, services/actions, plan, follow-up, and optional relevant history/prior treatment, procedure detail, and actual time fields. The core draft checklist checks presence only. It does not establish billing-code support or insurer acceptance. Final draft saving requires the provider-seen milestone and the sample core fields. Real code/service/payer requirements need a licensed, verified integration.

## Portal landing page

The preview opens on Today, with Doctor portal and Patient portal labels selected by the role control. Documents holds the chart files and any simulated denial history. Denials & resubmissions is a staff navigation item rather than the first page; patients see only their sample claim status and own document cards, not the staff correction form.

## Assessment-to-plan draft concept

After check-in, rooming, and provider assessment, load the fixed fictional dictation example. **Generate fictional care-plan draft** creates an unsigned fixed specimen linked to that sample assessment; **Review and copy draft to plan field** copies it for editing. A changed assessment invalidates the generated draft. Neither action signs the encounter or records the completed clinical plan milestone. The sample plan leaves management details and timing for clinician completion. Arbitrary assessments are unsupported; no real transcript, microphone, transcription, AI model, or treatment inference is connected.

Production requirement: with documented participant consent and an approved protected recording/transcription/AI arrangement, retain the assessment source/version, generate an evidence-linked draft with missing details flagged, and require the qualified rendering clinician to review, edit, and approve it before publication/signing. Never invent findings, care performed, medications, or unsupported clinical decisions. Provider/plan changes invalidate relevant review.

## Multiple activities and internal resubmission

In Patients, select any combination of **Review care plan**, **Update care plan**, **Discuss injection**, **Review medication**, and **Review imaging**. Each toggles independently and does not assert that a procedure occurred or assign codes. A primary appointment type still determines calendar availability.

Patients do not see internal denial records, reason text, correction forms, or denial/event history. Staff open **Denials & resubmissions**. The fixed form fills from sample claim fields; after physician evidence is added, returning to Billing staff automatically prepares the sample packet. Mark it reviewed, then **Simulate corrected resubmission** to see a clearly labeled sample receipt. There is no insurer transmission, verified official payer form, or real automatic retry. Production automation must follow verified correction/appeal rules, authorized review, original-claim references, and idempotent delivery.
