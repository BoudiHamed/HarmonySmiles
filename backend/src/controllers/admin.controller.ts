import { Request, Response, NextFunction } from 'express';
import {
  listAppointmentsService,
  getAppointmentByIdService,
  confirmAppointmentService,
  cancelAppointmentService,
  completeAppointmentService,
  noShowAppointmentService,
  deleteAppointmentService,
  listAppointmentsByPatientIdService,
} from '../services/appointment.service.js';
import { listPatientsService, getPatientByIdService } from '../services/patient.service.js';
import { AppointmentStatus } from '../types/appointment.types.js';
import { DateRangePreset } from '../utils/clinicTime.js';

/** List all appointments, ordered by date/time, optionally filtered (admin-facing) */
export const listAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Query already validated by middleware
    const { status, search, date_range } = req.query as {
      status?: AppointmentStatus;
      search?: string;
      date_range?: DateRangePreset;
    };

    const appointments = await listAppointmentsService({
      ...(status && { status }),
      ...(search && { search }),
      ...(date_range && { dateRange: date_range }),
    });

    res.status(200).json({
      success: true,
      data: appointments,
    });

  } catch (error) {
    next(error);
  }
};

/** List all patients, optionally filtered by name/phone/MRN search (admin-facing) */
export const listPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Query already validated by middleware
    const { search } = req.query as { search?: string };

    const patients = await listPatientsService({
      ...(search && { search }),
    });

    res.status(200).json({
      success: true,
      data: patients,
    });

  } catch (error) {
    next(error);
  }
};

/** Get a single patient's full profile: their info plus appointment history, split upcoming/past (admin-facing) */
export const getPatientProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as unknown as { id: number };

    const patient = await getPatientByIdService(id);
    const { upcoming, past } = await listAppointmentsByPatientIdService(id);

    res.status(200).json({
      success: true,
      data: {
        patient,
        upcomingAppointments: upcoming,
        pastAppointments: past,
      },
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

/** Set an appointment's status to Completed (admin-facing) — only once its date/time has arrived */
export const completeAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as unknown as { id: number };

    const appointment = await completeAppointmentService(id);

    res.status(200).json({
      success: true,
      message: 'Appointment completed',
      data: appointment,
    });

  } catch (error) {
    next(error);
  }
};

/** Set an appointment's status to NoShow (admin-facing) — only once its date/time has arrived */
export const noShowAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as unknown as { id: number };

    const appointment = await noShowAppointmentService(id);

    res.status(200).json({
      success: true,
      message: 'Appointment marked as no-show',
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
