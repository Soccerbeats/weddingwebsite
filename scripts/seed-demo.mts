/**
 * Fill an instance with a complete fictional wedding.
 *
 *   DATABASE_URL=... CONFIG_DIR=... PHOTO_DIR=... npm run seed:demo
 *
 * For the public demo: every page populated, every admin tab with something in
 * it, and not one word of anyone's real wedding. See src/lib/demoSeed.ts.
 *
 * **This deletes what is already there.** It is for a demo instance and it
 * refuses to run unless `--yes-wipe` is passed, because pointing it at
 * production by accident would be unrecoverable.
 *
 * Photographs come from Lorem Picsum by fixed seed, so the demo ships with real
 * images and the same run always produces the same ones. `--no-photos` skips
 * the download for a quick re-seed.
 */
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { ensureFinanceTables } from '../src/lib/financeDb';
import { ensureHoneymoonTables } from '../src/lib/honeymoonDb';
import {
    DEMO_BRIDE_PARTY, DEMO_COUPLE, DEMO_DAYS, DEMO_FAQS, DEMO_FINANCE, DEMO_FUND_ITEMS,
    DEMO_GROOM_PARTY, DEMO_MESSAGES, DEMO_NOTES, DEMO_PHOTO_CAPTIONS, DEMO_PLACES,
    DEMO_REGIONS, DEMO_REGISTRY_ITEMS, DEMO_SCHEDULE, DEMO_TIMELINE, DEMO_TODOS,
    DEMO_RSVP_DEADLINE, DEMO_WEDDING_DATE, demoGuests,
} from '../src/lib/demoSeed';

const args = process.argv.slice(2);
const CONFIRM = args.includes('--yes-wipe');
const NO_PHOTOS = args.includes('--no-photos');
const CONFIG_DIR = process.env.CONFIG_DIR ?? 'public/config';
const PHOTO_DIR = process.env.PHOTO_DIR ?? 'public/photos';
const PHOTO_COUNT = Number(process.env.PHOTO_COUNT ?? 36);

