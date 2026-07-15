import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

// Validates { body, query, params } against `schema` and, on success, replaces
// req.body/query/params with the parsed output (so coercions like z.coerce.number() take effect).
export const validate = (schema: ZodType) => (req: Request, _res: Response, next: NextFunction): void => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });

  if (!result.success) {
    next(result.error);
    return;
  }

  const parsed = result.data as { body?: unknown; query?: unknown; params?: unknown };
  if (parsed.body !== undefined) req.body = parsed.body;
  if (parsed.query !== undefined) req.query = parsed.query as Request['query'];
  if (parsed.params !== undefined) req.params = parsed.params as Request['params'];

  next();
};
