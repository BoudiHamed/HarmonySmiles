# Part 04 — Foundations: Errors & Types

You now have a database and a way to talk to it. Before writing your first real endpoint, build two more foundations that every endpoint from here on will depend on: **a consistent way to fail**, and **a consistent way to describe your data's shape**. Skipping either of these and "adding them later" is exactly how you end up with eight different ad hoc error-response formats and a codebase full of `any`.

## Part A — A consistent way to fail

### The problem with just `throw new Error(...)` everywhere

Imagine a service function detects that a requested appointment slot is already booked. It needs to communicate two different things to whoever eventually responds to the HTTP request: *what went wrong* (a message) and *what HTTP status code this deserves* (`409 Conflict`, in this case — the request is well-formed, but conflicts with the current state of the server). Plain JavaScript `Error` objects only carry a message. If every service just threw plain `Error`s, every controller would need its own guesswork about which status code to send back for which error — or worse, everything becomes a generic `500`, even genuinely expected situations like "that slot's taken" or "that appointment doesn't exist."

### `AppError` — a small subclass that carries a status code

```ts
// src/utils/AppError.ts
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}
```

That's the entire file. It's small on purpose — its only job is to be a *signal*. Later, a service can write:

```ts
throw new AppError('Appointment not found', 404);
```

and whatever eventually catches this error (next section) will know both what to tell the client and what status code to use — without needing to inspect the message string or guess.

The convention this project follows, and one worth adopting yourself: **use `AppError` for anything expected and user-facing** — a booking conflict, a missing resource, invalid credentials. **Use a plain `throw new Error(...)` (or let an unexpected exception propagate naturally) for anything that should genuinely never happen** — a database constraint you didn't anticipate, a bug. Plain errors become a generic `500` (next section), which is exactly right for "something is broken that a client can't do anything about," whereas an `AppError` represents "this specific, anticipated situation happened, and here's the right response for it."

### `error.middleware.ts` — the *only* place status codes get decided

Express has a special kind of middleware: a function with **four** parameters instead of the usual three (`req`, `res`, `next`). Express detects the four-parameter signature specifically and treats that function as an **error handler** — it only gets called when something upstream calls `next(someError)` (or throws inside an `async` handler that's wired to forward to `next`), rather than on every request.

```ts
// src/middlewares/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export const errorMiddleware = (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }

  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ success: false, message: 'Invalid JSON body' });
    return;
  }

  console.error(error);
  res.status(500).json({ success: false, message: 'Internal server error' });
};
```

Walk through the branches in order — they matter:

1. **`ZodError`** — you haven't built any Zod validators yet (that's Part 05), but wiring this branch now means every future validator gets a clean `400` response with field-by-field messages, for free, the moment you introduce it. No controller ever has to know Zod exists.
2. **`AppError`** — reads the status code straight off the error object built in the previous section, and sends the client-safe message. This is the branch every "expected failure" (booking conflict, not-found, bad login) ends up in.
3. **A malformed-JSON `SyntaxError`** — Express's own `express.json()` body parser throws a `SyntaxError` (with a `status` of `400` attached) when a client sends a request body that isn't valid JSON at all. Without this branch, that would fall through to the catch-all below and come back as a `500` — technically wrong, since a malformed request is the *client's* fault (`400`), not the server's.
4. **Everything else — the catch-all.** Anything that reaches here is, by construction, something nobody anticipated: a real bug, a database error you didn't specifically handle, whatever. Two things happen: `console.error(error)` logs the *real* error server-side (where you, the developer, can see the actual stack trace), and the client gets back a deliberately generic `{ message: 'Internal server error' }`. **Never let the real error message or stack trace reach the client** for unanticipated errors — it can leak internal details (table names, file paths, library versions) that are useful to an attacker and meaningless to a legitimate client anyway.

**Why this has to be the *only* place that decides status codes** — not something each controller does with its own `res.status(...)` calls on the error path: consistency. If five different controllers each handled their own errors, you'd inevitably end up with five slightly different response shapes and five different ideas of which errors deserve which status code. Centralizing it means every controller can do the exact same thing on failure — just `next(error)`, or let an `async` function's rejection propagate — and trust that whatever it threw gets turned into the right response, uniformly, everywhere.

**Where this gets mounted matters** — Express only recognizes a function as an error handler by its four-parameter arity, and it only catches errors from routes/middleware registered *before* it in the chain. So in `app.ts`, this has to be the very last thing you call `app.use(...)` with:

```ts
// src/app.ts (partial — you'll add more to this in later parts)
import express from 'express';
import { errorMiddleware } from './middlewares/error.middleware.js';

const app = express();

app.use(express.json());

// ... all your routes go here, registered before the error handler ...

app.use(errorMiddleware); // must be last
export default app;
```

If you registered `errorMiddleware` *before* your routes by mistake, it would simply never fire — Express would fall back to its own default (and much uglier — an HTML page, not JSON) error response instead.

