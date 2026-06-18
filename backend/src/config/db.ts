import pg, { PoolClient } from 'pg';
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
})
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
})

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export const getClient = (): Promise<PoolClient> => {
  return pool.connect();
};

