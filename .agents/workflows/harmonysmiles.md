---
description: Skill / Project Specification: Dental Clinic Reservation System
---

Project Goal
Build a complete Full Stack Dental Clinic Reservation System suitable for Real dental Clinic.
Understand SQL deeply.

Use the latest syntax of technologies(typescript,postgressql,express ...etc)

Use raw PostgreSQL queries through Node.js.

Tech Stack
Frontend: HTML5, CSS3, Bootstrap 5, Vanilla JavaScript, Fetch API.

Backend: Node.js, Typescript, Express.js.

Database: PostgreSQL (using pg package only. No ORMs).

Authentication: JWT, bcrypt.

Other Packages: cors, dotenv, nodemon.

General Rules
Follow Solid princples.

Follow clean architecture principles (Separate routes, controllers, middleware, and repository logic).

Write readable code with explanatory short comments.

Use async/await for asynchronous operations.

Use parameterized SQL queries ($1, $2) to prevent SQL Injection. Never concatenate SQL strings directly.

Handle all errors gracefully with meaningful HTTP status codes and JSON responses.

Business & Advanced Logic Requirements
1. User Features (Public)
View clinic info, services, and open the reservation form.

Fill details and submit a reservation without creating an account (No registration/login for patients).

Smart Available Slots (GET /available-slots):

System must return only free 30-minute slots between 10:00 AM and 6:00 PM.

Friday is completely unavailable. Past dates are rejected.

Smart Filter: If the user checks slots for "today", the system must filter out and exclude slots that have already passed in the current day's hours.

2. Admin Features (Protected)
Login using username/password.

View all appointments ordered by date and time, search/filter appointments.

Confirm, Cancel, or Delete appointments (All admin routes must be protected using JWT).

Admin Seeding: An admin account must be created via a database seed script (seed.js) using hashed passwords before the app starts.

3. Advanced Reservation Logic (Database Transactions)
When a patient submits a reservation, the operation must run inside a Database Transaction (BEGIN ... COMMIT / ROLLBACK):

Step 1: Check if patient exists by phone number (SELECT id FROM patients WHERE phone = $1).

Step 2: If patient doesn't exist, INSERT the patient and retrieve the new id.

Step 3: INSERT the appointment into the appointments table using the patient id.

Step 4: If any error occurs (e.g., duplicate slot exception or database crash), trigger a ROLLBACK.

Database Design (dental_clinic)
Tables & Schema
admins Table:

id (SERIAL PRIMARY KEY)

username (VARCHAR(50) UNIQUE NOT NULL)

password_hash (VARCHAR(255) NOT NULL)

created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

patients Table:

id (SERIAL PRIMARY KEY)

full_name (VARCHAR(100) NOT NULL)

phone (VARCHAR(30) UNIQUE NOT NULL)

email (VARCHAR(100))

created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

appointments Table:

id (SERIAL PRIMARY KEY)

patient_id (INTEGER NOT NULL)

appointment_date (DATE NOT NULL)

appointment_time (TIME NOT NULL)

status (VARCHAR(20) DEFAULT 'Pending')

Allowed values: Pending, Confirmed, Cancelled

notes (TEXT)

created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

Constraints & Indexes
Foreign Key: FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT

Partial Unique Index (Crucial Fix): * CREATE UNIQUE INDEX unique_active_appointment ON appointments (appointment_date, appointment_time) WHERE status != 'Cancelled';

Purpose: Prevents double-booking a time slot, but allows a slot to be re-booked if the previous appointment was cancelled.

API Requirements (Base URL: /api)
Public Endpoints
POST /appointments

Creates a reservation.

GET /available-slots?date=YYYY-MM-DD

Returns available time slots.

Admin Endpoints
POST /admin/login

Returns { "token": "JWT_TOKEN" }.

GET /admin/appointments (Protected)

Returns all appointments ordered by date/time.

GET /admin/appointments/:id (Protected)

Returns appointment details.

PATCH /admin/appointments/:id/confirm (Protected)

Sets status to Confirmed.

PATCH /admin/appointments/:id/cancel (Protected)

Sets status to Cancelled.

DELETE /admin/appointments/:id (Protected)


Deletes appointment.