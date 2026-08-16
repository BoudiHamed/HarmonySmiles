import { Appointment, AppointmentStatus, AppointmentWithPatient, CreateAppointmentDTO } from '../types/appointment.types.js';
import { DateRangePreset } from '../utils/clinicTime.js';
export declare const createAppointmentService: (data: CreateAppointmentDTO) => Promise<Appointment>;
export declare const getAvailableSlotsService: (date: string) => Promise<string[]>;
export interface ListAppointmentsFilters {
    status?: AppointmentStatus;
    search?: string;
    dateRange?: DateRangePreset;
}
export declare const listAppointmentsService: (filters: ListAppointmentsFilters) => Promise<AppointmentWithPatient[]>;
export interface PatientAppointmentsSplit {
    upcoming: Appointment[];
    past: Appointment[];
}
export declare const listAppointmentsByPatientIdService: (patientId: number) => Promise<PatientAppointmentsSplit>;
export declare const getAppointmentByIdService: (id: number) => Promise<AppointmentWithPatient>;
export declare const confirmAppointmentService: (id: number) => Promise<Appointment>;
export declare const cancelAppointmentService: (id: number) => Promise<Appointment>;
export declare const completeAppointmentService: (id: number) => Promise<Appointment>;
export declare const noShowAppointmentService: (id: number) => Promise<Appointment>;
export declare const deleteAppointmentService: (id: number) => Promise<void>;
//# sourceMappingURL=appointment.service.d.ts.map