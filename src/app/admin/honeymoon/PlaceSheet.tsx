'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    STATUSES, bookingKindFor, categoryMeta, formatDate, formatDayDate, formatDistance, hasCoords,
    isStayUrl, sourceLabel,
    type Place, type PlaceStatus,
} from '@/lib/honeymoon';
import { formatMoney, nightsAtBase } from '@/lib/honeymoonBudget';
import { describeHours } from '@/lib/honeymoonHours';
import { nearbyPlaces, providerOf } from '@/lib/honeymoonPlaces';
import { pricePatch, priceText, sheetSections, type SheetSection } from '@/lib/honeymoonPlaceSheet';
import { navUrl } from '@/lib/honeymoonToday';
import BookingPanel from './BookingPanel';
import { useHoneymoonApi } from './HoneymoonContext';
import LinkPreview from './LinkPreview';
import Markdown from './Markdown';
import { PlaceForm } from './PlaceEditor';
import PlacePhotos from './PlacePhotos';
import { PersonRatings, PlaceComments } from './PlaceNotes';
import { usePlaceSheet } from './PlaceSheetContext';
import { RatingPills } from './kit/RatingPills';
import { Sheet } from './kit/Sheet';
import {
    Button, CategoryChip, CategorySelect, CustomisableSelect, InlineText, MiniSelect, OverflowMenu,
} from './ui';

const SECTION_TITLES: Record<SheetSection, string> = {
    plan: 'On the trip',
    where: 'Where',
    booking: 'Booking & cost',
    stay: 'The stay',
    practical: 'Practical',
    notes: 'Notes & links',
    opinions: 'What you two think',
    photos: 'Photos',
    nearby: 'Nearby',
};

/**
 * Everything about one place, in the one panel the whole portal opens.
 *
 * Reads first, edits in place: every field is text you can click and change,
 * saved on blur, the way the stay cards already worked. "Edit everything" swaps
 * the body for the full form — the pin search, links, the lot — inside the same
 * panel, so nothing opens a second window on top of the first.
 *
 * Which sections show is decided by the place (`sheetSections`), never by where
 * it was opened from. That is the whole point of it existing.
 */
export default function PlaceSheet() {
    const api = useHoneymoonApi();
    const sheet = usePlaceSheet();
    const { state, close } = sheet;
    const [editing, setEditing] = useState(false);
    const guard = useRef<(() => boolean) | null>(null);
    const registerGuard = useCallback((fn: () => boolean) => { guard.current = fn; }, []);

    const place = state.kind === 'place' ? api.placeById.get(state.id) ?? null : null;
    const stateKey = state.kind === 'place' ? `p${state.id}` : state.kind === 'new' ? `n${state.at}` : '';

    // A new place, or a different one, always starts on the read view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setEditing(false); guard.current = null; }, [stateKey]);

    /* Deleted (or undone) while open: there is nothing left to show. */
    useEffect(() => {
        if (state.kind === 'place' && api.data && !api.placeById.has(state.id)) close();
    }, [state, api.data, api.placeById, close]);

    const open = state.kind === 'new' || place != null;
    const formMode = state.kind === 'new' || editing;
    const askGuard = () => (formMode && guard.current ? guard.current() : true);

    return (
        <Sheet
            open={open}
            onClose={close}
            guard={askGuard}
            modal={false}
            startTall={formMode}
            width={formMode ? 'lg' : 'md'}
            dataAttrs={place && !formMode
                ? { 'data-place-sheet': String(place.id), 'data-sections': sheetSections(place).join(',') }
                : { 'data-place-sheet': 'form' }}
            title={state.kind === 'new'
                ? <h2 className="text-lg font-semibold text-gray-900">Add a place</h2>
                : place && <SheetTitle place={place} />}
            actions={place && !formMode ? (
                <>
                    <Button className="hidden sm:inline-flex" onClick={() => setEditing(true)}>Edit everything</Button>
                    <PlaceMenu place={place} onEdit={() => setEditing(true)} />
                </>
            ) : undefined}
        >
            {formMode ? (
                <PlaceForm
                    key={stateKey}
                    api={api}
                    place={state.kind === 'new' ? null : place}
                    defaults={state.kind === 'new' ? state.defaults : undefined}
                    registerGuard={registerGuard}
                    onDone={() => { if (state.kind === 'new') close(); else setEditing(false); }}
                    onCancel={() => { if (state.kind === 'new') close(); else setEditing(false); }}
                />
            ) : place ? (
                <PlaceBody place={place} onEdit={() => setEditing(true)} />
            ) : null}
        </Sheet>
    );
}

