export interface Patient {
  id: number;
  medical_record_number: string;
  first_name: string;
  last_name: string;
  phone: string;
  birth_year: number;
  gender: 'Male' | 'Female';
  email: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePatientDTO {
  first_name: string;
  last_name: string;
  phone: string;
  birth_year: number;
  gender: 'Male' | 'Female';
  email?: string;
}

export interface UpdatePatientDTO {
  first_name?: string;
  last_name?: string;
  phone?: string;
  gender?: 'Male' | 'Female';
  email?: string;
}
