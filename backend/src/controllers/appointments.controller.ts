import { Request, Response, NextFunction } from 'express';
import { createAppointmentService } from '../services/appointment.service.js';

/** Create a new appointment (patient-facing) */
export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

  } catch (error) {
    // Forward to the central error handler
    next(error);
  }
};