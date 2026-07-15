# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

HarmonySmiles is a dental clinic reservation system with three independent top-level parts (no root package.json tying them together):

- `backend/` — Node.js/TypeScript/Express API backed by PostgreSQL. Active development, partially implemented (see "Implementation status" below).
- `frontend/` — static HTML/CSS/Bootstrap 5 marketing site. Not wired to the backend, no build step.
- `database/schema.sql` — hand-written SQL schema, applied manually to Postgres (no migration tool).

The full intended design (API routes, business rules, DB schema) is specified in `.agents/workflows/harmonysmiles.md`. Treat it as the design intent, not as a description of current code — much of it is not built yet.

## Commands

All commands run from `backend/`:

- `npm run dev` — `tsx watch src/server.ts` (tsx has built-in watch mode, no nodemon needed)
- `npm run build` — `tsc`, emits to `backend/dist/` (checked into git)
- `npm start` — runs the built `dist/server.js`

The package is ESM (`"type": "module"` in `package.json`), matching the `.js`-suffixed relative imports used everywhere (required by `"module": "nodenext"` in `tsconfig.json`) — don't reintroduce `ts-node`, its ESM loader hooks don't work against current Node versions and will silently fail to resolve `.js` specifiers back to `.ts` source files.

There is no test framework, test script, or lint config anywhere in this repo — don't invent `npm test`/`npm run lint` commands.

Required env vars (see `backend/.env`, not committed): `PORT`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `JWT_SECRET`. `src/utils/jwt.ts` throws at import time if `JWT_SECRET` is missing — fail fast rather than silently signing tokens with an undefined secret.

## Backend architecture

Layering flows `routes/` → `controllers/` → `services/` → raw `pg` queries via `src/config/db.ts`. No ORM is used anywhere — all SQL is hand-written with parameterized queries (`$1`, `$2`, ...).

- `src/app.ts` builds and exports the Express `app` (middleware + routes); `src/server.ts` imports it and calls `.listen()`. Keep that split — don't move `app.listen` back into `app.ts`.
- `src/config/db.ts` exports a pooled `query()` for simple queries, `getClient()` for a raw connection, and `withTransaction(fn)` which wraps `fn` in `BEGIN`/`COMMIT`, rolling back and releasing the client on any error. Use `withTransaction` for new atomic writes instead of hand-rolling `try/catch/finally`.
- `src/utils/AppError.ts` is a small `Error` subclass carrying a `statusCode`. Throw it from services for expected, user-facing failures (e.g. booking conflict → 409). Plain `throw new Error(...)` is still fine for "should never happen" cases — it becomes a 500.
- `src/middlewares/error.middleware.ts` is mounted last in `app.ts` and is the only place HTTP status codes get decided for errors: `ZodError` → 400 with per-field issues, `AppError` → its `statusCode`, anything else → 500 (logged server-side via `console.error`). Controllers should just `next(error)` and never set error status codes themselves.
- `src/middlewares/validate.middleware.ts` exports `validate(schema)`, a generic factory that `safeParse`s `{ body, query, params }` against a Zod schema and, on success, replaces `req.body`/`query`/`params` with the parsed (and coerced) output before calling `next()`. Use this for every new validator instead of writing bespoke middleware per route.
- `src/middlewares/validators/*` hold the Zod schemas themselves (shape `{ body: z.object({...}) }`), consumed by `validate()` at the route level — see `appointment.validator.ts` for the pattern, including the "appointment must be in the future" check done against Africa/Cairo local time, not server time.
- `src/types/*.types.ts` are hand-written interfaces per domain (appointment, patient, admin, auth) — no codegen from the DB schema.
- `src/services/appointment.service.ts::createAppointmentService` is the reference implementation for transactional services: inside `withTransaction`, it does an atomic `INSERT ... ON CONFLICT (phone) DO NOTHING RETURNING id` against `patients` (falling back to a `SELECT` by phone only if the insert hit the conflict), inserts the appointment, and outside the transaction, catches a Postgres `DatabaseError` whose `constraint` is `unique_active_appointment` and rethrows it as an `AppError` (409) with a user-facing message. Follow this pattern for other transactional service functions.
- There is no separate MRN-generation utility — the medical record number is derived in the same `INSERT` as the patient row, from that row's own `id` (via `nextval`/`currval` on `patients_id_seq`), so it can never race or drift from the patient it belongs to.

### Implementation status

Two paths are implemented and wired end-to-end, reachable over HTTP:
- `POST /api/appointments` (`public.routes.ts`) → `validate(createAppointmentSchema)` → `appointments.controller.ts` → `appointment.service.ts` → `errorMiddleware` on failure.
- `POST /api/admin/login` (`admin.routes.ts`) → `validate(loginSchema)` → `auth.controller.ts` → `auth.service.ts` (bcrypt compare + `signToken`) → `errorMiddleware` on failure. Every route registered on `adminRouter` **after** the `login` route is automatically behind `authMiddleware` (mounted via `adminRouter.use(authMiddleware)` right after `login`) — this ordering, not a per-route check, is what makes a newly added admin route protected by default. `authMiddleware` reads `Authorization: Bearer <token>`, verifies it via `utils/jwt.ts`, and attaches the payload to `req.admin` (typed via the module augmentation in `src/types/express.d.ts`).

Still empty stubs, not broken code — don't assume something is misconfigured just because these files are empty:
`admin.controller.ts` (no admin appointment-management routes exist yet — `adminRouter` currently only has `login` + the `authMiddleware` mount), `general.validator.ts`, `utils/generateSlots.ts` (no `GET /available-slots` yet), and `backend/seed.ts` (intended to seed the admin account per the spec doc — there is currently no admin row in the database and no way to create one except inserting it by hand).

Comments are in English throughout. User-facing strings (API response `message` fields, thrown `Error` messages surfaced to patients) are in Arabic by design — don't translate those, they're not comments.

## Database

Schema lives in `database/schema.sql` and is applied manually (no migration tooling — if you change the schema, update this file and note that it needs to be re-run).

The load-bearing, non-obvious piece: `unique_active_appointment` is a **partial unique index** on `appointments (appointment_date, appointment_time) WHERE status IN ('Pending', 'Confirmed')`. This prevents double-booking a slot while still allowing it to be rebooked once the prior appointment is cancelled/completed/no-show — it's what `createAppointmentService` catches by constraint name to produce the "slot already booked" error.

`patients.phone` is `UNIQUE` — the service layer relies on this for its `ON CONFLICT (phone)` upsert, so don't drop it.

`appointments.patient_id` FK is `ON DELETE RESTRICT` (a patient with existing appointments can't be deleted outright) — this matches `.agents/workflows/harmonysmiles.md` as of the last edit; if you see `ON DELETE CASCADE` mentioned anywhere else, that's stale.

## Frontend

Plain static site: pages live under `frontend/page/*.html` (e.g. `veneersection.html`, `implantsection.html`, `orthodonticsection.html`, `cleaningsection.html`), styles under `frontend/style/`, entry point `frontend/index.html`. No bundler, no package.json, no build step — edit the HTML/CSS directly. `frontend/README.md`'s file-structure section is stale (describes files like `services-cosmetic.html`/`team.html` that don't exist) — trust the actual directory listing over that README.
