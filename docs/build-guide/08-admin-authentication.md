# Part 08 — Admin Authentication

Everything so far has been public — anyone can book an appointment or check available slots, and that's correct; a booking page shouldn't require a login. Starting now, you're building the other half of this app: a dashboard only clinic staff should be able to use. That means you need a real answer to "how does the server know this request is really from a logged-in admin, and not just anyone who found the URL."

This part builds password hashing and login. Part 09 builds the middleware that actually *enforces* login on protected routes — deliberately kept separate, because "can I verify who you are" (this part) and "do I let this specific request through" (next part) are genuinely different concerns.

## Step 1 — Never store a plaintext password, ever

If your `admins` table just stored passwords as plain text, then anyone who ever gained read access to your database — a leaked backup, a compromised database credential, a careless query logged somewhere — would have every admin's actual login password immediately. **Hashing** solves this: instead of storing the password itself, you store the output of a one-way mathematical function applied to it. "One-way" means there's no practical way to reverse a hash back into the original password — the only way to check whether a given password is correct is to hash *that* input the same way and compare the two hashes.

This project uses `bcrypt` specifically, not a general-purpose hash function like SHA-256. That distinction matters: SHA-256 is *fast* — deliberately, since it's designed for things like verifying file integrity, where speed is a feature. Fast is exactly the wrong property for password hashing, because it means an attacker who steals your hashed passwords can try billions of guesses per second against them. `bcrypt` is deliberately, tunably *slow*, and includes a random "salt" baked into every hash automatically (so two admins who happen to pick the same password don't produce the same stored hash) — both properties make large-scale guessing attacks dramatically more expensive.

You already have `bcrypt` installed from Part 01. You'll use it in two places: hashing a password when an admin account is created (Part 11), and comparing a submitted password against a stored hash at login time (this part).

## Step 2 — The types

```ts
// src/types/admin.types.ts
export interface Admin {
  id: number;
  username: string;
  created_at: Date;
}

export interface AdminWithPassword extends Admin {
  password_hash: string;
}
```

Two interfaces, not one, and the split is deliberate: `Admin` is the shape you're allowed to send back to a client — it's what a login response's `admin` field looks like. `AdminWithPassword` extends it with the one field that should *never* leave the server: `password_hash`. Having a type that includes the hash, kept separate from the type that doesn't, makes it a visible, checkable fact in the code itself — anywhere a function's return type is plain `Admin`, you have a compile-time guarantee it isn't accidentally leaking the hash, rather than trusting every developer to remember to strip it out by hand every time.

```ts
// src/types/auth.types.ts
export interface loginInput {
  username: string;
  password: string;
}

export interface jwtPayload {
  adminId: number;
  username: string;
}

export interface loginResponse {
  success: boolean;
  message: string;
  token: string;
  admin: Admin;
}
```

`jwtPayload` is the shape of data that goes *inside* the signed token itself (Step 3) — deliberately minimal: just enough to identify who this token belongs to (`adminId`) and a convenience field (`username`), nothing sensitive. A JWT's payload is not encrypted, only signed (more on this distinction below) — never put anything in it you wouldn't be comfortable a client (or anyone who intercepts network traffic) reading directly, because they can.

## Step 3 — `jwt.ts`: signing and verifying tokens

