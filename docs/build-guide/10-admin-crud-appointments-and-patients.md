# Part 10 — Admin CRUD: Appointments & Patients

This is the biggest part of the guide, because it's the biggest part of the app: the entire backend surface behind the admin dashboard — listing and filtering appointments, viewing and updating a single one, listing patients, and viewing a patient's full profile. Everything from Parts 01–09 (the layered structure, `AppError`, the validation pattern, `authMiddleware`) exists to make this part mechanical to build instead of a mess. You'll feel that now.

## Step 1 — A constant, to prevent a bug that already happened once

```ts
// src/constants/appointment.constants.ts
export const ALLOWED_APPOINTMENT_STATUSES = ['Pending', 'Confirmed', 'Cancelled', 'Completed', 'NoShow'] as const;
```

One line, but worth explaining *why* it's its own file rather than just retyping the list of statuses wherever it's needed. This project's own history is the reason: at one point, the database schema, the TypeScript status type, and a validator each independently spelled out the same list of valid statuses — and one of them wrote `'No_Show'` (with an underscore) where the others wrote `'NoShow'`. Nothing caught this automatically; it was a silent mismatch until it caused a real, confusing bug. A single declared list, imported everywhere a status needs validating, doesn't prevent every possible mistake, but it collapses "four places that all need to agree" down to "one place, referenced four times" — which is a fundamentally easier thing to keep correct. The `as const` (rather than a plain array) is what lets TypeScript treat this as a fixed tuple of exact string literals, which is what makes it usable directly inside a Zod `z.enum(...)` in the next step.

## Step 2 — The validators

```ts
// src/middlewares/validators/admin.validator.ts
import { z } from 'zod';
import { ALLOWED_APPOINTMENT_STATUSES } from '../../constants/appointment.constants.js';

export const listAppointmentsSchema = z.object({
  query: z
    .object({
      status: z.enum(ALLOWED_APPOINTMENT_STATUSES).optional(),
      search: z.string().trim().min(1).optional(),
      date_range: z.enum(['today', 'tomorrow', 'week', 'month', 'upcoming', 'previous']).optional(),
    })
    .strict(),
});

export const listPatientsSchema = z.object({
  query: z.object({ search: z.string().trim().min(1).optional() }).strict(),
});

export const appointmentIdParamSchema = z.object({
  params: z
    .object({
      id: z.coerce.number({ error: 'Appointment id is required' }).int().positive(),
    })
    .strict(),
});

export const patientIdParamSchema = z.object({
  params: z
    .object({
      id: z.coerce.number({ error: 'Patient id is required' }).int().positive(),
    })
    .strict(),
});
```

Every field here is `.optional()` — every one of these list endpoints needs to work with *no* filters at all (return everything) just as well as with any combination of filters supplied. `appointmentIdParamSchema` and `patientIdParamSchema` are structurally identical — both just "a positive integer in the URL's `:id` slot" — kept as two separate exported schemas anyway, purely so each can produce its own resource-appropriate error message (`'Appointment id is required'` vs. `'Patient id is required'`) rather than one generic, less helpful message shared between two genuinely different resources.

`z.coerce.number()` on `id` matters for the same reason it mattered for `birth_year` back in Part 06: URL path parameters, like query strings, always arrive as strings (`req.params.id` is `"42"`, not `42`) — coercion is what turns that into an actual number your service functions can use directly, without every controller needing its own `Number(req.params.id)` conversion (and the associated risk of forgetting to check whether that conversion produced `NaN`).

## Step 3 — Finishing `clinicTime.ts`: `getDateRangeForPreset`

Part 07 mentioned this function without building it — now there's an actual use for it, so build it out:

