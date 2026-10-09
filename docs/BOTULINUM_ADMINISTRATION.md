# Detailed botulinum-toxin administration and billing review

Within an open appointment, the assigned clinician selects **Botulinum toxin / Botox-type treatment**, links a supporting clinical note and records actual administration facts. Exact brand mentions in notes are highlighted for clarification, not treated as proof of an injection. Identical retries of the same current source-service record reuse the record rather than create a duplicate.

## Recorded facts

- Actual product: BOTOX/onabotulinumtoxinA/type A; DYSPORT/abobotulinumtoxinA/type A; MYOBLOC/rimabotulinumtoxinB/type B; XEOMIN/incobotulinumtoxinA/type A; DAXXIFY/daxibotulinumtoxinA-lanm/type A. Other/unconfirmed formulations are recorded for clarification with no substitution or default dose conversion.
- Medical, cosmetic or mixed purpose; actual indication, medical-necessity narrative, initial/repeat treatment history, previous date when relevant, prior treatments/failures/response and frequency/follow-up plan. These are evidence fields, not treatment or coverage recommendations.
- Each individual opened vial: label strength in that product’s units, NDC as on the package, lot, expiry, container type, actual preparation method, prepared solution volume, actual diluent when used and preparation/administration source reference. NDC/lot/expiry are recorded, not authenticated against manufacturer systems.
- Each injection site: muscle/exact location, laterality or explicitly not applicable, product units administered and injection count. Total administered units are derived from these individual entries.
- Explicit actual discarded, remaining/unallocated and other-use units, including documented zero; discard reason and disposal reference; explanation for other-use units. Remaining drug or drug used elsewhere/cosmetically is not called discarded waste.
- Route, procedure technique, performed-service reference, consent reference, actual guidance (or explicitly none), reason for guidance if used, and tolerance/adverse events (or explicitly none noted). Injection/guidance CPT codes are separate professionally reviewed procedure lines; they are not auto-added from selecting guidance.

The app reconciles the sum of opened-vial units with administered + discarded + remaining + other-use units. It does not fill an unknown discard amount from the difference or prescribe preparation, dilution, injection sites, dose or treatment frequency. Units support three decimal places; the integer billing-line foundation holds fractional HCPCS results for explicit payer-rule work rather than automatically rounding.

## Product units and billing units

| Product | HCPCS | Product units represented by one HCPCS billing unit |
| --- | --- | ---: |
| BOTOX | J0585 | 1 |
| DYSPORT | J0586 | 5 |
| MYOBLOC | J0587 | 100 |
| XEOMIN | J0588 | 1 |
| DAXXIFY | J0589 | 1 |

These identities are documented in CMS article A57185; the denominators come from the bundled October 2026 CMS HCPCS release. The app validates code availability for the service date before a review can be saved. A product’s recorded dose divided by its own HCPCS denominator produces a billing-quantity calculation, **not a clinical conversion between toxin products**. Product potency units are not interchangeable.

After signing, the assigned clinician or authorized billing staff reviews separate administered and discarded drug components, the documented diagnosis, correct product code, units, modifiers and supporting rationale. Incorrect product/code pairs, unreconciled totals, missing documentation, dose/billing-unit mismatches and duplicate administered/discarded components cannot pass the source-linked workflow. Source review IDs and component identity survive claim creation and the durable outbox. Legacy manual lines cannot bypass the detailed record for these toxin drug codes.

## Wastage applicability

The coding reviewer must explicitly select a payer-wastage applicability context and record its source/reference. For the explicitly reviewed Medicare single-dose context, zero-discard administered lines require JZ; positive discard is a separate JW line; JZ cannot attest zero discard when discard is documented. Multi-dose containers cannot pass that single-dose context. No rule is automatically applied merely because the patient’s payer name contains Medicare.

The reviewer must check actual payer, buy-and-bill/supply arrangement, service location, separately payable status, applicable MAC/plan policy and date. Other-payer review records an attestation/source; it does not implement or prove all commercial/Medicaid wastage rules. Fractional billing-unit rounding, shared-vial allocation, unallocated remaining units, mixed/cosmetic use, samples and patient-supplied drugs are held for further professional review. This foundation does not automatically bill waste, authorize reimbursement, validate NDC/package strength, perform inventory purchasing reconciliation or provide a complete clinical medication-administration system.

All detailed records remain sample-only in this application. Real payer transmission is disabled. An insurer’s actual requirements, medical necessity and member benefits must be checked for the exact indication/product/provider/date. Detailed documentation is not a guarantee of coverage or payment.

## Primary references

- CMS product/code identities and an example local documentation policy: https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleId=57185 (local Noridian policy; not universal plan coverage).
- CMS October 2026 public-use HCPCS descriptors: https://www.cms.gov/files/zip/october-2026-alpha-numeric-hcpcs-file.zip
- CMS Medicare discarded-drug policy and JW/JZ FAQs: https://www.cms.gov/medicare/payment/part-b-drugs/discarded-drugs
- BOTOX prescribing information (product-specific potency warning): https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=33d066a9-34ff-4a1a-b38b-d10983df3300

Tests use fictional vial identifiers, administration sites, quantities and histories solely for arithmetic/authorization verification. They are not clinical protocols or patient recommendations.
