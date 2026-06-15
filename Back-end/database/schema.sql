

-- 1. ADMINS TABLE


CREATE TABLE IF NOT EXISTS admins (
id SERIAL PRIMARY KEY,

username VARCHAR(50) UNIQUE NOT NULL,

password_hash VARCHAR(255) NOT NULL,

created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP


);

 
-- 2. PATIENTS TABLE


CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    medical_record_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(50) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    birth_year INTEGER NOT NULL, 
    gender VARCHAR(10) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_gender
        CHECK (gender IN ('Male', 'Female'))
);


-- 3. APPOINTMENTS TABLE


CREATE TABLE IF NOT EXISTS appointments (
id SERIAL PRIMARY KEY,
patient_id INTEGER NOT NULL,

appointment_date DATE NOT NULL,

appointment_time TIME NOT NULL,

visit_reason VARCHAR(255),

notes TEXT,

status VARCHAR(20) DEFAULT 'Pending',

created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT fk_patient
    FOREIGN KEY (patient_id)
    REFERENCES patients(id)
    ON DELETE RESTRICT,

CONSTRAINT check_status
    CHECK (
        status IN (
            'Pending',
            'Confirmed',
            'Completed',
            'Cancelled',
            'NoShow'
        )
    )


);
-- 4. UNIQUE ACTIVE APPOINTMENT INDEX
-- Prevent double booking.
-- Cancelled appointments do not block the slot.

CREATE UNIQUE INDEX unique_active_appointment
ON appointments (
appointment_date,
appointment_time
)
WHERE status IN ('Pending', 'Confirmed');

-- 5. PERFORMANCE INDEXES

CREATE INDEX idx_patients_phone
ON patients(phone);

CREATE INDEX idx_appointments_date
ON appointments(appointment_date);

CREATE INDEX idx_appointments_patient
ON appointments(patient_id);
