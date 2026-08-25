# Part 03 — The Database Connection Layer

Every query this backend ever runs goes through exactly one file: `src/config/db.ts`. Nothing else in the project is allowed to import `pg` directly or create its own connection. This part builds that file piece by piece, and explains why centralizing it this tightly matters.

## Step 1 — A connection pool, not a single connection

```ts
import pg, { PoolClient, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
```

**Why a *pool* instead of just opening one connection and reusing it:** your Express server handles many requests concurrently — while one request is waiting on a query to finish, another request could arrive and need to run its own query at the same time. A single shared connection can only do one thing at a time; if two requests tried to share it, their queries would interleave incorrectly. A `Pool` maintains a set of ready-to-use connections (up to `max: 20` here) and hands one out to whichever piece of code asks (`pool.query(...)` or `pool.connect()`), automatically opening new ones as needed and reusing idle ones, up to that cap. This is the standard pattern for any server-side database client, in any language.

**`idleTimeoutMillis: 30000`** — a connection that's been sitting unused in the pool for 30 seconds gets closed. Postgres has its own limit on how many total connections it will accept; there's no reason to hold onto idle connections indefinitely just because load was briefly high once.

**`connectionTimeoutMillis: 10000`** — how long to wait for a *new* connection attempt to succeed before giving up. This number matters more than it looks like it should, and it's worth knowing the real story: it originally started at `2000` (2 seconds), which is fine for a server talking to a database on the same private network — but it turned out to be too aggressive for anyone connecting from *outside* that network, e.g. running a one-off script from a home computer against a cloud-hosted database in another country (see Part 11). A real Postgres handshake involves a TCP connection, then SSL negotiation, then authentication — three round trips minimum — and across a real-world, higher-latency network path, that can genuinely take longer than 2 seconds even though nothing is actually wrong. The fix was simply raising the number; there's no cleverness needed here, just recognizing that a timeout tuned for the best-case network path will eventually misfire on a worse one.

**`ssl: ... ? { rejectUnauthorized: false } : undefined`** — SSL is **opt-in**, controlled by a `DB_SSL` environment variable, not always-on. Local development Postgres (running on your own machine) typically has no SSL certificate configured at all, so forcing SSL would break local dev entirely. Managed cloud Postgres hosts (Render, Supabase, Neon, and similar), by contrast, generally *require* SSL for any external connection and will reject a plain connection outright. So: locally, leave `DB_SSL` unset; in production, set `DB_SSL=true`. (`rejectUnauthorized: false` specifically means "encrypt the connection, but don't verify the server's certificate against a known certificate authority" — acceptable here because you're connecting to a specific, known host you already trust by virtue of having its credentials, not browsing to an arbitrary server.)

## Step 2 — The DATE-column bug, and the fix that belongs here

This is the most subtle piece of this entire file, and it's worth understanding thoroughly because the underlying problem (implicit timezone conversions) is one of the most common sources of real bugs in any app that stores dates.

Recall from Part 02 that `appointments.appointment_date` is a plain SQL `DATE` — no time-of-day, no timezone, just a calendar date like "March 5th, 2026." Here's the problem: the `pg` driver, by default, converts every `DATE` value it reads back from Postgres into a JavaScript `Date` object — and to do that, it has to *invent* a time-of-day and timezone that weren't there in the first place. Its default behavior is to construct that `Date` at **midnight in the server process's own local timezone**.

Walk through what actually goes wrong: suppose the Node server process happens to be running in a timezone that's *ahead* of UTC (say, UTC+3). Postgres returns the date `2026-03-05`. The driver builds `new Date(2026, 2, 5, 0, 0, 0)` interpreted as UTC+3 local midnight. When that `Date` object later gets serialized to JSON (as every API response does, via `JSON.stringify`, which calls a `Date`'s `.toISOString()`), it's converted to UTC — and UTC midnight-minus-three-hours on March 5th is actually **March 4th, 21:00 UTC**. The date that reaches the frontend is off by a day. An admin's "Today" filter would show yesterday's appointments, or miss today's — not because of any bug in the filtering logic itself, but because the *data itself* silently shifted a calendar day somewhere between the database and the browser.

This is exactly the situation Part 02 flagged as the reason `appointment_date` is a plain `DATE` and not a timestamp — but it turns out the bug can sneak back in anyway, at the *driver* level, unless you explicitly stop it. The fix:

```ts
pg.types.setTypeParser(1082, (value: string) => value);
```

