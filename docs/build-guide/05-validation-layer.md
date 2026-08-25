# Part 05 — The Validation Layer

## Why validation is its own layer, not something a controller does inline

Every piece of data a client sends — a request body, a query string, a URL parameter — arrives as untyped, unverified text. A controller that just reads `req.body.birth_year` and hands it straight to a database query is trusting the client completely: to send a number where a number is expected, to not send fields it shouldn't, to not send a date string that isn't actually a valid date. Any of those assumptions being wrong can crash your server, corrupt your data, or (in the worst case) open a security hole.

The naive fix is to hand-check each field at the top of every controller: `if (!req.body.first_name) return res.status(400)...`. This "works," but it doesn't scale — every controller ends up with a wall of repetitive checks before its actual logic even starts, and it's extremely easy to forget one field, or to check it slightly differently in one controller than another.

This project solves it with two pieces working together: **Zod** (a schema-validation library) to *describe* what valid input looks like, declaratively, per-endpoint; and one **generic middleware** that *applies* any Zod schema, uniformly, before a request ever reaches a controller. Build the generic middleware first — it's a small amount of code that immediately every future validator gets to reuse.

## Step 1 — What Zod actually buys you

A Zod schema is both a runtime validator *and* a TypeScript type, generated from the same definition, so they can never drift apart. A minimal example — the schema for the admin login endpoint, which is the simplest one in this project and a good first one to write:

```ts
// src/middlewares/validators/login.validator.ts
import { z } from 'zod';

export const loginSchema = z.object({
  body: z
    .object({
      username: z.string({ error: 'Username is required' }).trim().min(1, 'Username is required'),
      password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
    })
    .strict(),
});
```

A few things worth calling out even in this simple example:

- **The schema wraps `body` in an outer object** (`z.object({ body: z.object({...}) })`), rather than just describing the body directly. This looks redundant for a single-source schema like this one, but it's what lets the *same* generic middleware (Step 2) validate `body`, `query`, and `params` uniformly for every endpoint — some endpoints only care about `body` (like this one), some only about `query` (available-slots), some about `params` (an appointment id in a URL) — and some, later, about more than one at once.
- **`.strict()`** — without this, Zod's default behavior is to silently *ignore* extra fields it didn't ask for. `.strict()` flips that: any field present in the input that isn't declared in the schema causes validation to fail. This matters more than it might seem — it means a client can never send unexpected extra data that quietly gets ignored (which could mask a client-side bug) or, worse, that some future careless code change starts reading from without it ever having been validated.
- **`.trim()`** — Zod doesn't just validate, it can also *transform*. `.trim()` strips leading/trailing whitespace before the `.min(1, ...)` check runs, so a username of `"   "` (all spaces) correctly fails the "required" check instead of technically passing because it has a nonzero length.
- **Custom error messages** (`'Username is required'`) — these are what a client actually sees in the `400` response's `errors` array (built by `error.middleware.ts` in Part 04), so writing them from the client's perspective, not the developer's, is worth the extra few words.

## Step 2 — One generic `validate()` middleware for every schema

```ts
// src/middlewares/validate.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

export const validate = (schema: ZodType) => (req: Request, _res: Response, next: NextFunction): void => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });

  if (!result.success) {
    next(result.error);
    return;
  }

  const parsed = result.data as { body?: unknown; query?: unknown; params?: unknown };
  if (parsed.body !== undefined) req.body = parsed.body;

  if (parsed.query !== undefined) {
    Object.defineProperty(req, 'query', {
      value: parsed.query,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  if (parsed.params !== undefined) req.params = parsed.params as Request['params'];

  next();
};
```

This is a **middleware factory** — `validate(schema)` doesn't validate anything itself; it *returns* a new middleware function that's specific to whatever `schema` you passed it. That returned function is what actually runs when a request comes in. This is the pattern that lets you write, in a route file:

```ts
router.post('/admin/login', validate(loginSchema), login);
```

— one line, reusable for every endpoint in the project, regardless of what its schema looks like.

Walk through what it does on each request:

1. **`schema.safeParse({ body: req.body, query: req.query, params: req.params })`** — bundles all three possible sources of client input into one object and hands it to Zod. `safeParse` (as opposed to `parse`) never throws — it returns a result object with either `{ success: true, data }` or `{ success: false, error }`, which is exactly what you want in middleware, where you want to handle the failure case explicitly rather than wrapping everything in a `try`/`catch`.
2. **On failure** — `next(result.error)` forwards the raw `ZodError` straight to Express's error-handling chain, where `error.middleware.ts` (Part 04) is already waiting with a dedicated branch for exactly this type, producing a clean `400` with per-field messages. The validation middleware itself doesn't know or care about response formatting — that's not its job.
3. **On success — this is the part that's easy to get wrong or skip, and shouldn't be:** overwrite `req.body`/`req.query`/`req.params` with the **parsed output**, not just let the request continue with its original raw input. Why this matters: Zod schemas can *transform* data as part of validation — the clearest example you'll hit later is `z.coerce.number()` on a `birth_year` field, which turns the string `"1990"` (every value arriving via HTTP is technically a string at the network level, even where a client's own JavaScript type is a number) into the actual number `1990`. If this middleware only validated and never replaced `req.body`, that coercion would happen and then be silently thrown away — every downstream controller and service would still see the original raw string. Replacing the request object with Zod's own parsed output is what makes coercion (and any other transform, like `.trim()`) actually *take effect* for the rest of the request's lifetime, not just during the validation check itself.

### The Express 5 gotcha hiding in that `query` branch

Notice `req.query` isn't reassigned the same simple way as `req.body`/`req.params` (`req.query = parsed.query`) — it goes through `Object.defineProperty` instead. This isn't stylistic preference; it's a real, easy-to-hit bug if you don't know about it. **Express 5 defines `req.query` as a getter-only accessor** — it's computed from the raw URL on access, with no corresponding setter. A plain assignment throws at runtime:

```
TypeError: Cannot set property query of #<IncomingMessage> which has only a getter
```

`Object.defineProperty(req, 'query', { value: ..., writable: true, configurable: true, enumerable: true })` sidesteps this by *replacing the property descriptor itself* rather than trying to invoke a setter that doesn't exist. This specific issue only surfaces the first time a schema actually validates `query` (as opposed to just `body`) — which is exactly the kind of bug that's easy to not discover until you build the *second* type of endpoint, if you didn't know to watch for it going in. Now you do.

## Step 3 — Wiring a validator into a route

Once you have a schema and the generic middleware, using it is a single line, placed *before* the controller in the route definition:

```ts
// src/routes/admin.routes.ts (the login line — full file built out in later parts)
import { Router } from 'express';
import { login } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema } from '../middlewares/validators/login.validator.js';

export const adminRouter = Router();
adminRouter.post('/login', validate(loginSchema), login);
```

Because middleware runs in the order it's listed, `validate(loginSchema)` always executes — and either rejects the request or normalizes it — *before* the `login` controller function ever runs. The controller can now trust, unconditionally, that `req.body.username` and `req.body.password` exist and are non-empty strings, with zero validation code of its own. That trust is the entire payoff of building this layer first.

## What you should have now

`validate.middleware.ts`, a working `loginSchema`, and the general pattern you'll now repeat — with progressively more interesting logic — for every other endpoint in the project. The next part puts this together with everything from Parts 01–04 to build the first complete, working feature.

**Next:** [Part 06 — The First Vertical Slice: Booking an Appointment](06-the-first-vertical-slice-booking.md).
