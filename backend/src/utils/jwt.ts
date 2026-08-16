import jwt from 'jsonwebtoken';
import { jwtPayload } from '../types/auth.types.js';

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export function signToken(payload: jwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d', algorithm: 'HS256' });
}

export function verifyToken(token: string): jwtPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwtPayload;
};
