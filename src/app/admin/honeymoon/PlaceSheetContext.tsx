'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Place } from '@/lib/honeymoon';

/**
 * The one way to show a place.
 *
 * Every surface in the portal — a map pin, a list row, a stay card, a stop on
 * a day, a search hit — calls `openPlace(id)`, and the shell draws the one
 * `PlaceSheet`. Before this there were five different windows depending on
 * where you clicked, each showing a different subset of the same place.
 * **Never render your own place window: call this.**
 */
export interface PlaceSheetApi {
    openPlace: (id: number) => void;
    /** A new place, optionally pre-filled (a stay from the Stays segment). */
    newPlace: (defaults?: Partial<Place>) => void;
    close: () => void;
    state: PlaceSheetState;
}

export type PlaceSheetState =
    | { kind: 'closed' }
    | { kind: 'place'; id: number }
    | { kind: 'new'; defaults: Partial<Place>; at: number };

const Context = createContext<PlaceSheetApi | null>(null);

export function PlaceSheetProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<PlaceSheetState>({ kind: 'closed' });
    const openPlace = useCallback((id: number) => setState({ kind: 'place', id }), []);
    // `at` makes a second "new place" a fresh form rather than the same one.
    const newPlace = useCallback((defaults: Partial<Place> = {}) => setState({
        kind: 'new', defaults, at: Date.now(),
    }), []);
    const close = useCallback(() => setState({ kind: 'closed' }), []);
    const value = useMemo(() => ({ openPlace, newPlace, close, state }), [openPlace, newPlace, close, state]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePlaceSheet(): PlaceSheetApi {
    const value = useContext(Context);
    if (!value) throw new Error('usePlaceSheet must be used inside the honeymoon layout');
    return value;
}
