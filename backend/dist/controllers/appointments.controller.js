import { createAppointmentService } from '../services/appointment.service.js';
/** Create a new appointment (patient-facing) */
export const createAppointment = async (req, res, next) => {
    try {
        // Body already validated by middleware
        const appointmentData = req.body;
        // Runs the transactional booking
        const newAppointment = await createAppointmentService(appointmentData);
        res.status(201).json({
            success: true,
            message: 'تم حجز الموعد بنجاح',
            data: newAppointment,
        });
    }
    catch (error) {
        // Forward to the central error handler
        next(error);
    }
};
//# sourceMappingURL=appointments.controller.js.map