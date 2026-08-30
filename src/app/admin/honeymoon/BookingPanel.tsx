'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/honeymoon';
import type { Booking, BookingKind } from '@/lib/honeymoon';
import { bookingFor, bookingTotal, formatMoney } from '@/lib/honeymoonBudget';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, SelectField, TextArea, TextField } from './ui';

/**
 * The paperwork behind "booked".
 *
 * `status: booked` on a place recorded *that* something was booked and nothing
 * else — no confirmation number, no money, no date after which cancelling costs
 * you. This is that missing half, and it is the same panel wherever a booking
 * can hang: a stay, an excursion, a flight, a dinner table.
 *
 * It creates the row lazily. A place is not a booking until there is something
 * to write down, so nothing exists until you press the button — which also means
 * a shortlist of forty hotels does not carry forty empty bookings.
 */
export default function BookingPanel({
    api, kind, placeId, travelId, stopId, journeyId, compact = false,
}: {
    api: HoneymoonApi;
    kind: BookingKind;
    placeId?: number | null;
    travelId?: number | null;
    stopId?: number | null;
    /**
     * The journey this booking covers.
     *
     * A ticket has one reference, one price and one cancellation date however
     * many legs it has, so a journey's booking hangs off the journey rather than
     * off one of its legs.
     */
    journeyId?: number | null;
    /** Fewer fields, for the places where this sits inside another form. */
    compact?: boolean;
}) {
    const bookings = api.data?.bookings ?? [];
    const currency = api.data?.trip.home_currency || 'USD';
    const booking = journeyId != null
        ? bookings.find((row) => row.journey_id === journeyId) ?? null
        : bookingFor(bookings, {
            place: placeId != null ? { id: placeId } as never : null,
            leg: travelId != null ? { id: travelId } as never : null,
            stopId: stopId ?? null,
        });
    const [creating, setCreating] = useState(false);

    const create = async () => {
        setCreating(true);
        try {
            await api.create('bookings', {
                kind,
                place_id: placeId ?? null,
                travel_id: travelId ?? null,
                stop_id: stopId ?? null,
                journey_id: journeyId ?? null,
            });
        } finally {
            setCreating(false);
        }
    };

    if (!booking) {
        return (
            <div className="rounded-2xl border border-dashed border-gray-200 p-3">
                <p className="text-[11px] text-gray-500">
                    {kind === 'travel'
                        ? 'No reference yet — the booking number, what it cost, when free '
                            + 'cancellation ends.'
                        : 'Nothing recorded yet — confirmation number, what it cost, when free '
                            + 'cancellation ends.'}
                </p>
                <Button className="mt-2" onClick={create} disabled={creating}>
                    {creating
                        ? 'Adding…'
                        : kind === 'travel' ? '+ Add the booking reference' : '+ Booking details'}
                </Button>
            </div>
        );
    }

    const set = (fields: Record<string, unknown>) => api.update('bookings', {
        id: booking.id, ...fields,
    });

    /*
     * What this booking comes to.
     *
     * For a stay that is the place's price times the nights — the price is the
     * stay's, entered once on the Stays tab, and this panel supplies the dates
     * it is multiplied by. It used to have a Cost box of its own, so the same
     * figure was typed twice and the budget had to decide which copy to trust.
     */
    const place = placeId != null ? api.placeById.get(placeId) ?? null : null;
    const total = bookingTotal(booking, place);
    /** The place owns the money, so this panel reports it rather than asking. */
    const derived = kind === 'stay' && place != null && booking.cost == null;
    const owed = total != null
        ? Math.max(0, total.amount - (booking.cost_paid ?? 0))
        : null;

    return (
        <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                    Booking
                </span>
                {booking.paid ? (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px]
                        font-semibold text-white">
                        Paid
                    </span>
                ) : owed != null && owed > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px]
                        font-semibold text-amber-800">
                        {formatMoney(owed, currency)} to pay
                    </span>
                ) : null}
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={() => api.removeRow('bookings', booking, 'Removed booking details')}
                    className="text-[11px] text-gray-500 underline decoration-dotted"
                >
                    Remove
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Field label="Confirmation">
                    <TextField
                        key={`c${booking.confirmation ?? ''}`}
                        defaultValue={booking.confirmation ?? ''}
                        placeholder="AMK-9931"
                        onBlur={(e) => {
                            if (e.target.value !== (booking.confirmation ?? '')) {
                                set({ confirmation: e.target.value });
                            }
                        }}
                    />
                </Field>
                <Field label="Booked with">
                    <TextField
                        key={`p${booking.provider ?? ''}`}
                        defaultValue={booking.provider ?? ''}
                        placeholder="Booking.com / direct"
                        onBlur={(e) => {
                            if (e.target.value !== (booking.provider ?? '')) {
                                set({ provider: e.target.value });
                            }
                        }}
                    />
                </Field>
            </div>

            {kind === 'stay' && (
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Check in">
                        <TextField
                            type="date"
                            key={`ci${booking.check_in ?? ''}`}
                            defaultValue={booking.check_in ?? ''}
                            onBlur={(e) => {
                                if (e.target.value !== (booking.check_in ?? '')) {
                                    set({ check_in: e.target.value });
                                }
                            }}
                        />
                    </Field>
                    <Field label="Check out">
                        <TextField
                            type="date"
                            key={`co${booking.check_out ?? ''}`}
                            defaultValue={booking.check_out ?? ''}
                            onBlur={(e) => {
                                if (e.target.value !== (booking.check_out ?? '')) {
                                    set({ check_out: e.target.value });
                                }
                            }}
                        />
                    </Field>
                </div>
            )}

            {kind === 'table' && (
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Party size">
                        <TextField
                            type="number"
                            min="1"
                            key={`ps${booking.party_size ?? ''}`}
                            defaultValue={booking.party_size ?? ''}
                            placeholder="2"
                            onBlur={(e) => {
                                if (e.target.value !== String(booking.party_size ?? '')) {
                                    set({ party_size: e.target.value });
                                }
                            }}
                        />
                    </Field>
                    <Field label="Dress code">
                        <TextField
                            key={`dc${booking.dress_code ?? ''}`}
                            defaultValue={booking.dress_code ?? ''}
                            placeholder="Smart casual"
                            onBlur={(e) => {
                                if (e.target.value !== (booking.dress_code ?? '')) {
                                    set({ dress_code: e.target.value });
                                }
                            }}
                        />
                    </Field>
                </div>
            )}

            <div className="grid grid-cols-3 gap-2">
                <Field label={`Cost (${total?.currency || currency})`}>
                    {derived ? (
                        /* Reported, not asked for. Where it comes from is said
                           out loud, so a wrong number is fixed in the one place
                           that can change it rather than hunted for. */
                        <div className="rounded-2xl bg-gray-50 px-3 py-2">
                            <p className="text-sm text-gray-800 tabular-nums">
                                {total != null
                                    ? formatMoney(total.amount, total.currency || currency)
                                    : '—'}
                            </p>
                            <p className="text-[10px] leading-tight text-gray-400">
                                {total?.detail
                                    ?? (place.cost == null
                                        ? 'Add the price to the stay'
                                        : 'From the stay’s price')}
                            </p>
                        </div>
                    ) : (
                        <TextField
                            type="number"
                            min="0"
                            step="0.01"
                            key={`ct${booking.cost ?? ''}`}
                            defaultValue={booking.cost != null ? String(booking.cost) : ''}
                            onBlur={(e) => {
                                const current = booking.cost != null ? String(booking.cost) : '';
                                if (e.target.value !== current) {
                                    set({ cost: e.target.value, cost_currency: currency });
                                }
                            }}
                        />
                    )}
                </Field>
                <Field label="Paid so far">
                    <TextField
                        type="number"
                        min="0"
                        step="0.01"
                        key={`cp${booking.cost_paid ?? ''}`}
                        defaultValue={booking.cost_paid != null ? String(booking.cost_paid) : ''}
                        onBlur={(e) => {
                            const current = booking.cost_paid != null ? String(booking.cost_paid) : '';
                            if (e.target.value !== current) set({ cost_paid: e.target.value });
                        }}
                    />
                </Field>
                <Field label="Settled">
                    <SelectField
                        value={booking.paid ? 'yes' : 'no'}
                        onChange={(e) => set({ paid: e.target.value === 'yes' })}
                    >
                        <option value="no">Not yet</option>
                        <option value="yes">Paid in full</option>
                    </SelectField>
                </Field>
            </div>

            {/* The two dates worth an alarm. */}
            <div className="grid grid-cols-2 gap-2">
                <Field label="Deposit due">
                    <TextField
                        type="date"
                        key={`dd${booking.deposit_due_on ?? ''}`}
                        defaultValue={booking.deposit_due_on ?? ''}
                        onBlur={(e) => {
                            if (e.target.value !== (booking.deposit_due_on ?? '')) {
                                set({ deposit_due_on: e.target.value });
                            }
                        }}
                    />
                </Field>
                <Field label="Free cancellation until">
                    <TextField
                        type="date"
                        key={`cb${booking.cancel_by ?? ''}`}
                        defaultValue={booking.cancel_by ?? ''}
                        onBlur={(e) => {
                            if (e.target.value !== (booking.cancel_by ?? '')) {
                                set({ cancel_by: e.target.value });
                            }
                        }}
                    />
                </Field>
            </div>

            {!compact && (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Contact">
                            <TextField
                                key={`ct2${booking.contact ?? ''}`}
                                defaultValue={booking.contact ?? ''}
                                placeholder="+62 363 41333"
                                onBlur={(e) => {
                                    if (e.target.value !== (booking.contact ?? '')) {
                                        set({ contact: e.target.value });
                                    }
                                }}
                            />
                        </Field>
                        <Field label="Booking page">
                            <TextField
                                key={`u${booking.url ?? ''}`}
                                defaultValue={booking.url ?? ''}
                                placeholder="https://…"
                                onBlur={(e) => {
                                    if (e.target.value !== (booking.url ?? '')) {
                                        set({ url: e.target.value });
                                    }
                                }}
                            />
                        </Field>
                    </div>
                    <Field label="Notes">
                        <TextArea
                            rows={2}
                            key={`n${booking.notes ?? ''}`}
                            defaultValue={booking.notes ?? ''}
                            placeholder="Sea-view room, late check-in agreed by email"
                            onBlur={(e) => {
                                if (e.target.value !== (booking.notes ?? '')) {
                                    set({ notes: e.target.value });
                                }
                            }}
                        />
                    </Field>
                </>
            )}

            <BookingSummary booking={booking} currency={currency} total={total?.amount ?? null} />
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide
                text-gray-400">
                {label}
            </label>
            {children}
        </div>
    );
}

/** One line restating the booking in words, which is how it gets checked. */
function BookingSummary({ booking, currency, total }: {
    booking: Booking; currency: string;
    /** The booking's own cost, or the stay's price times the nights. */
    total: number | null;
}) {
    const parts = [
        total != null ? formatMoney(total, currency) : null,
        booking.check_in && booking.check_out
            ? `${formatDate(booking.check_in)} → ${formatDate(booking.check_out)}`
            : null,
        booking.cancel_by ? `free until ${formatDate(booking.cancel_by)}` : null,
        booking.deposit_due_on && !booking.paid
            ? `deposit ${formatDate(booking.deposit_due_on)}`
            : null,
    ].filter(Boolean);
    if (!parts.length) return null;
    return <p className="text-[11px] text-emerald-900">{parts.join(' · ')}</p>;
}
