import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';

export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError('Must be logged in first', 401));
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    req.admin = verifyToken(token);
    next();
  } catch {
    next(new AppError('Invalid or expired session.', 401));
  }
};