```ts
// src/utils/clinicTime.ts (add this)
export const getDateRangeForPreset = (preset: DateRangePreset): { from?: string; to?: string } => {
  const now = getClinicNow();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { from: toISODate(today), to: toISODate(today) };

    case 'tomorrow': {
      const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      return { from: toISODate(tomorrow), to: toISODate(tomorrow) };
    }

    case 'week': {
      const daysSinceMonday = (today.getDay() + 6) % 7;
      const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday);
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      return { from: toISODate(monday), to: toISODate(sunday) };
    }

    case 'month': {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: toISODate(firstOfMonth), to: toISODate(lastOfMonth) };
    }

    case 'upcoming':
      return { from: toISODate(today) };

    case 'previous': {
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      return { to: toISODate(yesterday) };
    }
  }
};
```

The most interesting piece here is the `'week'` case's Monday calculation: `(today.getDay() + 6) % 7`. `Date.prototype.getDay()` returns `0` for Sunday — but this clinic (and most business contexts) thinks of weeks as starting on Monday. Adding `6` and taking the result modulo `7` re-maps the numbering so Monday becomes `0` days-since-Monday, Sunday becomes `6` — a small piece of modular arithmetic that's worth recognizing as a pattern any time you need to rotate which day of the week counts as "first."

Notice the return type is `{ from?: string; to?: string }` — both fields optional, and `'upcoming'`/`'previous'` each only ever set *one* of them. This is deliberate: "upcoming" genuinely means "today and every day after, with no end" — forcing a `to` value would mean inventing an artificial cutoff nobody asked for. The consuming code (Step 5, below) has to actually respect this and only apply whichever bound is present, which is exactly why `listAppointmentsService` builds its `WHERE` clause dynamically rather than always assuming both bounds exist.

## Step 4 — The lazy no-show sweep

Before building the list/filter logic, there's one small but important piece of business logic every admin-facing read needs to run first: automatically flipping any appointment whose scheduled time has already passed — and that nobody ever manually confirmed as `Completed` or marked `NoShow` — over to `NoShow`.

```ts
// src/services/appointment.service.ts (add this)
import { getClinicNowDateTime } from '../utils/clinicTime.js';

const markPastAppointmentsAsNoShow = async (): Promise<void> => {
  const { date, time } = getClinicNowDateTime();
  await query(
    `UPDATE appointments
     SET status = 'NoShow', updated_at = now()
     WHERE status IN ('Pending', 'Confirmed')
       AND (appointment_date < $1 OR (appointment_date = $1 AND appointment_time < $2))`,
    [date, time]
  );
};
```

Why this exists, and why it's shaped the way it is: a patient who simply never shows up for a `Pending` or `Confirmed` appointment leaves that appointment sitting in a state that's no longer true — the slot's time has passed, but nothing updated its status. Left alone, it would keep showing up in "upcoming" views forever, and (more importantly) it would keep *occupying* the partial unique index's protected set (Part 02), even though that slot is obviously not going to be used.

The genuinely interesting design decision here is **how** this gets triggered: this is not a scheduled job — there's no cron, no `setInterval`, nothing running in the background on a timer. This project deliberately has zero background-job infrastructure. Instead, this function is called at the *start* of every admin read path (you'll see it called from three different places below) — a **lazy sweep-on-read**. The practical effect is the same as a scheduled job for this app's actual usage pattern (an admin dashboard someone is actively looking at, not a system that needs to react to a missed appointment the instant it's missed) — the correction happens the next time anyone actually looks at the data, which for a clinic dashboard is "soon enough," without needing any new infrastructure. If this app ever needed genuinely real-time no-show detection (say, to trigger an automatic notification the moment a slot is missed, with nobody around to load the dashboard), this lazy approach would stop being sufficient, and that would be the point to introduce a real scheduler instead of adding more read-path side effects.

## Step 5 — `listAppointmentsService`: building a query from whichever filters were actually supplied

