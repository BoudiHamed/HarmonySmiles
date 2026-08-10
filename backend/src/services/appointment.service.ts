import { query, withTransaction } from '../config/db.js';
import { DatabaseError } from 'pg';
import { Appointment, AppointmentStatus, AppointmentWithPatient, CreateAppointmentDTO } from '../types/appointment.types.js';
import { AppError } from '../utils/AppError.js';
import { generateAvailableSlots } from '../utils/generateSlots.js';
import { DateRangePreset, getDateRangeForPreset } from '../utils/clinicTime.js';

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

export interface ListAppointmentsFilters {
  status?: AppointmentStatus;
  search?: string;
  dateRange?: DateRangePreset;
}

export const listAppointmentsService = async (filters: ListAppointmentsFilters): Promise<AppointmentWithPatient[]> => {
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
    params.push(from, to);
    conditions.push(`a.appointment_date BETWEEN $${params.length - 1} AND $${params.length}`);
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

export const getAppointmentByIdService = async (id: number): Promise<AppointmentWithPatient> => {
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

export const confirmAppointmentService = (id: number): Promise<Appointment> => updateAppointmentStatusService(id, 'Confirmed');

export const cancelAppointmentService = (id: number): Promise<Appointment> => updateAppointmentStatusService(id, 'Cancelled');

export const deleteAppointmentService = async (id: number): Promise<void> => {
  const result = await query('DELETE FROM appointments WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    throw new AppError('Appointment not found', 404);
  }
};
