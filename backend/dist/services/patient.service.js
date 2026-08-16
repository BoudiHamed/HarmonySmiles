import { query } from '../config/db.js';
import { getClinicNow } from '../utils/clinicTime.js';
import { AppError } from '../utils/AppError.js';
export const listPatientsService = async (filters) => {
    const conditions = [];
    const params = [];
    if (filters.search) {
        params.push(`%${filters.search}%`);
        conditions.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR medical_record_number ILIKE $${params.length})`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    // No DOB is stored, only birth_year — age is derived from it against the clinic's
    // current year (not the DB server's) each time the table is fetched, never persisted,
    // so it's always correct without needing a yearly update job.
    params.push(getClinicNow().getFullYear());
    const currentYearParam = `$${params.length}`;
    const result = await query(`SELECT id, medical_record_number, first_name, last_name, phone,
            (${currentYearParam}::int - birth_year) AS age, gender, email, created_at, updated_at
     FROM patients
     ${whereClause}
     ORDER BY medical_record_number`, params);
    return result.rows;
};
export const getPatientByIdService = async (id) => {
    const result = await query(`SELECT id, medical_record_number, first_name, last_name, phone,
            ($2::int - birth_year) AS age, gender, email, created_at, updated_at
     FROM patients
     WHERE id = $1`, [id, getClinicNow().getFullYear()]);
    const [patient] = result.rows;
    if (!patient) {
        throw new AppError('Patient not found', 404);
    }
    return patient;
};
//# sourceMappingURL=patient.service.js.map