```ts
export interface ListAppointmentsFilters {
  status?: AppointmentStatus;
  search?: string;
  dateRange?: DateRangePreset;
}

export const listAppointmentsService = async (filters: ListAppointmentsFilters): Promise<AppointmentWithPatient[]> => {
  await markPastAppointmentsAsNoShow();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`a.status = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length} OR p.phone ILIKE $${params.length})`);
  }

  if (filters.dateRange) {
    const { from, to } = getDateRangeForPreset(filters.dateRange);
    if (from !== undefined) {
      params.push(from);
      conditions.push(`a.appointment_date >= $${params.length}`);
    }
    if (to !== undefined) {
      params.push(to);
      conditions.push(`a.appointment_date <= $${params.length}`);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query<AppointmentWithPatient>(
    `SELECT a.*, p.first_name, p.last_name, p.phone, p.medical_record_number
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     ${whereClause}
     ORDER BY a.appointment_date, a.appointment_time`,
    params
  );

  return result.rows;
};
```

This function has to handle every combination of "which filters were actually supplied" — no filters, just a status, just a search term, all three at once, and so on — without writing a separate SQL query for every possible combination (which would be an unmanageable number of cases). The pattern here — build up two parallel arrays, `conditions` (SQL fragments) and `params` (the actual values, in order) — is a standard, reusable way to construct a dynamic `WHERE` clause safely.

**Why the parameters are numbered dynamically (`$${params.length}`) instead of hardcoded (`$1`, `$2`, ...).** Postgres's parameterized queries (the `$1`, `$2`, ... placeholders `pg` substitutes real values into) are positional — `$1` always refers to the *first* element of the `params` array you pass alongside the query text, `$2` the second, and so on, regardless of what the SQL text around them says. Since you don't know in advance how many filters will actually be active, you can't hardcode which placeholder number belongs to which condition — `params.push(value)` followed immediately by `` $${params.length} `` guarantees each new condition always references the placeholder for the value *just* pushed, whatever position that happens to land in for this particular request. This is also, not incidentally, why this is safe from SQL injection despite building the query text dynamically: the actual *values* (`filters.search`, `filters.status`, etc.) never get concatenated into the SQL string itself — only the placeholder syntax (`$3`, `$4`) does, with the real values passed separately in the `params` array for `pg` to substitute safely. Never build dynamic SQL by concatenating user-supplied values directly into the query text — this pattern is the correct alternative.

**Why `ILIKE`, not `LIKE`.** `LIKE` in Postgres is case-sensitive by default; `ILIKE` is case-insensitive. A staff member searching for a patient by name shouldn't have to match capitalization exactly.

**Why this always joins against `patients`, even when no `search` filter needs it.** The dashboard needs to show a patient's name and phone alongside every appointment row (`AppointmentWithPatient`, from Part 04) — that's a structural requirement of the response shape, independent of which filters happen to be active this particular request.

## Step 6 — The rest of the appointment service: single lookups and status transitions

```ts
export const getAppointmentByIdService = async (id: number): Promise<AppointmentWithPatient> => {
  await markPastAppointmentsAsNoShow();
  const result = await query<AppointmentWithPatient>(
    `SELECT a.*, p.first_name, p.last_name, p.phone, p.medical_record_number
     FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = $1`,
    [id]
  );
  const [appointment] = result.rows;
  if (!appointment) throw new AppError('Appointment not found', 404);
  return appointment;
};

const updateAppointmentStatusService = async (id: number, status: AppointmentStatus): Promise<Appointment> => {
  const result = await query<Appointment>(
    `UPDATE appointments SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [status, id]
  );
  const [appointment] = result.rows;
  if (!appointment) throw new AppError('Appointment not found', 404);
  return appointment;
};

export const confirmAppointmentService = async (id: number): Promise<Appointment> => {
  try {
    return await updateAppointmentStatusService(id, 'Confirmed');
  } catch (error: unknown) {
    if (error instanceof DatabaseError && error.constraint === 'unique_active_appointment') {
      throw new AppError('That slot is already booked by another appointment.', 409);
    }
    throw error;
  }
};

export const cancelAppointmentService = (id: number): Promise<Appointment> =>
  updateAppointmentStatusService(id, 'Cancelled');

