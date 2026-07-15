"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMRN = void 0;
const generateMRN = async (client) => {
    const currentYear = new Date().getFullYear();
    const prefix = `HS-${currentYear}-`;
    const text = `
    SELECT medical_record_number 
    FROM patients 
    WHERE medical_record_number LIKE $1 
    ORDER BY id DESC 
    LIMIT 1
  `;
    const values = [`${prefix}%`];
    const res = await client.query(text, values);
    const lastPatient = res.rows.at(0);
    if (!lastPatient) {
        return `${prefix}0001`;
    }
    const lastMRN = lastPatient.medical_record_number;
    const lastSerialNumber = parseInt(lastMRN.replace(prefix, ''), 10);
    const nextSerialNumber = lastSerialNumber + 1;
    return `${prefix}${nextSerialNumber.toString().padStart(4, '0')}`;
};
exports.generateMRN = generateMRN;
//# sourceMappingURL=generateMRN.js.map