`1082` is Postgres's internal type OID (object identifier) for the `DATE` type. This one line tells the `pg` driver: for any column of this type, don't convert it to a JavaScript `Date` at all — just hand back the raw text exactly as Postgres sent it (`'2026-03-05'`). No timezone interpretation happens, because none is ever invented in the first place. This is why, throughout the rest of this backend, `appointment_date` is always handled as a plain string — never as a `Date` object — and why the TypeScript type for it (Part 04) is `string`, not `Date`.

Note carefully what this override does *not* touch: `created_at` and `updated_at` are `TIMESTAMPTZ` (OID `1184`, untouched by this line), and they genuinely do represent a specific instant in time — for those columns, the driver's normal `Date`-object behavior is correct and wanted. This fix is narrowly scoped to the one type where the driver's default behavior was actively wrong for what the column means.

**The general lesson**, beyond this specific bug: when a library's default behavior involves implicitly picking a timezone on your behalf, that default is a hazard, not a convenience — because your server's own timezone (wherever it happens to be deployed) has nothing to do with the meaning of your data. This bug bites a huge number of real production apps in more or less this exact shape.

## Step 3 — Four exports, and why each exists

```ts
export const query = <T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) => {
  return pool.query<T>(text, params);
};

export const getClient = (): Promise<PoolClient> => {
  return pool.connect();
};

export const closePool = (): Promise<void> => {
  return pool.end();
};

export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
```

- **`query<T>()`** — the one you'll use for the vast majority of database calls: a single, standalone SQL statement. It checks a connection out of the pool, runs the query, and returns it automatically — you never have to think about releasing anything. The generic `<T>` lets you tell TypeScript what shape of rows to expect back (e.g. `query<Appointment>(...)`), so the result is typed instead of `any`.
- **`getClient()`** — a manual checkout. Unlike `query()`, whoever calls this is responsible for calling `.release()` themselves when done. You need this specifically when multiple statements must run on the *same* underlying connection — which is exactly the situation a database transaction requires (see below). You won't call this directly very often; mostly you'll go through `withTransaction`.
- **`closePool()`** — shuts the entire pool down. The **only** caller of this in the whole project is the one-off admin-seeding script (Part 11) — a short-lived script needs this so the Node process actually exits after it's done, instead of hanging forever because the pool is still holding open connections. The long-running server process never calls this; it's supposed to keep its connections open for its entire lifetime.
- **`withTransaction(fn)`** — the one piece of real logic in this file, and the one every future multi-step write should use rather than hand-rolling `try`/`catch`/`finally` again. A **transaction** is a way of telling Postgres "run these several statements as one atomic unit — either all of them happen, or none of them do." You need this whenever an operation involves more than one write that must succeed or fail *together*. Part 06 gives you the concrete example (creating a patient row and an appointment row together), but the general shape here is worth understanding on its own:
  1. Check out a single dedicated connection (`getClient()`) — transactions are a property of one connection's session, so every statement in the transaction must run on that same connection, not just "some connection from the pool."
  2. `BEGIN` — tell Postgres "start a transaction, don't commit anything yet."
  3. Run the caller's function `fn(client)`, which does whatever writes it needs, using this specific `client` (not the generic `query()` export — that would check out a *different* connection from the pool, defeating the whole point).
  4. If `fn` completes without throwing: `COMMIT` — make everything permanent.
  5. If `fn` throws *anything*: `ROLLBACK` — undo every change made since `BEGIN`, as if none of it happened, then re-throw the original error so the caller still finds out something went wrong.
  6. Either way, in a `finally` block: `client.release()` — return the connection to the pool so it can be reused. This has to happen unconditionally, success or failure, or you'd slowly leak connections out of the pool every time a transaction failed, until eventually there were none left.

## Why this whole file is the *only* place allowed to touch `pg`

Picture the alternative: every service file that needs a transaction writes its own `BEGIN`/`COMMIT`/`ROLLBACK`/`release()` logic. Now imagine one of those five services forgets the `finally` block, or forgets to `ROLLBACK` on error, or accidentally reuses `query()` (a *different* pooled connection) inside what was supposed to be one transaction. Each of those is a real, hard-to-notice bug — the kind that only shows up under load or after a failure, not during a quick manual test. Centralizing this logic in one file, written once and used everywhere, means you only have to get it right once, and every future feature that needs a transaction inherits correctness for free just by calling `withTransaction`.

## What you should have now

`src/config/db.ts`, fully working, exporting `query`, `getClient`, `withTransaction`, and `closePool`. You can sanity-check it works by writing a tiny throwaway script that calls `query('SELECT NOW()')` and logs the result — but don't build anything permanent on top of it yet; that starts once you have somewhere to catch errors properly.

**Next:** [Part 04 — Foundations: Errors & Types](04-foundations-errors-and-types.md), where you'll build the error-handling and type-safety scaffolding that every route, controller, and service from here on will lean on.
