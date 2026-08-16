import { query, withTransaction } from '../config/db.js';
import { DatabaseError } from 'pg';
import { Appointment, AppointmentStatus, AppointmentWithPatient, CreateAppointmentDTO } from '../types/appointment.types.js';
import { AppError } from '../utils/AppError.js';
import { generateAvailableSlots } from '../utils/generateSlots.js';
import {
  DateRangePreset,
  getDateRangeForPreset,
  getClinicNowDateTime,
  getClinicTodayISODate,
  hasAppointmentDateTimePassed,
} from '../utils/clinicTime.js';

export const createAppointmentService = async (data: CreateAppointmentDTO): Promise<Appointment> => {
  try {
    return await withTransaction(async (client) => {
      // 1. Insert patient; MRN is derived from the new row's own id (nextval/currval).
      // ON CONFLICT(phone) avoids duplicate patients on concurrent signups.
      const upsertPatientText = `
        INSERT INTO patients (id, medical_record_number, first_name, last_name, phone, birth_year, gender, email)
        VALUES (
          nextval('patients_id_seq'),
          'HS-' || to_char(now(), 'YYYY') || '-' || lpad(currval('patients_id_seq')::text, 4, '0'),
          $1, $2, $3, $4, $5, $6
        )
        ON CONFLICT (phone) DO NOTHING
        RETURNING id
      `;
      const upsertPatientRes = await client.query<{ id: number }>(upsertPatientText, [
        data.first_name,
        data.last_name,
        data.phone,
        data.birth_year,
        data.gender,
        data.email ?? null,
      ]);

      let patientId: number;

      const [insertedPatient] = upsertPatientRes.rows;

      if (insertedPatient) {
        // New patient
        patientId = insertedPatient.id;
      } else {
        // Phone already exists, fetch its id
        const patientCheckRes = await client.query<{ id: number }>(
          'SELECT id FROM patients WHERE phone = $1 LIMIT 1',
          [data.phone]
        );
        const [existingPatient] = patientCheckRes.rows;
        if (!existingPatient) {
          throw new Error('failed to insert the new patient data');
        }
        patientId = existingPatient.id;
      }

      // 2. Insert appointment
      const insertAppointmentText = `
        INSERT INTO appointments (patient_id, appointment_date, appointment_time, visit_reason, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const appointmentRes = await client.query<Appointment>(insertAppointmentText, [
        patientId,
        data.appointment_date,
        data.appointment_time,
        data.visit_reason ?? null,
        data.notes ?? null,
      ]);

      // Verify the insert succeeded before committing
      const [createdAppointment] = appointmentRes.rows;
      if (!createdAppointment) {
        throw new Error('failed to book the appointment');
      }

      return createdAppointment;
    });
  } catch (error: unknown) {
    if (error instanceof DatabaseError && error.constraint === 'unique_active_appointment') {
      throw new AppError('failed to book the appointment try again later.', 409);
    }

    throw error;
  }
};

export const getAvailableSlotsService = async (date: string): Promise<string[]> => {
  const bookedRes = await query<{ appointment_time: string }>(
    `SELECT appointment_time FROM appointments WHERE appointment_date = $1 AND status IN ('Pending', 'Confirmed')`,
    [date]
  );

  const bookedTimes = bookedRes.rows.map((row) => row.appointment_time);

  return generateAvailableSlots(date, bookedTimes);
};

// Flip any still-Pending/Confirmed appointment whose date+time has already passed to NoShow.
// Admin can still correct a wrongly-flagged one back via completeAppointmentService.
const markPastAppointmentsAsNoShow = async (): Promise<void> => {
  const { date, time } = getClinicNowDateTime();
  await query(
    `UPDATE appointments
     SET status = 'NoShow', updated_at = now()
     WHERE status IN ('Pending', 'Confirmed')
       AND (appointment_date < $1 OR (appointment_date = $1 AND appointment_time < $2))`,
    [date, time]
  );
};

export interface ListAppointmentsFilters {
  status?: AppointmentStatus;
  search?: string;
  dateRange?: DateRangePreset;
}

export const listAppointmentsService = async (filters: ListAppointmentsFilters): Promise<AppointmentWithPatient[]> => {
  await markPastAppointmentsAsNoShow();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`a.status = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length} OR p.phone ILIKE $${params.length})`
    );
  }

  if (filters.dateRange) {
    const { from, to } = getDateRangeForPreset(filters.dateRange);

    if (from !== undefined) {
      params.push(from);
      conditions.push(`a.appointment_date >= $${params.length}`);
    }

    if (to !== undefined) {
      params.push(to);
      conditions.push(`a.appointment_date <= $${params.length}`);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query<AppointmentWithPatient>(
    `SELECT a.*, p.first_name, p.last_name, p.phone, p.medical_record_number
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     ${whereClause}
     ORDER BY a.appointment_date, a.appointment_time`,
    params
  );

  return result.rows;
};

export interface PatientAppointmentsSplit {
  upcoming: Appointment[];
  past: Appointment[];
}

// All of a patient's appointments (any status), split into upcoming vs past for a profile view.
export const listAppointmentsByPatientIdService = async (patientId: number): Promise<PatientAppointmentsSplit> => {
  await markPastAppointmentsAsNoShow();

  const result = await query<Appointment>(
    `SELECT * FROM appointments WHERE patient_id = $1 ORDER BY appointment_date, appointment_time`,
    [patientId]
  );

  const todayStr = getClinicTodayISODate();

  return {
    upcoming: result.rows.filter((a) => a.appointment_date >= todayStr),
    past: result.rows.filter((a) => a.appointment_date < todayStr),
  };
};

export const getAppointmentByIdService = async (id: number): Promise<AppointmentWithPatient> => {
  await markPastAppointmentsAsNoShow();

  const result = await query<AppointmentWithPatient>(
    `SELECT a.*, p.first_name, p.last_name, p.phone, p.medical_record_number
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.id = $1`,
    [id]
  );

  const [appointment] = result.rows;
  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  return appointment;
};

const updateAppointmentStatusService = async (id: number, status: AppointmentStatus): Promise<Appointment> => {
  const result = await query<Appointment>(
    `UPDATE appointments SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [status, id]
  );

  const [appointment] = result.rows;
  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  return appointment;
};

