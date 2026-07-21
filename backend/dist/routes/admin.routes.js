import { Router } from 'express';
import { login } from '../controllers/auth.controller.js';
import { listAppointments, getAppointmentById, confirmAppointment, cancelAppointment, deleteAppointment, listPatients, } from '../controllers/admin.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema } from '../middlewares/validators/login.validator.js';
import { listAppointmentsSchema, appointmentIdParamSchema, listPatientsSchema, } from '../middlewares/validators/admin.validator.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
export const adminRouter = Router();
adminRouter.post('/login', validate(loginSchema), login);
// Routes below this line are protected automatically — no per-route check needed.
adminRouter.use(authMiddleware);
adminRouter.get('/appointments', validate(listAppointmentsSchema), listAppointments);
adminRouter.get('/appointments/:id', validate(appointmentIdParamSchema), getAppointmentById);
adminRouter.patch('/appointments/:id/confirm', validate(appointmentIdParamSchema), confirmAppointment);
adminRouter.patch('/appointments/:id/cancel', validate(appointmentIdParamSchema), cancelAppointment);
adminRouter.delete('/appointments/:id', validate(appointmentIdParamSchema), deleteAppointment);
adminRouter.get('/patients', validate(listPatientsSchema), listPatients);
//# sourceMappingURL=admin.routes.js.map