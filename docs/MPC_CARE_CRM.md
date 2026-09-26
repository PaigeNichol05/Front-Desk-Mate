# Managing Patient Care (MPC) · care CRM specification

MPC is the intended product name. The GitHub repository and existing Railway concept-demo URL retain the Front Desk Mate name for continuity. This is a **practice EHR, patient portal, scheduling, care coordination and revenue-cycle replacement**, not a sales contact database. The public browser demo uses fictional state and sends no messages, claims or bookings.

## Scheduling and visit flow

| Day | Sample provider allocation | Public self-booking |
| --- | --- | --- |
| Monday | Office morning | Office slots only |
| Tuesday | Office all day | Office slots |
| Wednesday | Office morning; anesthesia for another physician in afternoon | Morning office slots only |
| Thursday | Office all day | Office slots |
| Friday | Surgery center | Surgery request; staff confirms resources |

These are **sample hours**, not confirmed shift start/end times. Configure actual dates, holidays, blocked periods, location, provider, visit duration, lead time, capacity, procedure resources and time zone per practice. A patient or staff member chooses follow-up, patient care plan, injection or surgery and a reason category. Surgery is a request until staff confirms surgeon, facility, anesthesia, equipment, authorization and payer requirements. The clinician may mark the next visit purpose at checkout; the portal then offers only matching slots.

Store `provider_availability_rule`, `availability_exception`, `location`, `resource`, `appointment` (type, duration, patient-entered concern, source, status, time zone, creator, version), `appointment_resource`, and `visit_milestone` (scheduled, checked in, roomed, clinician seen, completed, with actor and timestamp). Use a transactional capacity check and unique resource/slot constraints to prevent concurrent double booking. Keep cancellation, reschedule, waitlist, check-in and audit history. Patients see only their own appointments; staff access is scoped to organization and assignment. Patient entered concerns go into the clinical intake record and should not appear in public links, logs or reminder text.

## Clinician assignment and patient view

The physician reviews the patient's recorded concerns and may keep the appointment or assign an eligible clinician in the office. The physician may write and sign the patient's care plan personally. New patients default to the physician. Routine follow-ups and care-plan visits may default to a PA; in the public demo the physician can move these to a physician, PA or NP. Surgery remains with a physician pending resource review. Opioid-management visits remain with a physician in the demo until the practice verifies the individual clinician's applicable authority and qualifications; visit assignment itself never authorizes prescribing.

Before the appointment day, the patient-facing booking and reminder views show the time, place, purpose and status, but neither the assigned person's name nor their professional role. The appointment-day view may display the assigned name and role. Staff may see the assignment earlier to coordinate care. The demo includes an explicit appointment-day preview; it does not represent actual access control. The practice must review any applicable notice, consent, payer, and patient-choice requirements before adopting a delayed display policy. Patient concerns, including a stated clinician preference, remain visible to the physician for an appropriate response; the software cannot prevent a patient from calling the office.

Production assignment requires an authenticated physician decision, an audit trail (prior assignee, new assignee, actor, time and reason), availability and appointment-capacity checks, current license, state scope, privileges, required supervision or collaboration, and any controlled-substance registration and authority relevant to the task and service date. Fail closed when verification is missing or expired. Reassignment must update the care-team roster and notify the affected clinicians and patient as required by practice policy; staff must confirm a handoff. Never infer prescribing authority solely from the title PA or NP. The current public demo uses fictional roles and has no credential validation.

The public demo now has three fictional patients with independent browser-only chart, booking and billing state. Staff can open each chart from the worklist; the patient-view toggle follows the selected fictional chart for demonstration and is not real authentication.

## Care relationship record

The patient care board joins demographics, care team, encounters, plan, tasks, referrals, messages, outreach, appointment history, authorizations and claim status into one authorized view. Tasks have owner, due time, priority, status, escalation and audit trail. Activity events reference their source record rather than duplicating clinical text into a broad CRM feed. Patients see only their portal view; billers and nonclinical staff do not automatically receive full chart access.

