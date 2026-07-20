import { PoolClient, QueryResultRow } from 'pg';
export declare const query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) => Promise<import("pg").QueryResult<T>>;
export declare const getClient: () => Promise<PoolClient>;
export declare const closePool: () => Promise<void>;
export declare const withTransaction: <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;
//# sourceMappingURL=db.d.ts.map