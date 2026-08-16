import { createAppointmentService, getAvailableSlotsService } from '../services/appointment.service.js';
/** Create a new appointment (patient-facing) */
export const createAppointment = async (req, res, next) => {
    try {
        // Body already validated by middleware
        const appointmentData = req.body;
        // Runs the transactional booking
        const newAppointment = await createAppointmentService(appointmentData);
        res.status(201).json({
            success: true,
            message: 'Appointment booked successfully',
            data: newAppointment,
        });
    }
    catch (error) {
        // Forward to the central error handler
        next(error);
    }
};
/** List free 30-minute slots for a given date (patient-facing) */
export const getAvailableSlots = async (req, res, next) => {
    try {
        // Query already validated by middleware
        const { date } = req.query;
        const slots = await getAvailableSlotsService(date);
        res.status(200).json({
            success: true,
            data: slots,
        });
    }
    catch (error) {
        // Forward to the central error handler
        next(error);
    }
};
//# sourceMappingURL=appointments.controller.js.map