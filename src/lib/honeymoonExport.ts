/**
 * The whole trip as one HTML file you can keep on a laptop.
 *
 * A backup for the offline Today view, not a replacement: if the service worker
 * never cached, the phone is dead, or the admin will not load, a file on disk
 * still opens in any browser with no network and no login. So it is
 * self-contained — no script or stylesheet from anywhere, no images, nothing
 * fetched — and it is a snapshot, which it says at the top.
 *
 * Pure: payload in, string out. The dashboard builds it from the data it
 * already holds, so there is no route to protect and nothing to keep in step.
 */
import {
    BOOKING_KINDS, DOCUMENT_KINDS, categoryMeta, formatDate, formatDayDate, formatTime,
    hasCoords, travelModeMeta,
    type Booking, type Day, type HoneymoonPayload, type Place, type TravelLeg,
} from './honeymoon';
import { buildBudget, formatMoney } from './honeymoonBudget';
import { formatMinutes, journeyTitle, journeysOf } from './honeymoonJourneys';
import { parseMarkdown, type Inline } from './honeymoonMarkdown';
import { INFO_SECTIONS, emergencyFor, navUrl } from './honeymoonToday';

/** Text into HTML. Everything that reaches the page goes through here. */
export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Only http(s), mailto and tel links become links; anything else stays text. */
function link(href: string | null | undefined, text: string): string {
    const url = (href ?? '').trim();
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) return escapeHtml(text);
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}

/** Multi-line free text, keeping its line breaks. */
function lines(value: string | null | undefined): string {
    return escapeHtml(value ?? '').replace(/\n/g, '<br>');
}

function inlineHtml(spans: Inline[]): string {
    return spans.map((span) => {
        switch (span.kind) {
            case 'strong': return `<strong>${escapeHtml(span.text)}</strong>`;
            case 'em': return `<em>${escapeHtml(span.text)}</em>`;
            case 'code': return `<code>${escapeHtml(span.text)}</code>`;
            case 'link': return link(span.href, span.text);
            default: return escapeHtml(span.text);
        }
    }).join('');
}

/** A guide note's Markdown, through the same parser the app uses. */
function markdownHtml(source: string): string {
    return parseMarkdown(source).map((block) => {
        switch (block.kind) {
            case 'h': return `<h${block.level + 2}>${inlineHtml(block.spans)}</h${block.level + 2}>`;
            case 'ul': return `<ul>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`;
            case 'ol': return `<ol>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</ol>`;
            case 'quote': return `<blockquote>${inlineHtml(block.spans)}</blockquote>`;
            default: return `<p>${inlineHtml(block.spans)}</p>`;
        }
    }).join('');
}

/** A label/value row, or nothing when there is no value. */
function field(label: string, value: string | null | undefined, raw = false): string {
    if (value == null || value === '') return '';
    return `<div class="f"><span class="k">${escapeHtml(label)}</span><span class="v">${raw ? value : lines(value)}</span></div>`;
}

export interface OfflineExportOptions {
    /** When the file was made, shown at the top so nobody mistakes it for live. */
    generatedAt?: Date;
}

/** The filename the download is saved under. */
export function offlineExportFilename(payload: Pick<HoneymoonPayload, 'trip'>, now = new Date()): string {
    const slug = (payload.trip.title || 'honeymoon')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'honeymoon';
    return `${slug}-offline-${now.toISOString().slice(0, 10)}.html`;
}

