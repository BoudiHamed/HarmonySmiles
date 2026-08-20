import { jwtPayload } from './auth.types.js';

declare global {
  namespace Express {
    interface Request {
      admin?: jwtPayload;
    }
  }
}
