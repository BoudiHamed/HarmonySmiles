# Part 06 — The First Vertical Slice: Booking an Appointment

Everything up to this point has been foundation — a database, a connection layer, error handling, validation plumbing. None of it does anything a user could actually experience yet. This part changes that: you're going to build `POST /api/appointments` completely, top to bottom, and by the end you'll have a real, working feature. This is also where the layered folder structure from Part 01 stops being an abstract idea and starts paying for itself, because you'll feel the boundaries between each layer as you build them.

The four layers you're about to write, in the order data actually flows through them on a real request:

```
Route  →  Validator  →  Controller  →  Service  →  Database
(what URL+method)  (is the input valid?)  (HTTP glue)  (the actual logic)
```

## Step 1 — The validator: `createAppointmentSchema`

Start here, not with the route, because you can't sensibly write a controller until you know exactly what shape of data it's guaranteed to receive.

```ts
// src/middlewares/validators/appointment.validator.ts
import { z } from 'zod';
import { getClinicNow, getMaxBookableDate, isClinicClosedOn } from '../../utils/clinicTime.js';

const currentYear = new Date().getFullYear();

export const createAppointmentSchema = z
  .object({
    body: z
      .object({
        first_name: z.string({ error: 'First name is required' }).trim().min(3).max(50),
        last_name: z.string({ error: 'Last name is required' }).trim().min(3).max(50),
        phone: z.string({ error: 'Phone number is required' }).trim().regex(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number' }),
        birth_year: z.coerce.number({ error: 'Birth year is required' }).int().min(1900).max(currentYear),
        gender: z.enum(['Male', 'Female'], { error: 'Gender must be Male or Female' }),
        email: z.union([z.string().trim().email(), z.literal('')]).optional(),
        appointment_date: z.string({ error: 'Appointment date is required' }).regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' }),
        appointment_time: z.string({ error: 'Appointment time is required' }).regex(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, { message: 'Time must be in HH:MM:SS format' }),
        visit_reason: z.string().trim().max(500).optional(),
        notes: z.string().trim().max(1000).optional(),
      })
      .strict(),
  })
  .superRefine((data, ctx) => {
    const appointment = new Date(`${data.body.appointment_date}T${data.body.appointment_time}`);

    if (isNaN(appointment.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body', 'appointment_date'], message: 'Invalid appointment date or time' });
      return;
    }

    if (appointment <= getClinicNow()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body', 'appointment_date'], message: 'Appointment must be in the future' });
    }

    const [yearStr, monthStr, dayStr] = data.body.appointment_date.split('-');
    const appointmentDateOnly = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));

    if (isClinicClosedOn(appointmentDateOnly)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body', 'appointment_date'], message: 'Clinic is closed on Saturdays and Sundays' });
    }

    if (appointmentDateOnly > getMaxBookableDate()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body', 'appointment_date'], message: 'Appointments can only be booked up to 1 month in advance' });
    }
  });
```

Most of these field rules are the straightforward kind Part 05 already covered (`.trim()`, `.min()`/`.max()`, `.regex()`). Three things here are worth pausing on:

**Why `birth_year` uses `z.coerce.number()` instead of plain `z.number()`.** Every value that arrives via an HTTP request body is, at the JSON level, whatever type the client sent — a JSON `number` would already parse as a number, but this project's frontend (Part 12) happens to send it as a string from a plain HTML input. `z.coerce.number()` attempts to convert the incoming value to a number *before* validating it as one, rather than rejecting a perfectly reasonable `"1990"` just because it wasn't already the exact right JavaScript type. This is exactly the kind of transform that only actually takes effect because Part 05's `validate()` middleware overwrites `req.body` with Zod's parsed output — worth re-reading that part now if this connection isn't clicking yet.

