import { Pool, types } from 'pg';

/**
 * DATE columns (OID 1082) are returned as the `YYYY-MM-DD` string Postgres
 * sent, not as a JS Date at local midnight. A Date makes every consumer choose
 * between local and UTC accessors, and `toISOString()` on one shifts the day
 * backwards for any server west of Greenwich. A calendar date is a string.
 */
types.setTypeParser(1082, (value: string) => value);

const ms = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

/**
 * Time limits, so one stuck query cannot take the whole site down. Without
 * them, ten hung queries held every connection in the pool and every later
 * request waited forever. (Idea from the wagnerbastian fork, v0.10.7.)
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Waiting for a free connection.
    connectionTimeoutMillis: ms('DB_CONNECTION_TIMEOUT_MS', 10_000),
    // One statement, enforced by Postgres itself.
    statement_timeout: ms('DB_STATEMENT_TIMEOUT_MS', 30_000),
    // A transaction left open and idle (a request that died mid-way).
    idle_in_transaction_session_timeout: ms('DB_IDLE_TRANSACTION_TIMEOUT_MS', 60_000),
});

// An idle connection that drops (a database restart, a network blip) emits
// 'error' on the pool; unhandled, that ends the Node process.
pool.on('error', (error) => {
    console.error('Database connection lost:', error.message);
});

export default pool;
