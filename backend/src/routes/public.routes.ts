import { Router } from 'express';
import { createAppointment } from '../controllers/appointments.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createAppointmentSchema } from '../middlewares/validators/appointment.validator.js';

export const publicRouter = Router();

publicRouter.post('/appointments', validate(createAppointmentSchema), createAppointment);
