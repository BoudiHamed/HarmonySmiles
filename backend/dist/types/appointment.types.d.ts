export type AppointmentStatus = 'Pending' | 'Confirmed' | 'Cancelled' | 'Completed' | 'NoShow';
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
    patient_id: number;
    appointment_date: string;
    appointment_time: string;
    visit_reason: string;
    notes?: string;
}
export interface CreateAppointmentDTO {
    full_name: string;
    phone: string;
    birth_year: number;
    gender: 'Male' | 'Female';
    email?: string;
    appointment_date: string;
    appointment_time: string;
    visit_reason?: string;
    notes?: string;
}
export interface updateAppointment {
    status?: AppointmentStatus;
    notes?: string;
}
//# sourceMappingURL=appointment.types.d.ts.map