import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ensureHoneymoonTables, getHoneymoonPayload } from '@/lib/honeymoonDb';

/**
 * Whole trips, frozen and thawed.
 *
 * `honeymoon_trip` is a singleton and threading a `trip_id` through eleven
 * tables to plan two trips at once is not the trade this portal wants. A
 * snapshot answers what the singleton cannot: keep the honeymoon after you have
 * flown home, and start the next trip from a copy of it.
 *
 * POST snapshots. PUT restores — into the live tables, replacing what is there,
 * which is why it takes a confirmation flag and snapshots the current state
 * first. DELETE forgets a snapshot.
 */
export async function POST(request: Request) {
    try {
        await ensureHoneymoonTables();
        const body = await request.json().catch(() => ({}));
        const payload = await getHoneymoonPayload();
        const name = (typeof body.name === 'string' && body.name.trim())
            || `${payload.trip.title} — ${new Date().toISOString().slice(0, 10)}`;
        const row = await pool.query(
            'INSERT INTO honeymoon_archives (name, payload) VALUES ($1, $2) RETURNING id, name, created_at',
            [name, JSON.stringify(payload)],
        );
        return NextResponse.json({ success: true, archive: row.rows[0] });
    } catch (error) {
        console.error('Error archiving the trip:', error);
        return NextResponse.json({ error: 'Could not archive the trip' }, { status: 500 });
    }
}

/**
 * Restore a snapshot over the live trip.
 *
 * All in one transaction: a half-restored trip would be worse than either the
 * old one or the new one. The current state is snapshotted first — under its own
 * name — so this is undoable by restoring that.
 */
