/**
 * Dashboard activity feed.
 *
 * There is no audit log table — and adding one would only start recording from
 * the day it ships. Instead the feed is assembled from the timestamps the data
 * already carries: RSVP submissions, guest-list additions, logged gifts,
 * finance payments and receipts, photo uploads, timeline milestones. That gives
 * a full history on the very first load, at the cost of only surfacing events
 * that left a dated row behind (edits and deletions are invisible).
 */
import type { PoolClient } from 'pg';

export type ActivityKind =
    | 'rsvp-yes'
    | 'rsvp-no'
    | 'rsvp-update'
    | 'guest'
    | 'gift'
    | 'payment'
    | 'receipt'
    | 'schedule'
    | 'photo'
    | 'milestone';

export interface ActivityEvent {
    id: string;
    kind: ActivityKind;
    title: string;
    detail?: string;
    /** ISO timestamp */
    at: string;
    href?: string;
}

/** How many events the feed keeps after merging every source. */
const FEED_LIMIT = 60;
/** Per-source cap, so one busy table can't crowd out the rest. */
const SOURCE_LIMIT = 30;
/** An RSVP touched within this window of creation isn't a real "edit". */
const EDIT_GRACE_MS = 60_000;

/**
 * Run a query that may target a table this install hasn't created yet.
 * The feed is a nice-to-have: a missing table returns nothing rather than
 * taking the whole dashboard down with it.
 */
async function safeRows<T = Record<string, unknown>>(
    client: PoolClient,
    sql: string,
): Promise<T[]> {
    try {
        const result = await client.query(sql);
        return result.rows as T[];
    } catch {
        return [];
    }
}

function iso(value: unknown): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Photos and milestones use `Date.now()` as their id, so the id *is* the date. */
function isoFromEpochId(id: unknown): string | null {
    const n = Number(id);
    // Anything below 2001 is a hand-written id, not a millisecond timestamp.
    if (!Number.isFinite(n) || n < 1_000_000_000_000) return null;
    return new Date(n).toISOString();
}

/**
 * "Aug 15, 2026" from a DATE column. node-postgres hands DATE back as a Date at
 * local midnight, so read the local components — toISOString() would shift the
 * day backwards for anyone west of UTC.
 */
