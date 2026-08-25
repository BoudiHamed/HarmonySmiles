# Part 09 — Protecting Admin Routes

Part 08 gave you a working login that hands back a token. On its own, that token doesn't protect anything yet — nothing is checking for it. This part builds the middleware that does, and — just as importantly — a way of wiring it into the router so that *every future admin route is protected automatically*, without needing to remember to add a check to each one individually.

## Step 1 — How the client is expected to send the token back

After logging in, the frontend (Part 12) stores the JWT it received and attaches it to every subsequent admin request as an HTTP header, in the standard format:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

This is the **Bearer token** convention — "bearer" meaning literally "whoever holds/bears this token is treated as authenticated," no further proof needed. It's a header, not a cookie, and that choice has a real consequence worth knowing: because it's not a cookie, the browser never attaches it *automatically* to requests the way it would a cookie — the frontend's own JavaScript has to explicitly read it (from wherever it stored it) and set the header on every request itself. The upside: this sidesteps a whole category of Cross-Site Request Forgery (CSRF) vulnerability that cookie-based auth has to actively defend against, since a malicious third-party page has no way to make the browser attach this header on its own. It's not a coincidence that this project's `cors()` setup (Part 06) can stay relatively simple — Bearer-token auth is a big part of why.

## Step 2 — `auth.middleware.ts`

```ts
// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';

export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError('Must be logged in first', 401));
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    req.admin = verifyToken(token);
    next();
  } catch {
    next(new AppError('Invalid or expired session.', 401));
  }
};
```

Two distinct failure cases here, and it's worth noticing the code treats them differently, even though both end up as a `401`:

1. **No header at all, or a header that doesn't start with `"Bearer "`** — the request never even attempted to authenticate. Rejected immediately, no need to touch `verifyToken` at all.
2. **A header is present, but `verifyToken` throws** — this covers *both* "the token is garbage/tampered with" (fails signature verification) and "the token is well-formed and was genuinely issued, but its 1-day expiry from Part 08 has passed" (`jsonwebtoken` throws its own specific expiry error, which this `catch` doesn't need to distinguish from a bad signature — both mean the same thing to the caller: "log in again"). Wrapping `verifyToken` in a `try`/`catch` here is what turns what would otherwise be an unhandled exception (and a `500`, the wrong status for "your session is invalid") into a clean, expected `401`.

On success, `req.admin = verifyToken(token)` attaches the decoded payload (`{ adminId, username }`, from Part 08) directly onto the request object, where every downstream controller can read it if it needs to know who's making this request. This is exactly what Part 04's `express.d.ts` module augmentation was built in advance for — without it, this line wouldn't type-check at all, since Express's own `Request` interface has no `admin` field.

## Step 3 — The ordering trick that protects every future route automatically

This is the part of this file that's easy to underappreciate on a first read, because the actual mechanism is just... where you put one line.

```ts
// src/routes/admin.routes.ts (building on Part 08's version)
import { authMiddleware } from '../middlewares/auth.middleware.js';

export const adminRouter = Router();

adminRouter.post('/login', validate(loginSchema), login);

// Every route registered below this line is automatically protected.
adminRouter.use(authMiddleware);

// (Part 10 fills in the actual protected routes here.)
```

`adminRouter.use(authMiddleware)`, called with no path argument, registers `authMiddleware` to run on *every* request that reaches this router from this point onward — but only for routes defined **after** this line in the file. Express processes middleware and route handlers in the exact order they're registered, top to bottom. `login` is registered first, so it never passes through `authMiddleware` at all — correct, since you obviously can't require a valid token to reach the endpoint whose entire job is to *issue* one. Everything registered after the `adminRouter.use(authMiddleware)` line, by contrast, always passes through it first.

**Why this specific pattern is worth preferring over the alternative** — adding `authMiddleware` individually to each protected route (`adminRouter.get('/appointments', authMiddleware, validate(...), listAppointments)`, repeated on every single line): with the per-route approach, protecting a *new* admin route you add six months from now requires remembering to add `authMiddleware` to it, every single time, forever. Forget it once, and you've shipped an unauthenticated admin endpoint — silently, with nothing failing loudly to catch the mistake. With the ordering approach, protection isn't something you have to remember per-route at all — it's a structural property of *where in the file* a route is written. Add a new route below the `adminRouter.use(authMiddleware)` line, and it's protected by construction, with no additional code needed and no way to forget. This is a genuinely nice example of a broader principle: when you can, prefer designs where doing the right thing is the *only* option, over designs where doing the right thing requires everyone to remember to do it correctly, every time, forever.

## What you should have now

Try calling any hypothetical protected route (even one that doesn't exist yet, like a made-up `GET /api/admin/test-protected`) with no `Authorization` header, and confirm you get a clean `401` — not because the route exists and rejected you, but because `authMiddleware` runs before Express even gets to the routing table's "does this path exist" check. Then confirm: a request with a garbage token also gets a `401`; a request with a real, freshly-issued token from Part 08's login makes it past `authMiddleware` (you can confirm this by temporarily adding a route after it that just does `res.json({ admin: req.admin })` and checking the response contains the right `adminId`/`username`).

**Next:** [Part 10 — Admin CRUD: Appointments & Patients](10-admin-crud-appointments-and-patients.md), where you'll finally build the actual dashboard functionality this protection exists to guard.
