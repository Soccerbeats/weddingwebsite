/**
 * Finance suite persistence.
 *
 * Follows the same convention as the donations route: idempotent
 * CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS on every request, so
 * deploys migrate themselves with no separate migration step.
 */
import pool from './db';
import {
    DEFAULT_SETTINGS,
    type Category, type BudgetItem, type Contributor, type FinanceSettings,
    type Payer, type Purchase, type Receipt, type ScheduledPayment, type Snapshot,
    type SubItem,
} from './finance';
import {
    SEED_CATEGORIES, SEED_CONTRIBUTORS, SEED_PAYERS, SEED_PURCHASES, SEED_SETTINGS,
} from './financeSeed';

let ready: Promise<void> | null = null;

async function createTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            adult_count INTEGER NOT NULL DEFAULT 0,
            minor_count INTEGER NOT NULL DEFAULT 0,
            plan_horizon_months INTEGER,
            paycheck_interval_days INTEGER NOT NULL DEFAULT 14,
            CONSTRAINT finance_settings_singleton CHECK (id = 1)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_items (
            id SERIAL PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES finance_categories(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            unit_cost NUMERIC NOT NULL DEFAULT 0,
            quantity NUMERIC NOT NULL DEFAULT 1,
            qty_source TEXT NOT NULL DEFAULT 'manual',
            use_subitems BOOLEAN NOT NULL DEFAULT FALSE,
            is_paid BOOLEAN NOT NULL DEFAULT FALSE,
            notes TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_subitems (
            id SERIAL PRIMARY KEY,
            item_id INTEGER NOT NULL REFERENCES finance_items(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            unit_cost NUMERIC NOT NULL DEFAULT 0,
            quantity NUMERIC NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_payers (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            share_pct NUMERIC NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);
    // Purchases and receipts keep their row when a budget line is deleted; the
    // link just goes null so no spending history is ever silently destroyed.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_purchases (
            id SERIAL PRIMARY KEY,
            payer_id INTEGER REFERENCES finance_payers(id) ON DELETE SET NULL,
            item_id INTEGER REFERENCES finance_items(id) ON DELETE SET NULL,
            description TEXT NOT NULL,
            amount NUMERIC NOT NULL DEFAULT 0,
            purchased_on DATE,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_contributors (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            pledged NUMERIC NOT NULL DEFAULT 0,
            notes TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_receipts (
            id SERIAL PRIMARY KEY,
            contributor_id INTEGER NOT NULL REFERENCES finance_contributors(id) ON DELETE CASCADE,
            item_id INTEGER REFERENCES finance_items(id) ON DELETE SET NULL,
            amount NUMERIC NOT NULL DEFAULT 0,
            received_on DATE,
            note TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    // Scheduled payments: a venue bill taken in four installments, a deposit now
    // and a balance later. Targets a line or a section, same as a payment does.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_schedule (
            id SERIAL PRIMARY KEY,
            item_id INTEGER REFERENCES finance_items(id) ON DELETE CASCADE,
            category_id INTEGER REFERENCES finance_categories(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'installment',
            amount NUMERIC NOT NULL DEFAULT 0,
            due_on DATE,
            settled BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    // Daily snapshot so the budget's drift over time is visible — the one thing
    // the spreadsheet could never show.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finance_snapshots (
            taken_on DATE PRIMARY KEY,
            budget_total NUMERIC NOT NULL DEFAULT 0,
            paid_total NUMERIC NOT NULL DEFAULT 0,
            bill_remaining NUMERIC NOT NULL DEFAULT 0,
            gift_received NUMERIC NOT NULL DEFAULT 0,
            still_to_spend NUMERIC NOT NULL DEFAULT 0,
            item_count INTEGER NOT NULL DEFAULT 0
        )
    `);

    // Archive instead of delete: keeps a cancelled vendor's history without it
    // skewing any total.
    for (const table of ['finance_categories', 'finance_items', 'finance_purchases', 'finance_contributors']) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`);
    }
    await pool.query(`ALTER TABLE finance_purchases ADD COLUMN IF NOT EXISTS receipt_path TEXT`);
    await pool.query(`ALTER TABLE finance_contributors ADD COLUMN IF NOT EXISTS thank_you_sent BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE finance_contributors ADD COLUMN IF NOT EXISTS thank_you_sent_at TIMESTAMP`);

    // Lump-sum payments: a venue installment pays down a whole section at once
    // rather than any single line, so purchases and receipts can target either.
    await pool.query(`ALTER TABLE finance_purchases ADD COLUMN IF NOT EXISTS category_id INTEGER
                      REFERENCES finance_categories(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE finance_receipts ADD COLUMN IF NOT EXISTS category_id INTEGER
                      REFERENCES finance_categories(id) ON DELETE SET NULL`);

    await pool.query(`CREATE INDEX IF NOT EXISTS finance_items_category_idx ON finance_items(category_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS finance_purchases_category_idx ON finance_purchases(category_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS finance_schedule_item_idx ON finance_schedule(item_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS finance_schedule_category_idx ON finance_schedule(category_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS finance_subitems_item_idx ON finance_subitems(item_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS finance_receipts_contributor_idx ON finance_receipts(contributor_id)`);
    await pool.query(`INSERT INTO finance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
}

/**
 * Import the original spreadsheet, but only into a completely empty suite.
 * Guarded by a transaction and a re-check so a double-click can't duplicate it.
 */
async function seedIfEmpty() {
    const existing = await pool.query('SELECT 1 FROM finance_categories LIMIT 1');
    if (existing.rowCount) return;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const recheck = await client.query('SELECT 1 FROM finance_categories LIMIT 1');
        if (recheck.rowCount) { await client.query('ROLLBACK'); return; }

        await client.query(
            `UPDATE finance_settings
                SET adult_count = $1, minor_count = $2,
                    plan_horizon_months = $3, paycheck_interval_days = $4
              WHERE id = 1`,
            [SEED_SETTINGS.adult_count, SEED_SETTINGS.minor_count,
             SEED_SETTINGS.plan_horizon_months, SEED_SETTINGS.paycheck_interval_days],
        );

        const itemIds = new Map<string, number>();
        const categoryIds = new Map<string, number>();
        for (const [ci, cat] of SEED_CATEGORIES.entries()) {
            const catRow = await client.query(
                'INSERT INTO finance_categories (name, sort_order) VALUES ($1, $2) RETURNING id',
                [cat.name, ci],
            );
            const categoryId = catRow.rows[0].id;
            categoryIds.set(cat.name, categoryId);
            for (const [ii, item] of cat.items.entries()) {
                const itemRow = await client.query(
                    `INSERT INTO finance_items
                        (category_id, name, unit_cost, quantity, qty_source, use_subitems, sort_order)
                     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                    [categoryId, item.name, item.unit_cost, item.quantity,
                     item.qty_source, !!item.subitems, ii],
                );
                const itemId = itemRow.rows[0].id;
                itemIds.set(item.name, itemId);
                for (const [si, sub] of (item.subitems ?? []).entries()) {
                    await client.query(
                        `INSERT INTO finance_subitems (item_id, name, unit_cost, quantity, sort_order)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [itemId, sub.name, sub.unit_cost, sub.quantity, si],
                    );
                }
            }
        }

        const payerIds = new Map<string, number>();
        for (const [pi, payer] of SEED_PAYERS.entries()) {
            const row = await client.query(
                'INSERT INTO finance_payers (name, share_pct, sort_order) VALUES ($1, $2, $3) RETURNING id',
                [payer.name, payer.share_pct, pi],
            );
            payerIds.set(payer.name, row.rows[0].id);
        }

        for (const p of SEED_PURCHASES) {
            await client.query(
                `INSERT INTO finance_purchases (payer_id, item_id, category_id, description, amount)
                 VALUES ($1, $2, $3, $4, $5)`,
                [payerIds.get(p.payer) ?? null,
                 p.item ? itemIds.get(p.item) ?? null : null,
                 p.section ? categoryIds.get(p.section) ?? null : null,
                 p.description, p.amount],
            );
        }

        for (const [ci, c] of SEED_CONTRIBUTORS.entries()) {
            const row = await client.query(
                'INSERT INTO finance_contributors (name, pledged, sort_order) VALUES ($1, $2, $3) RETURNING id',
                [c.name, c.pledged, ci],
            );
            const contributorId = row.rows[0].id;
            for (const r of c.receipts) {
                await client.query(
                    `INSERT INTO finance_receipts (contributor_id, item_id, category_id, amount, note)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [contributorId,
                     r.item ? itemIds.get(r.item) ?? null : null,
                     r.section ? categoryIds.get(r.section) ?? null : null,
                     r.amount, r.note],
                );
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/** Runs once per process; concurrent callers await the same promise. */
export function ensureFinanceTables(): Promise<void> {
    if (!ready) {
        ready = (async () => {
            await createTables();
            await seedIfEmpty();
        })().catch((error) => {
            ready = null; // let the next request retry rather than caching the failure
            throw error;
        });
    }
    return ready;
}

export interface FinanceData {
    settings: FinanceSettings;
    categories: Category[];
    payers: Payer[];
    purchases: Purchase[];
    contributors: Contributor[];
    schedule: ScheduledPayment[];
    snapshots: Snapshot[];
    /** counts of archived rows, so the UI can offer a way back to them */
    archived: { categories: number; items: number; purchases: number; contributors: number };
}

/** Postgres "undefined_table" — the schema went missing under a running process. */
const UNDEFINED_TABLE = '42P01';

export async function loadFinanceData(): Promise<FinanceData> {
    await ensureFinanceTables();
    try {
        return await queryFinanceData();
    } catch (error) {
        // A restored dump or swapped volume can drop the tables while this
        // process still believes it created them. Rebuild once rather than
        // serving 500s until someone restarts the container.
        if ((error as { code?: string })?.code !== UNDEFINED_TABLE) throw error;
        console.warn('Finance tables missing; rebuilding schema.');
        ready = null;
        await ensureFinanceTables();
        return queryFinanceData();
    }
}

async function queryFinanceData(): Promise<FinanceData> {
    const [settingsRes, catRes, itemRes, subRes, payerRes, purchaseRes, contribRes, receiptRes,
           scheduleRes, snapshotRes, archivedRes] =
        await Promise.all([
            pool.query(`SELECT adult_count, minor_count, plan_horizon_months, paycheck_interval_days
                          FROM finance_settings WHERE id = 1`),
            pool.query(`SELECT id, name, sort_order, archived FROM finance_categories
                         WHERE NOT archived ORDER BY sort_order, id`),
            pool.query(`SELECT id, category_id, name, unit_cost::float8 AS unit_cost,
                               quantity::float8 AS quantity, qty_source, use_subitems,
                               is_paid, notes, sort_order, archived
                          FROM finance_items WHERE NOT archived ORDER BY sort_order, id`),
            pool.query(`SELECT id, item_id, name, unit_cost::float8 AS unit_cost,
                               quantity::float8 AS quantity, sort_order
                          FROM finance_subitems ORDER BY sort_order, id`),
            pool.query(`SELECT id, name, share_pct::float8 AS share_pct, sort_order
                          FROM finance_payers ORDER BY sort_order, id`),
            pool.query(`SELECT id, payer_id, item_id, category_id, description,
                               amount::float8 AS amount, purchased_on::text AS purchased_on,
                               notes, receipt_path, archived
                          FROM finance_purchases WHERE NOT archived
                         ORDER BY purchased_on DESC NULLS LAST, id DESC`),
            pool.query(`SELECT id, name, pledged::float8 AS pledged, notes, sort_order,
                               thank_you_sent, thank_you_sent_at::text AS thank_you_sent_at, archived
                          FROM finance_contributors WHERE NOT archived ORDER BY sort_order, id`),
            pool.query(`SELECT id, contributor_id, item_id, category_id,
                               amount::float8 AS amount, received_on::text AS received_on, note
                          FROM finance_receipts
                         ORDER BY received_on DESC NULLS LAST, id DESC`),
            pool.query(`SELECT id, item_id, category_id, label, kind,
                               amount::float8 AS amount, due_on::text AS due_on, settled, sort_order
                          FROM finance_schedule ORDER BY due_on NULLS LAST, sort_order, id`),
            pool.query(`SELECT taken_on::text AS taken_on, budget_total::float8 AS budget_total,
                               paid_total::float8 AS paid_total,
                               bill_remaining::float8 AS bill_remaining,
                               gift_received::float8 AS gift_received,
                               still_to_spend::float8 AS still_to_spend, item_count
                          FROM finance_snapshots ORDER BY taken_on`),
            pool.query(`SELECT
                (SELECT COUNT(*) FROM finance_categories WHERE archived)::int AS categories,
                (SELECT COUNT(*) FROM finance_items WHERE archived)::int AS items,
                (SELECT COUNT(*) FROM finance_purchases WHERE archived)::int AS purchases,
                (SELECT COUNT(*) FROM finance_contributors WHERE archived)::int AS contributors`),
        ]);

    const subsByItem = new Map<number, SubItem[]>();
    for (const sub of subRes.rows as SubItem[]) {
        const list = subsByItem.get(sub.item_id) ?? [];
        list.push(sub);
        subsByItem.set(sub.item_id, list);
    }

    const itemsByCategory = new Map<number, BudgetItem[]>();
    for (const row of itemRes.rows) {
        const item: BudgetItem = { ...row, subitems: subsByItem.get(row.id) ?? [] };
        const list = itemsByCategory.get(item.category_id) ?? [];
        list.push(item);
        itemsByCategory.set(item.category_id, list);
    }

    const receiptsByContributor = new Map<number, Receipt[]>();
    for (const receipt of receiptRes.rows as Receipt[]) {
        const list = receiptsByContributor.get(receipt.contributor_id) ?? [];
        list.push(receipt);
        receiptsByContributor.set(receipt.contributor_id, list);
    }

    return {
        settings: (settingsRes.rows[0] as FinanceSettings) ?? { ...DEFAULT_SETTINGS },
        categories: catRes.rows.map((c) => ({ ...c, items: itemsByCategory.get(c.id) ?? [] })) as Category[],
        payers: payerRes.rows as Payer[],
        purchases: purchaseRes.rows as Purchase[],
        contributors: contribRes.rows.map((c) => ({
            ...c, receipts: receiptsByContributor.get(c.id) ?? [],
        })) as Contributor[],
        schedule: scheduleRes.rows as ScheduledPayment[],
        snapshots: snapshotRes.rows as Snapshot[],
        archived: archivedRes.rows[0] as FinanceData['archived'],
    };
}

/**
 * Record today's headline figures, once per day. Upserts so repeated page loads
 * keep the latest reading rather than piling up rows.
 */
export async function recordSnapshot(summary: {
    budgetTotal: number; paidTotal: number; billRemaining: number;
    receivedTotal: number; stillToSpendCash: number; itemCount: number;
}, today: string) {
    await pool.query(
        `INSERT INTO finance_snapshots
            (taken_on, budget_total, paid_total, bill_remaining, gift_received,
             still_to_spend, item_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (taken_on) DO UPDATE SET
            budget_total = EXCLUDED.budget_total, paid_total = EXCLUDED.paid_total,
            bill_remaining = EXCLUDED.bill_remaining, gift_received = EXCLUDED.gift_received,
            still_to_spend = EXCLUDED.still_to_spend, item_count = EXCLUDED.item_count`,
        [today, summary.budgetTotal, summary.paidTotal, summary.billRemaining,
         summary.receivedTotal, summary.stillToSpendCash, summary.itemCount],
    );
}
