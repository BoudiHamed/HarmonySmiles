import { Request, Response, NextFunction } from 'express';
/** List all appointments, ordered by date/time, optionally filtered (admin-facing) */
export declare const listAppointments: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** List all patients, optionally filtered by name/phone/MRN search (admin-facing) */
export declare const listPatients: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** Get a single patient's full profile: their info plus appointment history, split upcoming/past (admin-facing) */
export declare const getPatientProfile: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** Get a single appointment by id (admin-facing) */
export declare const getAppointmentById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** Set an appointment's status to Confirmed (admin-facing) */
export declare const confirmAppointment: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** Set an appointment's status to Cancelled (admin-facing) */
export declare const cancelAppointment: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** Set an appointment's status to Completed (admin-facing) — only once its date/time has arrived */
export declare const completeAppointment: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** Set an appointment's status to NoShow (admin-facing) — only once its date/time has arrived */
export declare const noShowAppointment: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** Permanently delete an appointment (admin-facing) */
export declare const deleteAppointment: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=admin.controller.d.ts.map