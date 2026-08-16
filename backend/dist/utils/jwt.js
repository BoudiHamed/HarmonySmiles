import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}
export function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d', algorithm: 'HS256' });
}
export function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}
;
//# sourceMappingURL=jwt.js.map