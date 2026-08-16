// Validates { body, query, params } against `schema`, replacing them with the parsed (coerced) output.
export const validate = (schema) => (req, _res, next) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
        next(result.error);
        return;
    }
    const parsed = result.data;
    if (parsed.body !== undefined)
        req.body = parsed.body;
    // req.query is getter-only in Express 5; redefine it instead of assigning.
    if (parsed.query !== undefined) {
        Object.defineProperty(req, 'query', {
            value: parsed.query,
            writable: true,
            configurable: true,
            enumerable: true,
        });
    }
    if (parsed.params !== undefined)
        req.params = parsed.params;
    next();
};
//# sourceMappingURL=validate.middleware.js.map