// Re-confirming an old Cancelled/Completed/NoShow appointment can collide with a different
// appointment that has since taken its date+time slot — catch that the same way
// createAppointmentService does, instead of letting the raw constraint violation surface as a 500.
export const confirmAppointmentService = async (id: number): Promise<Appointment> => {
  try {
    return await updateAppointmentStatusService(id, 'Confirmed');
  } catch (error: unknown) {
    if (error instanceof DatabaseError && error.constraint === 'unique_active_appointment') {
      throw new AppError('That slot is already booked by another appointment.', 409);
    }
    throw error;
  }
};

export const cancelAppointmentService = (id: number): Promise<Appointment> => updateAppointmentStatusService(id, 'Cancelled');

// Only allowed once the appointment's own date+time has arrived — an appointment can't be
// marked completed ahead of when it's actually scheduled to happen.
export const completeAppointmentService = async (id: number): Promise<Appointment> => {
  const result = await query<Appointment>('SELECT * FROM appointments WHERE id = $1', [id]);
  const [appointment] = result.rows;

  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  if (!hasAppointmentDateTimePassed(appointment.appointment_date, appointment.appointment_time)) {
    throw new AppError('Cannot mark an appointment as completed before its scheduled date and time', 409);
  }

  return updateAppointmentStatusService(id, 'Completed');
};

// Same time gate as completeAppointmentService — a patient can't be marked as having missed
// an appointment that hasn't happened yet. Lets an admin apply NoShow immediately rather
// than waiting for the next markPastAppointmentsAsNoShow sweep.
export const noShowAppointmentService = async (id: number): Promise<Appointment> => {
  const result = await query<Appointment>('SELECT * FROM appointments WHERE id = $1', [id]);
  const [appointment] = result.rows;

  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  if (!hasAppointmentDateTimePassed(appointment.appointment_date, appointment.appointment_time)) {
    throw new AppError('Cannot mark an appointment as no-show before its scheduled date and time', 409);
  }

  return updateAppointmentStatusService(id, 'NoShow');
};

export const deleteAppointmentService = async (id: number): Promise<void> => {
  const result = await query('DELETE FROM appointments WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    throw new AppError('Appointment not found', 404);
  }
};
