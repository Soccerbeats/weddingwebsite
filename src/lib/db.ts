import { Pool, types } from 'pg';

/**
 * DATE columns (OID 1082) are returned as the `YYYY-MM-DD` string Postgres
 * sent, not as a JS Date at local midnight. A Date makes every consumer choose
 * between local and UTC accessors, and `toISOString()` on one shifts the day
 * backwards for any server west of Greenwich. A calendar date is a string.
 */
types.setTypeParser(1082, (value: string) => value);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export default pool;
