# Part 01 — Project Setup & Tooling

Before writing a single route, you need a project that actually *runs*. This sounds trivial, but the single biggest hidden failure mode in this entire codebase's history happened right here, at the very beginning, in a config file nobody thinks to double-check. We'll build up to that on purpose, so you understand exactly why it matters.

## Step 1 — Why the backend is its own independent folder

Look at the top level of this repository:

```
HarmonySmiles/
  backend/
  frontend/
  database/
```

There is **no root `package.json`**. That's a deliberate choice, not an oversight. The backend is a Node/TypeScript API. The frontend is plain static HTML/CSS/JS with zero build tooling — no bundler, no npm at all. The database is one hand-written SQL file. These three things have nothing in common tooling-wise, so gluing them together under one root `package.json` (or a monorepo tool like npm workspaces/Turborepo) would add ceremony with no payoff for a project this size. Each part is independently deployable (and, as you'll see in Part 13, actually is deployed as three separate services).

**The lesson:** don't reach for monorepo tooling just because a project has multiple parts. Reach for it when those parts actually need to share code or be built together. Here, they don't.

So: `cd` into a fresh `backend/` folder and everything in Parts 01–11 happens inside it.

## Step 2 — `npm init` and the single most important line in `package.json`

```bash
mkdir backend && cd backend
npm init -y
```

This gives you a bare-bones `package.json`. Now open it and add one field:

```jsonc
{
  "name": "back-end",
  "version": "1.0.0",
  "type": "module"
}
```

### Why `"type": "module"` matters more than anything else in this file

Node.js supports two module systems: the old one (**CommonJS**, `require()`/`module.exports`) and the modern standard one (**ES Modules**, `import`/`export`). `"type": "module"` tells Node "treat every `.js` file in this package as an ES Module."

Why does this project use ESM instead of the more common CommonJS-by-default setup? Because ESM is the direction the whole JavaScript ecosystem has been moving for years, TypeScript's own tooling is built to support it well via the `nodenext` module setting (see Step 4), and it avoids a specific category of interop headaches you'd otherwise hit mixing modern npm packages that ship ESM-only builds.

The cost of this choice is that **every relative import needs an explicit `.js` extension**, even though you're writing `.ts` files:

```ts
// Correct, even in a .ts file:
import { query } from '../config/db.js';

// Wrong — will fail to resolve at runtime:
import { query } from '../config/db';
```

