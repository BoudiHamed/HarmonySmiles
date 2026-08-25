# Part 11 — Seeding the First Admin

Here's a problem every admin-login system has to solve once, at the very beginning, and it's easy to not think about until you actually hit it: `POST /admin/login` checks a submitted password against a row in the `admins` table — but on a brand new database, that table is empty. There's no login endpoint that could ever create the *first* admin account, because creating an admin isn't something the public API exposes at all (and shouldn't — an open "create an admin" endpoint would be a serious security hole). You need some other way in, exactly once, before the app is otherwise usable.

## The answer: a one-off script, not an API endpoint

```ts
// backend/seed.ts  — note: at the repo root of backend/, NOT inside src/
import bcrypt from 'bcrypt';
import { query, closePool } from './src/config/db.js';

const SALT_ROUNDS = 10;

const seedAdmin = async (): Promise<void> => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required to seed the admin account');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO admins (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO NOTHING
     RETURNING id`,
    [username, passwordHash]
  );

  if (result.rows.length > 0) {
    console.log(`Admin account "${username}" created.`);
  } else {
    console.log(`Admin account "${username}" already exists — skipped.`);
  }
};

seedAdmin()
  .catch((error) => {
    console.error('Failed to seed account:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    closePool();
  });
```

Run it with:

```bash
ADMIN_USERNAME=youradminname ADMIN_PASSWORD=yourpassword npx tsx seed.ts
```

(or set those two variables in your `.env` and add an `npm run seed` script — `"seed": "tsx seed.ts"` — which is exactly what this project's own `package.json` does.)

## Why every one of these choices is deliberate

**Why this lives *outside* `src/`, at the top level of `backend/`, instead of alongside all your other backend code.** Recall Part 01's `tsconfig.json`: `"include": ["src/**/*"]`. This file is placed specifically *outside* that boundary, on purpose — it means `npm run build` (which compiles everything `tsconfig.json` includes) never bundles this script into your production build, and `npm start` (which runs the compiled `dist/server.js`) never accidentally runs it as part of normal server startup. It's run directly via `tsx seed.ts` — deliberately a manual, one-time action a human takes, never something that happens automatically as a side effect of deploying or starting the server.

**Why it reads credentials from environment variables, `throw`ing immediately if they're missing — the exact same fail-fast pattern from `jwt.ts` back in Part 08.** This is the same reasoning applied again: better to refuse to run at all, with a clear error, than to silently do something wrong (or crash confusingly deep inside `bcrypt.hash(undefined, ...)`) because a required value was missing. It's worth recognizing this as a *reusable pattern*, not a coincidence that two unrelated files independently do the same thing — "validate your required inputs exist, loudly, before doing anything with them" is a habit worth applying broadly, well beyond this specific project.

**Why `ON CONFLICT (username) DO NOTHING`, not a plain `INSERT` — making this script safe to re-run.** If you ran this a second time with the same `ADMIN_USERNAME`, a plain `INSERT` would either throw a uniqueness-violation error (since `admins.username` is `UNIQUE`, from Part 02) or, worse, if written differently, could silently overwrite an existing admin's password with a new one you didn't necessarily mean to reset. `ON CONFLICT (username) DO NOTHING` makes re-running the script a safe no-op if that username already exists — you can run this command as many times as you want, in any environment, without worrying about accidentally clobbering an account.

**Why `.finally(() => closePool())` at the very end.** This is the one and only place in the whole project that calls `closePool()` (built back in Part 03) — and it's here for a very concrete, practical reason: `pg.Pool` keeps its connections open indefinitely, which is exactly right for a long-running server process that needs to stay ready for the next request forever, but is exactly wrong for a short script that's supposed to do one thing and exit. Without explicitly closing the pool, this script's Node process would just... hang, after logging its success message, because there's still an open TCP connection keeping the event loop alive. `.finally()` (rather than putting this only in the success path, or only in the catch) guarantees the pool gets closed whether the script succeeded or failed — the process should exit cleanly either way.

## Running this against a database that isn't your own machine

Everything above works identically whether you're pointing it at a local development Postgres or a real, deployed production database — the script itself doesn't know or care which. The only thing that changes is which `DB_*` environment variables are in effect when you run it. This becomes directly relevant once you deploy (Part 13): the running production server never runs this script for you automatically (there's no mechanism in this project that would — no deploy hook, no `postinstall` script, nothing), so creating that first production admin account is a manual step you take yourself, once, by running this exact script locally with your production database's connection details substituted in for the local ones.

## What you should have now

At least one working admin account, and — going back to Part 08 — the ability to actually test a real login end to end for the first time, instead of hand-inserting a bcrypt hash yourself just to get something to test against.

**Next:** [Part 12 — Wiring the Frontend](12-wiring-the-frontend.md), a short part covering how the plain-HTML booking form and admin dashboard actually call the API you've now fully built.
