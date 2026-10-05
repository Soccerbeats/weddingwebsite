/**
 * What the place panel shows, and in what order.
 *
 * One rule for every place, wherever it was opened from: the panel's shape
 * depends on the place, never on the caller. A stay gets one extra section
 * (its nights and price history); nothing else varies — an excursion is a
 * place, so it reads like one.
 */
import { COST_PER_LABELS, formatPrice, priceValue, type Place } from './honeymoon';

export type SheetSection =
    | 'plan' | 'where' | 'booking' | 'stay' | 'practical' | 'notes' | 'opinions' | 'photos' | 'nearby';

const CORE: SheetSection[] = ['plan', 'where', 'booking', 'practical', 'notes', 'opinions', 'photos', 'nearby'];

export function sheetSections(place: Pick<Place, 'category' | 'is_excursion'>): SheetSection[] {
    if (place.category !== 'stay') return [...CORE];
    const at = CORE.indexOf('booking') + 1;
    return [...CORE.slice(0, at), 'stay', ...CORE.slice(at)];
}

/**
 * A place's price as one line of text: the number with what it is per, or the
 * free-text note when there is no number.
 */
export function priceText(
    place: Pick<Place, 'cost' | 'cost_per' | 'cost_currency' | 'price_note'>,
    currency: string | null | undefined,
): string {
    if (place.cost == null) return place.price_note ?? '';
    const money = formatPrice(String(place.cost), place.cost_currency || currency);
    return place.cost_per === 'total' ? money : `${money} ${COST_PER_LABELS[place.cost_per]}`;
}

/**
 * What typing into the price line writes.
 *
 * A number becomes the real `cost` the budget adds up; anything else — "ask at
 * the desk" — stays words in the note, because that is not arithmetic. A first
 * figure on a stay is a nightly rate (the question a stay is asked); on
 * anything else, a total. An existing figure keeps what it was per and its
 * currency, so retyping a week's total never quietly turns it into a rate.
 */
export function pricePatch(
    place: Pick<Place, 'category' | 'cost' | 'cost_per' | 'cost_currency'>,
    typed: string,
    home: string,
): Record<string, string> {
    const text = typed.trim();
    const amount = priceValue(text);
    if (amount == null) return { cost: '', price_note: text };
    return {
        cost: String(amount),
        cost_per: place.cost != null ? place.cost_per : place.category === 'stay' ? 'night' : 'total',
        cost_currency: place.cost_currency || home,
    };
}