if (!CONFIRM) {
    console.error(`
This wipes the target database and config directory and replaces them with
demo data. It is for the demo instance only.

  DATABASE_URL=postgres://…  npm run seed:demo -- --yes-wipe

Target database: ${process.env.DATABASE_URL ?? '(DATABASE_URL not set)'}
Config directory: ${CONFIG_DIR}
Photo directory:  ${PHOTO_DIR}
`);
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/* ------------------------------------------------------------------ */
/* Photos                                                              */
/* ------------------------------------------------------------------ */

interface PhotoRow {
    id: number; filename: string; alt: string; category: string;
    order: number; hearted: boolean;
}

async function seedPhotos(): Promise<PhotoRow[]> {
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    const rows: PhotoRow[] = [];

    for (let i = 0; i < Math.min(PHOTO_COUNT, DEMO_PHOTO_CAPTIONS.length); i += 1) {
        const filename = `demo-${String(i + 1).padStart(2, '0')}.jpg`;
        const target = path.join(PHOTO_DIR, filename);

        if (!NO_PHOTOS && !fs.existsSync(target)) {
            // A fixed seed per file: the same demo photograph every time.
            const url = `https://picsum.photos/seed/wed-demo-${i + 1}/1600/1067`;
            try {
                const res = await fetch(url, { redirect: 'follow' });
                if (!res.ok) throw new Error(`http ${res.status}`);
                fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
                process.stdout.write('.');
            } catch (error) {
                // A missing photo must not stop the seed: the rest of the demo is
                // still worth having, and the gallery degrades to fewer images.
                console.warn(`\n  could not fetch ${filename}: ${(error as Error).message}`);
                continue;
            }
        } else if (!fs.existsSync(target)) {
            continue;
        }

        rows.push({
            id: 1_700_000_000_000 + i,
            filename,
            alt: DEMO_PHOTO_CAPTIONS[i],
            category: 'wedding',
            order: i,
            // Roughly the same proportion hearted as a real install.
            hearted: i % 5 !== 3 && i < 20,
        });
    }
    if (!NO_PHOTOS) process.stdout.write('\n');
    return rows;
}

/* ------------------------------------------------------------------ */
/* Config files                                                        */
/* ------------------------------------------------------------------ */

/**
 * A photo reference, as site.json stores them: a **bare filename**.
 *
 * The app prepends `/api/photos/` itself. Writing the full path here produced
 * `/api/photos/api/photos/demo-01.jpg` and a page of 404s — which is how the
 * convention got checked against production rather than assumed.
 */
function heroName(photos: PhotoRow[], index: number): string {
    return photos.length ? photos[index % photos.length].filename : '';
}

function writeConfig(photos: PhotoRow[]) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    const party = (list: typeof DEMO_BRIDE_PARTY, offset: number) => list.map((member, i) => ({
        id: `demo-${offset + i}`,
        name: member.name,
        role: member.role,
        relationship: member.relationship,
        photo: heroName(photos, offset + i + 4),
        bio: '',
        photoAlign: 'object-center',
    }));

    const site = {
        brideName: DEMO_COUPLE.bride,
        groomName: DEMO_COUPLE.groom,
        weddingDate: DEMO_WEDDING_DATE,
        weddingTime: '4:00 PM',
        weddingLocation: 'Asheville, North Carolina',
        weddingVenue: 'The Ravenwood Estate',
        venueAddress: '418 Ravenwood Lane, Asheville, NC 28804',
        venueDescription: 'A stone house and a walled garden at the end of a long gravel lane, twenty minutes out of town.',
        rsvpDeadline: DEMO_RSVP_DEADLINE,
        countdownMode: 'days_only',
        homeHero: heroName(photos, 0),
        aboutHero: heroName(photos, 1),
        footerHeroImage: heroName(photos, 2),
        venuePhoto: heroName(photos, 3),
        weddingLogo: '',
        logoMode: false,
        homeHeadline: 'Maya & Theo, at last',
        homeIntroTitle: 'We are getting married',
        homeIntroBody: 'Nine years after standing in the wrong queue for the wrong film, we are doing this properly. '
            + 'The twelfth of June, a stone house outside Asheville, and everyone we like in one walled garden. '
            + 'There is a shuttle, there is a pizza van at midnight, and there is no seating plan drama we are willing to discuss.',
        ourStoryTitle: ' ',
        ourStoryBody: 'It started as a mix-up over cinema tickets and became the kind of thing where neither of us can '
            + 'remember what the arrangement was before. There was a flat with no lift and a sofa that would not fit '
            + 'through the door. There was a dog we went to "look at". There was a year in which Theo learned to cook '
            + 'properly and Maya learned to make bread that does not need to be called rustic, and friends stopped '
            + 'offering to bring anything. There was a two-hundred-kilometre walk on which, somewhere around day nine '
            + 'and one memorable blister, we started talking about this. The proposal was supposed to involve a '
            + 'restaurant and a speech. What it actually involved was a power cut, a torch and a kitchen floor, eleven '
            + 'days early, which in hindsight was much more us.',
        howWeMetTitle: 'How we met',
        ceremonyText: 'Four o\'clock on the lawn, or in the orangery if the weather has other ideas. Twenty minutes.',
        receptionText: 'Dinner at six in the ballroom, speeches at a quarter to eight, dancing until the band gives up. '
            + 'Shuttles run to both hotels until half past midnight.',
        timelineSubtitle: 'Nine years, abbreviated',
        photosSubtitle: 'Some of ours, and some of yours',
        weddingPartySubtitle: 'The people who got us here, and who will get us through the day',
        aboutSubtitle: '',
        scheduleSubtitle: 'Everything, in order',
        registryPageSubtitle: '',
        roomBlockHotel: 'The Coppermill',
        roomBlockUrl: 'https://example.com/demo-room-block',
        roomBlockMessage: 'Rooms are held at The Coppermill and the Laurel Inn until the first of May, both at the foot '
            + 'of the hill with the shuttle stopping outside. Mention the wedding when you book and the rate applies.',
        accentColor: '#7C6A46',
        accentLightColor: '#E8DFC9',
        accentDarkColor: '#5B4C31',
        weddingColorPalette: ['#7C6A46', '#E8DFC9', '#4F5D52', '#B4796C', '#2F2A25'],
        faqs: DEMO_FAQS,
        scheduleEvents: DEMO_SCHEDULE,
        weddingParty: {
            brideParty: party(DEMO_BRIDE_PARTY, 0),
            groomParty: party(DEMO_GROOM_PARTY, 7),
        },
        basicMode: false,
        basicModeShowVenue: true,
        heroSlideshowEnabled: true,
        heroSlideshowImages: photos.slice(0, 9).map((p) => p.filename),
        heroSlideshowInterval: 6000,
        adminBgColors: {
            home: '#ffffff', about: '#ffffff', photos: '#ffffff', timeline: '#ffffff',
            schedule: '#ffffff', faqs: '#ffffff', rsvps: '#ffffff', weddingParty: '#ffffff',
            settings: '#ffffff', wipControl: '#ffffff',
        },
        pageBgColors: {
            home: '#FBF8F2', about: '#FBF8F2', ourStory: '#FFFFFF', weddingParty: '#FBF8F2',
            schedule: '#FFFFFF', photos: '#FFFFFF', rsvp: '#FBF8F2', registry: '#FFFFFF',
        },
        navCards: {
            'our-story': 'Our Story', registry: 'Registry', schedule: 'Schedule',
            rsvp: 'RSVP', 'wedding-party': 'Wedding Party', photos: 'Photos',
        },
        registry: {
            enabled: true,
            showFinancials: true,
            title: 'Registry',
            subtitle: 'A few things, and a fund for the trip',
            description: 'We have lived together for seven years, so the cupboards are not bare. If you would like to '
                + 'give something, there is a short list of things that are genuinely wearing out, and a fund towards '
                + 'the honeymoon — two weeks in Portugal, most of it on foot. Neither is expected in the slightest.',
            zelle: { handle: 'demo@example.com', label: 'Zelle (demo)' },
            venmo: { handle: '@maya-theo-demo', label: 'Venmo (demo)' },
            cashapp: { handle: '$mayatheodemo', label: 'Cash App (demo)' },
            paypal: { handle: 'demo@example.com', label: 'PayPal (demo)' },
            items: DEMO_FUND_ITEMS.map((item, i) => ({ ...item, id: `fund-${i + 1}` })),
        },
        registryItems: DEMO_REGISTRY_ITEMS.map((item, i) => ({
            id: `reg-${i + 1}`,
            store: item.store,
            title: item.title,
            description: item.description,
            // External URLs in production (scraped from the store), so the demo
            // uses a placeholder host rather than a wedding photograph.
            image: `https://picsum.photos/seed/demo-product-${i + 1}/600/600`,
            price: item.price,
            url: 'https://example.com/demo-product',
        })),
    };

    fs.writeFileSync(path.join(CONFIG_DIR, 'site.json'), `${JSON.stringify(site, null, 2)}\n`);

    fs.writeFileSync(path.join(CONFIG_DIR, 'photos.json'),
        `${JSON.stringify({ photos }, null, 2)}\n`);

    const milestones = DEMO_TIMELINE.map((m, i) => ({
        id: 1_700_000_000_000 + i,
        title: m.title,
        date: m.date,
        description: m.description,
        photos: photos.length
            ? [photos[(i * 3) % photos.length].filename, photos[(i * 3 + 1) % photos.length].filename]
            : [],
        dateFormat: 'month_year',
        photoAligns: ['object-center', 'object-center'],
    }));
    fs.writeFileSync(path.join(CONFIG_DIR, 'timeline.json'),
        `${JSON.stringify({ milestones }, null, 2)}\n`);

    return site;
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

/** Every table the demo owns, children before parents. */
const WIPE = [
    'seat_assignments', 'seating_tables', 'floor_plan_room', 'floor_plans',
    'finance_purchases', 'finance_receipts', 'finance_schedule', 'finance_subitems',
    'finance_items', 'finance_contributors', 'finance_payers', 'finance_categories',
    'finance_snapshots', 'finance_settings',
    'donations', 'rsvps', 'guest_list', 'wip_toggles',
    'honeymoon_stops', 'honeymoon_travel', 'honeymoon_days', 'honeymoon_places',
    'honeymoon_regions', 'honeymoon_notes', 'honeymoon_todos',
];

async function tableExists(name: string): Promise<boolean> {
    const res = await pool.query('SELECT to_regclass($1) AS t', [`public.${name}`]);
    return res.rows[0].t != null;
}

async function wipe() {
    for (const table of WIPE) {
        if (await tableExists(table)) await pool.query(`DELETE FROM ${table}`);
    }
    // The honeymoon trip is a singleton, so it is reset rather than deleted.
    if (await tableExists('honeymoon_trip')) {
        await pool.query(`UPDATE honeymoon_trip SET title = $1, start_date = NULL, end_date = NULL,
            notes = NULL, focus_country = '', home_currency = 'USD' WHERE id = 1`, ['Honeymoon']);
    }
}

async function seedGuests() {
    const guests = demoGuests(90);
    const ids: number[] = [];
    for (const guest of guests) {
        const res = await pool.query(
            `INSERT INTO guest_list
             (guest_name, email, phone, party_size, side, notes, invited, rsvp_status,
              address, party_members, flag, relationship)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [guest.guest_name, guest.email, guest.phone, guest.party_size, guest.side,
                guest.notes, guest.invited, guest.rsvp_status, guest.address,
                JSON.stringify(guest.party_members), guest.flag, guest.relationship],
        );
        ids.push(res.rows[0].id);
    }

    // RSVPs only for guests whose status says they answered, so the two agree.
    let message = 0;
    let rsvps = 0;
    for (const [index, guest] of guests.entries()) {
        if (!guest.rsvp_status || guest.rsvp_status === 'likely_not') continue;
        const attending = guest.rsvp_status === 'attending';
        await pool.query(
            `INSERT INTO rsvps
             (guest_name, email, phone, attending, number_of_guests, message, dietary_restrictions)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [guest.guest_name, guest.email ?? 'demo@example.com', guest.phone,
                attending, attending ? guest.party_size : 0,
                index % 3 === 0 ? DEMO_MESSAGES[message++ % DEMO_MESSAGES.length] : null,
                JSON.stringify(guest.party_members
                    .filter((m) => m.dietary)
                    .map((m) => ({ name: m.name, restriction: m.dietary })))],
        );
        rsvps += 1;
    }

    // Donations against the fund, from guests who are coming.
    const givers = guests.filter((g) => g.rsvp_status === 'attending').slice(0, 14);
    for (const [index, giver] of givers.entries()) {
        const fund = DEMO_FUND_ITEMS[index % DEMO_FUND_ITEMS.length];
        const gift = index % 5 === 4;
        await pool.query(
            `INSERT INTO donations
             (guest_name, amount, fund_item_id, fund_item_title, event, gift, thank_you_sent)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [giver.guest_name, gift ? null : 25 + ((index * 35) % 220),
                `fund-${(index % DEMO_FUND_ITEMS.length) + 1}`, fund.title, 'wedding',
                gift ? 'Hand-thrown serving bowl' : null, index % 3 === 0],
        );
    }

    return { guests: ids.length, rsvps, donations: givers.length, ids, list: guests };
}

async function seedWip() {
    const pages: [string, string, boolean, boolean][] = [
        ['/registry', 'Registry', false, false],
        ['/photos', 'Photos', false, false],
        ['/our-story', 'Our Story', false, false],
    ];
    for (const [pathName, label, wipFlag, hidden] of pages) {
        await pool.query(
            `INSERT INTO wip_toggles (page_path, page_label, is_wip, is_hidden) VALUES ($1,$2,$3,$4)
             ON CONFLICT (page_path) DO UPDATE SET is_wip = $3, is_hidden = $4`,
            [pathName, label, wipFlag, hidden],
        );
    }
}

async function seedFinance() {
    if (!(await tableExists('finance_items'))) return { items: 0 };

    await pool.query(`INSERT INTO finance_settings (id, adult_count, minor_count, plan_horizon_months,
        paycheck_interval_days) VALUES (1, 96, 14, 12, 14)
        ON CONFLICT (id) DO UPDATE SET adult_count = 96, minor_count = 14`);

    const categoryIds: number[] = [];
    for (const [index, name] of DEMO_FINANCE.categories.entries()) {
        const res = await pool.query(
            'INSERT INTO finance_categories (name, sort_order, archived) VALUES ($1,$2,false) RETURNING id',
            [name, index],
        );
        categoryIds.push(res.rows[0].id);
    }

    const payerIds: number[] = [];
    for (const [index, [name, share]] of DEMO_FINANCE.payers.entries()) {
        const res = await pool.query(
            'INSERT INTO finance_payers (name, share_pct, sort_order) VALUES ($1,$2,$3) RETURNING id',
            [name, share, index],
        );
        payerIds.push(res.rows[0].id);
    }

    for (const [index, [name, pledged, notes]] of DEMO_FINANCE.contributors.entries()) {
        await pool.query(
            `INSERT INTO finance_contributors (name, pledged, notes, sort_order, archived, thank_you_sent)
             VALUES ($1,$2,$3,$4,false,$5)`,
            [name, pledged, notes, index, index < 2],
        );
    }

    const itemIds: number[] = [];
    for (const [index, [name, unit, qty, categoryIndex, paid]] of DEMO_FINANCE.items.entries()) {
        const res = await pool.query(
            `INSERT INTO finance_items
             (category_id, name, unit_cost, quantity, qty_source, use_subitems, is_paid, sort_order, archived)
             VALUES ($1,$2,$3,$4,$5,false,$6,$7,false) RETURNING id`,
            [categoryIds[categoryIndex], name, unit, qty, qty > 1 ? 'guests' : 'manual', paid, index],
        );
        itemIds.push(res.rows[0].id);
    }

    // Purchases against the paid items, split between the two payers.
    let purchases = 0;
    for (const [index, [name, unit, qty, , paid]] of DEMO_FINANCE.items.entries()) {
        if (!paid) continue;
        await pool.query(
            `INSERT INTO finance_purchases
             (payer_id, item_id, description, amount, purchased_on, category_id, archived)
             VALUES ($1,$2,$3,$4,$5,$6,false)`,
            [payerIds[index % payerIds.length], itemIds[index], name, unit * qty,
                `2026-${String(3 + (index % 8)).padStart(2, '0')}-${String(3 + (index % 24)).padStart(2, '0')}`,
                categoryIds[DEMO_FINANCE.items[index][3]]],
        );
        purchases += 1;
    }

    // Money actually received from the two contributors marked as thanked.
    const contributors = await pool.query('SELECT id, pledged FROM finance_contributors ORDER BY sort_order LIMIT 3');
    for (const [index, row] of contributors.rows.entries()) {
        await pool.query(
            `INSERT INTO finance_receipts (contributor_id, amount, received_on, note)
             VALUES ($1,$2,$3,$4)`,
            [row.id, Number(row.pledged), `2026-0${3 + index}-1${index}`, index === 0 ? 'Bank transfer' : null],
        );
    }

    await pool.query(
        `INSERT INTO finance_schedule (item_id, category_id, label, kind, amount, due_on, settled, sort_order)
         VALUES ($1,$2,'Catering balance','payment',$3,'2027-05-15',false,0)`,
        [itemIds[1], categoryIds[0], 92 * 110 * 0.6],
    );

    return { items: itemIds.length, purchases };
}

async function seedSeating(guestIds: number[], guests: { guest_name: string; party_size: number }[]) {
    if (!(await tableExists('floor_plans'))) return { tables: 0, seats: 0 };

    const plan = await pool.query(
        'INSERT INTO floor_plans (name, room_width, room_height) VALUES ($1,$2,$3) RETURNING id',
        ['The Ballroom', 1400, 900],
    );
    const planId = plan.rows[0].id;
    await pool.query('INSERT INTO floor_plan_room (floor_plan_id, vertices) VALUES ($1,$2)', [
        planId,
        JSON.stringify([{ x: 40, y: 40 }, { x: 1360, y: 40 }, { x: 1360, y: 860 }, { x: 40, y: 860 }]),
    ]);

    // Twelve rounds in a grid, plus the sweetheart table at the top.
    const tableIds: { id: number; seats: number }[] = [];
    const sweet = await pool.query(
        `INSERT INTO seating_tables (floor_plan_id, name, table_type, seat_count, x, y, rotation)
         VALUES ($1,'Maya & Theo','sweetheart',2,700,140,0) RETURNING id`, [planId],
    );
    tableIds.push({ id: sweet.rows[0].id, seats: 2 });

    for (let i = 0; i < 12; i += 1) {
        const res = await pool.query(
            `INSERT INTO seating_tables (floor_plan_id, name, table_type, seat_count, x, y, rotation)
             VALUES ($1,$2,'round',10,$3,$4,0) RETURNING id`,
            [planId, `Table ${i + 1}`, 220 + (i % 4) * 320, 320 + Math.floor(i / 4) * 210],
        );
        tableIds.push({ id: res.rows[0].id, seats: 10 });
    }

    // Seat the couple, then fill the rounds party by party so groups stay together.
    let seats = 0;
    await pool.query(
        `INSERT INTO seat_assignments (seating_table_id, seat_index, display_name) VALUES ($1,0,'Maya'),($1,1,'Theo')`,
        [tableIds[0].id],
    );
    seats += 2;

    let table = 1;
    let seat = 0;
    for (const [index, guest] of guests.entries()) {
        if (table >= tableIds.length) break;
        const size = Math.min(guest.party_size, 10);
        // Keep a party on one table rather than splitting it across two.
        if (seat + size > tableIds[table].seats) { table += 1; seat = 0; }
        if (table >= tableIds.length) break;
        for (let m = 0; m < size; m += 1) {
            await pool.query(
                `INSERT INTO seat_assignments
                 (seating_table_id, seat_index, guest_list_id, display_name, party_group_id)
                 VALUES ($1,$2,$3,$4,$5)`,
                [tableIds[table].id, seat + m, m === 0 ? guestIds[index] : null,
                    m === 0 ? guest.guest_name : `${guest.guest_name.split(' ')[0]}'s guest`,
                    guestIds[index]],
            );
            seats += 1;
        }
        seat += size;
    }

    return { tables: tableIds.length, seats };
}

