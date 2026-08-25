# Part 02 — Designing the Database

## Why the database comes before any API code

It's tempting to start with "let's write the `POST /appointments` route" — but a route's job is to accept some input, validate it, and store it *somewhere*. If you don't know the exact shape of that "somewhere" yet, you'll end up redesigning your validation and your response shapes every time you change your mind about the schema. Design the data first, and the API becomes a much more mechanical exercise of "expose this data safely."

This project uses **plain PostgreSQL with hand-written SQL** — no ORM (Object-Relational Mapper) like Prisma, TypeORM, or Sequelize, and no migration tool. That's worth defending up front, since it's the opposite of what a lot of tutorials default to:

- **No ORM** means every query is SQL you wrote and can read directly — nothing is generated, nothing is "magic." For a project this size (three tables, a handful of endpoints), an ORM's abstraction saves very little typing and costs you a layer of indirection every time something needs precise control — like the partial unique index you're about to build, which most ORMs don't model well at all.
- **No migration tool** means schema changes are applied by hand, by literally re-running `schema.sql` (or the relevant new statements) against Postgres. This is a real limitation — it means nothing detects "the code expects a column that isn't actually in this database" — but it's an honest, visible limitation rather than a false sense of safety from partial migration tooling.

Create `database/schema.sql`. You'll build it table by table.

## Table 1 — `admins`

