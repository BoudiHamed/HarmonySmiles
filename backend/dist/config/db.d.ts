import { PoolClient } from 'pg';
export declare const query: (text: string, params?: any[]) => Promise<import("pg").QueryResult<any>>;
export declare const getClient: () => Promise<PoolClient>;
export declare const withTransaction: <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;
//# sourceMappingURL=db.d.ts.map