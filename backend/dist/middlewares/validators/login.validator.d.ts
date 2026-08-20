import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    body: z.ZodObject<{
        username: z.ZodString;
        password: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strip>;
//# sourceMappingURL=login.validator.d.ts.map