import { z } from 'zod';
import { ALLOWED_APPOINTMENT_STATUSES } from '../../constants/appointment.constants.js';

export const listAppointmentsSchema = z.object({
  query: z
    .object({
      status: z.enum(ALLOWED_APPOINTMENT_STATUSES).optional(),
      search: z.string().trim().min(1).optional(),
      date_range: z.enum(['today', 'tomorrow', 'week', 'month']).optional(),
    })
    .strict(),
});

export const listPatientsSchema = z.object({
  query: z
    .object({
      search: z.string().trim().min(1).optional(),
    })
    .strict(),
});

export const appointmentIdParamSchema = z.object({
  params: z
    .object({
      id: z.coerce
        .number({ error: 'Appointment id is required' })
        .int('Appointment id must be an integer')
        .positive('Appointment id must be positive'),
    })
    .strict(),
});

export const patientIdParamSchema = z.object({
  params: z
    .object({
      id: z.coerce
        .number({ error: 'Patient id is required' })
        .int('Patient id must be an integer')
        .positive('Patient id must be positive'),
    })
    .strict(),
});
