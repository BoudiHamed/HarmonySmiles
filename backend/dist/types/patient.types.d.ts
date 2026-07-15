export interface patients {
    id: number;
    full_name: string;
    email: string | null;
    phone: string;
    medical_record_number: string;
    age: number;
    gender: "Male" | "Female";
    created_at: Date;
    updated_at: Date;
}
export interface createPatient {
    full_name: string;
    email?: string;
    phone: string;
    birth_year: number;
    gender: 'Male' | 'Female';
}
export interface updatePatient {
    full_name?: string;
    email?: string;
    phone?: string;
    gender?: 'Male' | 'Female';
}
//# sourceMappingURL=patient.types.d.ts.map