import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
export const errorMiddleware = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
        return;
    }
    if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
    }
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
};
//# sourceMappingURL=error.middleware.js.map