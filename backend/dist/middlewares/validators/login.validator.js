import { z } from 'zod';
export const loginSchema = z.object({
    body: z
        .object({
        username: z.string({ error: 'Username is required' }).trim().min(1, 'Username is required'),
        password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
    })
        .strict(),
});
//# sourceMappingURL=login.validator.js.map