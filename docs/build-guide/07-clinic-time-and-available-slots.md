# Part 07 — Clinic Time & Available Slots

Part 06 used a function — `getClinicNow()` — that doesn't exist yet. This part builds it, along with everything else needed for the second public endpoint, `GET /available-slots`. It's worth its own part because "what time is it, really, for the purposes of this app" turns out to be a surprisingly deep question, and getting it wrong is one of the easiest ways to ship a subtly broken booking system.

## Step 1 — The core problem: three different clocks

At any given moment, there are (at least) three different "current times" potentially in play:

1. **The server's own clock**, in whatever timezone the machine running Node happens to be configured for.
2. **The database server's clock**, potentially a *different* machine, potentially a different timezone again.
3. **The clinic's actual local time** — Zurich, Switzerland, in this project's case.

Only the third one is what actually matters for deciding "is this appointment slot in the past" or "is the clinic open today." If your code just calls `new Date()` and trusts it, you're actually asking "what time is it where the server process happens to be running" — which, for a cloud-hosted server, could be almost anywhere, and has nothing to do with when the clinic is actually open. This project's own history hit exactly this bug once already — an earlier version of this code hardcoded the wrong timezone entirely (based on where a developer's own machine happened to be, not where the clinic actually is), and it silently made every "is this appointment in the future" and "is the clinic open today" check wrong by a few hours until it was caught and fixed.

The fix: **centralize "what time is it for the clinic" into one file, used by everything else that needs to know**, so there's exactly one place that can be right or wrong, instead of the same logic duplicated (and potentially each duplicate subtly different) in four places.

## Step 2 — `getClinicNow()`, and the trick that makes it work

```ts
// src/utils/clinicTime.ts
export const CLINIC_TIMEZONE = 'Europe/Zurich';

export const getClinicNow = (): Date => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: CLINIC_TIMEZONE }));
};
```

Two lines, but worth slowing down on, because the trick here is genuinely non-obvious the first time you see it.

`new Date()` gives you the current real instant in time, as always. `.toLocaleString('en-US', { timeZone: CLINIC_TIMEZONE })` formats that instant *as a string*, specifically as it would read on a clock in Zurich right now — regardless of what timezone the server itself is in. So far, that's just a display string, like `"8/25/2026, 4:30:00 PM"`.

The trick is wrapping that string back in `new Date(...)`. When you construct a `Date` from a string like that (no explicit timezone/offset in it), JavaScript parses it **as if it were local time** — meaning, local to whatever timezone the *code doing the parsing* is running in. So this constructs a `Date` object whose underlying instant, when later read back out using the server's own local-time getters (`.getHours()`, `.getDate()`, etc. — which always report in the server's own timezone), reports exactly the *clinic's* wall-clock numbers. The round trip — format as clinic-local, then parse as if it were server-local — cancels out in exactly the way needed: every place downstream that reads `.getHours()`/`.getDate()`/`.getDay()` off the result of `getClinicNow()` gets the clinic's actual local numbers back, no matter what timezone the server process itself happens to be running in.

This is a real, working pattern — but it's honest to flag its one sharp edge, documented directly in this project rather than hidden: it can theoretically misparse during the **server's own local** daylight-saving-time transition window (the one or two hours a year where a local time is briefly ambiguous or skipped entirely). This is narrow, has never actually been observed to cause a problem in this project, and only matters at all if the server happens to run in a DST-observing timezone during that specific window. It's a known, accepted, documented limitation — not a silently-hidden bug — which is the right way to carry a limitation like this rather than pretending it doesn't exist.

## Step 3 — Everything else in `clinicTime.ts`, built on top of `getClinicNow()`

```ts
const CLOSED_WEEKDAYS = [0, 6]; // Sunday, Saturday

export const isClinicClosedOn = (date: Date): boolean => {
  return CLOSED_WEEKDAYS.includes(date.getDay());
};
```

A direct, simple check — `Date.prototype.getDay()` returns `0` for Sunday through `6` for Saturday. Worth noting for anyone tempted to "correct" this later based on assumptions from a different region: this clinic is genuinely closed Saturday **and** Sunday, both — confirmed against the real spec for this specific clinic (which is in Switzerland), not a leftover from some other assumption. If you're adapting this project for a clinic with different hours, this is the one line to change.

```ts
export const getMaxBookableDate = (): Date => {
  const now = getClinicNow();
  const targetMonth = now.getMonth() + 1;
  const lastDayOfTargetMonth = new Date(now.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(now.getFullYear(), targetMonth, Math.min(now.getDate(), lastDayOfTargetMonth));
};
```

