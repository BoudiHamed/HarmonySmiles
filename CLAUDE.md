# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

HarmonySmiles is a dental clinic reservation system with three independent top-level parts (no root package.json tying them together):

- `backend/` — Node.js/TypeScript/Express API backed by PostgreSQL. Every route in the spec is implemented (see "Implementation status" below); still actively evolving.
- `frontend/` — static HTML/CSS/Bootstrap 5 marketing site, no build step. The public booking page (`page/bookappointment.html`) and the admin dashboard (`page/admin/`) are wired to the backend via plain `fetch()` calls; the rest of the marketing pages are still static/unwired.
- `database/schema.sql` — hand-written SQL schema, applied manually to Postgres (no migration tool).

The full intended design (API routes, business rules, DB schema) is specified in `.agents/workflows/harmonysmiles.md`. Treat it as the design intent, not as a description of current code — much of it is not built yet.

## Commands

All commands run from `backend/`:

- `npm run dev` — `tsx watch src/server.ts` (tsx has built-in watch mode, no nodemon needed)
- `npm run build` — `tsc`, emits to `backend/dist/` (checked into git)
- `npm start` — runs the built `dist/server.js`

The package is ESM (`"type": "module"` in `package.json`), matching the `.js`-suffixed relative imports used everywhere (required by `"module": "nodenext"` in `tsconfig.json`) — don't reintroduce `ts-node`, its ESM loader hooks don't work against current Node versions and will silently fail to resolve `.js` specifiers back to `.ts` source files.

There is no test framework, test script, or lint config anywhere in this repo — don't invent `npm test`/`npm run lint` commands.

Required env vars (see `backend/.env`, not committed): `PORT`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `JWT_SECRET`. `src/utils/jwt.ts` throws at import time if `JWT_SECRET` is missing — fail fast rather than silently signing tokens with an undefined secret. `ADMIN_USERNAME`/`ADMIN_PASSWORD` are only needed to run `npm run seed` (`backend/seed.ts`), not for the server itself.

## Backend architecture

Layering flows `routes/` → `controllers/` → `services/` → raw `pg` queries via `src/config/db.ts`. No ORM is used anywhere — all SQL is hand-written with parameterized queries (`$1`, `$2`, ...).

