import { Appointment, AppointmentStatus, AppointmentWithPatient, CreateAppointmentDTO } from '../types/appointment.types.js';
export declare const createAppointmentService: (data: CreateAppointmentDTO) => Promise<Appointment>;
export declare const getAvailableSlotsService: (date: string) => Promise<string[]>;
export interface ListAppointmentsFilters {
    status?: AppointmentStatus;
    search?: string;
}
export declare const listAppointmentsService: (filters: ListAppointmentsFilters) => Promise<AppointmentWithPatient[]>;
export declare const getAppointmentByIdService: (id: number) => Promise<AppointmentWithPatient>;
export declare const confirmAppointmentService: (id: number) => Promise<Appointment>;
export declare const cancelAppointmentService: (id: number) => Promise<Appointment>;
export declare const deleteAppointmentService: (id: number) => Promise<void>;
//# sourceMappingURL=appointment.service.d.ts.map