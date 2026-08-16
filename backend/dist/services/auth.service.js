import bcrypt from 'bcrypt';
import { query } from '../config/db.js';
import { signToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';
// Precomputed hash of an arbitrary password, compared against on a "no such user" login attempt
// so that path takes the same ~bcrypt-compare time as a real "wrong password" attempt — otherwise
// the faster response for an unknown username leaks which usernames exist via a timing side-channel.
const DUMMY_PASSWORD_HASH = '$2b$10$42q6H/XUCvNMGlyuPcCmKOdB2hvF0oCzVdVz8bCRK1Vn5CCdfkquu';
export const loginService = async (input) => {
    const adminRes = await query('SELECT id, username, password_hash, created_at FROM admins WHERE username = $1 LIMIT 1', [input.username]);
    const [admin] = adminRes.rows;
    // Same error for "no such user" and "wrong password" so we never reveal which one was wrong.
    const passwordMatches = await bcrypt.compare(input.password, admin?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!admin || !passwordMatches) {
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
//# sourceMappingURL=auth.service.js.map