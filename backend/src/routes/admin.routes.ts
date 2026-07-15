import { Router } from 'express';
import { login } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema } from '../middlewares/validators/login.validator.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

export const adminRouter = Router();

adminRouter.post('/login', validate(loginSchema), login);

// Everything registered below this line is protected — a new route added here
// automatically requires a valid admin token, without needing its own middleware.
adminRouter.use(authMiddleware);
