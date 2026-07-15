import { withTransaction } from '../config/db.js';
import { DatabaseError } from 'pg';
import { CreateAppointmentDTO } from '../types/appointment.types.js';
import { AppError } from '../utils/AppError.js';

export const createAppointmentService = async (data: CreateAppointmentDTO): Promise<unknown> => {
  try {
    return await withTransaction(async (client) => {
      // 1. Insert patient; MRN is derived from the new row's own id (nextval/currval).
      // ON CONFLICT(phone) avoids duplicate patients on concurrent signups.
      const upsertPatientText = `
        INSERT INTO patients (id, medical_record_number, full_name, phone, birth_year, gender, email)
        VALUES (
          nextval('patients_id_seq'),
          'HS-' || to_char(now(), 'YYYY') || '-' || lpad(currval('patients_id_seq')::text, 4, '0'),
          $1, $2, $3, $4, $5
        )
        ON CONFLICT (phone) DO NOTHING
        RETURNING id
      `;
      const upsertPatientRes = await client.query<{ id: number }>(upsertPatientText, [
        data.full_name,
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
          throw new Error('فشل في تسجيل بيانات المريض الجديد.');
        }
        patientId = existingPatient.id;
      }

      // 2. Insert appointment
      const insertAppointmentText = `
        INSERT INTO appointments (patient_id, appointment_date, appointment_time, visit_reason, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const appointmentRes = await client.query(insertAppointmentText, [
        patientId,
        data.appointment_date,
        data.appointment_time,
        data.visit_reason ?? null,
        data.notes ?? null,
      ]);

      // Verify the insert succeeded before committing
      const [createdAppointment] = appointmentRes.rows;
      if (!createdAppointment) {
        throw new Error('فشل في إتمام عملية حجز الموعد.');
      }

      return createdAppointment;
    });
  } catch (error: unknown) {
    if (error instanceof DatabaseError && error.constraint === 'unique_active_appointment') {
      throw new AppError('عذراً يا فندم، هذا الموعد تم حجزه بالفعل! يرجى اختيار وقت آخر.', 409);
    }

    throw error;
  }
};