- `src/app.ts` builds and exports the Express `app` (middleware + routes); `src/server.ts` imports it and calls `.listen()`. Keep that split — don't move `app.listen` back into `app.ts`.
- `src/config/db.ts` exports a pooled `query<T>()` for simple queries, `getClient()` for a raw connection, `withTransaction(fn)` which wraps `fn` in `BEGIN`/`COMMIT`, rolling back and releasing the client on any error, and `closePool()` (only used by `seed.ts`, so a one-off script can actually exit instead of hanging on an open connection — the server itself never calls it). Use `withTransaction` for new atomic writes instead of hand-rolling `try/catch/finally`.
- `src/utils/AppError.ts` is a small `Error` subclass carrying a `statusCode`. Throw it from services for expected, user-facing failures (e.g. booking conflict → 409). Plain `throw new Error(...)` is still fine for "should never happen" cases — it becomes a 500.
- `src/middlewares/error.middleware.ts` is mounted last in `app.ts` and is the only place HTTP status codes get decided for errors: `ZodError` → 400 with per-field issues, `AppError` → its `statusCode`, anything else → 500 (logged server-side via `console.error`). Controllers should just `next(error)` and never set error status codes themselves.
- `src/middlewares/validate.middleware.ts` exports `validate(schema)`, a generic factory that `safeParse`s `{ body, query, params }` against a Zod schema and, on success, replaces `req.body`/`query`/`params` with the parsed (and coerced) output before calling `next()`. Use this for every new validator instead of writing bespoke middleware per route. Note: Express 5 exposes `req.query` as a getter-only accessor (no setter) — the middleware replaces it via `Object.defineProperty`, not plain assignment, or it throws `TypeError: Cannot set property query of #<IncomingMessage> which has only a getter`. `req.body`/`req.params` don't have this problem and are reassigned normally.
- `src/middlewares/validators/*` hold the Zod schemas themselves (shape `{ body: z.object({...}) }` or `{ query: z.object({...}) }`), consumed by `validate()` at the route level — see `appointment.validator.ts` and `general.validator.ts` for the pattern, including the "must be in the future"/"must not be in the past" checks done against the clinic's local time (`Europe/Zurich` — the clinic is in Switzerland, not Egypt; if you see `Africa/Cairo` anywhere, that's a stale leftover, not intentional), not server time. Both validators use `src/utils/clinicTime.ts`'s `getClinicNow()`/`CLINIC_TIMEZONE` rather than duplicating the `Intl.DateTimeFormat` logic — add new clinic-local-time checks through that shared helper.
- `src/types/*.types.ts` are hand-written interfaces per domain (appointment, patient, admin, auth) — no codegen from the DB schema.
- `src/services/appointment.service.ts::createAppointmentService` is the reference implementation for transactional services: inside `withTransaction`, it does an atomic `INSERT ... ON CONFLICT (phone) DO NOTHING RETURNING id` against `patients` (falling back to a `SELECT` by phone only if the insert hit the conflict), inserts the appointment, and outside the transaction, catches a Postgres `DatabaseError` whose `constraint` is `unique_active_appointment` and rethrows it as an `AppError` (409) with a user-facing message. Follow this pattern for other transactional service functions.
- `src/services/appointment.service.ts::getAvailableSlotsService` backs `GET /available-slots`: queries booked `appointment_time`s for the given date (`status IN ('Pending', 'Confirmed')`), then hands them to the pure `utils/generateSlots.ts::generateAvailableSlots(date, bookedTimes)`, which has no DB access of its own — it just computes free 30-minute slots (10:00–18:00 clinic-local time, Sunday fully closed, past slots excluded for today). Sunday (not Friday) is confirmed correct — the clinic is in Switzerland, not Egypt.
- `src/services/appointment.service.ts` also owns the admin CRUD surface — `listAppointmentsService`, `getAppointmentByIdService`, `confirmAppointmentService`, `cancelAppointmentService`, `deleteAppointmentService` — all plain (non-transactional) queries; the latter four throw `AppError('Appointment not found', 404)` when the target row doesn't exist. `listAppointmentsService` builds its `WHERE` clause dynamically, only for filters actually supplied (`status` exact match, `search` as `ILIKE` across the joined patient's name/phone), and always orders by `appointment_date, appointment_time` per spec.
- `src/services/patient.service.ts::listPatientsService` backs the admin patients table (`GET /admin/patients`) — a plain, non-transactional query over `patients` directly (not joined with `appointments`), with the same optional-`search`/dynamic-`WHERE` pattern as `listAppointmentsService` (`ILIKE` across name/phone/MRN), ordered by `last_name, first_name`.
- There is no separate MRN-generation utility — the medical record number is derived in the same `INSERT` as the patient row, from that row's own `id` (via `nextval`/`currval` on `patients_id_seq`), so it can never race or drift from the patient it belongs to.

### Implementation status

Every route in the spec is now implemented and wired end-to-end, reachable over HTTP:
- `POST /api/appointments` (`public.routes.ts`) → `validate(createAppointmentSchema)` → `appointments.controller.ts` → `appointment.service.ts` → `errorMiddleware` on failure.
- `GET /api/available-slots?date=YYYY-MM-DD` (`public.routes.ts`) → `validate(availableSlotsSchema)` → `appointments.controller.ts::getAvailableSlots` → `appointment.service.ts::getAvailableSlotsService` → `utils/generateSlots.ts`.
- `POST /api/admin/login` (`admin.routes.ts`) → `validate(loginSchema)` → `auth.controller.ts` → `auth.service.ts` (bcrypt compare + `signToken`) → `errorMiddleware` on failure. Every route registered on `adminRouter` **after** the `login` route is automatically behind `authMiddleware` (mounted via `adminRouter.use(authMiddleware)` right after `login`) — this ordering, not a per-route check, is what makes a newly added admin route protected by default. `authMiddleware` reads `Authorization: Bearer <token>`, verifies it via `utils/jwt.ts`, and attaches the payload to `req.admin` (typed via the module augmentation in `src/types/express.d.ts`).
- `GET /api/admin/appointments` (optional `?status=`/`?search=`, `validate(listAppointmentsSchema)`), `GET /api/admin/appointments/:id`, `PATCH /api/admin/appointments/:id/confirm`, `PATCH /api/admin/appointments/:id/cancel`, `DELETE /api/admin/appointments/:id` (the latter four sharing `validate(appointmentIdParamSchema)`), and `GET /api/admin/patients` (optional `?search=`, `validate(listPatientsSchema)`) — all in `admin.routes.ts` → `admin.controller.ts` → the admin functions in `appointment.service.ts`/`patient.service.ts`. All protected by the `authMiddleware` ordering above.