**Why `email` is `z.union([z.string().email(), z.literal('')])` instead of just `z.string().email().optional()`.** A plain optional field means "this field can be entirely absent." But an HTML form's email input, left blank, doesn't omit the field — it sends an empty string. `z.string().email()` alone would reject `""` as "not a valid email," which is the wrong failure for a field the user simply chose not to fill in. The union says: accept either a real, valid email address, *or* exactly an empty string (which then gets stripped out before reaching the database — see Step 4). This is a small detail, but it's the kind of thing that, if you get it wrong, produces a confusing validation error for a completely reasonable user action.

**Why the date/time logic needs `.superRefine()` instead of just more field-level rules.** Zod's per-field methods (`.min()`, `.regex()`, etc.) can only look at *one field in isolation*. "Is this appointment in the future" requires comparing `appointment_date` **and** `appointment_time` **together** against the current moment — a genuinely cross-field check, which is exactly what `.superRefine()` is for: it runs after the individual fields have already passed their own checks, with access to the *entire* parsed object at once, and can add validation issues based on any combination of fields.

Notice something easy to miss: the future-check compares against `getClinicNow()` — **the clinic's own local time**, not the server's. This project's clinic is physically in Switzerland; the server (and definitely a developer's own laptop) might be running in a completely different timezone. If this check compared against the server's raw `new Date()`, a booking that's clearly in the past by the clinic's clock could pass validation just because the server happens to be several hours behind — or a genuinely valid near-future booking could get wrongly rejected the other way. `getClinicNow()` is what makes this comparison mean the same thing regardless of where the server physically runs; it's built in Part 07, but it's worth knowing *why* it exists the moment you first use it, here.

## Step 2 — The route

```ts
// src/routes/public.routes.ts
import { Router } from 'express';
import { createAppointment, getAvailableSlots } from '../controllers/appointments.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createAppointmentSchema } from '../middlewares/validators/appointment.validator.js';
import { availableSlotsSchema } from '../middlewares/validators/general.validator.js';

export const publicRouter = Router();

publicRouter.post('/appointments', validate(createAppointmentSchema), createAppointment);
publicRouter.get('/available-slots', validate(availableSlotsSchema), getAvailableSlots);
```

(You'll build `getAvailableSlots` and `availableSlotsSchema` in Part 07 — including the second line here now just means you won't need to revisit this file later.)

This file is deliberately dumb — it does exactly one thing: says "a `POST` to `/appointments` gets validated by `createAppointmentSchema`, then handled by `createAppointment`." No logic, no database access, nothing else. If you ever find yourself wanting to put an `if` statement in a route file, that's a sign it belongs one layer down, in the controller or service instead.

Then mount it in `app.ts`:

```ts
// src/app.ts
import express from 'express';
import cors from 'cors';
import { publicRouter } from './routes/public.routes.js';
import { errorMiddleware } from './middlewares/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', publicRouter);
app.use(errorMiddleware);

export default app;
```

`app.use('/api', publicRouter)` prefixes every route in `publicRouter` with `/api` — so `POST /appointments` (as written in the router) actually becomes reachable at `POST /api/appointments`. This is worth internalizing as a real, historical lesson from this exact project: **a route existing in a router file is not the same thing as that route being reachable.** Early in this project's actual history, a public router was fully written — correct validator, correct controller, correct service, all of it — but the line mounting it onto `app` was simply never added. Every individual file was correct in isolation, and the feature was completely unreachable over HTTP anyway. There is no automated check that catches "you wrote a router but forgot to mount it" — the only way to know is to actually make the HTTP request and see it 404. Test the full path, not just the pieces, once you think a feature is done.

## Step 3 — The controller

```ts
// src/controllers/appointments.controller.ts
import { Request, Response, NextFunction } from 'express';
import { createAppointmentService } from '../services/appointment.service.js';

export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const newAppointment = await createAppointmentService(req.body);
    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      data: newAppointment,
    });
  } catch (error) {
    next(error);
  }
};
```

This is about as thin as a controller gets, and that's the point. By the time execution reaches this function, `req.body` has already been validated *and coerced* (Part 05) — the controller doesn't re-check anything. Its entire job is: call exactly one service function, and shape the HTTP response around whatever it returns. `201 Created` (not `200 OK`) is the correct status specifically because this request created a new resource — a small detail, but the kind of thing worth getting right rather than defaulting everything to `200`.

