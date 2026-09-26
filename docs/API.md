# API surface (JSON)

Login `POST /api/login`, session `GET /api/session`, logout `POST /api/logout`. Mutations after login require `X-CSRF-Token` returned by login/session. Cookies are HttpOnly and SameSite=Strict. All routes are same-origin. No public signup or API tokens.

| Endpoint | Roles | Purpose |
| --- | --- | --- |
| `GET /api/dashboard`, `/patients`, `/encounters?patientId=` | All | Role-filtered worklist and chart list |
| `GET/POST /api/encounters/:id/sections` | All read; physician/admin write | Structured note sections |
| `POST /api/encounters/:id/sign` | Assigned physician | Lock and sign encounter |
| `POST /api/encounters/:id/checks` | Practice staff | Preview documentation/claim-line checks |
| `POST /api/encounters/:id/checkout` | Assigned physician | Validate and queue exactly one claim |
| `GET/POST /api/suggestions` | All read; practice staff write | Manual candidate codes with rationale |
| `GET/POST /api/authorizations` | All read; biller/admin write | Track requests; approval update is intentionally absent |
| `GET /api/claims`, `/claims/:id/events` | All | Role-filtered claims and history |
| `GET/POST /api/claims/:id/denials`, `/payments` | All read; biller/admin write | Record payer outcomes and payments |
| `POST /api/appeals` | Biller/admin | Draft appeal linked to denial |
| `GET/POST /api/files`, `GET /api/files/:id` | Authorized chart users | Upload and fetch PNG/JPEG/PDF, max 4 MB |

Patient users can access only records linked to their `patient_id`; staff are bounded by `org_id`. This is a starter authorization matrix that needs a finer care-team and break-glass policy before production. API errors use `{error, issues?}`. Checkout body: `{"lines":[{"procedure_system":"CPT","procedure_code":"...","diagnosis_code":"...","modifier":"","units":1,"charge_cents":10000,"authorization_id":null}]}`. Amounts use integer cents.
