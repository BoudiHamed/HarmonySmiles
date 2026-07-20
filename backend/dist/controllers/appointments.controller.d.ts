import { Request, Response, NextFunction } from 'express';
/** Create a new appointment (patient-facing) */
export declare const createAppointment: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** List free 30-minute slots for a given date (patient-facing) */
export declare const getAvailableSlots: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=appointments.controller.d.ts.map