function SheetTitle({ place }: { place: Place }) {
    const api = useHoneymoonApi();
    const meta = categoryMeta(place.category);
    const region = place.region_id != null ? api.regionById.get(place.region_id) : null;
    return (
        <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {meta.icon} {meta.label}{region ? ` · ${region}` : ''}
            </p>
            <InlineText
                value={place.name}
                className="-ml-2 text-lg font-semibold text-gray-900"
                onCommit={(name) => { if (name.trim()) api.update('places', { id: place.id, name: name.trim() }); }}
            />
        </div>
    );
}

function PlaceMenu({ place, onEdit }: { place: Place; onEdit: () => void }) {
    const api = useHoneymoonApi();
    const router = useRouter();
    const { close } = usePlaceSheet();
    return (
        <OverflowMenu items={[
            { label: 'Edit everything', onClick: onEdit },
            ...(hasCoords(place) ? [{
                label: 'Show on the map',
                onClick: () => { router.push(`/admin/honeymoon/map?place=${place.id}`); },
            }] : []),
            ...(place.needs_review ? [{
                label: 'Pin looks right',
                onClick: () => api.patchPlace(place.id, { needs_review: false }),
            }] : []),
            place.is_excursion
                ? { label: 'Not an excursion', onClick: () => api.patchPlace(place.id, { is_excursion: false }) }
                : { label: 'Make it an excursion', onClick: () => api.patchPlace(place.id, { is_excursion: true }) },
            place.archived
                ? { label: 'Put back on the shortlist', onClick: () => api.patchPlace(place.id, { archived: false }) }
                : { label: 'Remove from the shortlist', onClick: () => api.patchPlace(place.id, { archived: true }) },
            {
                label: 'Delete',
                danger: true,
                // Undoable, so no confirm — the toast is the safety net.
                onClick: () => { close(); void api.removePlaces([place]); },
            },
        ]} />
    );
}

