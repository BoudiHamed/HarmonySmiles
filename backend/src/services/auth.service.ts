import bcrypt from 'bcrypt';
import { query } from '../config/db.js';
import { signToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';
import { loginInput, loginResponse } from '../types/auth.types.js';
import { AdminWithPassword } from '../types/admin.types.js';

export const loginService = async (input: loginInput): Promise<loginResponse> => {
  const adminRes = await query(
    'SELECT id, username, password_hash, created_at FROM admins WHERE username = $1 LIMIT 1',
    [input.username]
  );
  const [admin] = adminRes.rows as AdminWithPassword[];

  // Same error for "no such user" and "wrong password" so we never reveal which one was wrong.
  if (!admin) {
    throw new AppError('Invalid username or password', 401);
  }

  const passwordMatches = await bcrypt.compare(input.password, admin.password_hash);
  if (!passwordMatches) {
    throw new AppError('Invalid username or password', 401);
  }

  const token = signToken({ adminId: admin.id, username: admin.username });

  return {
    success: true,
    message: 'Logged in successfully',
    token,
    admin: { id: admin.id, username: admin.username, created_at: admin.created_at },
  };
};