This computes "the same day, one month from now" — the cutoff for how far in advance someone can book. It looks more complicated than `now.getMonth() + 1` alone, and that complexity is earning its keep. Walk through why a naive version breaks: if today is January 31st, "next month, same day" naively computed would try to construct "February 31st" — a date that doesn't exist. JavaScript's `Date` constructor doesn't error on this; it silently *overflows* into the next month instead, quietly handing you March 2nd or 3rd. That's not "one month out" anymore, it's closer to five weeks — a real, silent widening of the booking window that nobody asked for and nothing would visibly flag.

The fix here is the `new Date(year, targetMonth + 1, 0)` trick: in JavaScript, a `Date` constructed with day `0` gives you the *last day of the previous month* — so `new Date(year, targetMonth + 1, 0)` gives you the last day of `targetMonth` itself. Once you know that, `Math.min(now.getDate(), lastDayOfTargetMonth)` clamps correctly: on January 31st, the target month is February, its last day is the 28th (or 29th), and `Math.min(31, 28)` gives you 28 — so "next month" correctly lands on February 28th, not an overflowed March date. This is worth internalizing as a general pattern, not just memorizing for this one function: **whenever you do month arithmetic in JavaScript, explicitly clamp against the target month's actual last day** — never assume every month has as many days as the one you started in.

```ts
const pad = (n: number): string => n.toString().padStart(2, '0');
const toISODate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const getClinicTodayISODate = (): string => toISODate(getClinicNow());

export const getClinicNowDateTime = (): { date: string; time: string } => {
  const now = getClinicNow();
  return {
    date: toISODate(now),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  };
};
```

Two small formatting helpers on top of `getClinicNow()`. `getClinicTodayISODate()` gives you today's date as a plain `'YYYY-MM-DD'` string — directly comparable to `appointments.appointment_date`, which (recall Part 03) is also stored and read as a plain string, not a `Date` object. Because `'YYYY-MM-DD'` strings happen to sort in the same order lexicographically as they do chronologically, you can compare two of these strings with plain `<`/`>`/`>=` and get a chronologically correct answer, with no date-parsing needed at all — a small but genuinely useful property you'll lean on again in Part 10.

```ts
export const hasAppointmentDateTimePassed = (date: string, time: string): boolean => {
  const [yearStr, monthStr, dayStr] = date.split('-');
  const [hourStr, minuteStr, secondStr = '0'] = time.split(':');
  const appointmentDateTime = new Date(
    Number(yearStr), Number(monthStr) - 1, Number(dayStr),
    Number(hourStr), Number(minuteStr), Number(secondStr)
  );
  return getClinicNow() >= appointmentDateTime;
};
```

You'll use this in Part 10 to stop an admin from marking a future appointment as "Completed" or "No Show" before it's actually happened. Both sides of the `>=` comparison are built the same way — as plain numbers fed into `new Date(...)`, which JavaScript interprets using the *server's own* local timezone — so even though neither side has been explicitly converted to "clinic time" at this exact line, they're both going through the identical interpretation rule, which keeps the comparison internally consistent regardless of what timezone the server happens to be in. This is a subtle enough point that it's fine if it takes a re-read to fully land; the practical takeaway is simpler: don't "simplify" this by mixing a plain server-local `new Date()` with a `getClinicNow()`-derived value elsewhere without thinking through whether both sides are still using a consistent interpretation.

```ts
export type DateRangePreset = 'today' | 'tomorrow' | 'week' | 'month' | 'upcoming' | 'previous';

export const getDateRangeForPreset = (preset: DateRangePreset): { from?: string; to?: string } => {
  // today / tomorrow / week / month / upcoming / previous —
  // see Part 10 for how the admin dashboard actually uses each of these.
  // ...
};
```

You'll build this one out fully in Part 10, once there's an actual admin dashboard filter to use it for — it's mentioned here just so you know it lives in this same file, for the same reason as everything else above: it's another piece of "what does a calendar date mean, relative to right now, for this clinic," and belongs with the rest of that logic rather than scattered into whichever controller happens to need it first.

## Step 4 — `generateSlots.ts`: a pure function, deliberately with no database access

