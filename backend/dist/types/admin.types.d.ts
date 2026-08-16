export interface Admin {
    id: number;
    username: string;
    created_at: Date;
}
export interface AdminWithPassword extends Admin {
    password_hash: string;
}
//# sourceMappingURL=admin.types.d.ts.map