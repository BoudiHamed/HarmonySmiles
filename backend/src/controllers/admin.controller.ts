import { Request, Response, NextFunction } from 'express';
import {
  listAppointmentsService,
  getAppointmentByIdService,
  confirmAppointmentService,
  cancelAppointmentService,
  deleteAppointmentService,
} from '../services/appointment.service.js';
import { AppointmentStatus } from '../types/appointment.types.js';

/** List all appointments, ordered by date/time, optionally filtered (admin-facing) */
export const listAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Query already validated by middleware
    const { status, search } = req.query as { status?: AppointmentStatus; search?: string };

    const appointments = await listAppointmentsService({
      ...(status && { status }),
      ...(search && { search }),
    });

    res.status(200).json({
      success: true,
      data: appointments,
    });

  } catch (error) {
    next(error);
  }
};

/** Get a single appointment by id (admin-facing) */
export const getAppointmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Params already validated (and coerced to number) by middleware
    const { id } = req.params as unknown as { id: number };

    const appointment = await getAppointmentByIdService(id);

    res.status(200).json({
      success: true,
      data: appointment,
    });

  } catch (error) {
    next(error);
  }
};

/** Set an appointment's status to Confirmed (admin-facing) */
export const confirmAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as unknown as { id: number };

    const appointment = await confirmAppointmentService(id);

    res.status(200).json({
      success: true,
      message: 'Appointment confirmed',
      data: appointment,
    });

  } catch (error) {
    next(error);
  }
};

/** Set an appointment's status to Cancelled (admin-facing) */
export const cancelAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as unknown as { id: number };

    const appointment = await cancelAppointmentService(id);

    res.status(200).json({
      success: true,
      message: 'Appointment cancelled',
      data: appointment,
    });

  } catch (error) {
    next(error);
  }
};

/** Permanently delete an appointment (admin-facing) */
export const deleteAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as unknown as { id: number };

    await deleteAppointmentService(id);

    res.status(200).json({
      success: true,
      message: 'Appointment deleted',
    });

  } catch (error) {
    next(error);
  }
};