```ts
// src/utils/generateSlots.ts
import { getClinicNow, isClinicClosedOn } from './clinicTime.js';

const CLINIC_OPEN_HOUR = 10;
const CLINIC_CLOSE_HOUR = 18;
const SLOT_MINUTES = 30;

const pad = (n: number): string => n.toString().padStart(2, '0');

export const generateAvailableSlots = (date: string, bookedTimes: string[]): string[] => {
  const [yearStr, monthStr, dayStr] = date.split('-');
  const targetDate = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));

  if (isClinicClosedOn(targetDate)) return [];

  const now = getClinicNow();
  const isToday = targetDate.toDateString() === now.toDateString();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slotCount = ((CLINIC_CLOSE_HOUR - CLINIC_OPEN_HOUR) * 60) / SLOT_MINUTES;
  const dayMinutes = Array.from({ length: slotCount }, (_, i) => CLINIC_OPEN_HOUR * 60 + i * SLOT_MINUTES);

  return dayMinutes
    .filter((minutes) => !isToday || minutes > nowMinutes)
    .map((minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`)
    .filter((time) => !bookedTimes.includes(time));
};
```

Notice what this function does **not** do: it never imports `db.ts`, never runs a query. It takes `bookedTimes` as a plain argument — a list of already-booked time strings for that date — and its entire job is pure computation: generate every 30-minute slot between opening and closing time, drop any that have already passed if the requested date is today, and drop any that appear in `bookedTimes`.

This separation is deliberate, and it's a pattern worth applying broadly, not just here: **keep pure logic (no side effects, same input always gives the same output) separate from the code that fetches the data that logic needs.** The immediate, concrete payoff: this function is trivially easy to reason about and to test in isolation — you can call `generateAvailableSlots('2026-03-05', ['10:00:00', '10:30:00'])` directly and know exactly what you should get back, with no database, no server, nothing else running. If this function reached into the database itself, you couldn't do that — you'd need a real database connection and real rows just to check whether the *math* is right.

## Step 5 — The service that fetches the real data and hands it to the pure function

```ts
// src/services/appointment.service.ts (add this alongside createAppointmentService)
import { generateAvailableSlots } from '../utils/generateSlots.js';

export const getAvailableSlotsService = async (date: string): Promise<string[]> => {
  const bookedRes = await query<{ appointment_time: string }>(
    `SELECT appointment_time FROM appointments WHERE appointment_date = $1 AND status IN ('Pending', 'Confirmed')`,
    [date]
  );

  const bookedTimes = bookedRes.rows.map((row) => row.appointment_time);
  return generateAvailableSlots(date, bookedTimes);
};
```

This is the layer that *does* touch the database — it's a plain `query()` call (no transaction needed; this is a single read, not a multi-step write), fetching only the `appointment_time`s already booked for that date. Notice the same status filter as the partial unique index from Part 02: `status IN ('Pending', 'Confirmed')` — a `Cancelled` appointment's old slot should show up as available again, and this query is careful to only treat genuinely *active* bookings as occupying a slot, exactly mirroring what the database's own uniqueness rule considers "active."

## Step 6 — Validator, controller, and route for `GET /available-slots`

```ts
// src/middlewares/validators/general.validator.ts
import { z } from 'zod';
import { getClinicNow, getMaxBookableDate } from '../../utils/clinicTime.js';

export const availableSlotsSchema = z
  .object({
    query: z
      .object({
        date: z.string({ error: 'Date is required' }).regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' }),
      })
      .strict(),
  })
  .superRefine((data, ctx) => {
    const [yearStr, monthStr, dayStr] = data.query.date.split('-');
    const requestedDate = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));

    if (isNaN(requestedDate.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['query', 'date'], message: 'Invalid date' });
      return;
    }

    const now = getClinicNow();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (requestedDate < today) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['query', 'date'], message: 'Date must not be in the past' });
    }
    if (requestedDate > getMaxBookableDate()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['query', 'date'], message: 'Date must be within 1 month from today' });
    }
  });
```

This is the first schema in the project that validates `query` rather than `body` — go back and re-check Part 05's `validate.middleware.ts` if you want a reminder of exactly why that specific branch needs `Object.defineProperty` instead of a plain assignment (Express 5's getter-only `req.query`). Everything else here follows the same `.superRefine()` pattern from Part 06's booking validator, reusing the exact same `getMaxBookableDate()`/`getClinicNow()` helpers — which is the entire payoff of having centralized them in Part 07 rather than each validator inventing its own version.

```ts
// src/controllers/appointments.controller.ts (add this alongside createAppointment)
export const getAvailableSlots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { date } = req.query as { date: string };
    const slots = await getAvailableSlotsService(date);
    res.status(200).json({ success: true, data: slots });
  } catch (error) {
    next(error);
  }
};
```

Same thin-controller shape as Part 06 — read already-validated input, call one service function, shape the response, forward errors. The route wiring (`publicRouter.get('/available-slots', validate(availableSlotsSchema), getAvailableSlots)`) was already added in Part 06's `public.routes.ts`, so there's nothing left to change there.

## What you should have now

Both public endpoints fully working: `POST /api/appointments` and `GET /api/available-slots?date=YYYY-MM-DD`. Test the interaction between them directly — book a slot, then call `available-slots` for that same date, and confirm the slot you just took no longer appears in the list. Then cancel that appointment directly in the database (`UPDATE appointments SET status = 'Cancelled' WHERE id = ...`) and confirm the slot reappears — that's the partial unique index and this endpoint's status filter agreeing with each other, exactly as designed back in Part 02.

**Next:** [Part 08 — Admin Authentication](08-admin-authentication.md), where the project's second half begins: everything behind a login screen.