export async function PUT(request: Request) {
    const client = await pool.connect();
    try {
        await ensureHoneymoonTables();
        const body = await request.json().catch(() => ({}));
        const id = Math.trunc(Number(body.id));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid id required' }, { status: 400 });
        }
        if (body.confirm !== true) {
            return NextResponse.json(
                { error: 'This replaces the current trip; send confirm: true.' },
                { status: 400 },
            );
        }

        const stored = await client.query('SELECT name, payload FROM honeymoon_archives WHERE id = $1', [id]);
        const archive = stored.rows[0];
        if (!archive) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        const data = archive.payload;

        // Snapshot what is about to be replaced, outside the transaction that
        // replaces it, so it survives even if the restore fails.
        const current = await getHoneymoonPayload();
        await pool.query(
            'INSERT INTO honeymoon_archives (name, payload) VALUES ($1, $2)',
            [`Before restoring “${archive.name}”`, JSON.stringify(current)],
        );

        await client.query('BEGIN');
        // Order matters: children before parents, and days before places because
        // days reference places.
        for (const table of [
            'honeymoon_comments', 'honeymoon_bookings', 'honeymoon_documents',
            'honeymoon_price_checks', 'honeymoon_stops', 'honeymoon_travel',
            'honeymoon_journeys', 'honeymoon_days', 'honeymoon_todos', 'honeymoon_notes',
            'honeymoon_places', 'honeymoon_regions',
        ]) {
            await client.query(`DELETE FROM ${table}`);
        }

        await client.query(
            `UPDATE honeymoon_trip SET title = $1, start_date = $2, end_date = $3,
                home_currency = $4, notes = $5, focus_country = $6, budget = $7,
                partner_names = $8, info = $9, time_format = $10, distance_unit = $11, phase = $12
             WHERE id = 1`,
            [
                data.trip?.title ?? 'Honeymoon', data.trip?.start_date ?? null,
                data.trip?.end_date ?? null, data.trip?.home_currency ?? 'USD',
                data.trip?.notes ?? null, data.trip?.focus_country ?? '',
                data.trip?.budget ?? null, data.trip?.partner_names ?? '',
                JSON.stringify(data.trip?.info ?? {}), data.trip?.time_format ?? '24h',
                data.trip?.distance_unit ?? 'km', data.trip?.phase ?? 'planning',
            ],
        );

        /* Old id → new id, so the children can be re-pointed. */
        const regionIds = new Map<number, number>();
        for (const region of data.regions ?? []) {
            const row = await client.query(
                `INSERT INTO honeymoon_regions (name, country, description, center_lat, center_lng,
                    sort_order, boundary)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [region.name, region.country ?? '', region.description ?? null,
                    region.center_lat, region.center_lng, region.sort_order ?? 0,
                    region.boundary ? JSON.stringify(region.boundary) : null],
            );
            regionIds.set(region.id, row.rows[0].id);
        }

        const placeIds = new Map<number, number>();
        for (const place of data.places ?? []) {
            const row = await client.query(
                `INSERT INTO honeymoon_places
                    (region_id, name, category, lat, lng, address, description, status, price_note,
                     links, photos, source, needs_review, rating, image_url, is_excursion, archived,
                     country, rank, sort_order, cost, cost_currency, cost_per, opening_hours,
                     best_time, ratings, star_rating, price_range, amenities)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                         $21,$22,$23,$24,$25,$26,$27,$28,$29) RETURNING id`,
                [
                    place.region_id != null ? regionIds.get(place.region_id) ?? null : null,
                    place.name, place.category, place.lat, place.lng, place.address,
                    place.description, place.status ?? 'idea', place.price_note,
                    JSON.stringify(place.links ?? []), JSON.stringify(place.photos ?? []),
                    place.source ?? 'manual', place.needs_review === true, place.rating,
                    place.image_url, place.is_excursion === true, place.archived === true,
                    place.country ?? '', place.rank, place.sort_order ?? 0,
                    place.cost, place.cost_currency, place.cost_per ?? 'total',
                    place.opening_hours, place.best_time, JSON.stringify(place.ratings ?? {}),
                    place.star_rating, place.price_range, JSON.stringify(place.amenities ?? []),
                ],
            );
            placeIds.set(place.id, row.rows[0].id);
        }

        /* Journeys before legs: a leg points at one. */
        const journeyIds = new Map<number, number>();
        for (const journey of data.journeys ?? []) {
            const row = await client.query(
                `INSERT INTO honeymoon_journeys (title, kind, notes, sort_order)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [journey.title ?? '', journey.kind ?? 'flight', journey.notes ?? null,
                    journey.sort_order ?? 0],
            );
            journeyIds.set(journey.id, row.rows[0].id);
        }

        const dayIds = new Map<number, number>();
        const stopIds = new Map<number, number>();
        const travelIds = new Map<number, number>();
        for (const day of data.days ?? []) {
            const row = await client.query(
                `INSERT INTO honeymoon_days (day_number, title, base_place_id, notes)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [day.day_number, day.title,
                    day.base_place_id != null ? placeIds.get(day.base_place_id) ?? null : null,
                    day.notes],
            );
            dayIds.set(day.id, row.rows[0].id);

            for (const stop of day.stops ?? []) {
                const stopRow = await client.query(
                    `INSERT INTO honeymoon_stops (day_id, place_id, custom_label, start_time, notes,
                        sort_order, duration_minutes, outcome, favourite, journal, photos)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
                    [row.rows[0].id,
                        stop.place_id != null ? placeIds.get(stop.place_id) ?? null : null,
                        stop.custom_label, stop.start_time, stop.notes, stop.sort_order ?? 0,
                        stop.duration_minutes, stop.outcome, stop.favourite === true,
                        stop.journal, JSON.stringify(stop.photos ?? [])],
                );
                stopIds.set(stop.id, stopRow.rows[0].id);
            }

            for (const leg of day.travel ?? []) {
                const legRow = await client.query(
                    `INSERT INTO honeymoon_travel (day_id, mode, from_text, to_text, depart_time,
                        arrive_time, confirmation_ref, notes, arrive_day_offset, from_lat, from_lng,
                        to_lat, to_lng, sort_order, cost, cost_currency, booked_by, depart_tz,
                        arrive_tz, flight_no, from_terminal, to_terminal, aircraft, journey_id,
                        depart_date, arrive_date)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                             $20,$21,$22,$23,$24,$25,$26) RETURNING id`,
                    [row.rows[0].id, leg.mode ?? 'flight', leg.from_text, leg.to_text,
                        leg.depart_time, leg.arrive_time, leg.confirmation_ref, leg.notes,
                        leg.arrive_day_offset ?? 0, leg.from_lat, leg.from_lng, leg.to_lat,
                        leg.to_lng, leg.sort_order ?? 0, leg.cost, leg.cost_currency,
                        leg.booked_by, leg.depart_tz, leg.arrive_tz, leg.flight_no,
                        leg.from_terminal, leg.to_terminal, leg.aircraft,
                        leg.journey_id != null ? journeyIds.get(leg.journey_id) ?? null : null,
                        leg.depart_date ?? null, leg.arrive_date ?? null],
                );
                travelIds.set(leg.id, legRow.rows[0].id);
            }
        }

        for (const note of data.notes ?? []) {
            await client.query(
                `INSERT INTO honeymoon_notes (title, body, category, source, sort_order, region_id,
                    place_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [note.title, note.body ?? '', note.category, note.source, note.sort_order ?? 0,
                    note.region_id != null ? regionIds.get(note.region_id) ?? null : null,
                    note.place_id != null ? placeIds.get(note.place_id) ?? null : null],
            );
        }

        for (const todo of data.todos ?? []) {
            await client.query(
                `INSERT INTO honeymoon_todos (text, done, result, category, due_on, sort_order,
                    kind, person, place_id, day_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [todo.text, todo.done === true, todo.result, todo.category, todo.due_on,
                    todo.sort_order ?? 0, todo.kind ?? 'task', todo.person,
                    todo.place_id != null ? placeIds.get(todo.place_id) ?? null : null,
                    todo.day_id != null ? dayIds.get(todo.day_id) ?? null : null],
            );
        }

        for (const booking of data.bookings ?? []) {
            await client.query(
                `INSERT INTO honeymoon_bookings (place_id, travel_id, stop_id, journey_id, kind,
                    provider, confirmation, url, contact, check_in, check_out, check_in_time,
                    check_out_time, cost, cost_currency, cost_paid, deposit_due_on, cancel_by,
                    party_size, dress_code, paid, documents, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                         $21,$22,$23)`,
                [
                    booking.place_id != null ? placeIds.get(booking.place_id) ?? null : null,
                    booking.travel_id != null ? travelIds.get(booking.travel_id) ?? null : null,
                    booking.stop_id != null ? stopIds.get(booking.stop_id) ?? null : null,
                    booking.journey_id != null
                        ? journeyIds.get(booking.journey_id) ?? null : null,
                    booking.kind ?? 'other', booking.provider, booking.confirmation, booking.url,
                    booking.contact, booking.check_in, booking.check_out, booking.check_in_time,
                    booking.check_out_time, booking.cost, booking.cost_currency, booking.cost_paid,
                    booking.deposit_due_on, booking.cancel_by, booking.party_size,
                    booking.dress_code, booking.paid === true,
                    JSON.stringify(booking.documents ?? []), booking.notes,
                ],
            );
        }

        for (const comment of data.comments ?? []) {
            if (comment.place_id == null) continue;
            const placeId = placeIds.get(comment.place_id);
            if (placeId == null) continue;
            await client.query(
                'INSERT INTO honeymoon_comments (place_id, author, body) VALUES ($1, $2, $3)',
                [placeId, comment.author ?? '', comment.body ?? ''],
            );
        }

        await client.query('COMMIT');
        return NextResponse.json({ success: true, restored: archive.name });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('Error restoring the trip:', error);
        return NextResponse.json({ error: 'Could not restore that snapshot' }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function DELETE(request: Request) {
    try {
        await ensureHoneymoonTables();
        const id = Math.trunc(Number(new URL(request.url).searchParams.get('id')));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid id required' }, { status: 400 });
        }
        const result = await pool.query('DELETE FROM honeymoon_archives WHERE id = $1', [id]);
        if (!result.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting an archive:', error);
        return NextResponse.json({ error: 'Could not delete that snapshot' }, { status: 500 });
    }
}