export const completeAppointmentService = async (id: number): Promise<Appointment> => {
  const result = await query<Appointment>('SELECT * FROM appointments WHERE id = $1', [id]);
  const [appointment] = result.rows;
  if (!appointment) throw new AppError('Appointment not found', 404);

  if (!hasAppointmentDateTimePassed(appointment.appointment_date, appointment.appointment_time)) {
    throw new AppError('Cannot mark an appointment as completed before its scheduled date and time', 409);
  }

  return updateAppointmentStatusService(id, 'Completed');
};

export const noShowAppointmentService = async (id: number): Promise<Appointment> => {
  const result = await query<Appointment>('SELECT * FROM appointments WHERE id = $1', [id]);
  const [appointment] = result.rows;
  if (!appointment) throw new AppError('Appointment not found', 404);

  if (!hasAppointmentDateTimePassed(appointment.appointment_date, appointment.appointment_time)) {
    throw new AppError('Cannot mark an appointment as no-show before its scheduled date and time', 409);
  }

  return updateAppointmentStatusService(id, 'NoShow');
};

export const deleteAppointmentService = async (id: number): Promise<void> => {
  const result = await query('DELETE FROM appointments WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) throw new AppError('Appointment not found', 404);
};
```

A handful of patterns worth naming explicitly, since you'll see each of them recur constantly in real backend code beyond just this project:

- **`updateAppointmentStatusService` is a private, unexported helper** — `confirmAppointmentService` and `cancelAppointmentService` both just call it with a different status literal, rather than each reimplementing the same `UPDATE ... RETURNING *` query. Whenever you notice two functions are "the same shape, different constant," that's a signal to extract the shared shape into one internal helper.
- **`RETURNING *` doubling as an existence check.** Rather than running a separate `SELECT` first to check whether an appointment with this `id` exists, then a second `UPDATE`, the code just attempts the `UPDATE` directly and checks whether `RETURNING *` came back with a row. If the `id` doesn't exist, the `UPDATE` simply affects zero rows and returns none — cheaper than two round trips, and just as correct.
- **`confirmAppointmentService` needs the same `unique_active_appointment` catch as `createAppointmentService` did back in Part 06 — but the other status transitions don't.** Think through why: re-confirming an old, previously `Cancelled`/`Completed`/`NoShow` appointment moves it *back into* the set of statuses (`Pending`, `Confirmed`) the partial unique index actually protects — and by the time you're re-confirming it, some *other* appointment might have since legitimately taken that exact date+time slot. `cancelAppointmentService`, `completeAppointmentService`, and `noShowAppointmentService`, by contrast, never set a status the index cares about (`Cancelled`, `Completed`, and `NoShow` are all *outside* the `WHERE status IN ('Pending', 'Confirmed')` clause) — so none of them can ever collide with that index, and none of them need this extra catch. Getting this asymmetry right requires actually understanding *why* the index exists (Part 02), not just pattern-matching "this other function has a try/catch, so this one should too."
- **The time-gate on `completeAppointmentService`/`noShowAppointmentService`.** An admin shouldn't be able to mark an appointment scheduled for next week as already "Completed" today — that would be recording something that hasn't happened yet. Both functions fetch the row first specifically to check `hasAppointmentDateTimePassed` (built back in Part 07) before allowing the status change, returning a `409` (the request conflicts with the current state — "this hasn't happened yet") if it's too early.

## Step 7 — Splitting a patient's appointments into upcoming and past

```ts
export interface PatientAppointmentsSplit {
  upcoming: Appointment[];
  past: Appointment[];
}

export const listAppointmentsByPatientIdService = async (patientId: number): Promise<PatientAppointmentsSplit> => {
  await markPastAppointmentsAsNoShow();

  const result = await query<Appointment>(
    `SELECT * FROM appointments WHERE patient_id = $1 ORDER BY appointment_date, appointment_time`,
    [patientId]
  );

  const todayStr = getClinicTodayISODate();

  return {
    upcoming: result.rows.filter((a) => a.appointment_date >= todayStr),
    past: result.rows.filter((a) => a.appointment_date < todayStr),
  };
};
```

This backs the patient profile page's two tables. Rather than writing two separate SQL queries (one with `WHERE appointment_date >= $2`, one with `<`), it fetches everything for this patient in a single query and splits it in plain JavaScript afterward. This is a legitimate, deliberate simplification for this specific case — a single patient's total appointment history is never going to be large enough that fetching it all at once and filtering in memory is a real performance concern, and one query plus a filter is simpler to read than two nearly-identical queries. (Contrast this with `listAppointmentsService` in Step 5, which genuinely does need dynamic, database-level filtering — there, the row count is the *entire clinic's* appointment history, not one patient's, so pushing the filtering into SQL actually matters.) Knowing when a simpler, less "efficient-looking" approach is the right call — and when it isn't — is itself a skill; this pair of functions is a good side-by-side example of both answers being correct in their own context.

Also notice: comparing `a.appointment_date >= todayStr` works correctly using plain string comparison, with no date parsing at all — exactly the `'YYYY-MM-DD'`-strings-sort-chronologically property mentioned back in Part 07.

## Step 8 — The patient service

```ts
// src/services/patient.service.ts
import { query } from '../config/db.js';
import { Patient } from '../types/patient.types.js';
import { getClinicNow } from '../utils/clinicTime.js';
import { AppError } from '../utils/AppError.js';

export interface ListPatientsFilters {
  search?: string;
}

export const listPatientsService = async (filters: ListPatientsFilters): Promise<Patient[]> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR medical_record_number ILIKE $${params.length})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(getClinicNow().getFullYear());
  const currentYearParam = `$${params.length}`;

  const result = await query<Patient>(
    `SELECT id, medical_record_number, first_name, last_name, phone,
            (${currentYearParam}::int - birth_year) AS age, gender, email, created_at, updated_at
     FROM patients
     ${whereClause}
     ORDER BY medical_record_number`,
    params
  );

  return result.rows;
};

