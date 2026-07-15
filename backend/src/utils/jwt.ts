import jwt from 'jsonwebtoken';
import { jwtPayload } from '../types/auth.types.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export const signToken = (payload: jwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
};

export const verifyToken = (token: string): jwtPayload => {
  return jwt.verify(token, JWT_SECRET) as jwtPayload;
};
