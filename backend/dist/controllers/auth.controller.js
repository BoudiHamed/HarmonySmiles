import { loginService } from '../services/auth.service.js';
export const login = async (req, res, next) => {
    try {
        const result = await loginService(req.body);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
};
//# sourceMappingURL=auth.controller.js.map