async function seedHoneymoon() {
    if (!(await tableExists('honeymoon_places'))) return { places: 0 };

    const start = '2027-06-14';
    await pool.query(
        `UPDATE honeymoon_trip SET title = $1, start_date = $2, end_date = $3,
         home_currency = 'USD', notes = $4, focus_country = '' WHERE id = 1`,
        ['Portugal, two weeks', start, '2027-06-29',
            'Lisbon and the south, then Porto and the Douro, then Madeira for the walking.'],
    );

    const regionIds: number[] = [];
    for (const [index, region] of DEMO_REGIONS.entries()) {
        const res = await pool.query(
            `INSERT INTO honeymoon_regions (name, country, description, sort_order)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [region.name, region.country, region.description, index],
        );
        regionIds.push(res.rows[0].id);
    }

    const placeIds = new Map<string, number>();
    for (const [index, [name, category, regionIndex, lat, lng, description]] of DEMO_PLACES.entries()) {
        // A demo should look reviewed, not like a fresh bulk import: most pins
        // are confirmed, a handful are left flagged so the review flow has
        // something to show.
        const needsReview = index % 17 === 5;
        const status = index % 11 === 0 ? 'booked' : index % 4 === 0 ? 'shortlisted' : 'idea';
        const res = await pool.query(
            `INSERT INTO honeymoon_places
             (region_id, name, category, lat, lng, description, status, source, needs_review,
              is_excursion, rating, price_note, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
            [regionIds[regionIndex], name, category, lat, lng, description, status,
                index % 3 === 0 ? 'Guide' : 'Added by me', needsReview,
                category === 'activity', category === 'stay' || category === 'activity'
                    ? (index % 3 === 0 ? 'yes' : index % 7 === 0 ? 'no' : null) : null,
                category === 'stay' ? `$${140 + ((index * 17) % 220)} per night`
                    : category === 'activity' ? `$${25 + ((index * 13) % 90)}` : null,
                index],
        );
        placeIds.set(name, res.rows[0].id);
    }

    for (const note of DEMO_NOTES) {
        await pool.query(
            'INSERT INTO honeymoon_notes (title, body, category, source) VALUES ($1,$2,$3,$4)',
            [note.title, note.body, note.category, 'Guide'],
        );
    }

    for (const [index, [text, category, done, result]] of DEMO_TODOS.entries()) {
        await pool.query(
            'INSERT INTO honeymoon_todos (text, category, done, result, sort_order) VALUES ($1,$2,$3,$4,$5)',
            [text, category, done, result, index],
        );
    }

    let stops = 0;
    /** Which stay each day sleeps at, so the bookings below can be built from it. */
    const stayByDay = new Map<number, number>();
    for (const [dayNumber, title, notes, stopNames] of DEMO_DAYS) {
        const stay = stopNames.find((name) => name.includes(',') && placeIds.has(name));
        const stayId = stay ? placeIds.get(stay) ?? null : null;
        if (stayId != null) stayByDay.set(dayNumber, stayId);
        const day = await pool.query(
            `INSERT INTO honeymoon_days (day_number, title, notes, base_place_id)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [dayNumber, title, notes, stayId],
        );
        for (const [index, name] of stopNames.entries()) {
            const placeId = placeIds.get(name);
            if (placeId == null) continue;
            await pool.query(
                `INSERT INTO honeymoon_stops (day_id, place_id, start_time, sort_order)
                 VALUES ($1,$2,$3,$4)`,
                [day.rows[0].id, placeId,
                    index === 0 ? '09:30' : index === 1 ? '12:00' : index === 2 ? '15:30' : '19:30',
                    index],
            );
            stops += 1;
        }
    }

    /*
     * The stays, as bookings.
     *
     * A day's base is derived from these — the booking is where "we are
     * sleeping here on these nights" is actually said, and the itinerary reads
     * it rather than being told separately. Consecutive days at the same place
     * are one booking, checking out on the morning after the last night, which
     * is what a hotel means by check-out.
     */
    const nightsAt: { placeId: number; from: number; to: number }[] = [];
    for (const [dayNumber, placeId] of [...stayByDay.entries()].sort((a, b) => a[0] - b[0])) {
        const run = nightsAt[nightsAt.length - 1];
        if (run && run.placeId === placeId && run.to === dayNumber - 1) run.to = dayNumber;
        else nightsAt.push({ placeId, from: dayNumber, to: dayNumber });
    }
    const dayDate = (dayNumber: number) => {
        const date = new Date(`${start}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + dayNumber - 1);
        return date.toISOString().slice(0, 10);
    };
    for (const [index, run] of nightsAt.entries()) {
        const nights = run.to - run.from + 1;
        await pool.query(
            `INSERT INTO honeymoon_bookings
             (place_id, kind, provider, confirmation, check_in, check_out, check_in_time,
              check_out_time, cost, cost_currency, paid, party_size, notes)
             VALUES ($1,'stay',$2,$3,$4,$5,'15:00','11:00',$6,'EUR',$7,2,$8)`,
            [run.placeId, index % 2 === 0 ? 'Booking.com' : 'Direct',
                `DEMO-${String(1000 + index * 137).slice(0, 4)}`,
                dayDate(run.from), dayDate(run.to + 1),
                (nights * 180 + index * 25).toFixed(2), index % 3 !== 0,
                nights === 1 ? 'One night on the way through.' : null],
        );
    }

    // One flight in and one between the mainland and Madeira.
    const firstDay = await pool.query('SELECT id FROM honeymoon_days WHERE day_number = 1');
    if (firstDay.rows[0]) {
        await pool.query(
            `INSERT INTO honeymoon_travel
             (day_id, mode, from_text, to_text, depart_time, arrive_time, confirmation_ref)
             VALUES ($1,'flight','CLT Charlotte','LIS Lisbon','18:40','08:15','QK4R2M')`,
            [firstDay.rows[0].id],
        );
    }
    const madeira = await pool.query('SELECT id FROM honeymoon_days WHERE day_number = 14');
    if (madeira.rows[0]) {
        await pool.query(
            `INSERT INTO honeymoon_travel
             (day_id, mode, from_text, to_text, depart_time, arrive_time, confirmation_ref)
             VALUES ($1,'flight','LIS Lisbon','FNC Funchal','10:05','11:50','TP1693')`,
            [madeira.rows[0].id],
        );
    }

    return { regions: regionIds.length, places: placeIds.size, notes: DEMO_NOTES.length, stops };
}

/**
 * The tables and columns the app adds from inside a route handler.
 *
 * `ensureFinanceTables` and `ensureHoneymoonTables` are exported, so those are
 * called directly above. Donations and the two guest-list columns are created by
 * `/api/admin/donations` and `/api/admin/guest-list` on their first request, and
 * there is nothing to import — so the statements are repeated here, identical to
 * the originals and to `database/init.sql`. Without this the seed only works
 * against a database whose API has already been used, which a fresh demo's has
 * not.
 */
async function ensureLateSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS donations (
            id SERIAL PRIMARY KEY,
            guest_id INTEGER,
            guest_name TEXT NOT NULL,
            amount NUMERIC DEFAULT 0,
            fund_item_id TEXT,
            fund_item_title TEXT,
            event TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query("ALTER TABLE donations ADD COLUMN IF NOT EXISTS co_donors JSONB DEFAULT '[]'::jsonb");
    await pool.query('ALTER TABLE donations ADD COLUMN IF NOT EXISTS gift TEXT');
    await pool.query('ALTER TABLE donations ADD COLUMN IF NOT EXISTS thank_you_sent BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE donations ADD COLUMN IF NOT EXISTS thank_you_sent_at TIMESTAMP');
    await pool.query('ALTER TABLE donations ALTER COLUMN amount SET DEFAULT 0');
    await pool.query('ALTER TABLE donations ALTER COLUMN amount DROP NOT NULL');
    await pool.query('ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS flag VARCHAR(20)');
    await pool.query('ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS relationship VARCHAR(255)');
    await pool.query('ALTER TABLE wip_toggles ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false');
}

/* ------------------------------------------------------------------ */

async function main() {
    console.log('Seeding the demo…\n');

    /*
     * Let the app create its own tables first.
     *
     * Several of them are made on the first request to their API rather than by
     * init.sql, so a database that has never served a request is missing them —
     * and the seed runs before anything has. Calling the app's own ensure
     * functions is better than restating their schemas here, where the two would
     * drift.
     */
    await ensureFinanceTables();
    await ensureHoneymoonTables();
    await ensureLateSchema();
    console.log('  schema ready');

    console.log('  photos');
    const photos = await seedPhotos();
    console.log(`  ${photos.length} photographs`);

    writeConfig(photos);
    console.log(`  site.json, photos.json, timeline.json → ${CONFIG_DIR}`);

    await wipe();
    console.log('  cleared the database');

    const guests = await seedGuests();
    console.log(`  ${guests.guests} guests, ${guests.rsvps} RSVPs, ${guests.donations} donations`);

    await seedWip();
    const finance = await seedFinance();
    console.log(`  ${finance.items} budget items, ${finance.purchases ?? 0} purchases`);

    const seating = await seedSeating(guests.ids, guests.list);
    console.log(`  ${seating.tables} tables, ${seating.seats} seats assigned`);

    const honeymoon = await seedHoneymoon();
    console.log(`  honeymoon: ${honeymoon.places} places across ${honeymoon.regions} regions, `
        + `${DEMO_DAYS.length} days, ${honeymoon.stops} stops, ${honeymoon.notes} notes`);

    console.log('\nDone. Everything in here is fictional.');
    await pool.end();
}

main().catch(async (error) => {
    console.error('\nSeed failed:', error);
    await pool.end();
    process.exit(1);
});