This looks bizarre the first time you see it (you're importing a `.ts` file, why does the import say `.js`?). The reason: Node's ESM resolver runs on the **compiled output** — after `tsc` builds `db.ts` into `db.js`, that's the file that actually gets loaded at runtime. TypeScript's `nodenext` module mode requires you to write imports as they'll resolve *after* compilation, and then it's smart enough to still type-check against the `.ts` source. You'll see this reinforced in Step 4.

## Step 3 — Installing dependencies, and why each one is here

```bash
npm install express cors dotenv pg bcrypt jsonwebtoken zod
npm install -D typescript tsx @types/express @types/cors @types/pg @types/bcrypt @types/jsonwebtoken @types/node
```

Every single one of these earns its place — nothing here is "just in case":

| Package | Why it's here |
|---|---|
| `express` | The HTTP framework — routes, middleware, request/response handling. The most standard choice for a Node API; nothing exotic needed for a project this size. |
| `cors` | Without it, a browser calling this API from a different origin (the frontend's own domain) gets blocked by the browser's same-origin policy before the request even reaches your server. |
| `dotenv` | Loads `.env` into `process.env` in local development. (Production doesn't use this file at all — see Part 13.) |
| `pg` | The official PostgreSQL driver. Talks to Postgres directly with raw SQL — **there is no ORM in this project**, a decision explained fully in Part 03. |
| `bcrypt` | Hashes admin passwords before they ever touch the database. Storing plaintext passwords is never acceptable, even for a single-clinic internal tool. |
| `jsonwebtoken` | Signs and verifies the tokens that keep an admin logged in after they authenticate. Covered in depth in Part 08. |
| `zod` | Validates and type-checks every piece of data coming in from a client, before it's trusted anywhere else in the app. Covered in Part 05. |
| `typescript` (dev) | The compiler. Lets you write with real types instead of raw JavaScript, catching a whole category of bugs (wrong field names, wrong argument types) before the code ever runs. |
| `tsx` (dev) | Runs TypeScript directly during development, with a built-in file-watcher — no separate `nodemon` needed. **Why not `ts-node`?** Keep reading — this is the gotcha. |
| `@types/*` (dev) | TypeScript's own compiler doesn't know the shape of plain-JS libraries like `express` or `pg`. These packages are nothing but type definitions, so TypeScript can type-check your usage of those libraries too. |

### The gotcha: why `tsx`, and specifically *not* `ts-node`

If you've used TypeScript with Node before, your instinct might be to reach for `ts-node` to run `.ts` files directly during development. **Don't, in this project.** `ts-node`'s ESM support relies on Node loader hooks that don't reliably resolve `.js`-suffixed relative imports back to their `.ts` source files on current Node versions — which is exactly the import style Step 2 just committed you to. Concretely: it will silently fail to find `../config/db.js` because the actual file on disk is `db.ts`, and current `ts-node` + current Node just doesn't bridge that gap reliably anymore.

`tsx` doesn't have this problem — it's built for exactly this ESM-plus-TypeScript combination. This is the kind of thing that's easy to lose an entire afternoon to if you don't know it up front, which is why it's called out here before you've written a line of app code.

## Step 4 — `tsconfig.json`, decoded line by line

Create `backend/tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",

    "module": "nodenext",
    "target": "esnext",

    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,

    "strict": true,
    "skipLibCheck": true,
    "moduleDetection": "force",
    "isolatedModules": true,

    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"]
}
```

Nothing here is boilerplate you can safely ignore — each option is doing a specific job:

- **`rootDir: "./src"` / `outDir: "./dist"`** — your handwritten TypeScript lives in `src/`; the compiled, runnable JavaScript lands in `dist/`. Keeping these separate means you never accidentally edit a compiled file or check messy build output into the wrong place.
- **`module: "nodenext"`** — this is the setting that *requires* the `.js`-extension import style from Step 2. It tells TypeScript "compile and resolve modules exactly the way Node's own ESM loader will," instead of some looser bundler-style resolution that wouldn't actually work when you `node dist/server.js` for real.
- **`target: "esnext"`** — compile down to modern JavaScript syntax, not some older ES5 dialect. There's no need to support ancient runtimes here; the server runs on whatever Node version you deploy it with.
- **`strict: true`** — turns on every strict type-checking rule TypeScript has (no implicit `any`, null checks enforced, etc.). This is what actually makes TypeScript worth using — without it, you get the syntax overhead with almost none of the safety benefit.
- **`noUncheckedIndexedAccess: true`** — this one is easy to skip and shouldn't be. It means array/object index access (`someArray[0]`, `someRow.rows[0]`) is typed as possibly `undefined`, forcing you to actually check before using it. You'll see this pattern constantly in this codebase — e.g. `const [admin] = adminRes.rows;` followed immediately by `if (!admin) { ... }` — and this compiler flag is *why* that check isn't optional; skipping it would be a type error, not just bad practice.
- **`isolatedModules: true`** — ensures every file can be compiled independently (a requirement for some faster build tools, and generally a sign of cleanly separated modules — no weird cross-file type-only dependencies that only work when the whole project compiles as one unit).
- **`skipLibCheck: true`** — don't type-check the internals of your `node_modules` dependencies. You trust that published packages' own type definitions are internally consistent; re-checking them on every build would just slow things down for no benefit.
- **`include: ["src/**/*"]`** — only `src/` is part of the TypeScript project. This matters later: `seed.ts` (Part 11) deliberately lives *outside* `src/`, specifically so it's excluded here and run directly via `tsx` instead of being bundled into the production build. Same reasoning applies to nothing else yet at this point in the guide, but keep it in mind.

## Step 5 — npm scripts

Add these to `package.json`:

```jsonc
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

- **`npm run dev`** — what you'll use constantly while building. `tsx watch` re-runs the server automatically every time you save a file, running the TypeScript directly (no separate build step needed during development).
- **`npm run build`** — compiles `src/**/*.ts` into `dist/**/*.js`, per `tsconfig.json`. This is the production build step.
- **`npm start`** — runs the *compiled* output, not the TypeScript source. This is what actually runs in production (see Part 13) — production doesn't use `tsx` at all, it runs plain compiled JavaScript with plain `node`.

Note there's deliberately no `npm test` or `npm run lint` — this project has no test framework or lint config. That's an honest gap worth knowing about rather than a script you should invent and leave broken.

## Step 6 — Folder structure, decided before writing any code

Create this skeleton inside `backend/src/`:

```
src/
  app.ts
  server.ts
  config/
  routes/
  controllers/
  services/
  middlewares/
    validators/
  utils/
  types/
  constants/
```

You'll fill every one of these in over the coming parts, but it's worth understanding the philosophy now, because it's the answer to "why are there so many small files instead of a few big ones":

- **`app.ts` vs. `server.ts` — a deliberate split.** `app.ts` builds and *exports* the configured Express app (middleware, routes) but never calls `.listen()`. `server.ts` is the actual process entry point — it imports `app` and is the only file that calls `.listen()`. Why bother splitting a two-line difference across two files? Because an app that doesn't bind a port can be imported and tested in isolation later (e.g. with a library like `supertest`, which drives requests against the Express app object directly without needing a real open port). If `app.listen()` lived inside `app.ts`, importing it for a test would also start a real server — annoying at best, and a source of "port already in use" errors at worst. This split costs nothing today and buys you real flexibility later.
- **`routes/` → `controllers/` → `services/` → `config/db.ts`** is a one-directional flow, and each layer has exactly one job:
  - **`routes/`** only maps an HTTP method + path to a validator and a controller function. It contains zero logic.
  - **`controllers/`** are thin HTTP glue: read the (already-validated) request, call one service function, shape the JSON response, forward errors. A controller never talks to the database directly.
  - **`services/`** hold all the actual business logic and are the only layer allowed to run SQL queries.
  - **`config/db.ts`** is the single choke point for the actual database connection — nothing outside it is allowed to create its own connection pool.

  The payoff of this separation: when something breaks, you know exactly which layer to look in. A wrong HTTP status code is a controller or `error.middleware.ts` problem. Wrong data in the database is a services problem. A route returning 404 that shouldn't is a `routes/` problem. Without this separation, every bug hunt starts with "which of these 400 lines in one file is responsible," which does not scale past a handful of features.
- **`middlewares/validators/`** is its own subfolder specifically because validation schemas are numerous (one per endpoint, roughly) but small, and they're a genuinely different kind of file from the actual Express middleware functions living directly in `middlewares/`.
- **`utils/`** holds small, focused, *reusable* pure functions (no side effects where avoidable) that don't belong to any one feature — clinic timezone math, slot generation. If a function only makes sense for one feature, it stays a private helper inside that feature's service file instead of moving to `utils/` prematurely.
- **`types/`** holds hand-written TypeScript interfaces, one file per domain (appointments, patients, admin, auth). There's no ORM generating these from the database schema — you write them by hand and keep them in sync manually. Part 04 covers why that tradeoff was accepted.
- **`constants/`** holds small fixed value lists (like the set of valid appointment statuses) that need to be referenced from more than one place, specifically to prevent the exact kind of bug where one file says `'NoShow'` and another says `'No_Show'` and nothing catches the mismatch until it's live.

## Step 7 — Environment variables and `.gitignore`

Create `backend/.env` (and make sure it's gitignored — secrets should never be committed):

```
PORT=3000
DB_USER=postgres
DB_PASSWORD=your_local_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=harmonysmiles_db
JWT_SECRET=some_long_random_string
```

Create `backend/.gitignore`:

```
node_modules
.env
```

Why `dist/` is *not* in this `.gitignore` (a choice you might expect to be reversed): this project checks its compiled output into git. That's unusual for a typical open-source project, but it means a deploy that only runs `npm start` (no build step) still has something to run, as a safety net. Part 13 revisits this — the recommended deploy setup still runs a real build step on every deploy rather than relying on the committed `dist/` being current, but having it committed means the repo is never in a state where it literally cannot run.

## What you should have now

An empty but fully wired project: `npm run dev` starts (even with an empty `app.ts` that does nothing yet — try creating one with just `console.log('it runs')` to confirm your setup works before moving on). If `tsx watch src/server.ts` fails at this point, stop and fix it now — every later part assumes this foundation just works.

**Next:** [Part 02 — Designing the Database](02-database-design.md), where you'll design the actual data before writing a single line of API code — because you can't sensibly design an endpoint's validation or response shape until you know what you're validating and returning.
