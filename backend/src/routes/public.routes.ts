import { Router } from 'express';
import { createAppointment, getAvailableSlots } from '../controllers/appointments.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createAppointmentSchema } from '../middlewares/validators/appointment.validator.js';
import { availableSlotsSchema } from '../middlewares/validators/general.validator.js';

export const publicRouter = Router();

publicRouter.post('/appointments', validate(createAppointmentSchema), createAppointment);
publicRouter.get('/available-slots', validate(availableSlotsSchema), getAvailableSlots);
