# Part 13 — Deploying to Render

Everything so far has run on your own machine. This part takes it to Render, a cloud hosting platform, as three separate deployed resources — a managed Postgres database, the backend as a Web Service, and the frontend as a Static Site. This part is written a little differently from the rest of the guide: instead of just describing the "right" configuration, it walks through several real failures that happened while actually deploying this exact project, because understanding *why* each one happened is what will let you diagnose the next one yourself, on this project or any other.

## Why three separate resources, not one

Nothing about this project requires the database, backend, and frontend to live in the same place, or even the same hosting provider. They're deployed as three independent Render resources for the same reason they're three independent folders in the repository (Part 01): each has a genuinely different deployment shape. Postgres needs to be a persistent, stateful database service. The backend needs to be a long-running Node process that stays up and listens for requests. The frontend is just static files — HTML, CSS, JS — that need nothing more than a place to be served from. Render happens to offer a distinct resource type for each of these three shapes, and using the one that actually matches each part is simpler than trying to force all three into one.

## Step 1 — The database

Create a new **PostgreSQL** resource on Render. Once it's provisioned, Render gives you a set of connection details — a Hostname, Port, Database name, Username, and Password — plus both an **Internal** and an **External** connection URL, built from those same values.

**Internal vs. External matters, and it's worth understanding precisely, not just picking one by habit.** The Internal hostname only resolves from *inside* Render's own private network — i.e., from another Render resource in the same account/region, like the backend Web Service you're about to create. It's faster (traffic never leaves Render's internal network) and doesn't count against any external bandwidth limits. The External hostname resolves from anywhere on the public internet — your own laptop, a different hosting provider, anywhere — but the connection has to travel over the real internet to get there. Use the **Internal** hostname for the backend Web Service's own connection (Step 2) — it lives in the same Render account, so there's no reason to route its normal traffic out to the public internet and back. You'll need the **External** hostname later (Step 5) for exactly one thing: running `seed.ts` from your own machine.

Apply the schema you built in Part 02 against this new database, using the External connection details, from your own machine:

```bash
psql "<the External Database URL from Render's dashboard>" -f database/schema.sql
```

## Step 2 — The backend Web Service, and the setting that trips up almost everyone first

Create a **Web Service** on Render, pointed at your repository. Before anything else works, one setting has to be correct, and it's easy to miss because most tutorials assume a repo with a single `package.json` at its root:

**Root Directory must be set to `backend`.** Recall from Part 01: there is no `package.json` at the repository's top level — the backend is its own independent project inside a `backend/` subfolder. If you leave Render's Root Directory unset (defaulting to the repo root), its build step will look for a `package.json` right there, find none, and fail immediately, before your actual code is ever involved at all. This is the single most common first failure, and the fix is entirely a dashboard setting, not a code change.

**Build Command:** `npm install && npm run build`
**Start Command:** `npm start`

These map directly to the scripts you wrote in Part 01: `npm run build` compiles `src/` into `dist/` fresh, on Render's own infrastructure, every deploy; `npm start` runs the compiled output (`node dist/server.js`) — production never uses `tsx` or runs TypeScript directly, only the built JavaScript. Even though `dist/` happens to be checked into git (Part 01's explanation for why), always let a real build step run on deploy rather than assuming the committed `dist/` is up to date with whatever you last pushed to `src/` — the committed copy exists as a safety net, not as the primary deploy mechanism.

### Environment variables: none of your `.env` reaches Render, ever

This is worth stating plainly because it's easy to assume otherwise: `.env` is in `.gitignore` (Part 01) specifically so it's never committed — which also means it's never present on Render's servers at all. Every environment variable your app needs has to be entered by hand, once, in the Web Service's **Environment** tab:

- `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` — copied from the Postgres resource's **Internal** connection details (Step 1).
- `DB_SSL=true` — recall Part 03: SSL is opt-in via this variable specifically because local development Postgres has no certificate configured. Render's managed Postgres, by contrast, requires it. Forgetting this variable produces a connection failure that can look confusing if you don't already know to check for it.
- `JWT_SECRET` — a long, random string (not the same one you used locally, ideally). Recall Part 08: `jwt.ts` throws immediately, at import time, if this is missing — which on Render doesn't just break login, it crashes the *entire process* on startup, over and over, every time Render tries to restart it (a "crash loop"). If your very first deploy never comes up at all and the logs show it dying immediately, this is the first thing to check.
- **Do not set `PORT` yourself.** Render assigns and injects its own `PORT` value automatically for every Web Service, and `server.ts` already reads `process.env.PORT` (Part 01). Manually setting one yourself in the dashboard can create a mismatch between the port your app actually listens on and the port Render expects to find open.

## Step 3 — The failure that looks nothing like its actual cause: binding to the wrong host

This is worth its own section because it's genuinely one of the most misleading failure modes you can hit, precisely because *nothing in your own application's logs looks wrong when it happens*.

Here's what it looks like: you deploy, and the logs show your server starting up completely normally —

```
Server is running on port 3000
```