export const getPatientByIdService = async (id: number): Promise<Patient> => {
  const result = await query<Patient>(
    `SELECT id, medical_record_number, first_name, last_name, phone,
            ($2::int - birth_year) AS age, gender, email, created_at, updated_at
     FROM patients WHERE id = $1`,
    [id, getClinicNow().getFullYear()]
  );
  const [patient] = result.rows;
  if (!patient) throw new AppError('Patient not found', 404);
  return patient;
};
```

The one genuinely interesting detail here: **age is computed in SQL, on every single read, and never stored anywhere.** Recall from Part 02 that `patients` only stores `birth_year` — not because storing a full age would be *wrong*, exactly, but because a stored age would need to be updated by something, on every patient, every year, forever (a scheduled job you'd have to remember to run, on infrastructure this project deliberately doesn't have). Instead, `(currentYear::int - birth_year) AS age` computes it fresh, in the query itself, every time — meaning it's automatically, permanently correct with zero maintenance, and the "current year" used is explicitly the *clinic's* current year (`getClinicNow().getFullYear()`, passed in as a parameter), not the database server's own clock, for the same reasoning as everywhere else in this project that "what time/date is it" matters.

## Step 9 — The controller

```ts
// src/controllers/admin.controller.ts
import { Request, Response, NextFunction } from 'express';
import {
  listAppointmentsService, getAppointmentByIdService, confirmAppointmentService,
  cancelAppointmentService, completeAppointmentService, noShowAppointmentService,
  deleteAppointmentService, listAppointmentsByPatientIdService,
} from '../services/appointment.service.js';
import { listPatientsService, getPatientByIdService } from '../services/patient.service.js';
import { AppointmentStatus } from '../types/appointment.types.js';
import { DateRangePreset } from '../utils/clinicTime.js';

export const listAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, search, date_range } = req.query as {
      status?: AppointmentStatus; search?: string; date_range?: DateRangePreset;
    };

    const appointments = await listAppointmentsService({
      ...(status && { status }),
      ...(search && { search }),
      ...(date_range && { dateRange: date_range }),
    });

    res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
};

