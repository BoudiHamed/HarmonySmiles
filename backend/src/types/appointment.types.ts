import type { Patient } from './patient.types.js';

export type AppointmentStatus = 'Pending' | 'Confirmed' | 'Cancelled' | 'Completed' | 'NoShow';

export interface Appointment {
  id: number;
  patient_id: number;
  appointment_date: string;
  appointment_time: string;
  visit_reason: string | null;
  status: AppointmentStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// What admin.controller.ts actually gets back: an appointment joined with its patient's info.
export interface AppointmentWithPatient
  extends Appointment,
    Pick<Patient, 'first_name' | 'last_name' | 'phone' | 'medical_record_number'> {}

// GET /admin/patients/:id — a patient's full info plus their appointment history, split by date.
export interface PatientProfile {
  patient: Patient;
  upcomingAppointments: Appointment[];
  pastAppointments: Appointment[];
}

export interface CreateAppointmentDTO {
  first_name: string;
  last_name: string;
  phone: string;
  birth_year: number;
  gender: 'Male' | 'Female';
  email?: string;
  appointment_date: string;
  appointment_time: string;
  visit_reason?: string;
  notes?: string;
}

export interface UpdateAppointmentDTO {
  status?: AppointmentStatus;
  notes?: string;
}