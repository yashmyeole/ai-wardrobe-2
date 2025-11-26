// lib/db.ts
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in env");
}

const connectionString = process.env.DATABASE_URL;

// Use a global to prevent creating new pool on every module load (serverless)
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: pg.Pool | undefined;
}

let pool: pg.Pool;

if (global.__pgPool) {
  pool = global.__pgPool;
} else {
  pool = new Pool({
    connectionString,
    // Optional: tune these for Supabase / serverless
    // max: 10,
    // idleTimeoutMillis: 30000,
    // connectionTimeoutMillis: 2000,
  });
  global.__pgPool = pool;
}

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // optional logging: console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
}

// helper for acquiring client for transaction
export async function getClient() {
  const client = await pool.connect();
  return client;
}