export function buildOfflineHtml(payload: HoneymoonPayload, options: OfflineExportOptions = {}): string {
    const generatedAt = options.generatedAt ?? new Date();
    const { trip } = payload;
    const time = (value: string | null) => (value ? (trip.time_format === '12h' ? formatTime(value) : value) : '');
    const placeById = new Map(payload.places.map((place) => [place.id, place]));
    const regionById = new Map(payload.regions.map((region) => [region.id, region]));
    const placeName = (id: number | null) => (id == null ? '' : placeById.get(id)?.name ?? '');
    const dayOfLeg = new Map<number, Day>();
    const dayOfStop = new Map<number, Day>();
    for (const day of payload.days) {
        for (const leg of day.travel) dayOfLeg.set(leg.id, day);
        for (const stop of day.stops) dayOfStop.set(stop.id, day);
    }
    const kindLabel = (key: string) => BOOKING_KINDS.find((k) => k.key === key)?.label ?? key;
    const money = (amount: number | null, currency: string | null) => (amount == null
        ? '' : formatMoney(amount, (currency || trip.home_currency || 'USD').toUpperCase()));
    const mapsLink = (place: Place) => link(navUrl(place), 'Directions');

    /** What a booking is for, in words. */
    const bookingTarget = (booking: Booking): string => {
        if (booking.place_id != null) return placeName(booking.place_id);
        if (booking.travel_id != null) {
            const leg = payload.days.flatMap((d) => d.travel).find((l) => l.id === booking.travel_id);
            if (leg) return [leg.from_text, leg.to_text].filter(Boolean).join(' → ') || 'Travel leg';
        }
        if (booking.journey_id != null) {
            const journey = payload.journeys.find((j) => j.id === booking.journey_id);
            if (journey) return journey.title;
        }
        if (booking.stop_id != null) {
            const day = dayOfStop.get(booking.stop_id);
            const stop = day?.stops.find((s) => s.id === booking.stop_id);
            if (stop) return stop.custom_label || placeName(stop.place_id) || 'Stop';
        }
        return booking.provider || 'Booking';
    };

    const bookingHtml = (booking: Booking, withTarget: boolean): string => `
        <div class="booking">
            <div class="bh">${escapeHtml(kindLabel(booking.kind))}${withTarget ? ` — ${escapeHtml(bookingTarget(booking))}` : ''}
                ${booking.paid ? '<span class="tag good">Paid</span>' : ''}</div>
            ${field('Confirmation', booking.confirmation ? `<strong class="ref">${escapeHtml(booking.confirmation)}</strong>` : '', true)}
            ${field('Provider', booking.provider)}
            ${field('Contact', booking.contact)}
            ${field('Check in', [formatDate(booking.check_in), time(booking.check_in_time)].filter(Boolean).join(' '))}
            ${field('Check out', [formatDate(booking.check_out), time(booking.check_out_time)].filter(Boolean).join(' '))}
            ${field('Party', booking.party_size != null ? String(booking.party_size) : '')}
            ${field('Dress code', booking.dress_code)}
            ${field('Cost', [money(booking.cost, booking.cost_currency),
                booking.cost_paid != null ? `${money(booking.cost_paid, booking.cost_currency)} paid` : ''].filter(Boolean).join(' · '))}
            ${field('Deposit due', formatDate(booking.deposit_due_on))}
            ${field('Cancel by', formatDate(booking.cancel_by))}
            ${field('Link', booking.url ? link(booking.url, booking.url) : '', true)}
            ${field('Notes', booking.notes)}
        </div>`;

    const legHtml = (leg: TravelLeg): string => {
        const mode = travelModeMeta(leg.mode);
        const depart = [time(leg.depart_time), leg.depart_tz ? `(${leg.depart_tz})` : ''].filter(Boolean).join(' ');
        const arrive = [time(leg.arrive_time), leg.arrive_tz ? `(${leg.arrive_tz})` : '',
            leg.arrive_day_offset > 0 ? `+${leg.arrive_day_offset} day${leg.arrive_day_offset === 1 ? '' : 's'}` : '']
            .filter(Boolean).join(' ');
        const bookings = payload.bookings.filter((b) => b.travel_id === leg.id);
        return `
        <div class="leg">
            <div class="lh">${escapeHtml(mode.icon)} ${escapeHtml(leg.from_text || '?')} → ${escapeHtml(leg.to_text || '?')}
                ${leg.flight_no ? `<span class="tag">${escapeHtml(leg.flight_no)}</span>` : ''}</div>
            ${field('Departs', [formatDate(leg.depart_date), depart, leg.from_terminal ? `Terminal ${leg.from_terminal}` : ''].filter(Boolean).join(' · '))}
            ${field('Arrives', [formatDate(leg.arrive_date), arrive, leg.to_terminal ? `Terminal ${leg.to_terminal}` : ''].filter(Boolean).join(' · '))}
            ${field('Confirmation', leg.confirmation_ref ? `<strong class="ref">${escapeHtml(leg.confirmation_ref)}</strong>` : '', true)}
            ${field('Aircraft', leg.aircraft)}
            ${field('Booked by', leg.booked_by)}
            ${field('Cost', money(leg.cost, leg.cost_currency))}
            ${field('Notes', leg.notes)}
            ${bookings.map((b) => bookingHtml(b, false)).join('')}
        </div>`;
    };

    const placeHtml = (place: Place, extra = ''): string => {
        const region = place.region_id != null ? regionById.get(place.region_id) : undefined;
        const comments = payload.comments.filter((c) => c.place_id === place.id);
        const bookings = payload.bookings.filter((b) => b.place_id === place.id);
        return `
        <div class="item card" id="place-${place.id}">
            <div class="ch"><strong>${escapeHtml(place.name)}</strong>
                <span class="tag">${escapeHtml(categoryMeta(place.category).label)}</span>
                ${place.status === 'booked' ? '<span class="tag good">Booked</span>' : ''}
                ${place.rating === 'yes' ? '<span class="tag">Interested</span>' : ''}
                ${extra}</div>
            ${field('Region', region ? [region.name, place.country || region.country].filter(Boolean).join(', ') : place.country)}
            ${field('Address', place.address)}
            ${field('Location', hasCoords(place)
                ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)} · ${mapsLink(place)}`
                : place.address ? mapsLink(place) : '', true)}
            ${field('Cost', place.cost != null ? `${money(place.cost, place.cost_currency)} ${place.cost_per === 'total' ? '' : `per ${place.cost_per}`}`.trim() : '')}
            ${field('Price note', place.price_note)}
            ${field('Opening hours', place.opening_hours)}
            ${field('Best time', place.best_time)}
            ${field('About', place.description)}
            ${place.links.length ? field('Links', place.links.map((l) => link(l.url, l.label || l.url)).join(' · '), true) : ''}
            ${comments.length ? field('Comments', comments.map((c) => `<em>${escapeHtml(c.author)}:</em> ${lines(c.body)}`).join('<br>'), true) : ''}
            ${bookings.map((b) => bookingHtml(b, false)).join('')}
        </div>`;
    };

    const sections: { id: string; title: string; body: string }[] = [];

    /* ---- Emergency ---- */
    const countries = [...new Set(payload.regions.map((r) => r.country).filter(Boolean))];
    if (trip.focus_country && !countries.includes(trip.focus_country)) countries.unshift(trip.focus_country);
    const emergency = (countries.length ? countries : ['']).map((country) => {
        const info = emergencyFor(country);
        return `<div class="item card"><div class="ch"><strong>${escapeHtml(info.country)}</strong></div>
            ${info.numbers.map((n) => field(n.label, link(`tel:${n.number}`, n.number), true)).join('')}</div>`;
    }).join('');
    const infoBlocks = INFO_SECTIONS
        .filter((section) => trip.info?.[section.key]?.trim())
        .map((section) => `<div class="item card"><div class="ch"><strong>${escapeHtml(section.label)}</strong></div>
            <p>${lines(trip.info[section.key])}</p></div>`).join('');
    sections.push({ id: 'emergency', title: 'Emergency & essentials', body: emergency + infoBlocks });

    /* ---- Itinerary ---- */
    if (payload.days.length) {
        const days = [...payload.days].sort((a, b) => a.day_number - b.day_number).map((day) => {
            const base = day.base_place_id != null ? placeById.get(day.base_place_id) : undefined;
            const stops = [...day.stops].sort((a, b) => a.sort_order - b.sort_order).map((stop) => {
                const place = stop.place_id != null ? placeById.get(stop.place_id) : undefined;
                const label = stop.custom_label || place?.name || 'Stop';
                const bookings = payload.bookings.filter((b) => b.stop_id === stop.id);
                return `<li><span class="t">${escapeHtml(time(stop.start_time))}${stop.duration_minutes
                    ? ` <small>(${escapeHtml(formatMinutes(stop.duration_minutes))})</small>` : ''}</span>
                    <div><strong>${place ? `<a href="#place-${place.id}">${escapeHtml(label)}</a>` : escapeHtml(label)}</strong>
                    ${place?.address ? `<div class="muted">${escapeHtml(place.address)}</div>` : ''}
                    ${place && (hasCoords(place) || place.address) ? `<div>${mapsLink(place)}</div>` : ''}
                    ${stop.notes ? `<div>${lines(stop.notes)}</div>` : ''}
                    ${stop.journal ? `<div class="muted"><em>${lines(stop.journal)}</em></div>` : ''}
                    ${bookings.map((b) => bookingHtml(b, false)).join('')}</div></li>`;
            }).join('');
            const legs = [...day.travel].sort((a, b) => a.sort_order - b.sort_order).map(legHtml).join('');
            const todos = payload.todos.filter((t) => t.day_id === day.id);
            const date = formatDayDate(trip.start_date, day.day_number);
            return `
            <details class="item day" open id="day-${day.day_number}">
                <summary><strong>Day ${day.day_number}</strong>${date ? ` · ${escapeHtml(date)}` : ''}${day.title ? ` — ${escapeHtml(day.title)}` : ''}</summary>
                ${base ? field('Staying at', `<a href="#place-${base.id}">${escapeHtml(base.name)}</a>${base.address ? ` · ${escapeHtml(base.address)}` : ''}`, true) : ''}
                ${day.notes ? `<p>${lines(day.notes)}</p>` : ''}
                ${legs ? `<h4>Travel</h4>${legs}` : ''}
                ${stops ? `<h4>Plan</h4><ol class="stops">${stops}</ol>` : '<p class="muted">Nothing planned.</p>'}
                ${todos.length ? `<h4>To do</h4><ul>${todos.map((t) => `<li>${t.done ? '☑' : '☐'} ${escapeHtml(t.text)}</li>`).join('')}</ul>` : ''}
            </details>`;
        }).join('');
        sections.push({ id: 'itinerary', title: 'Itinerary', body: days });
    }

    /* ---- Journeys ---- */
    const journeys = journeysOf(payload).filter((group) => group.legs.length);
    if (journeys.length) {
        sections.push({
            id: 'travel', title: 'Flights & travel',
            body: journeys.map((group) => {
                const bookings = group.journey
                    ? payload.bookings.filter((b) => b.journey_id === group.journey?.id) : [];
                const layovers = group.layovers.filter((l) => l.minutes != null)
                    .map((l) => `${escapeHtml(l.at || 'Layover')}: ${escapeHtml(formatMinutes(l.minutes))}${l.changesAirport ? ' (change airport)' : ''}`);
                return `<div class="item card"><div class="ch"><strong>${escapeHtml(journeyTitle(group))}</strong>
                    ${group.totalMinutes != null ? `<span class="tag">${escapeHtml(formatMinutes(group.totalMinutes))} door to door</span>` : ''}</div>
                    ${field('Dates', [formatDate(group.departDate), formatDate(group.arriveDate)].filter(Boolean).join(' → '))}
                    ${layovers.length ? field('Layovers', layovers.join('<br>'), true) : ''}
                    ${group.journey?.notes ? `<p>${lines(group.journey.notes)}</p>` : ''}
                    ${group.legs.map(legHtml).join('')}
                    ${bookings.map((b) => bookingHtml(b, false)).join('')}</div>`;
            }).join(''),
        });
    }

    /* ---- Bookings ---- */
    if (payload.bookings.length) {
        const sorted = [...payload.bookings].sort((a, b) => (a.check_in ?? '9999').localeCompare(b.check_in ?? '9999'));
        sections.push({
            id: 'bookings', title: 'All bookings & confirmations',
            body: sorted.map((b) => `<div class="item">${bookingHtml(b, true)}</div>`).join(''),
        });
    }

    /* ---- Documents ---- */
    if (payload.documents.length) {
        sections.push({
            id: 'documents', title: 'Documents',
            body: `<p class="muted">The files themselves are not in this copy — only what each one is.</p>${
                payload.documents.map((doc) => {
                    const kind = DOCUMENT_KINDS.find((k) => k.key === doc.kind);
                    return `<div class="item card"><div class="ch">${escapeHtml(kind?.icon ?? '')} <strong>${escapeHtml(doc.name)}</strong>
                        <span class="tag">${escapeHtml(kind?.label ?? doc.kind)}</span></div>
                        ${field('Whose', doc.person)}
                        ${field('Expires', formatDate(doc.expires_on))}
                        ${field('For', doc.place_id != null ? placeName(doc.place_id) : '')}
                        ${field('Notes', doc.notes)}</div>`;
                }).join('')}`,
        });
    }

    /* ---- Stays, excursions, everything else ---- */
    const live = payload.places.filter((p) => !p.archived);
    const stays = live.filter((p) => p.category === 'stay')
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name));
    if (stays.length) {
        sections.push({
            id: 'stays', title: 'Stays',
            body: stays.map((p) => {
                const nights = payload.days.filter((d) => d.base_place_id === p.id).length;
                return placeHtml(p, nights ? `<span class="tag">${nights} night${nights === 1 ? '' : 's'}</span>` : '');
            }).join(''),
        });
    }
    const excursions = live.filter((p) => p.is_excursion && p.category !== 'stay');
    if (excursions.length) {
        sections.push({ id: 'excursions', title: 'Excursions', body: excursions.map((p) => placeHtml(p)).join('') });
    }
    const others = live.filter((p) => p.category !== 'stay' && !p.is_excursion);
    if (others.length) {
        const groups = new Map<string, Place[]>();
        for (const place of others) {
            const region = place.region_id != null ? regionById.get(place.region_id)?.name : undefined;
            const key = region || 'No region';
            groups.set(key, [...(groups.get(key) ?? []), place]);
        }
        sections.push({
            id: 'places', title: 'Places',
            body: [...groups.entries()].map(([region, places]) => `<h3 class="group">${escapeHtml(region)}</h3>${
                places.sort((a, b) => a.name.localeCompare(b.name)).map((p) => placeHtml(p)).join('')}`).join(''),
        });
    }

    /* ---- Checklist & packing ---- */
    if (payload.todos.length) {
        const list = (kind: 'task' | 'packing') => payload.todos.filter((t) => t.kind === kind)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((t) => `<li class="item">${t.done ? '☑' : '☐'} ${escapeHtml(t.text)}${
                t.person ? ` <span class="tag">${escapeHtml(t.person)}</span>` : ''}${
                t.due_on ? ` <span class="muted">due ${escapeHtml(formatDate(t.due_on))}</span>` : ''}${
                t.result ? `<div class="muted">${lines(t.result)}</div>` : ''}</li>`).join('');
        const tasks = list('task');
        const packing = list('packing');
        sections.push({
            id: 'checklist', title: 'Checklist & packing',
            body: `${tasks ? `<h3 class="group">Checklist</h3><ul class="todos">${tasks}</ul>` : ''}${
                packing ? `<h3 class="group">Packing</h3><ul class="todos">${packing}</ul>` : ''}`,
        });
    }

    /* ---- Guide notes ---- */
    if (payload.notes.length) {
        sections.push({
            id: 'notes', title: 'Guide notes',
            body: [...payload.notes].sort((a, b) => a.sort_order - b.sort_order).map((note) => `
                <details class="item card"><summary><strong>${escapeHtml(note.title)}</strong>${
                    note.category ? ` <span class="tag">${escapeHtml(note.category)}</span>` : ''}</summary>
                    ${markdownHtml(note.body)}</details>`).join(''),
        });
    }

    /* ---- Money ---- */
    const budget = buildBudget(payload);
    if (budget.total > 0) {
        const home = (trip.home_currency || 'USD').toUpperCase();
        sections.push({
            id: 'money', title: 'Money',
            body: `<div class="item card">
                ${field('Trip total', formatMoney(budget.total, home))}
                ${field('Paid', formatMoney(budget.paid, home))}
                ${field('Still to pay', formatMoney(budget.outstanding, home))}
                ${budget.budget != null ? field('Budget', formatMoney(budget.budget, home)) : ''}
                ${payload.rates.length ? field('Exchange rates', payload.rates.map((r) => `${r.pair}: ${r.rate}`).join(' · ')) : ''}
            </div>`,
        });
    }

    const lastDay = payload.days.length ? Math.max(...payload.days.map((d) => d.day_number)) : 0;
    const dates = trip.start_date
        ? `${formatDayDate(trip.start_date, 1)}${lastDay > 1 ? ` – ${formatDayDate(trip.start_date, lastDay)}` : ''}`
        : '';
    const stamp = generatedAt.toLocaleString('en-US', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
    });

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(trip.title || 'Honeymoon')} — offline copy</title>
<style>${STYLES}</style>
</head>
<body>
<header class="top">
    <h1>${escapeHtml(trip.title || 'Honeymoon')}</h1>
    <p>${escapeHtml([dates, trip.partner_names].filter(Boolean).join(' · '))}</p>
    <p class="muted">Offline copy, saved ${escapeHtml(stamp)} UTC. A snapshot — changes made after this are not in it.</p>
    ${trip.notes ? `<p>${lines(trip.notes)}</p>` : ''}
    <div class="tools">
        <input id="q" type="search" placeholder="Search everything — a hotel, a booking ref, a phone number…" autocomplete="off">
        <button type="button" id="expand">Expand all</button>
        <button type="button" id="collapse">Collapse all</button>
    </div>
    <nav>${sections.map((s) => `<a href="#${s.id}">${escapeHtml(s.title)}</a>`).join('')}</nav>
    <p id="none" class="muted" hidden>Nothing matches.</p>
</header>
<main>
${sections.map((s) => `<section id="${s.id}"><h2>${escapeHtml(s.title)}</h2>${s.body}</section>`).join('\n')}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/** Light and dark, print-friendly, no external fonts. */
const STYLES = `
:root{--bg:#fafaf9;--card:#fff;--text:#1c1917;--muted:#78716c;--line:#e7e5e4;--accent:#B8941F;--tag:#f5f5f4;--good:#047857}
@media (prefers-color-scheme:dark){:root{--bg:#161412;--card:#211e1b;--text:#f5f5f4;--muted:#a8a29e;--line:#3a3532;--accent:#D4AF37;--tag:#2e2a26;--good:#34d399}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header.top{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:16px max(16px,calc(50% - 440px))}
main{padding:8px max(16px,calc(50% - 440px)) 64px}
h1{margin:0;font-size:24px}h2{margin:32px 0 12px;font-size:20px;border-bottom:2px solid var(--accent);padding-bottom:4px}
h3.group{margin:20px 0 8px;font-size:16px;color:var(--muted)}h4{margin:12px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
p{margin:6px 0}.muted{color:var(--muted)}a{color:var(--accent)}
.tools{display:flex;gap:8px;margin:10px 0 8px;flex-wrap:wrap}
#q{flex:1;min-width:200px;padding:10px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit}
button{padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;cursor:pointer}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px}nav a{text-decoration:none}
.card,.day{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:10px 0}
.day>summary,.card>summary{cursor:pointer;font-size:16px}
.ch{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:6px}
.tag{display:inline-block;font-size:11px;padding:1px 8px;border-radius:999px;background:var(--tag);color:var(--muted)}
.tag.good{color:var(--good)}
.f{display:grid;grid-template-columns:120px 1fr;gap:8px;padding:2px 0;font-size:14px}
.k{color:var(--muted)}.v{overflow-wrap:anywhere}
.ref{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;letter-spacing:.03em}
.leg,.booking{border-left:3px solid var(--accent);padding:6px 0 6px 12px;margin:8px 0}
.lh,.bh{font-weight:600;margin-bottom:2px}
ol.stops{list-style:none;padding:0;margin:0}ol.stops>li{display:grid;grid-template-columns:90px 1fr;gap:8px;padding:8px 0;border-top:1px solid var(--line)}
ol.stops>li:first-child{border-top:0}.t{font-variant-numeric:tabular-nums;color:var(--muted)}.t small{display:block}
section,[id^=place-],[id^=day-]{scroll-margin-top:200px}
ul.todos{list-style:none;padding:0}ul.todos li{padding:4px 0}
blockquote{margin:6px 0;padding-left:12px;border-left:3px solid var(--line);color:var(--muted)}
[hidden]{display:none!important}
mark{background:#fde68a;color:#1c1917}
@media (max-width:560px){.f{grid-template-columns:1fr;gap:0}.f .k{font-size:12px}ol.stops>li{grid-template-columns:1fr}}
@media print{header.top{position:static}.tools,nav{display:none}details{break-inside:avoid}.card,.day{break-inside:avoid}}
`;

/**
 * Search, and expand/collapse. Plain DOM, no dependencies: every `.item`
 * whose text does not contain the query is hidden, a section with nothing
 * left is hidden, and a matching collapsed block opens so the hit is visible.
 */
const SCRIPT = `
(function(){
var q=document.getElementById('q'),none=document.getElementById('none');
var items=[].slice.call(document.querySelectorAll('.item'));
var sections=[].slice.call(document.querySelectorAll('main section'));
var opened=new WeakMap();
items.forEach(function(el){el._t=el.textContent.toLowerCase();});
q.addEventListener('input',function(){
  var term=q.value.trim().toLowerCase(),any=false;
  items.forEach(function(el){
    var hit=!term||el._t.indexOf(term)!==-1;
    el.hidden=!hit;
    if(el.tagName==='DETAILS'){
      if(term&&hit&&!el.open){el.open=true;opened.set(el,true);}
      if(!term&&opened.get(el)){el.open=false;opened.delete(el);}
    }
  });
  sections.forEach(function(s){
    var visible=!term||s.querySelector('.item:not([hidden])');
    s.hidden=!visible; if(visible)any=true;
  });
  none.hidden=any;
});
function all(open){[].slice.call(document.querySelectorAll('details')).forEach(function(d){d.open=open;});}
document.getElementById('expand').onclick=function(){all(true);};
document.getElementById('collapse').onclick=function(){all(false);};
})();
`;
