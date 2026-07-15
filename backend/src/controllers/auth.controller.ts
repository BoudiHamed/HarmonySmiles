import { Request, Response, NextFunction } from 'express';
import { loginService } from '../services/auth.service.js';

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await loginService(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