The `try`/`catch` pattern here — call the service, and on any thrown error just `next(error)` — is what every controller in this project does, without exception. It never inspects *what kind* of error it caught; it doesn't need to, because `error.middleware.ts` (Part 04) already knows how to turn an `AppError`, a `ZodError`, or an unexpected exception into the right response. This uniformity is only possible because Part 04 was built first.

## Step 4 — The service: the real logic, and the actual database transaction

This is the most important function you'll write in this whole guide — it's the one place multiple earlier parts (the database's partial unique index, `withTransaction`, `AppError`) all come together at once.

```ts
// src/services/appointment.service.ts
import { query, withTransaction } from '../config/db.js';
import { DatabaseError } from 'pg';
import { Appointment, CreateAppointmentDTO } from '../types/appointment.types.js';
import { AppError } from '../utils/AppError.js';

export const createAppointmentService = async (data: CreateAppointmentDTO): Promise<Appointment> => {
  try {
    return await withTransaction(async (client) => {
      const upsertPatientText = `
        INSERT INTO patients (id, medical_record_number, first_name, last_name, phone, birth_year, gender, email)
        VALUES (
          nextval('patients_id_seq'),
          'HS-' || to_char(now(), 'YYYY') || '-' || lpad(currval('patients_id_seq')::text, 4, '0'),
          $1, $2, $3, $4, $5, $6
        )
        ON CONFLICT (phone) DO NOTHING
        RETURNING id
      `;
      const upsertPatientRes = await client.query<{ id: number }>(upsertPatientText, [
        data.first_name, data.last_name, data.phone, data.birth_year, data.gender, data.email ?? null,
      ]);

      let patientId: number;
      const [insertedPatient] = upsertPatientRes.rows;

      if (insertedPatient) {
        patientId = insertedPatient.id;
      } else {
        const patientCheckRes = await client.query<{ id: number }>(
          'SELECT id FROM patients WHERE phone = $1 LIMIT 1',
          [data.phone]
        );
        const [existingPatient] = patientCheckRes.rows;
        if (!existingPatient) throw new Error('failed to insert the new patient data');
        patientId = existingPatient.id;
      }

      const insertAppointmentText = `
        INSERT INTO appointments (patient_id, appointment_date, appointment_time, visit_reason, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const appointmentRes = await client.query<Appointment>(insertAppointmentText, [
        patientId, data.appointment_date, data.appointment_time, data.visit_reason ?? null, data.notes ?? null,
      ]);

      const [createdAppointment] = appointmentRes.rows;
      if (!createdAppointment) throw new Error('failed to book the appointment');

      return createdAppointment;
    });
  } catch (error: unknown) {
    if (error instanceof DatabaseError && error.constraint === 'unique_active_appointment') {
      throw new AppError('failed to book the appointment try again later.', 409);
    }
    throw error;
  }
};
```

Take this apart piece by piece — there's a lot of deliberate reasoning packed into a fairly short function.

### Why this needs a transaction at all

A single booking request touches **two** tables: it needs a `patients` row (creating one if this phone number is new, or reusing the existing one if it's a returning patient), and it needs an `appointments` row referencing that patient. These two writes must succeed or fail *together*. If the patient insert succeeded but the appointment insert then failed for some reason, you'd be left with an orphaned patient row and no appointment — a partial, inconsistent result nobody asked for. `withTransaction` (built in Part 03) is exactly the tool for this: everything inside the callback either all commits, or all rolls back, with the `client` parameter it hands you being the one connection every statement inside must use, so they're all part of the same atomic unit.

### The patient upsert — and why it's one clever `INSERT`, not "check, then insert"

The tempting, simpler-looking approach would be: `SELECT` to check if a patient with this phone already exists; if not, `INSERT` a new one. **Don't do this** — it has the exact same race condition problem the database's `unique_active_appointment` index (Part 02) exists to prevent, just applied to `patients.phone` instead of appointment slots. Two booking requests for a brand-new phone number, arriving within milliseconds of each other, could both run the `SELECT`, both see "no existing patient," and both then try to `INSERT` — and now you're relying on `patients.phone`'s `UNIQUE` constraint to reject the second one with a raw database error you haven't specifically planned for.

The actual code sidesteps this with `INSERT ... ON CONFLICT (phone) DO NOTHING RETURNING id` — a single atomic statement. Postgres itself handles the "does this already exist" check as part of the insert attempt, with no window for a second request to sneak in between a check and a write. Two possible outcomes:
- **The phone is new**: the row inserts, `RETURNING id` hands back the new row's id, and `upsertPatientRes.rows` has one row in it.
- **The phone already exists**: `ON CONFLICT (phone) DO NOTHING` means Postgres skips the insert entirely and quietly returns *no* row — so `upsertPatientRes.rows` is empty. The code then falls back to a plain `SELECT ... WHERE phone = $1` to fetch the *existing* patient's id instead.

### The medical record number — generated from the very id it labels

```sql
'HS-' || to_char(now(), 'YYYY') || '-' || lpad(currval('patients_id_seq')::text, 4, '0'),
```

This builds something like `HS-2026-0042` directly inside the `INSERT` statement, from three pieces: a fixed prefix, the current year, and a zero-padded sequence number. The interesting part is `nextval('patients_id_seq')` (used for the `id` column itself, a few lines above this one) followed by `currval('patients_id_seq')` (used here) — `nextval` advances Postgres's internal id-generating sequence and returns the new value; `currval` reads back *the same value this session just generated*, without advancing it again. This guarantees the medical record number is derived from the row's *own* id, atomically, within the same statement — there's no separate "generate an MRN" step that could theoretically read a different, already-stale id if another insert happened in between. A separate MRN-generation utility function, called as a second step after the insert, would reintroduce exactly the kind of race condition the rest of this function goes out of its way to avoid.

(One honest side effect worth knowing about, not a bug: `nextval()` always advances the sequence, even on the `ON CONFLICT` branch where the row doesn't actually get inserted. This means id numbers — and therefore MRN numbers — can have small gaps over time. That's harmless; Postgres sequences are only ever guaranteed to hand out unique, increasing numbers, never a guarantee of *no gaps*. It's not something to "fix.")

### Catching the double-booking error, outside the transaction

If two clients really do race to book the exact same slot, the *second* one's `INSERT INTO appointments` will violate the `unique_active_appointment` partial unique index from Part 02, and `pg` will throw a `DatabaseError` with a `.constraint` property naming exactly which constraint was violated. The `catch` block at the very bottom checks specifically for that constraint name and rethrows it as a clean `AppError('...', 409)` — a "Conflict" the client can actually understand and act on ("try a different slot"), instead of a raw, unfriendly database error surfacing as an opaque `500`.

Notice this `catch` sits **outside** the `withTransaction(...)` call, wrapping the whole thing — not inside it. `withTransaction` already rolls the transaction back automatically on any thrown error (Part 03) and then rethrows that same error unchanged; this outer `catch` is purely about translating that already-rolled-back error into the right shape for the client, not about the transaction's own success/failure logic.

## What you should have now

A fully working `POST /api/appointments`. Test it for real — with a tool like `curl`, Postman, or Thunder Client — and confirm three things actually happen: a first booking for a brand-new phone number succeeds and creates both a patient and an appointment; a second booking using the *same* phone number succeeds too, but reuses the existing patient (check the database — there should be exactly one row in `patients` for that phone, however many appointments they've booked); and attempting to book the *exact same date and time* twice returns a clean `409`, not a crash.

**Next:** [Part 07 — Clinic Time & Available Slots](07-clinic-time-and-available-slots.md), where you'll build `getClinicNow()` (used above but not yet written) and the second public endpoint: showing which slots are actually free.