```sql
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

The simplest table in the schema, and worth starting with because every choice here recurs in the other two tables:

- **`SERIAL PRIMARY KEY`** — an auto-incrementing integer id. Postgres creates a hidden sequence behind the scenes and hands out the next number on every insert. This is what Part 03/06 will later read back via `RETURNING id`.
- **`username VARCHAR(50) UNIQUE NOT NULL`** — the `UNIQUE` constraint means Postgres itself will reject a second admin with the same username, at the database level — not something your application code has to remember to check. This is a recurring theme in this schema: push invariants down into the database where possible, so a bug in application logic can't silently violate them.
- **`password_hash`, never `password`** — the column name itself is a design decision. There is no code path anywhere in this project that stores a plaintext password. By the time anything reaches this table, it's already been through `bcrypt` (Part 08). Naming the column `password_hash` rather than `password` is a small but genuinely useful guardrail — it makes it obvious to anyone reading a query later that whatever's in there isn't meant to be compared directly.
- **`TIMESTAMPTZ` for `created_at`/`updated_at`** — not `TIMESTAMP` (without time zone). `TIMESTAMPTZ` stores an actual instant in time (internally, UTC), and Postgres converts it for display based on whatever session timezone you're querying from. This matters because it means these columns are unambiguous no matter where your server or your database happen to physically run — a real problem you'll deal with head-on for a *different* column type in `appointments`, below.

## Table 2 — `patients`

```sql
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    medical_record_number VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(30) UNIQUE NOT NULL,
    birth_year INTEGER NOT NULL,
    gender VARCHAR(10) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_gender CHECK (gender IN ('Male', 'Female'))
);
```

A few choices here that ripple all the way into the application code you'll write in later parts:

- **`phone VARCHAR(30) UNIQUE NOT NULL`** — this single constraint is what Part 06's transactional booking logic leans on entirely. A patient is identified by their phone number, and the database guarantees no two patient rows can share one. When you get to `createAppointmentService`, you'll write an `INSERT ... ON CONFLICT (phone) DO NOTHING` — that syntax is only legal, and only does anything useful, *because* this constraint exists. Don't drop it later without realizing you've also broken that upsert logic.
- **`birth_year INTEGER`, not a full date of birth.** The clinic only needs a patient's age, and only needs it approximately. Storing just the birth year (rather than a full `DATE` of birth) is a deliberate minimalism — it's enough to compute "age" correctly for the dashboard, sidesteps needing to ask patients for a day/month they might not want to share for a dental appointment, and avoids a whole category of "is this age off by one depending on whether their birthday has happened yet this year" edge cases that a full DOB would introduce and that nobody asked for. You'll see in Part 10 that age is computed **on every read**, in SQL, from `current_year - birth_year` — never stored, so it's automatically correct every January 1st without a scheduled job to update it.
- **`CHECK (gender IN ('Male', 'Female'))`** — a database-level constraint enforcing the same rule your Zod schema (Part 05) will also enforce at the API boundary. This is intentional duplication, not redundancy you should "clean up": the API validation exists to give a client a nice, immediate `400` error with a clear message; the database constraint exists as a last line of defense against *any* code path that inserts a row — including a future script, a manual `psql` session, or a bug that bypasses the validator. Defense in depth: each layer assumes the other might fail.
- **`medical_record_number VARCHAR(20) UNIQUE NOT NULL`** — reserved here, but you won't generate this value in SQL as a default. Part 06 shows exactly how it's derived (from the row's own `id`, at insert time) and why that specific approach avoids a whole class of race conditions a separate "generate an MRN" utility function would risk.

## Table 3 — `appointments`, and the constraint that does the real work

```sql
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    visit_reason VARCHAR(255),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_patient
        FOREIGN KEY (patient_id)
        REFERENCES patients(id)
        ON DELETE RESTRICT,

    CONSTRAINT check_status
        CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled', 'NoShow'))
);
```

Walk through each piece:

- **`appointment_date DATE`, `appointment_time TIME` — two separate columns, not one `TIMESTAMP`.** This looks like it makes date math more annoying (and in a couple of places, it genuinely does — see Part 07), but it's correct on purpose. An appointment at "10:00 on March 5th" is a *calendar concept* — a fact about the clinic's schedule — not an instant in universal time. A `TIMESTAMP`/`TIMESTAMPTZ` column would force you to pick a timezone interpretation for that value, and if the server, the database, and the clinic itself are all in different timezones (a real situation this project ran into — the dev machine runs in one timezone, the clinic is physically in Switzerland), a timestamp-based column becomes a constant source of off-by-one-day bugs. Plain `DATE`/`TIME` columns have no timezone baked in at all — they're just calendar numbers, which is exactly what an appointment slot actually is. (Part 03 covers a real bug this still caused, and the fix, at the driver level.)
- **`patient_id ... ON DELETE RESTRICT`** — this is a specific, deliberate choice among three options Postgres offers for what happens to an appointment when its patient is deleted: `CASCADE` (delete the appointments too), `SET NULL` (orphan them), or `RESTRICT` (refuse the delete entirely). `RESTRICT` was chosen because a patient with appointment history represents real clinic records — silently deleting their appointments (`CASCADE`) or leaving broken orphaned rows (`SET NULL`) both destroy information a real dental clinic would need to keep. `RESTRICT` forces a human decision: you cannot delete a patient who has appointments, full stop, until you've deliberately dealt with those appointments first.
- **`status VARCHAR(20) DEFAULT 'Pending'`** plus a `CHECK` constraint — same "belt and suspenders" reasoning as `gender` above. A brand new appointment starts life as `'Pending'` unless told otherwise, and no row can ever have a status outside this fixed set, no matter what inserts it.

### The unique index that makes the whole booking system correct

This is the single most important piece of database design in this project, so it gets its own section.

```sql
CREATE UNIQUE INDEX unique_active_appointment
ON appointments (appointment_date, appointment_time)
WHERE status IN ('Pending', 'Confirmed');
```

**The problem this solves:** two patients must never be able to book the exact same clinic slot (same date, same time). This sounds like something you could check in application code — "before inserting, query whether this slot is already taken, and if not, insert." But that check-then-insert pattern has a **race condition**: if two people submit a booking for the same slot within milliseconds of each other, both requests can pass the "is it free?" check *before either has actually inserted anything*, and you end up with two appointments in the same slot anyway. This isn't a hypothetical — it's a textbook concurrency bug, and the more successful a booking page is, the more likely two people are to hit "Book" around the same moment for a popular slot.

**Why a *partial* unique index, not a plain one:** a plain `UNIQUE (appointment_date, appointment_time)` index would also stop the double-booking — but it would *also* permanently block that slot forever, even after the original appointment is cancelled. A cancelled appointment shouldn't hold a slot hostage. The `WHERE status IN ('Pending', 'Confirmed')` clause makes the uniqueness rule apply only to *active* appointments — Postgres only enforces "no duplicates" among rows currently in one of those two statuses. The moment an appointment becomes `'Cancelled'`, `'Completed'`, or `'NoShow'`, it drops out of the set this index cares about, and that date+time slot becomes bookable again.

**Why this lives in the database instead of application code:** because the database is the one place that can guarantee this rule *atomically*, even under real concurrent load, without you having to write your own locking logic. When you get to Part 06, you'll see the actual application-level consequence of this design: `createAppointmentService` doesn't pre-check slot availability at all before inserting — it just tries the insert, and if this index rejects it (because someone else's booking beat it there by milliseconds), Postgres throws a specific, catchable error that the service translates into a clean "sorry, that slot's taken" response. The database *is* the source of truth for whether a slot is free — not a query your application ran a moment earlier that might already be stale.

## Performance indexes

```sql
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
```

Two more indexes, for a completely different reason than the one above — these are pure performance, with no correctness implication if you left them out. The admin dashboard filters and sorts appointments by date constantly (Part 10), and looks up a patient's appointment history by `patient_id` on the profile page — without these indexes, both of those queries would force Postgres to scan every row in the table to find matches, which is fine at a few hundred rows and would start to hurt as the table grows. (Note that `patients.phone` doesn't need a separate performance index — its own `UNIQUE` constraint from Table 2 already creates one automatically as a side effect.)

## Applying the schema

There's no migration tool, so "applying the schema" just means running this file directly against a real Postgres database:

```bash
psql "postgresql://user:password@host:5432/dbname" -f database/schema.sql
```

Every `CREATE TABLE IF NOT EXISTS` is safe to re-run — it won't error out if the tables already exist. This is useful for local development (re-running the whole file after a fresh `docker run postgres` or similar), but it is **not** a substitute for a real migration tool if the schema needs to change later on a database that already has data in it — `IF NOT EXISTS` won't add a new column to an existing table, for instance. For a project this size, that tradeoff is accepted; for a larger one, this is exactly the kind of thing you'd introduce a tool like `node-pg-migrate` or `Prisma Migrate` for.

## What you should have now

A real, running Postgres database with three tables, the correct constraints, and the one index that makes concurrent booking safe. Nothing has queried it yet — that starts in the next part.

**Next:** [Part 03 — The Database Connection Layer](03-database-connection-layer.md), where you'll write the one file in the entire project allowed to actually open a connection to this database.
