/**
 * One-time seed of the finance suite from the original
 * "Heav & Aust Wedding Spreadsheet — Budget" tab.
 *
 * Applied only when the finance tables are completely empty, so it can never
 * duplicate or clobber real edits.
 *
 * Two deliberate departures from the source spreadsheet:
 *
 *  1. `is_paid` is false everywhere. The sheet encoded paid status as literal
 *     bold text ("Bold means its been payed") and the CSV export discarded it.
 *     Tick the paid lines off in the UI.
 *
 *  2. Kim's two receipts ($1,200 Dress + $680 Veil) are both seeded. The sheet's
 *     receipt log totalled $6,880 while its contributions block claimed $6,200
 *     received — the $680 was never rolled up. The corrected figure is $6,880,
 *     so seeded totals intentionally run $680 ahead of the old sheet.
 */

export interface SeedSubItem {
    name: string;
    unit_cost: number;
    quantity: number;
}

export interface SeedItem {
    name: string;
    unit_cost: number;
    quantity: number;
    qty_source: 'manual' | 'adults' | 'minors' | 'total';
    subitems?: SeedSubItem[];
}

export interface SeedCategory {
    name: string;
    items: SeedItem[];
}

export const SEED_SETTINGS = {
    adult_count: 124,
    minor_count: 11,
    plan_horizon_months: null as number | null,
    paycheck_interval_days: 14,
};

export const SEED_CATEGORIES: SeedCategory[] = [
    {
        name: 'Main Cost',
        items: [
            { name: 'Venue', unit_cost: 4500, quantity: 1, qty_source: 'manual' },
            {
                name: 'Appetizers',
                unit_cost: 0,
                quantity: 1,
                qty_source: 'manual',
                // 135 guests x 5 apps / 3 kinds = 225 pieces each; sums to $1,700
                subitems: [
                    { name: 'Caprese Skewers', unit_cost: 3, quantity: 100 },
                    { name: 'Coconut Shrimp', unit_cost: 4, quantity: 100 },
                    { name: 'Chicken Satay', unit_cost: 3.5, quantity: 100 },
                    { name: 'Fruit Platter', unit_cost: 175, quantity: 2 },
                    { name: 'Veggie Platters', unit_cost: 150, quantity: 2 },
                    { name: 'Pizza', unit_cost: 0, quantity: 0 },
                ],
            },
            { name: 'Dinner', unit_cost: 35, quantity: 124, qty_source: 'adults' },
            { name: 'Dinner Kids', unit_cost: 12, quantity: 11, qty_source: 'minors' },
            { name: 'Bar', unit_cost: 37, quantity: 124, qty_source: 'adults' },
            { name: 'Service Charge Bar/Dinner', unit_cost: 2259.6, quantity: 1, qty_source: 'manual' },
            { name: 'Taxes', unit_cost: 839.3, quantity: 1, qty_source: 'manual' },
        ],
    },
    {
        name: 'Staff And Extras',
        items: [
            { name: 'Photographer', unit_cost: 4000, quantity: 1, qty_source: 'manual' },
            { name: 'Videographer', unit_cost: 1500, quantity: 1, qty_source: 'manual' },
            { name: 'Dj', unit_cost: 1850, quantity: 1, qty_source: 'manual' },
            { name: 'Floral', unit_cost: 2000, quantity: 1, qty_source: 'manual' },
            { name: 'Dessert', unit_cost: 300, quantity: 1, qty_source: 'manual' },
        ],
    },
    {
        name: 'Other',
        items: [
            { name: 'Dress', unit_cost: 1200, quantity: 1, qty_source: 'manual' },
            { name: 'Tux', unit_cost: 300, quantity: 1, qty_source: 'manual' },
            { name: 'Hair', unit_cost: 0, quantity: 1, qty_source: 'manual' },
            { name: 'Makeup', unit_cost: 0, quantity: 1, qty_source: 'manual' },
            { name: 'Wedding Party Gifts', unit_cost: 500, quantity: 1, qty_source: 'manual' },
            { name: 'Parent Gifts', unit_cost: 0, quantity: 1, qty_source: 'manual' },
            { name: "Austin's Ring", unit_cost: 300, quantity: 1, qty_source: 'manual' },
            { name: 'Thank You Cards', unit_cost: 100, quantity: 1, qty_source: 'manual' },
            { name: 'Save the Date', unit_cost: 47.36, quantity: 1, qty_source: 'manual' },
            { name: 'Stamps for Save the Date', unit_cost: 70, quantity: 1, qty_source: 'manual' },
            { name: 'Invitations', unit_cost: 100, quantity: 1, qty_source: 'manual' },
            { name: 'Stamps for Invitations', unit_cost: 70, quantity: 1, qty_source: 'manual' },
            { name: 'Decor', unit_cost: 1250, quantity: 1, qty_source: 'manual' },
            { name: 'Wedding Insurance', unit_cost: 100, quantity: 1, qty_source: 'manual' },
            { name: 'Rehearsal Dinner', unit_cost: 1000, quantity: 1, qty_source: 'manual' },
        ],
    },
];

export const SEED_PAYERS = [
    { name: 'Austin', share_pct: 50 },
    { name: 'Heaven', share_pct: 50 },
];

/** `item` matches a budget line by name; null means the spend has no budget line. */
export const SEED_PURCHASES: {
    payer: string;
    item: string | null;
    description: string;
    amount: number;
}[] = [
        { payer: 'Austin', item: 'Stamps for Save the Date', description: 'Stamps', amount: 70 },
        { payer: 'Austin', item: 'Venue', description: 'Venue 2/4', amount: 5000 },
        { payer: 'Austin', item: 'Decor', description: 'Decor (from Amy)', amount: 250 },
        { payer: 'Austin', item: 'Decor', description: 'Candle Beads', amount: 136 },
        { payer: 'Austin', item: 'Tux', description: 'Suit', amount: 300 },
        { payer: 'Heaven', item: 'Photographer', description: 'Photogropher 1/2', amount: 1000 },
        { payer: 'Heaven', item: 'Videographer', description: 'Videographer', amount: 1500 },
        { payer: 'Heaven', item: null, description: 'AirBnb (others will contribute)', amount: 1957 },
        { payer: 'Heaven', item: 'Floral', description: 'Floral Deposit', amount: 100 },
        { payer: 'Heaven', item: 'Tux', description: 'Austin Suit', amount: 300 },
        { payer: 'Heaven', item: 'Decor', description: 'Dollar Tree Bouquet Vases', amount: 20 },
        { payer: 'Heaven', item: 'Invitations', description: 'Invites', amount: 53 },
        { payer: 'Heaven', item: "Austin's Ring", description: 'Aust Ring', amount: 1284 },
        { payer: 'Heaven', item: 'Venue', description: 'Venue Payment', amount: 4680 },
    ];

export const SEED_CONTRIBUTORS: {
    name: string;
    pledged: number;
    receipts: { amount: number; item: string | null; note: string | null }[];
}[] = [
        { name: 'Karie & Dave', pledged: 5000, receipts: [] },
        { name: 'Kim', pledged: 1200, receipts: [
            { amount: 1200, item: 'Dress', note: 'Dress' },
            // No Veil budget line exists, so this one stays unearmarked.
            { amount: 680, item: null, note: 'Veil' },
        ] },
        { name: 'Rob', pledged: 10000, receipts: [
            { amount: 5000, item: 'Venue', note: 'Venue 1/4' },
        ] },
        { name: 'A Gram', pledged: 1000, receipts: [] },
    ];
