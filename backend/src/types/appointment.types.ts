export type AppointmentStatus = 'Pending' | 'Confirmed' | 'Cancelled' | 'Completed' | 'No_Show';

export interface Appointment {
  id: number;
  patient_id: number;
  appointment_date: Date;
  status: AppointmentStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface createAppointment {
    patient_id : number;
    appointment_date : string;
    notes? : string
}

export interface updateAppointment {
    status? : AppointmentStatus;
    notes? : string
}