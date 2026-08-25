# HarmonySmiles Backend — The Complete Build Guide

## What this is

This is a from-scratch, step-by-step walkthrough of how the HarmonySmiles backend and database were built — not just *what* the code does, but *why* it was written the way it was, *why* the files are split up the way they are, and what would go wrong if you skipped each step or did it differently.

It's written for someone who has never built a project like this before: a real API backed by a real database, with authentication, validation, and error handling done properly. If you follow these parts in order, typing the code out yourself (don't just copy-paste — you'll learn more typing it), you will end up with a working clone of this backend, and — more importantly — you'll understand *why every piece is where it is*.

This guide only covers the **backend** (`backend/`) and the **database** (`database/schema.sql`), since that's where almost all of the actual engineering decisions live. The frontend is plain static HTML/CSS/JS with no build step — Part 12 covers just enough of it to show how it talks to the backend you'll have built.

## Who this is for

You should be comfortable with:
- Basic JavaScript (variables, functions, `async`/`await`, arrays, objects)
- Running commands in a terminal
- The general idea of "client sends a request, server sends back a response"

You do **not** need to already know:
- TypeScript
- Express
- SQL / PostgreSQL
- JWT authentication
- Any of this — that's what the guide teaches, in the order you'd actually need it.

## How the project is really built: vertical slices, not horizontal layers

A tempting but wrong way to build this project would be: "write all the routes, then all the controllers, then all the services." That sounds organized, but it means you can't test anything until the very end, and you'll be writing code for layers you don't understand yet because you haven't seen how they're used.

Instead, this guide builds the project the way it was actually built: **foundations first** (project setup, database, DB connection, error handling — the things everything else depends on), then **one complete vertical slice** at a time (route → validator → controller → service → back out), starting with the simplest possible feature (booking an appointment) and only adding complexity (authentication, admin CRUD) once the simple case works end-to-end.

This matters because it's also *why the code is organized the way it is*. Once you've built one full vertical slice by hand, the layered folder structure (`routes/`, `controllers/`, `services/`, `middlewares/`) stops looking like arbitrary ceremony and starts looking like the only sane way to keep six different concerns (routing, input validation, HTTP response shaping, business logic, database access, error handling) from turning into one giant tangled file.

## The parts

Read them in order — each one assumes you've done the previous ones.

| Part | Title | What you'll build |
|---|---|---|
| [01](01-project-setup-and-tooling.md) | Project Setup & Tooling | An empty but correctly configured TypeScript/ESM Node project — the single most silently-broken step if done wrong |
| [02](02-database-design.md) | Designing the Database | `database/schema.sql` — three tables, and the one index that does most of the actual work in this app |
| [03](03-database-connection-layer.md) | The Database Connection Layer | `src/config/db.ts` — the only file in the project allowed to talk to Postgres directly |
| [04](04-foundations-errors-and-types.md) | Foundations: Errors & Types | `AppError`, `error.middleware.ts`, and the hand-written TypeScript types every other file leans on |
| [05](05-validation-layer.md) | The Validation Layer | Zod schemas and a single generic `validate()` middleware, instead of hand-checking `req.body` in every controller |
| [06](06-the-first-vertical-slice-booking.md) | The First Vertical Slice: Booking an Appointment | Route → validator → controller → service, wired end to end, with a real database transaction |
| [07](07-clinic-time-and-available-slots.md) | Clinic Time & Available Slots | Why "what time is it" needed its own file, and how free slots get computed |
| [08](08-admin-authentication.md) | Admin Authentication | Password hashing, JWTs, and the timing-attack you'd never think to defend against |
| [09](09-protecting-admin-routes.md) | Protecting Admin Routes | One middleware, one line of router ordering, and every future admin route is safe by construction |
| [10](10-admin-crud-appointments-and-patients.md) | Admin CRUD: Appointments & Patients | The dashboard's entire backend surface — list, filter, confirm, cancel, complete, delete |
| [11](11-seeding-the-first-admin.md) | Seeding the First Admin | The chicken-and-egg problem of "how do you log in before any admin account exists" |
| [12](12-wiring-the-frontend.md) | Wiring the Frontend | How the plain-HTML booking form and admin dashboard actually call this API |
| [13](13-deploying-to-render.md) | Deploying to Render | Taking it from your machine to the public internet, and the four ways that silently fails |

## A note on "why," repeated throughout

Every part follows the same rhythm for each piece of code:

1. **The problem** — what goes wrong, or what's impossible, without this code.
2. **The code** — what you actually type.
3. **Why it's shaped this way** — the specific reasoning, including alternatives that were considered and rejected, and mistakes that are easy to make here specifically (some of which really happened while this project was being built).

If you only remember one thing from this whole guide, make it this: **every file in this backend exists because some specific problem needed solving, not because "that's how Express projects are organized."** Once you can explain *why* each file exists in your own words, you understand this codebase — and you'll be equipped to make the same kind of decision yourself the next time you need a new file.

Start with [Part 01 — Project Setup & Tooling](01-project-setup-and-tooling.md).
