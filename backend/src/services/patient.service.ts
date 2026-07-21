import { query } from '../config/db.js';
import { Patient } from '../types/patient.types.js';

export interface ListPatientsFilters {
  search?: string;
}

export const listPatientsService = async (filters: ListPatientsFilters): Promise<Patient[]> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR medical_record_number ILIKE $${params.length})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query<Patient>(
    `SELECT id, medical_record_number, first_name, last_name, phone, birth_year, gender, email, created_at, updated_at
     FROM patients
     ${whereClause}
     ORDER BY last_name, first_name`,
    params
  );

  return result.rows;
};