— no errors, nothing alarming. And then, roughly fifteen minutes later (Render's full build-and-deploy time allowance), the deploy fails anyway, with a generic `Timed Out` message. Your application never crashed. It never logged an error. It just... wasn't reachable, for a reason invisible from inside the app itself.

**The cause:** `server.ts`, as a first pass, might reasonably be written as:

```ts
app.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
```

— no explicit host argument. Node's default behavior in that case is to listen on the *unspecified* address, which starts up successfully and even accepts local connections — but isn't reliably reachable by Render's own external port-probing mechanism, which is how Render decides whether your deploy actually came up successfully. Your app is technically running; Render just can't confirm it from the outside, and after its full time allowance, gives up and reports a timeout that gives you no hint the actual problem is a missing host argument three words long.

**The fix**, and the reason `server.ts` was written this way from the start in Part 01's version of this file rather than the naive version above:

```ts
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
```

Explicitly binding to `'0.0.0.0'` (meaning "accept connections on every network interface this machine has," not just an ambiguous default) is what makes the process reliably visible to Render's port probe. If you ever come across a from-scratch `server.ts` — your own or someone else's — that omits the host argument, and it's headed for Render (or most other container-based hosts), add it. This single detail costs nothing to include up front and is genuinely difficult to diagnose after the fact if you don't already know to look for it.

## Step 4 — A real health check, not just a bare port probe

Add one small route to `app.ts`, before your other routes:

```ts
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

Then, in the Web Service's **Settings → Health & Alerts**, set the Health Check Path to `/health`. This gives Render a real, meaningful endpoint to poll — one that returns an explicit `200` your app itself controls — rather than relying purely on the lower-level "is *any* port open at all" probe from Step 3. It's a small addition, but it turns "is my service actually healthy" into a question your own code answers directly, instead of an inference Render has to make indirectly.

## Step 5 — A second, subtler timeout: connecting to the database from outside Render's network

Once the backend is deploying successfully, you still need to run `seed.ts` (Part 11) against the production database to create your first real admin account. Running it from your own machine, against Postgres's **External** hostname, can hit a different timeout entirely:

```
Error: Connection terminated due to connection timeout
```

— even though the database is genuinely reachable (you can confirm this independently: a raw TCP connectivity check to the host and port succeeds). The cause here is `connectionTimeoutMillis` in `db.ts` (Part 03) — if it's set aggressively low (the value it might reasonably start at, `2000`, i.e. two seconds), a real Postgres handshake over an actual internet connection — TCP, then SSL negotiation, then authentication, several round trips — from your home network to a database possibly in another country entirely, can genuinely take longer than that, even with nothing actually wrong. Raising it (this project settled on `10000`, ten seconds) fixes it, and does no harm to normal operation — the backend's own connections, over Render's fast internal network, will never come close to using that much of the allowance; the higher number only matters for exactly this kind of occasional, higher-latency, external connection.

Once that's fixed, run the seed script with the **External** connection details as one-off environment overrides for a single terminal session, rather than editing your local `.env` file (which would leave you pointed at production the next time you casually ran `npm run dev`, a mistake worth actively avoiding):

```bash
DB_USER=... DB_PASSWORD=... DB_HOST=<external-hostname> DB_PORT=5432 DB_NAME=... DB_SSL=true npm run seed
```

## Step 6 — A confusing "it's still not working" that isn't actually a bug

Once the database connects successfully and the seed script has run, a login attempt might still return "Invalid username or password" — and it's worth explicitly separating two credentials that are easy to conflate, especially right after just having configured one of them:

- **`DB_USER`/`DB_PASSWORD`** (Step 2) are how the *backend process* authenticates to Postgres.
- **The admin dashboard's login** is checked against rows in the `admins` table (Part 08), created by the *username and password you passed to `seed.ts`* (Part 11) — a completely separate credential pair with no relationship to the database's own connection credentials.

If the backend is connecting to the database successfully (no more `500`s) but login still fails, the actual cause is almost always that the seed script either hasn't been run yet against *this specific* database, or you're testing with the database credentials instead of the seeded admin credentials by mistake — not a deeper bug in the authentication logic itself.

## Step 7 — The frontend Static Site

Create a **Static Site** resource, Root Directory `frontend`, an empty Build Command (there's nothing to build — Part 12), and Publish Directory `.` (since `index.html` sits directly inside `frontend/`, not in a nested `build/` or `dist/` output folder the way a bundled frontend would).

Then — and this is the step it's easy to forget, precisely because it's a code change rather than a dashboard setting — update `API_BASE_URL` in both `admin-api.js` and `bookappointment.js` (Part 12) to point at your backend's actual deployed URL (`https://your-service-name.onrender.com/api`), not `localhost`. Since these are two independent constants by design, both need updating, every time the backend's URL changes for any reason (a rename, a redeploy under a different service name) — nothing will error loudly if you forget one; the frontend will just silently fail every request from whichever page still points at the old URL.

## A few things worth knowing going in, not discovering the hard way

- **Render's free Postgres tier is time-limited** — it gets deleted after a set period. Fine for testing this guide's steps yourself; a real, ongoing deployment needs a paid instance.
- **Free-tier Web Services spin down after roughly 15 minutes of inactivity**, and take 30–60 seconds to cold-start again on the next request. The first booking or login attempt after a quiet period will look slow or hung, not broken — this is expected free-tier behavior, not a regression.
- **CORS is currently wide open** (`app.use(cors())` with no restriction, from Part 06) — acceptable for this project's current scope (no cookies involved, so it's not classically CSRF-exploitable), but worth tightening to an explicit origin allowlist before this ever handles anything more sensitive than it currently does.
- **There's no rate limiting anywhere** — `/admin/login` in particular is currently only protected from brute-force guessing by `bcrypt`'s inherent slowness (Part 08), not by any request-throttling. Adding `express-rate-limit`, at minimum on the login route, is a reasonable next step beyond the scope of this guide.

## What you should have now

This entire project, built from an empty folder across thirteen parts, running live on the public internet: a real database, a real authenticated API, and a real frontend that talks to it — and, more importantly than any single deployed URL, an understanding of *why* every layer of it is shaped the way it is, which is worth far more than the code itself, since that's what lets you build the next thing correctly too.
