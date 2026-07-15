// Validates { body, query, params } against `schema` and, on success, replaces
// req.body/query/params with the parsed output (so coercions like z.coerce.number() take effect).
export const validate = (schema) => (req, _res, next) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
        next(result.error);
        return;
    }
    const parsed = result.data;
    if (parsed.body !== undefined)
        req.body = parsed.body;
    if (parsed.query !== undefined)
        req.query = parsed.query;
    if (parsed.params !== undefined)
        req.params = parsed.params;
    next();
};
//# sourceMappingURL=validate.middleware.js.map