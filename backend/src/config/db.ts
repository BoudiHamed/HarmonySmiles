import pg, { PoolClient, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('Connected to the database');
});
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(1);
});

export const query = <T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) => {
  return pool.query<T>(text, params);
};

export const getClient = (): Promise<PoolClient> => {
  return pool.connect();
};

// Ends the pool; only used by one-off scripts (e.g. seed.ts) so they can exit.
export const closePool = (): Promise<void> => {
  return pool.end();
};

// Runs `fn` inside BEGIN/COMMIT, rolling back and releasing the client on any error.
export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