// listPatients, getPatientProfile, getAppointmentById, confirmAppointment, cancelAppointment,
// completeAppointment, noShowAppointment, deleteAppointment all follow the exact same shape:
// read already-validated input, call one service function, shape the response, next(error) on failure.
```

Two small things worth naming even in this "boring by design" controller:

**The `...(status && { status })` spread pattern.** `listAppointmentsService` expects a `ListAppointmentsFilters` object where each field is either present or entirely absent — not present-but-`undefined`. `...(status && { status })` conditionally spreads in the `{ status }` key only when `status` is truthy; when it's `undefined`, `status && {...}` short-circuits to `undefined`, and spreading `undefined` into an object literal is a no-op (JavaScript specifically allows this). This is a compact, idiomatic way to build "only include this key if this value is actually present" objects without a series of `if` statements manually assigning keys one at a time.

**Reading `req.params.id` as a `number`, not a `string`.** Even though `appointmentIdParamSchema` (Step 2) coerces `id` to a real number and `validate()` (Part 05) overwrites `req.params` with that coerced output, Express's own TypeScript types still describe every `req.params` value as `string` — the types don't know about the runtime coercion that already happened. The actual codebase handles this with a cast: `const { id } = req.params as unknown as { id: number };` — worth knowing this cast exists and *why* it's there (bridging a gap between what actually happens at runtime and what Express's generic types can express), rather than being surprised by it or "fixing" it by removing the coercion that makes it true.

## Step 10 — The full route table

```ts
// src/routes/admin.routes.ts (complete)
import { Router } from 'express';
import { login } from '../controllers/auth.controller.js';
import {
  listAppointments, getAppointmentById, confirmAppointment, cancelAppointment,
  completeAppointment, noShowAppointment, deleteAppointment, listPatients, getPatientProfile,
} from '../controllers/admin.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema } from '../middlewares/validators/login.validator.js';
import {
  listAppointmentsSchema, appointmentIdParamSchema, listPatientsSchema, patientIdParamSchema,
} from '../middlewares/validators/admin.validator.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

export const adminRouter = Router();

adminRouter.post('/login', validate(loginSchema), login);

adminRouter.use(authMiddleware);

adminRouter.get('/appointments', validate(listAppointmentsSchema), listAppointments);
adminRouter.get('/appointments/:id', validate(appointmentIdParamSchema), getAppointmentById);
adminRouter.patch('/appointments/:id/confirm', validate(appointmentIdParamSchema), confirmAppointment);
adminRouter.patch('/appointments/:id/cancel', validate(appointmentIdParamSchema), cancelAppointment);
adminRouter.patch('/appointments/:id/complete', validate(appointmentIdParamSchema), completeAppointment);
adminRouter.patch('/appointments/:id/no-show', validate(appointmentIdParamSchema), noShowAppointment);
adminRouter.delete('/appointments/:id', validate(appointmentIdParamSchema), deleteAppointment);
adminRouter.get('/patients', validate(listPatientsSchema), listPatients);
adminRouter.get('/patients/:id', validate(patientIdParamSchema), getPatientProfile);
```

Notice `PATCH`, not `PUT` or `POST`, for confirm/cancel/complete/no-show. This follows standard REST convention: `PATCH` means "partially modify an existing resource" (exactly what "change this appointment's status" is), whereas `PUT` conventionally means "replace this resource entirely" and `POST` (already used for creating a *new* appointment back in Part 06) means "create something new." Using the method that matches what's actually happening isn't just style — it's information a client (or another developer reading the route table) can rely on without having to read the handler's implementation to know what it does.

## What you should have now

The entire admin dashboard's backend, fully working and fully protected. Test the full range of behavior, not just the happy path: list with no filters, list with each filter individually and combined, confirm a pending appointment, try to complete a future-dated one (should `409`), try to complete one whose time has passed (should succeed), delete one, and confirm every one of these correctly requires a valid token.

**Next:** [Part 11 — Seeding the First Admin](11-seeding-the-first-admin.md) — solving the chicken-and-egg problem this whole part has been quietly assuming was already solved.
