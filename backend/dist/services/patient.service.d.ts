import { Patient } from '../types/patient.types.js';
export interface ListPatientsFilters {
    search?: string;
}
export declare const listPatientsService: (filters: ListPatientsFilters) => Promise<Patient[]>;
export declare const getPatientByIdService: (id: number) => Promise<Patient>;
//# sourceMappingURL=patient.service.d.ts.map