function PlaceBody({ place, onEdit }: { place: Place; onEdit: () => void }) {
    const api = useHoneymoonApi();
    const router = useRouter();
    const { openPlace } = usePlaceSheet();
    const home = api.data?.trip.home_currency || 'USD';
    const [previewing, setPreviewing] = useState(false);

    const nearby = useMemo(
        () => nearbyPlaces(place, api.data?.places ?? [], 8, 6),
        [place, api.data?.places],
    );
    const days = useMemo(() => api.data?.days ?? [], [api.data?.days]);
    const onDays = useMemo(() => days
        .filter((day) => day.base_place_id === place.id || day.stops.some((s) => s.place_id === place.id))
        .map((day) => ({ day, asBase: day.base_place_id === place.id })), [days, place.id]);
    const startDate = api.data?.trip.start_date ?? null;
    const listing = place.links.find((l) => isStayUrl(l.url))?.url ?? place.links[0]?.url ?? null;

    const set = (fields: Record<string, unknown>) => api.update('places', { id: place.id, ...fields });

    const regionOptions = [
        { key: '', label: '— no area —' },
        ...(api.data?.regions ?? []).map((r) => ({ key: String(r.id), label: r.name })),
    ];

    const sections: Record<SheetSection, React.ReactNode> = {
        plan: (
            <div className="space-y-2">
                {onDays.length === 0 ? (
                    <p className="text-sm text-gray-500">Not on any day yet.</p>
                ) : (
                    <ul className="space-y-1">
                        {onDays.map(({ day, asBase }) => (
                            <li key={day.id}>
                                <button
                                    type="button"
                                    onClick={() => router.push(`/admin/honeymoon/itinerary?day=${day.day_number}`)}
                                    className="flex min-h-11 md:min-h-0 w-full items-baseline gap-2 rounded-xl px-2 py-1
                                        text-left text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <span className="font-medium">Day {day.day_number}</span>
                                    <span className="text-gray-400">{formatDayDate(startDate, day.day_number) ?? ''}</span>
                                    <span className="min-w-0 flex-1 truncate">{day.title ?? ''}</span>
                                    {asBase && <span className="text-[11px] text-emerald-700">sleeping here</span>}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {days.length > 0 && (
                    <MiniSelect
                        value=""
                        aria-label="Add to a day"
                        onChange={async (e) => {
                            const dayId = Number(e.target.value);
                            if (dayId) await api.create('stops', { day_id: dayId, place_id: place.id });
                        }}
                    >
                        <option value="">+ Add to a day…</option>
                        {days.map((day) => (
                            <option key={day.id} value={day.id}>
                                Day {day.day_number}{day.title ? ` — ${day.title}` : ''}
                            </option>
                        ))}
                    </MiniSelect>
                )}
            </div>
        ),
        where: (
            <div className="space-y-2">
                <Field label="Address">
                    <InlineText value={place.address ?? ''} placeholder="+ Add an address"
                        onCommit={(address) => set({ address })} />
                </Field>
                <Field label="Area">
                    <CustomisableSelect
                        compact
                        label={`Area for ${place.name}`}
                        value={place.region_id != null ? String(place.region_id) : ''}
                        placeholder="Ubud, Seminyak…"
                        options={regionOptions}
                        onChange={(next) => set({ region_id: next === '' ? null : Number(next) })}
                        onCreate={async (typed) => {
                            const existing = (api.data?.regions ?? [])
                                .find((r) => r.name.toLowerCase() === typed.toLowerCase());
                            if (existing) return String(existing.id);
                            const created = await api.createRegion(typed, api.data?.trip.focus_country || '');
                            return created == null ? null : String(created);
                        }}
                    />
                </Field>
                {hasCoords(place) ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                        <LinkPill href={navUrl(place)} dark>Directions</LinkPill>
                        <LinkPill href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${place.lat},${place.lng}`}>
                            Street View
                        </LinkPill>
                        <button
                            type="button"
                            onClick={() => router.push(`/admin/honeymoon/map?place=${place.id}`)}
                            className="min-h-11 md:min-h-0 rounded-full border border-gray-200 px-3 py-1.5 text-xs
                                font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Show on the map
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-amber-700">Not pinned yet — it won&apos;t show on the map.</span>
                        <Button onClick={onEdit}>Find it</Button>
                    </div>
                )}
                {place.needs_review && hasCoords(place) && (
                    <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-3 py-2">
                        <span className="text-xs text-amber-800">Placed automatically — check it.</span>
                        <Button onClick={() => api.patchPlace(place.id, { needs_review: false })}>Looks right</Button>
                    </div>
                )}
            </div>
        ),
        booking: (
            <div className="space-y-2">
                <Field label="Price">
                    <InlineText
                        value={priceText(place, home)}
                        placeholder={place.category === 'stay' ? '+ Price per night — type 250' : '+ Price — type 40'}
                        onCommit={(typed) => set(pricePatch(place, typed, home))}
                    />
                </Field>
                <BookingPanel api={api} kind={bookingKindFor(place)} placeId={place.id} compact />
            </div>
        ),
        stay: <StaySection place={place} />,
        practical: (
            <div className="space-y-1">
                <Field label="Hours">
                    <InlineText value={place.opening_hours ?? ''} placeholder="+ Mo-Su 09:00-18:00"
                        onCommit={(opening_hours) => set({ opening_hours })} />
                    {place.opening_hours && describeHours(place.opening_hours) && (
                        <p className="px-2 text-[11px] text-gray-400">{describeHours(place.opening_hours)}</p>
                    )}
                </Field>
                <Field label="Best time">
                    <InlineText value={place.best_time ?? ''} placeholder="+ Sunrise · avoid weekends"
                        onCommit={(best_time) => set({ best_time })} />
                </Field>
                <Field label="Type">
                    <CategorySelect
                        value={place.category}
                        places={api.data?.places ?? []}
                        onChange={(category) => set({ category })}
                        onCreateCategory={api.createCategory}
                    />
                </Field>
                {(place.star_rating != null || place.amenities.length > 0) && (
                    <p className="px-2 pt-1 text-xs text-gray-500">
                        {place.star_rating != null && <span className="mr-2">{place.star_rating}★</span>}
                        {place.amenities.join(' · ')}
                    </p>
                )}
                <p className="px-2 pt-1 text-[11px] text-gray-400">Source: {sourceLabel(place.source)}</p>
            </div>
        ),
        notes: (
            <div className="space-y-2">
                <InlineText
                    multiline
                    value={place.description ?? ''}
                    placeholder="+ Notes — what you liked, when to go, what to book…"
                    className="-ml-2 text-sm text-gray-700"
                    onCommit={(description) => set({ description })}
                />
                {place.description && /[*_`#\[]/.test(place.description) && (
                    <div className="rounded-2xl bg-gray-50 px-3 py-2">
                        <Markdown source={place.description} className="text-sm text-gray-700" />
                    </div>
                )}
                {place.links.length > 0 && (
                    <ul className="space-y-1">
                        {place.links.map((link) => (
                            <li key={link.url}>
                                <a href={link.url} target="_blank" rel="noopener noreferrer"
                                    className="flex min-h-11 md:min-h-0 items-center gap-2 text-sm text-accent hover:underline">
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                                        {providerOf(link.url) ?? 'Link'}
                                    </span>
                                    <span className="truncate">{link.label || link.url}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
                {listing && <Button onClick={() => setPreviewing(true)}>Preview the listing</Button>}
            </div>
        ),
        opinions: (
            <div className="space-y-2">
                <PersonRatings api={api} place={place} />
                <PlaceComments api={api} place={place} />
            </div>
        ),
        photos: <PlacePhotos api={api} place={place} compact />,
        nearby: nearby.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing else pinned within 8 km.</p>
        ) : (
            <ul className="space-y-0.5">
                {nearby.map(({ place: other, km }) => (
                    <li key={other.id}>
                        <button
                            type="button"
                            onClick={() => openPlace(other.id)}
                            className="flex min-h-11 md:min-h-0 w-full items-center gap-2 rounded-xl px-2 py-1 text-left
                                text-sm hover:bg-gray-50"
                        >
                            <span aria-hidden>{categoryMeta(other.category).icon}</span>
                            <span className="min-w-0 flex-1 truncate text-gray-700">{other.name}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{formatDistance(km)}</span>
                        </button>
                    </li>
                ))}
            </ul>
        ),
    };

    return (
        <div className="space-y-5">
            <Cover place={place} />
            <div className="flex flex-wrap items-center gap-2">
                <MiniSelect
                    value={place.status}
                    aria-label="Status"
                    onChange={(e) => api.patchPlace(place.id, { status: e.target.value as PlaceStatus })}
                >
                    {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </MiniSelect>
                <RatingPills value={place.rating} onChange={(rating) => api.patchPlace(place.id, { rating: rating ?? '' })} />
                {place.rank != null && (
                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">#{place.rank}</span>
                )}
                {place.is_excursion && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-800">Excursion</span>}
                {place.archived && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">Removed</span>}
                <CategoryChip category={place.category} />
            </div>

            {sheetSections(place).map((key) => (
                <section key={key} data-sheet-section={key}>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {SECTION_TITLES[key]}
                    </h3>
                    {sections[key]}
                </section>
            ))}

            {previewing && listing && (
                <LinkPreview
                    title={place.name}
                    url={listing}
                    rating={place.rating}
                    onClose={() => setPreviewing(false)}
                    onRate={(rating) => api.patchPlace(place.id, { rating })}
                />
            )}
        </div>
    );
}

function StaySection({ place }: { place: Place }) {
    const api = useHoneymoonApi();
    const home = api.data?.trip.home_currency || 'USD';
    const nights = nightsAtBase(api.data?.days ?? [], place.id);
    const booking = (api.data?.bookings ?? []).find((b) => b.kind === 'stay' && b.place_id === place.id);
    const checks = (api.data?.price_checks ?? []).filter((c) => c.place_id === place.id);
    return (
        <dl className="space-y-1 text-sm">
            <Row label="Nights on the itinerary">{nights || 'none yet'}</Row>
            {booking?.check_in && (
                <Row label="Booked">
                    {formatDate(booking.check_in)} → {formatDate(booking.check_out) ?? '?'}
                </Row>
            )}
            {checks.map((check, index) => (
                <Row key={`${check.checked_at}-${index}`} label={index === 0 ? 'Last price check' : 'Before that'}>
                    {check.amount != null ? formatMoney(check.amount, check.currency || home) : check.price_note ?? '—'}
                    {check.checked_at && <span className="text-gray-400"> · {formatDate(check.checked_at.slice(0, 10))}</span>}
                </Row>
            ))}
        </dl>
    );
}

function Cover({ place }: { place: Place }) {
    if (place.photos.length > 0) {
        return (
            <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-gray-100">
                <Image src={`/api/photos/${place.photos[0]}`} alt={place.name} fill unoptimized className="object-cover" />
            </div>
        );
    }
    if (!place.image_url) return null;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={place.image_url}
            alt=""
            referrerPolicy="no-referrer"
            className="h-40 w-full rounded-2xl bg-gray-100 object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2">
            <span className="pt-2 md:pt-1 text-xs text-gray-500">{label}</span>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{label}</dt>
            <dd className="text-right text-gray-800">{children}</dd>
        </div>
    );
}

function LinkPill({ href, children, dark = false }: { href: string; children: React.ReactNode; dark?: boolean }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-11 md:min-h-0 items-center rounded-full px-3 py-1.5 text-xs font-medium
                ${dark ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
        >
            {children}
        </a>
    );
}