## Part B — A consistent way to describe your data

### Why hand-written types instead of generating them from the database

Some frameworks and ORMs can generate TypeScript types automatically from your database schema. This project doesn't do that — every type is a hand-written interface, organized one file per domain:

```
src/types/
  appointment.types.ts
  patient.types.ts
  admin.types.ts
  auth.types.ts
  express.d.ts
```

The honest tradeoff here: hand-written types can drift out of sync with the real database schema if you change one and forget the other — there's no tooling in this project that would catch that for you. What you get in exchange, for a project this size, is simplicity: no code-generation step to run and keep working, and types that say exactly what you intend them to say, including some things a naive auto-generated type wouldn't capture correctly — most notably, `appointment_date` being typed as `string`, not `Date`, which (as you saw in Part 03) is a deliberate, meaningful choice tied directly to how the `pg` driver was configured, not something a generic schema-to-types tool would necessarily know to do.

### Example: `appointment.types.ts`

```ts
// src/types/appointment.types.ts
import type { Patient } from './patient.types.js';

export type AppointmentStatus = 'Pending' | 'Confirmed' | 'Cancelled' | 'Completed' | 'NoShow';

export interface Appointment {
  id: number;
  patient_id: number;
  appointment_date: string; // 'YYYY-MM-DD' — see db.ts's DATE-parser override
  appointment_time: string; // 'HH:MM:SS'
  visit_reason: string | null;
  status: AppointmentStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// What the admin dashboard actually gets back: an appointment joined with its patient's info.
export interface AppointmentWithPatient
  extends Appointment,
    Pick<Patient, 'first_name' | 'last_name' | 'phone' | 'medical_record_number'> {}

export interface CreateAppointmentDTO {
  first_name: string;
  last_name: string;
  phone: string;
  birth_year: number;
  gender: 'Male' | 'Female';
  email?: string;
  appointment_date: string;
  appointment_time: string;
  visit_reason?: string;
  notes?: string;
}
```

A few patterns worth internalizing here, because you'll repeat them for `patient.types.ts` and `admin.types.ts`:

- **A union type for status** (`'Pending' | 'Confirmed' | ...`), matching the database's own `CHECK` constraint from Part 02 exactly. Now, anywhere in your TypeScript code that a variable is typed `AppointmentStatus`, the compiler will refuse to let you assign it a typo'd value like `'Confrimed'` — a category of bug caught at compile time instead of surfacing as a silent, un-matched status in production.
- **`Appointment` vs. `AppointmentWithPatient`** as two separate interfaces, not one interface with a bunch of optional patient fields. This matches reality: some queries return a bare appointment row; others (Part 10) `JOIN` against `patients` and return more. Using `Pick<Patient, ...>` to lift just the relevant fields from `Patient` rather than retyping `first_name: string` etc. by hand keeps the two types from drifting apart if `Patient` ever changes shape.
- **A `...DTO` type** (`CreateAppointmentDTO` — "Data Transfer Object," a common naming convention for "the shape of data crossing a boundary") separate from the `Appointment` database-row type. These aren't the same thing: `CreateAppointmentDTO` describes what a *client* sends when creating an appointment (no `id`, no `status`, no `created_at` — the server decides those); `Appointment` describes a full row as it exists once stored. Conflating them would mean either your input type has fields a client should never be able to set (like `status`), or your stored-row type has to make everything optional to accommodate incoming data — both are worse than just having two honestly different types for two honestly different purposes.

### `express.d.ts` — teaching TypeScript about your own additions to Express's types

You won't need this until Part 09 (when `auth.middleware.ts` starts attaching a decoded JWT payload to `req.admin`), but it's worth creating the file now and understanding the pattern, since it's a slightly unusual piece of TypeScript:

```ts
// src/types/express.d.ts
import { jwtPayload } from './auth.types.js';

declare global {
  namespace Express {
    interface Request {
      admin?: jwtPayload;
    }
  }
}

export {};
```

This is called **module augmentation** — you're not creating a new type, you're reaching into a type that already exists (Express's own `Request` interface, defined inside the `@types/express` package) and adding a field to it. Without this, if `auth.middleware.ts` wrote `req.admin = someDecodedToken`, TypeScript would reject it — `Request` has no `admin` field as far as the compiler knows — forcing every file that reads `req.admin` later to use an unsafe cast like `(req as any).admin` just to silence the compiler. This one file, written once, means `req.admin` is fully and correctly typed (`jwtPayload | undefined`) everywhere in the project, with no casts needed anywhere else.

## What you should have now

`AppError`, `error.middleware.ts` wired into `app.ts` as the last middleware, and the beginnings of `src/types/`. Nothing user-facing exists yet — but the plumbing that will make every future feature's failures behave consistently is in place.

**Next:** [Part 05 — The Validation Layer](05-validation-layer.md), where you'll make sure bad input never even reaches a controller in the first place.
