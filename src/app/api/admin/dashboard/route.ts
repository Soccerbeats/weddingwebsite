import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SITE_CONFIG_PATH = path.join(process.cwd(), 'public/config/site.json');
const PHOTOS_CONFIG_PATH = path.join(process.cwd(), 'public/config/photos.json');
const TIMELINE_CONFIG_PATH = path.join(process.cwd(), 'public/config/timeline.json');

function readJson(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export async function GET() {
  const client = await pool.connect();
  try {
    const siteConfig = readJson(SITE_CONFIG_PATH) || {};
    const photosData = readJson(PHOTOS_CONFIG_PATH) || { photos: [] };
    const timelineData = readJson(TIMELINE_CONFIG_PATH) || { milestones: [] };

    const photos: any[] = photosData.photos || [];
    const milestones: any[] = timelineData.milestones || [];

    // RSVP stats
    const rsvpResult = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE attending = true)::int AS attending,
        COUNT(*) FILTER (WHERE attending = false)::int AS declined,
        COALESCE(SUM(number_of_guests) FILTER (WHERE attending = true), 0)::int AS total_guests
      FROM rsvps
    `);

    // Guest list stats
    const guestResult = await client.query(`
      SELECT
        COUNT(*)::int AS total_invited,
        COALESCE(SUM(party_size), 0)::int AS total_party_size,
        COUNT(*) FILTER (WHERE rsvp_status = 'confirmed')::int AS confirmed,
        COUNT(*) FILTER (WHERE rsvp_status = 'declined')::int AS declined_guests,
        COUNT(*) FILTER (WHERE side = 'bride')::int AS bride_side,
        COUNT(*) FILTER (WHERE side = 'groom')::int AS groom_side,
        COUNT(*) FILTER (WHERE invited = true AND (rsvp_status IS NULL OR rsvp_status = ''))::int AS pending,
        COALESCE(SUM(party_size) FILTER (WHERE rsvp_status = 'likely_not_coming'), 0)::int AS likely_not_coming
      FROM guest_list
    `);

    // Recent RSVPs (last 5)
    const recentResult = await client.query(`
      SELECT guest_name, attending, number_of_guests, created_at
      FROM rsvps
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Ensure is_hidden column exists (idempotent)
    await client.query(`ALTER TABLE wip_toggles ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false`);

    // WIP toggles
    const wipResult = await client.query(`
      SELECT page_label, is_wip, is_hidden FROM wip_toggles ORDER BY page_label
    `);

    // Seating overview
    let seating = { tables: 0, totalSeats: 0, assignedSeats: 0, tableList: [] as { name: string; seat_count: number; assigned: number; table_type: string }[] };
    try {
      const fpResult = await client.query(`SELECT id FROM floor_plans ORDER BY id ASC LIMIT 1`);
      if (fpResult.rows.length > 0) {
        const fpId = fpResult.rows[0].id;
        const tablesResult = await client.query(
          `SELECT t.id, t.name, t.seat_count, t.table_type,
                  COUNT(sa.seat_index)::int AS assigned
           FROM seating_tables t
           LEFT JOIN seat_assignments sa ON sa.seating_table_id = t.id
           WHERE t.floor_plan_id = $1
           GROUP BY t.id, t.name, t.seat_count, t.table_type
           ORDER BY t.name`, [fpId]
        );
        const rows = tablesResult.rows;
        seating = {
          tables: rows.length,
          totalSeats: rows.reduce((s: number, r: any) => s + r.seat_count, 0),
          assignedSeats: rows.reduce((s: number, r: any) => s + r.assigned, 0),
          tableList: rows.map((r: any) => ({ name: r.name, seat_count: r.seat_count, assigned: r.assigned, table_type: r.table_type })),
        };
      }
    } catch { /* seating tables may not exist yet */ }

    const rsvp = rsvpResult.rows[0];
    const guests = guestResult.rows[0];

    // Countdown
    let daysUntil: number | null = null;
    if (siteConfig.weddingDate) {
      const weddingMs = new Date(siteConfig.weddingDate).getTime();
      const nowMs = Date.now();
      daysUntil = Math.ceil((weddingMs - nowMs) / (1000 * 60 * 60 * 24));
    }

    return NextResponse.json({
      siteConfig,
      countdown: { daysUntil },
      rsvp: {
        total: rsvp.total,
        attending: rsvp.attending,
        declined: rsvp.declined,
        totalGuests: rsvp.total_guests,
      },
      guestList: {
        totalInvited: guests.total_invited,
        totalPartySize: guests.total_party_size,
        confirmed: guests.confirmed,
        declined: guests.declined_guests,
        brideSide: guests.bride_side,
        groomSide: guests.groom_side,
        pending: guests.pending,
        likelyNotComing: guests.likely_not_coming,
      },
      photos: {
        total: photos.length,
        hearted: photos.filter((p: any) => p.hearted).length,
      },
      timeline: {
        milestones: milestones.length,
      },
      recentRsvps: recentResult.rows,
      wipToggles: wipResult.rows as { page_label: string; is_wip: boolean; is_hidden: boolean }[],
      seating,
    });
  } finally {
    client.release();
  }
}
