import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
export declare const validate: (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=validate.middleware.d.ts.map