## Reminders and messaging

1. Collect and verify patient contact information, preferred channel and confidential communication restrictions. Offer portal notice, SMS or email according to the practice's reviewed policy. A reminder job references the appointment and a delivery window; it checks current appointment status and preference immediately before sending. Cancel or replace reminders on reschedule/cancellation. Record delivery attempts, suppression, failures and replies.
2. Default external message: “You have an upcoming appointment. Please sign in to MPC or call the office for details.” Do not include diagnosis, procedure, patient ID or a chart link containing a token in plain SMS. A patient may request alternative communication, which the practice must handle as required by its policy and law.
3. A patient portal conversation creates an authenticated thread, staff task and audit events. A third-party delivery or AI service touching PHI needs a scoped BAA and technical safeguards before integration. The public demo's “send” and chat topic buttons are **simulations**, not delivery or a live model.

## Human-like assistant and on-call routing

The production assistant should answer scheduling, preparation **from approved practice instructions**, portal navigation and claim-status questions in a natural style. It should use the authenticated patient's authorized context only after the BAA and risk review, cite the source instruction or record in its staff trace, disclose that it is an AI assistant, preserve the conversation, and offer a human handoff. It must not invent medical advice, make diagnoses, alter care plans or promise coverage. Ask a clinician to review clinical questions. Show **“If this may be an emergency, call 911”** prominently; automated emergency detection is not a substitute for 911 or clinical triage.

The on-call service needs a practice-approved, staffed roster with eligible physician/PA/NP roles and scope rules, primary and backup shifts, **explicit weekend/holiday rotations**, local time zone, acknowledgment deadline, backup escalation, delivery status, retries and a monitored failure queue. The weekend shift begins and ends at configured times; a shift cannot have a gap or the same person as both primary and backup. For patient questions, send the on-call clinician a generic SMS alert to open the secure portal. No PHI in the SMS by default. Staff acknowledge and respond in the authenticated thread; unanswered messages escalate to backup and operations. Do not advertise “24/7 response” until staffing and delivery monitoring can meet it. The demo rotates sample roles and lets a user simulate acknowledgment and backup escalation without sending SMS.

**Delivery contract:** choose a messaging service, obtain its BAA and exact feature scope if it handles PHI, complete sender registration/consent requirements, provision verified on-call numbers and credentials, and test actual delivery to the primary and backup. Twilio documents HIPAA-eligible Programmable Messaging under a BAA; this is a candidate, not a configured vendor. A production worker must persist alerts and delivery attempts, use idempotency and retries, observe provider delivery receipts, recheck the active shift at send time, escalate unacknowledged alerts after the practice's deadline, and page operations if both contacts fail. Do not use a browser timer for these guarantees. A monitored end-to-end weekend drill and actual staffing sign-off are required before calling the service operational.

## Release gates

- Practice owner confirms exact office hours, providers, locations, surgery-center resources, visit durations and booking rules.
- Signed BAAs and verified covered services for host, database, messaging provider, AI provider and subprocessors where they handle PHI; practice risk analysis and policies complete.
- Tests for two patients booking the same slot, provider absence, DST boundaries, canceled reminders, confidential-contact choices, alert delivery failure, missed acknowledgment, cross-patient access, prompt injection and unsafe clinical replies.
- Clinician and compliance review of assistant responses and escalation thresholds; staffed support roster and incident plan; limited monitored pilot before real use.

## Official references

- [HHS business-associate guidance, including patient-portal AI chatbot](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html)
- [HHS appointment reminder guidance](https://www.hhs.gov/hipaa/for-professionals/faq/may-health-care-providers-leave-messages/index.html)
- [HHS email and confidential communication guidance](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-permit-health-care-providers-to-use-email-to-discuss-health-issues-with-patients/index.html)
- [Twilio HIPAA eligibility and BAA overview](https://www.twilio.com/en-us/hipaa)
