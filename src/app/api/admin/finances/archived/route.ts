import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ensureFinanceTables } from '@/lib/financeDb';

/**
 * Archived rows, which `loadFinanceData` deliberately filters out so they can't
 * skew a total. Fetched only when the user asks to see them, so there is always
 * a way back from an archive.
 */
export async function GET() {
    try {
        await ensureFinanceTables();
        const [categories, items, purchases, contributors] = await Promise.all([
            pool.query('SELECT id, name FROM finance_categories WHERE archived ORDER BY name'),
            pool.query(`SELECT i.id, i.name, c.name AS category_name
                          FROM finance_items i
                          LEFT JOIN finance_categories c ON c.id = i.category_id
                         WHERE i.archived ORDER BY i.name`),
            pool.query(`SELECT id, description, amount::float8 AS amount, purchased_on
                          FROM finance_purchases WHERE archived
                         ORDER BY purchased_on DESC NULLS LAST, id DESC`),
            pool.query('SELECT id, name, pledged::float8 AS pledged FROM finance_contributors WHERE archived ORDER BY name'),
        ]);
        return NextResponse.json({
            categories: categories.rows,
            items: items.rows,
            purchases: purchases.rows,
            contributors: contributors.rows,
        });
    } catch (error) {
        console.error('Error loading archived finance rows:', error);
        return NextResponse.json({ error: 'Failed to load archived rows' }, { status: 500 });
    }
}
