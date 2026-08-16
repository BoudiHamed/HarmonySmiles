import type { Admin } from "./admin.types.js";
export interface loginInput {
    username: string;
    password: string;
}
export interface loginResponse {
    success: boolean;
    message: string;
    token: string;
    admin: Admin;
}
export interface jwtPayload {
    adminId: number;
    username: string;
}
//# sourceMappingURL=auth.types.d.ts.map