`backend/seed.ts` (run via `npm run seed`, requires `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars) creates the first admin account — bcrypt-hashed, `ON CONFLICT (username) DO NOTHING` so it's safe to re-run. It's outside `tsconfig.json`'s `include` (`src/**/*`) by design, same as the rest of `src/`'s stubs were — run directly via `tsx`, not compiled by `npm run build`.

No empty stubs remain in `backend/src/` — every file listed in `ARCHITECTURE.md` is now implemented.

All comments and user-facing strings (API response `message` fields, thrown `Error` messages) are English — kept short, one line where possible. This file previously claimed user-facing strings were "in Arabic by design"; that was a leftover from the same stale Egypt assumption behind the old `Africa/Cairo`/Friday-closed mistakes and has been confirmed wrong — the clinic is in Switzerland, English is correct.

## Database

Schema lives in `database/schema.sql` and is applied manually (no migration tooling — if you change the schema, update this file and note that it needs to be re-run).

The load-bearing, non-obvious piece: `unique_active_appointment` is a **partial unique index** on `appointments (appointment_date, appointment_time) WHERE status IN ('Pending', 'Confirmed')`. This prevents double-booking a slot while still allowing it to be rebooked once the prior appointment is cancelled/completed/no-show — it's what `createAppointmentService` catches by constraint name to produce the "slot already booked" error.

`patients.phone` is `UNIQUE` — the service layer relies on this for its `ON CONFLICT (phone)` upsert, so don't drop it.

`appointments.patient_id` FK is `ON DELETE RESTRICT` (a patient with existing appointments can't be deleted outright) — this matches `.agents/workflows/harmonysmiles.md` as of the last edit; if you see `ON DELETE CASCADE` mentioned anywhere else, that's stale.

## Frontend

Plain static site: pages live under `frontend/page/*.html` (e.g. `veneersection.html`, `implantsection.html`, `orthodonticsection.html`, `cleaningsection.html`), styles under `frontend/style/`, entry point `frontend/index.html`. No bundler, no package.json, no build step — edit the HTML/CSS directly. `frontend/README.md`'s file-structure section is stale (describes files like `services-cosmetic.html`/`team.html` that don't exist) — trust the actual directory listing over that README.

Two parts of the frontend are wired to the backend via plain `fetch()` (no framework, no build step — each page loads its own small `.js` file):
- `frontend/page/bookappointment.html` + `bookappointment.js` — the real public booking form. Loads live slots from `GET /available-slots` whenever the date changes, then `POST`s to `/appointments` with exactly the fields `createAppointmentSchema` expects (optional fields are omitted entirely when empty, since the backend's `.strict()` schemas reject unexpected/empty-string keys). Every page's "Book an Appointment" nav link (main nav + mobile offcanvas, across all pages) points here now, not to `contactus.html` (which is still just a non-functional generic contact form).
- `frontend/page/admin/` — `login.html`/`login.js` (posts to `/admin/login`, stores the JWT in `localStorage`), `dashboard.html`/`dashboard.js` (appointments table — filterable by status/search, with Confirm/Cancel/Delete actions), and `patients.html`/`patients.js` (patients table — filterable by name/phone/MRN, read-only) — separate pages, not tabs on one page, linked via a shared icon sidebar (`.admin-sidebar` in `style/admin.css`, duplicated markup on both pages per the site's no-templating convention, with `.active` set statically per page). `admin-api.js` is the shared fetch wrapper: attaches the bearer token to every `/admin/*` call and auto-redirects to login on a `401`. `API_BASE_URL` is hardcoded to `http://localhost:3000/api` in `admin-api.js` and separately in `bookappointment.js` (two separate constants, not shared — deliberately not worth a shared config module for one string) — update both if deploying anywhere other than local dev.
