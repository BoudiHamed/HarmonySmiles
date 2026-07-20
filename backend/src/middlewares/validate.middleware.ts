import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

// Validates { body, query, params } against `schema`, replacing them with the parsed (coerced) output.
export const validate = (schema: ZodType) => (req: Request, _res: Response, next: NextFunction): void => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });

  if (!result.success) {
    next(result.error);
    return;
  }

  const parsed = result.data as { body?: unknown; query?: unknown; params?: unknown };
  if (parsed.body !== undefined) req.body = parsed.body;
  // req.query is getter-only in Express 5; redefine it instead of assigning.
  if (parsed.query !== undefined) {
    Object.defineProperty(req, 'query', {
      value: parsed.query,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  if (parsed.params !== undefined) req.params = parsed.params as Request['params'];

  next();
};