**What a JWT actually is**, briefly, since the rest of this section only makes sense with this in mind: a JSON Web Token is a string made of three parts — a header, a payload (your data, like `jwtPayload` above), and a signature — where the signature is a cryptographic proof, computed using a secret key only the server knows, that the header and payload haven't been tampered with since the server issued them. Anyone can *read* a JWT's payload (it's just base64-encoded JSON, not encrypted) — but nobody without the server's secret key can *forge* one or *modify* an existing one without the signature failing to verify. That's the entire security property a JWT gives you: not confidentiality, but tamper-evidence.

```ts
// src/utils/jwt.ts
import jwt from 'jsonwebtoken';
import { jwtPayload } from '../types/auth.types.js';

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export function signToken(payload: jwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d', algorithm: 'HS256' });
}

export function verifyToken(token: string): jwtPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwtPayload;
}
```

Three deliberate choices here worth understanding, not just copying:

**The `if (!JWT_SECRET) throw` at the top of the file, not buried inside a function.** This runs the moment the file is first imported — at server startup, before the app is even listening for requests. This is a **fail-fast** pattern: if the secret is missing, you want the whole server to refuse to start at all, loudly, with an unambiguous error message, rather than starting up "successfully" and only failing (or worse, silently misbehaving) the first time someone tries to log in. Consider the alternative: without this check, `JWT_SECRET` would be `undefined`, `jwt.sign(payload, undefined, ...)` might not even throw depending on the library version, and you could end up signing every token with a literal, guessable value — a genuine security hole, and one that would be very easy to not notice until it was already a live problem. Fail-fast turns a silent, delayed disaster into an immediate, obvious one you fix before anything's at risk.

**`expiresIn: '1d'`.** Tokens don't last forever — after 24 hours, `verifyToken` will start throwing (JWTs encode their own expiry, checked automatically by the library), forcing a re-login. This is a standard security tradeoff: shorter expiry limits how long a stolen token stays useful; too short, and legitimate users get logged out annoyingly often. One day is a reasonable middle ground for an internal admin tool used during a clinic's working hours.

**`algorithm: 'HS256'`, pinned explicitly on both signing and verifying, rather than trusting the library's default.** This is a defense-in-depth measure against a real, historical class of JWT vulnerability: some JWT libraries, if not told which algorithm to expect, will trust an algorithm *named inside the token itself* — which means an attacker could hand-craft a token claiming `"alg": "none"` (no signature at all) and have a careless verifier accept it. Explicitly restricting `verifyToken` to only ever accept `HS256` closes that door, even though this specific project only ever uses one symmetric secret and isn't currently exposed to that particular attack in practice — it's the kind of habit worth having regardless, because it costs nothing and the alternative failure mode is severe.

## Step 4 — `auth.service.ts`, and the timing-attack you'd never think to defend against on your own

```ts
// src/services/auth.service.ts
import bcrypt from 'bcrypt';
import { query } from '../config/db.js';
import { signToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';
import { loginInput, loginResponse } from '../types/auth.types.js';
import { AdminWithPassword } from '../types/admin.types.js';

const DUMMY_PASSWORD_HASH = '$2b$10$42q6H/XUCvNMGlyuPcCmKOdB2hvF0oCzVdVz8bCRK1Vn5CCdfkquu';

export const loginService = async (input: loginInput): Promise<loginResponse> => {
  const adminRes = await query(
    'SELECT id, username, password_hash, created_at FROM admins WHERE username = $1 LIMIT 1',
    [input.username]
  );
  const [admin] = adminRes.rows as AdminWithPassword[];

  const passwordMatches = await bcrypt.compare(input.password, admin?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!admin || !passwordMatches) {
    throw new AppError('Invalid username or password', 401);
  }

  const token = signToken({ adminId: admin.id, username: admin.username });

  return {
    success: true,
    message: 'Logged in successfully',
    token,
    admin: { id: admin.id, username: admin.username, created_at: admin.created_at },
  };
};
```

Two security details here are easy to miss on a first read, and worth walking through slowly, because they're the kind of thing that separates "looks secure" from "actually is."

**The exact same error message and status code for "no such user" and "wrong password."** Look closely: whether `admin` is `undefined` (username doesn't exist at all) or `admin` exists but `passwordMatches` is `false` (wrong password for a real account), the response is identical: `'Invalid username or password'`, `401`. This is deliberate, not laziness. If a "no such user" response were even slightly different from a "wrong password" response — a different message, a different status code, even a difference in *which fields* the JSON response includes — an attacker could use that difference to enumerate valid usernames one at a time, without ever guessing a single correct password. Identical responses for both cases close that off entirely.

**The `DUMMY_PASSWORD_HASH` fallback, and why the code *always* calls `bcrypt.compare`, even when there's no real user to compare against.** This is the subtler one. `bcrypt.compare` is deliberately slow (Step 1) — which means the *time it takes to respond* to a login attempt is itself a signal, if you're not careful. Imagine the code instead did this:

```ts
// DON'T do this — looks fine, has a real timing side-channel:
if (!admin) throw new AppError('Invalid username or password', 401);
const passwordMatches = await bcrypt.compare(input.password, admin.password_hash);
```

Here, a request for a username that *doesn't exist* returns almost instantly (no `bcrypt.compare` ever runs), while a request for a username that *does* exist takes measurably longer (the slow hash comparison actually runs) — even though both eventually return the identical `401` message. An attacker measuring response times alone — without ever seeing a different message — could still figure out which usernames are real, just from how long the server takes to say no. The actual code closes this gap by *always* calling `bcrypt.compare`, comparing against a real (but meaningless) precomputed hash — `DUMMY_PASSWORD_HASH` — when there's no real user to check against, so a "no such user" attempt takes essentially the same amount of time as a "wrong password for a real user" attempt. Nothing about the response, timing included, distinguishes the two cases.

This is a genuinely subtle category of vulnerability (a **timing attack**) that's easy to never think about unless you already know to look for it — which is exactly why it's worth spelling out in this much detail here, rather than just presenting the working code and moving on.

## Step 5 — The controller, and wiring up the route

```ts
// src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { loginService } from '../services/auth.service.js';

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await loginService(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
```

By now this shape should feel completely familiar — the same thin controller pattern from Parts 06 and 07, nothing new here. The `loginSchema` validator was already built back in Part 05; wire it into a new `admin.routes.ts`:

```ts
// src/routes/admin.routes.ts (start of the file — Part 09 adds the protected routes below this)
import { Router } from 'express';
import { login } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema } from '../middlewares/validators/login.validator.js';

export const adminRouter = Router();

adminRouter.post('/login', validate(loginSchema), login);
```

And mount it in `app.ts`, alongside `publicRouter`:

```ts
// src/app.ts
import { adminRouter } from './routes/admin.routes.js';
// ...
app.use('/api/admin', adminRouter);
```

## What you should have now

A working `POST /api/admin/login`. To actually test it, you'll need at least one row in `admins` with a real bcrypt hash — Part 11 builds the proper seeding script for that, but if you want to test right now, you can hash a test password by hand in a throwaway script (`await bcrypt.hash('testpassword', 10)`) and insert it directly. Confirm: a correct username/password returns a token; a wrong password returns a `401` with the generic message; a nonexistent username returns the *exact same* `401` and message. That last check is the one that's easy to skip and shouldn't be — it's the whole point of Step 4.

**Next:** [Part 09 — Protecting Admin Routes](09-protecting-admin-routes.md), where you'll make that token actually mean something, by requiring it on every route that isn't login.