function dateLabel(value: unknown): string | null {
    if (!value) return null;
    // lib/db returns DATE columns as `YYYY-MM-DD`; build the Date from parts so
    // it can never be read as UTC midnight and rendered a day early.
    const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    const [y, m, d] = text.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function money(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '$0';
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export async function buildActivityFeed(
    client: PoolClient,
    photos: { id?: unknown; title?: unknown; alt?: unknown; filename?: unknown }[],
    milestones: { id?: unknown; title?: unknown; date?: unknown }[],
): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];
    const push = (e: ActivityEvent | null) => { if (e) events.push(e); };

    // ── RSVPs — one event for the submission, another if it was later changed ──
    const rsvps = await safeRows<{
        id: number; guest_name: string; attending: boolean;
        number_of_guests: number; created_at: Date; updated_at: Date | null;
    }>(client, `
        SELECT id, guest_name, attending, number_of_guests, created_at, updated_at
        FROM rsvps
        ORDER BY GREATEST(created_at, COALESCE(updated_at, created_at)) DESC
        LIMIT ${SOURCE_LIMIT}
    `);
    for (const r of rsvps) {
        const guests = r.number_of_guests || 0;
        const detail = r.attending
            ? `${guests} ${guests === 1 ? 'guest' : 'guests'}`
            : 'Not attending';
        const created = iso(r.created_at);
        if (created) {
            push({
                id: `rsvp-${r.id}`,
                kind: r.attending ? 'rsvp-yes' : 'rsvp-no',
                title: `${r.guest_name} RSVP'd ${r.attending ? 'yes' : 'no'}`,
                detail,
                at: created,
                href: '/admin/rsvps',
            });
        }
        const updated = iso(r.updated_at);
        if (created && updated && new Date(updated).getTime() - new Date(created).getTime() > EDIT_GRACE_MS) {
            push({
                id: `rsvp-edit-${r.id}`,
                kind: 'rsvp-update',
                title: `${r.guest_name} updated their RSVP`,
                detail: r.attending ? `Now attending · ${detail}` : 'Now not attending',
                at: updated,
                href: '/admin/rsvps',
            });
        }
    }

    // ── Guest list additions ──────────────────────────────────────────────────
    const guests = await safeRows<{
        id: number; guest_name: string; party_size: number; side: string | null; created_at: Date;
    }>(client, `
        SELECT id, guest_name, party_size, side, created_at
        FROM guest_list
        ORDER BY created_at DESC
        LIMIT ${SOURCE_LIMIT}
    `);
    for (const g of guests) {
        const at = iso(g.created_at);
        if (!at) continue;
        const size = g.party_size || 1;
        const side = g.side ? `${g.side.charAt(0).toUpperCase()}${g.side.slice(1)}'s side` : null;
        push({
            id: `guest-${g.id}`,
            kind: 'guest',
            title: `${g.guest_name} added to the guest list`,
            detail: [side, `party of ${size}`].filter(Boolean).join(' · '),
            at,
            href: '/admin/rsvps',
        });
    }

    // ── Gifts logged against the registry / gift fund ─────────────────────────
    const donations = await safeRows<{
        id: number; guest_name: string; amount: number | null;
        gift: string | null; fund_item_title: string | null; created_at: Date;
    }>(client, `
        SELECT id, guest_name, amount::float8 AS amount, gift, fund_item_title, created_at
        FROM donations
        ORDER BY created_at DESC
        LIMIT ${SOURCE_LIMIT}
    `);
    for (const d of donations) {
        const at = iso(d.created_at);
        if (!at) continue;
        const hasCash = Number(d.amount) > 0;
        push({
            id: `donation-${d.id}`,
            kind: 'gift',
            title: hasCash
                ? `${money(d.amount)} gift from ${d.guest_name}`
                : `Gift from ${d.guest_name}`,
            detail: [d.gift, d.fund_item_title].filter(Boolean).join(' · ') || undefined,
            at,
            href: '/admin/registry',
        });
    }

    // ── Finance: money out ────────────────────────────────────────────────────
    const purchases = await safeRows<{
        id: number; description: string; amount: number; payer: string | null; created_at: Date;
    }>(client, `
        SELECT p.id, p.description, p.amount::float8 AS amount,
               p.created_at, y.name AS payer
        FROM finance_purchases p
        LEFT JOIN finance_payers y ON y.id = p.payer_id
        WHERE p.archived IS NOT TRUE
        ORDER BY p.created_at DESC
        LIMIT ${SOURCE_LIMIT}
    `);
    for (const p of purchases) {
        const at = iso(p.created_at);
        if (!at) continue;
        push({
            id: `purchase-${p.id}`,
            kind: 'payment',
            title: `${money(p.amount)} paid — ${p.description}`,
            detail: p.payer ? `by ${p.payer}` : undefined,
            at,
            href: '/admin/finances',
        });
    }

    // ── Finance: money in ─────────────────────────────────────────────────────
    const receipts = await safeRows<{
        id: number; amount: number; contributor: string | null; created_at: Date;
    }>(client, `
        SELECT r.id, r.amount::float8 AS amount, r.created_at, c.name AS contributor
        FROM finance_receipts r
        LEFT JOIN finance_contributors c ON c.id = r.contributor_id
        ORDER BY r.created_at DESC
        LIMIT ${SOURCE_LIMIT}
    `);
    for (const r of receipts) {
        const at = iso(r.created_at);
        if (!at) continue;
        push({
            id: `receipt-${r.id}`,
            kind: 'receipt',
            title: `${money(r.amount)} received${r.contributor ? ` from ${r.contributor}` : ''}`,
            detail: 'gift money',
            at,
            href: '/admin/finances',
        });
    }

    // ── Finance: payments put on the schedule ─────────────────────────────────
    const scheduled = await safeRows<{
        id: number; label: string; amount: number; due_on: Date | null; created_at: Date;
    }>(client, `
        SELECT id, label, amount::float8 AS amount, due_on, created_at
        FROM finance_schedule
        ORDER BY created_at DESC
        LIMIT ${SOURCE_LIMIT}
    `);
    for (const s of scheduled) {
        const at = iso(s.created_at);
        if (!at) continue;
        const due = dateLabel(s.due_on);
        push({
            id: `schedule-${s.id}`,
            kind: 'schedule',
            title: `${money(s.amount)} scheduled — ${s.label}`,
            detail: due ? `due ${due}` : undefined,
            at,
            href: '/admin/finances',
        });
    }

    // ── Photos and milestones — timestamps recovered from their epoch ids ─────
    for (const p of photos.slice(-SOURCE_LIMIT)) {
        const at = isoFromEpochId(p.id);
        if (!at) continue;
        const name = String(p.title || p.alt || p.filename || 'Untitled');
        push({
            id: `photo-${p.id}`,
            kind: 'photo',
            title: 'Photo uploaded',
            detail: name.length > 48 ? `${name.slice(0, 47)}…` : name,
            at,
            href: '/admin/photos',
        });
    }

    for (const m of milestones.slice(-SOURCE_LIMIT)) {
        const at = isoFromEpochId(m.id);
        if (!at) continue;
        push({
            id: `milestone-${m.id}`,
            kind: 'milestone',
            title: 'Timeline milestone added',
            detail: String(m.title || 'Untitled'),
            at,
            href: '/admin/timeline',
        });
    }

    events.sort((a, b) => b.at.localeCompare(a.at));
    return events.slice(0, FEED_LIMIT);
}
