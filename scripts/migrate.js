const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('ERROR: DATABASE_URL environment variable is not set');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString,
    });

    try {
        console.log('Connecting to database...');

        const sqlPath = path.join(__dirname, '..', 'database', 'init.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        await pool.query(sql);

        console.log('✅ Migration completed successfully!');

        // Check if wip_toggles table was created
        const result = await pool.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wip_toggles'"
        );

        if (result.rows.length > 0) {
            console.log('✅ wip_toggles table exists');
        } else {
            console.log('❌ wip_toggles table not found');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
