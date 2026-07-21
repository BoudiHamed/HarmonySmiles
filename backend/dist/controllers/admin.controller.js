import { listAppointmentsService, getAppointmentByIdService, confirmAppointmentService, cancelAppointmentService, deleteAppointmentService, } from '../services/appointment.service.js';
import { listPatientsService } from '../services/patient.service.js';
/** List all appointments, ordered by date/time, optionally filtered (admin-facing) */
export const listAppointments = async (req, res, next) => {
    try {
        // Query already validated by middleware
        const { status, search } = req.query;
        const appointments = await listAppointmentsService({
            ...(status && { status }),
            ...(search && { search }),
        });
        res.status(200).json({
            success: true,
            data: appointments,
        });
    }
    catch (error) {
        next(error);
    }
};
/** List all patients, optionally filtered by name/phone/MRN search (admin-facing) */
export const listPatients = async (req, res, next) => {
    try {
        // Query already validated by middleware
        const { search } = req.query;
        const patients = await listPatientsService({
            ...(search && { search }),
        });
        res.status(200).json({
            success: true,
            data: patients,
        });
    }
    catch (error) {
        next(error);
    }
};
/** Get a single appointment by id (admin-facing) */
export const getAppointmentById = async (req, res, next) => {
    try {
        // Params already validated (and coerced to number) by middleware
        const { id } = req.params;
        const appointment = await getAppointmentByIdService(id);
        res.status(200).json({
            success: true,
            data: appointment,
        });
    }
    catch (error) {
        next(error);
    }
};
/** Set an appointment's status to Confirmed (admin-facing) */
export const confirmAppointment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const appointment = await confirmAppointmentService(id);
        res.status(200).json({
            success: true,
            message: 'Appointment confirmed',
            data: appointment,
        });
    }
    catch (error) {
        next(error);
    }
};
/** Set an appointment's status to Cancelled (admin-facing) */
export const cancelAppointment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const appointment = await cancelAppointmentService(id);
        res.status(200).json({
            success: true,
            message: 'Appointment cancelled',
            data: appointment,
        });
    }
    catch (error) {
        next(error);
    }
};
/** Permanently delete an appointment (admin-facing) */
export const deleteAppointment = async (req, res, next) => {
    try {
        const { id } = req.params;
        await deleteAppointmentService(id);
        res.status(200).json({
            success: true,
            message: 'Appointment deleted',
        });
    }
    catch (error) {
        next(error);
    }
};
//# sourceMappingURL=admin.controller.js.map