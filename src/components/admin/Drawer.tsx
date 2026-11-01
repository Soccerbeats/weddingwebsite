'use client';

import { Component, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { drawerLayout, SPINE, type DrawerMode, type DrawerSlot } from '@/lib/drawerLayout';

/*
 * Every panel in the admin is a drawer from the right (v0.10.33).
 *
 * There used to be pop-ups in the middle of the screen *and* drawers from the
 * right, and a place opened from a day's pop-up slid in underneath it. Now
 * there is one kind: `Drawer`. `Modal` and the honeymoon portal's `Sheet` are
 * thin wrappers over it, so every caller kept its API.
 *
 * On a laptop the open drawers are laid out together by `DrawerProvider`
 * (`drawerLayout()` decides where): side by side, the newest on the right,
 * older ones folding into a named strip when the room runs out — or, in "one
 * drawer" mode, only the newest shown with a back arrow to the others. On a
 * phone each is the bottom sheet it always was.
 *
 * A drawer stays where it is in the tree that opened it and is portalled to
 * <body>, so it keeps its own state and context; the provider only knows the
 * order, sizes and names. Delete confirmations, the sign-in prompt and the
 * photo viewer deliberately stay pop-ups.
 */

const MODE_KEY = 'admin-drawer-mode';
const WIDTHS = { md: 480, lg: 640, xl: 1040 } as const;
export type DrawerWidth = keyof typeof WIDTHS;

/**
 * True below the `md` breakpoint (768px), decided after mount.
 *
 * The server has no viewport, so the first render always says "not a phone"
 * and the effect corrects it — the same rule the seating chart's list view
 * follows. Anything that must not flash should be CSS, not this.
 */
export function useIsPhone(): boolean {
    const [phone, setPhone] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(max-width: 767px)');
        const apply = () => setPhone(query.matches);
        apply();
        query.addEventListener('change', apply);
        return () => query.removeEventListener('change', apply);
    }, []);
    return phone;
}

interface Entry {
    id: number;
    width: number;
    modal: boolean;
    label: string;
    /** Asks to close (the guard may refuse); true when it closed. */
    attempt: () => boolean;
}

interface Host {
    entries: Entry[];
    slots: Map<number, DrawerSlot & { index: number }>;
    viewport: number;
    mode: DrawerMode;
    setMode: (mode: DrawerMode) => void;
    put: (entry: Entry) => void;
    remove: (id: number) => void;
    /** Closes every drawer opened after `id` (all of them for null), newest first. */
    closeAfter: (id: number | null) => void;
}

const HostContext = createContext<Host | null>(null);

/** The drawer setting, for the Settings pages. */
export function useDrawerMode(): [DrawerMode, (mode: DrawerMode) => void] {
    const host = useContext(HostContext);
    return [host?.mode ?? 'stack', host?.setMode ?? (() => undefined)];
}

export function DrawerProvider({ children }: { children: React.ReactNode }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [mode, setModeState] = useState<DrawerMode>('stack');
    const [viewport, setViewport] = useState(1280);
    // The backdrop is portalled, which the server cannot do: drawn after mount.
    const [mounted, setMounted] = useState(false);
    const live = useRef(entries);
    useEffect(() => { live.current = entries; });

    useEffect(() => {
        try {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (window.localStorage.getItem(MODE_KEY) === 'single') setModeState('single');
        } catch {
            // No storage: side by side.
        }
        const measure = () => setViewport(window.innerWidth);
        measure();
        setMounted(true);
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    const setMode = useCallback((next: DrawerMode) => {
        setModeState(next);
        try { window.localStorage.setItem(MODE_KEY, next); } catch { /* not remembered */ }
    }, []);

    const put = useCallback((entry: Entry) => {
        setEntries((list) => {
            const at = list.findIndex((e) => e.id === entry.id);
            if (at < 0) return [...list, entry];
            const old = list[at];
            if (old.width === entry.width && old.modal === entry.modal && old.label === entry.label && old.attempt === entry.attempt) return list;
            const next = list.slice();
            next[at] = entry;
            return next;
        });
    }, []);
    const remove = useCallback((id: number) => {
        setEntries((list) => (list.some((e) => e.id === id) ? list.filter((e) => e.id !== id) : list));
    }, []);
    const closeAfter = useCallback((id: number | null) => {
        const list = live.current;
        const from = id == null ? 0 : list.findIndex((e) => e.id === id) + 1;
        if (id != null && from === 0) return;
        for (let i = list.length - 1; i >= from; i--) {
            if (!list[i].attempt()) return;
        }
    }, []);

    // Escape closes the newest drawer only — not every one at once, which is
    // what five drawers each listening for it would do. A menu open inside a
    // drawer takes its own Escape first.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            const list = live.current;
            if (!list.length || document.querySelector('[data-popover]')) return;
            event.stopPropagation();
            list[list.length - 1].attempt();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const slots = useMemo(() => {
        const laid = drawerLayout(entries.map((e) => e.width), viewport, mode);
        return new Map(entries.map((e, index) => [e.id, { ...laid[index], index }]));
    }, [entries, viewport, mode]);

    const host = useMemo<Host>(() => ({
        entries, slots, viewport, mode, setMode, put, remove, closeAfter,
    }), [entries, slots, viewport, mode, setMode, put, remove, closeAfter]);

    // One backdrop under all of them. A press that *starts* on it closes them
    // all; releasing a text selection over it is not a click outside.
    const pressed = useRef(false);
    const dimmed = entries.some((e) => e.modal);
    return (
        <HostContext.Provider value={host}>
            {children}
            {mounted && createPortal(
                <div
                    aria-hidden
                    data-drawer-backdrop
                    onPointerDown={(e) => { pressed.current = e.target === e.currentTarget; }}
                    onClick={() => { if (pressed.current) closeAfter(null); pressed.current = false; }}
                    className={`fixed inset-0 z-[55] bg-gray-900/25 transition-opacity duration-300
                        ${dimmed ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                />,
                document.body,
            )}
        </HostContext.Provider>
    );
}

/** What was on screen while it closes: never worth crashing the page over. */
class Quiet extends Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? null : this.props.children; }
}

let nextId = 1;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * A panel that slides in from the right on a laptop and up from the bottom on
 * a phone.
 *
 * `modal={false}` draws no backdrop and lets the page keep working — the map
 * stays pannable with a place open beside it; a press outside closes it unless
 * it lands inside `data-sheet-keep` (the map), where a click on another pin
 * swaps the place instead. A drawer whose name changes closes the ones opened
 * from it: a different day in the day drawer is a different trail.
 */
export function Drawer({
    open, onClose, title, actions, children, modal = true, guard, width = 'md',
    dataAttrs, startTall = false,
}: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    modal?: boolean;
    /** Runs before a close you asked for; false keeps it open. */
    guard?: () => boolean;
    width?: DrawerWidth;
    dataAttrs?: Record<string, string>;
    /** On a phone, open at full height — a form needs the room. */
    startTall?: boolean;
}) {
    const host = useContext(HostContext);
    const phone = useIsPhone();
    const [id] = useState(() => nextId++);
    const panel = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLDivElement>(null);
    const [tall, setTall] = useState(false);
    const [label, setLabel] = useState('');

    const guardRef = useRef(guard);
    const closeRef = useRef(onClose);
    useEffect(() => { guardRef.current = guard; closeRef.current = onClose; });
    const attempt = useCallback(() => {
        if (guardRef.current && !guardRef.current()) return false;
        closeRef.current();
        return true;
    }, []);

    // Its name, for the strip, the trail and the back arrow.
    useLayoutEffect(() => {
        // The heading (or `data-drawer-name`), when there is one: a subtitle that counts things changes
        // under you, and a new name closes what was opened from this drawer.
        const node = titleRef.current;
        // An editable name is an input, which has no text: it says its name.
        const nameNode = node?.querySelector('[data-drawer-name], h1, h2, h3, h4') ?? node;
        const text = (nameNode?.getAttribute('data-drawer-name') || nameNode?.textContent || '').replace(/\s+/g, ' ').trim();
        setLabel((was) => (was === text ? was : text));
    }, [title, open]);

    // Join the stack while open.
    useEffect(() => {
        if (!open || !host) return;
        host.put({ id, width: WIDTHS[width], modal, label, attempt });
    }, [open, host, id, width, modal, label, attempt]);
    const hostRemove = host?.remove;
    useEffect(() => {
        if (!open || !hostRemove) return;
        return () => hostRemove(id);
    }, [open, hostRemove, id]);

    // A new name means a new trail: close what was opened from the old one.
    const named = useRef('');
    const closeAfter = host?.closeAfter;
    useEffect(() => {
        if (!open) { named.current = ''; return; }
        if (named.current && label && named.current !== label) closeAfter?.(id);
        if (label) named.current = label;
    }, [open, label, closeAfter, id]);

    // Slides in from off screen: it is drawn there first, then moved.
    const [entered, setEntered] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const wasOpen = useRef(open);
    const slot = host?.slots.get(id);
    // Where it was, for sliding out from there after it has left the stack.
    const [lastSlot, setLastSlot] = useState(slot);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { if (slot) setLastSlot(slot); }, [slot]);
    const lastIndex = useRef(0);
    useEffect(() => { if (slot) lastIndex.current = slot.index; }, [slot]);
    useEffect(() => {
        if (open) {
            const frame = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
            wasOpen.current = true;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLeaving(false);
            return () => cancelAnimationFrame(frame);
        }
        if (!wasOpen.current) return;
        wasOpen.current = false;
        setEntered(false);
        // In "one drawer" mode a drawer over another just goes: the one under
        // it comes back in its place rather than watching it slide away.
        const over = lastIndex.current > 0 && host?.mode === 'single';
        if (over || phone) return;
        setLeaving(true);
        const timer = setTimeout(() => setLeaving(false), 340);
        return () => clearTimeout(timer);
    }, [open, host?.mode, phone]);

    // "One drawer" mode: what opens over a drawer glides in from the right,
    // and the drawer you go back to returns from the left. Animated in place —
    // remounting the content would throw away anything typed into it.
    const body = useRef<HTMLDivElement>(null);
    const hidden = slot?.hidden ?? false;
    const wasHidden = useRef(hidden);
    const glide = (from: number) => {
        if (phone || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        body.current?.animate(
            [{ opacity: 0, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'none' }],
            { duration: 380, easing: EASE },
        );
    };
    const glideRef = useRef(glide);
    useEffect(() => { glideRef.current = glide; });
    useEffect(() => {
        if (wasHidden.current && !hidden && open) glideRef.current(-28);
        wasHidden.current = hidden;
    }, [hidden, open]);
    const overAnother = host?.mode === 'single' && (slot?.index ?? 0) > 0;
    useEffect(() => {
        if (overAnother) glideRef.current(28);
    }, [overAnother]);

    // Outside presses close a drawer that leaves the page usable.
    useEffect(() => {
        if (!open || modal) return;
        const onDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target || panel.current?.contains(target)) return;
            if (target.closest('[data-sheet-keep], [data-sheet-panel], [role="dialog"], [data-popover], [data-drawer-backdrop]')) return;
            attempt();
        };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
    }, [open, modal, attempt]);

    // Without a provider (the public share page) it closes on Escape itself.
    useEffect(() => {
        if (!open || host) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || document.querySelector('[data-popover]')) return;
            event.stopPropagation();
            attempt();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, host, attempt]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setTall(open && startTall); }, [open, startTall]);

    /*
     * Phone: drag the top of the sheet down to shrink or close, up to expand.
     *
     * The whole top is the grip, not just the little bar: the bar is 40px wide
     * and a thumb missed it as often as it hit it. A press only becomes a drag
     * once it has moved, so the buttons up there still take a tap, and the
     * click that would follow a drag is swallowed. The sheet follows the finger
     * both ways, then snaps to the nearest of closed, half and full — a quick
     * flick goes one step that way whatever the distance.
     */
    const drag = useRef<{
        id: number; y: number; startH: number; lastY: number; lastT: number; v: number; active: boolean;
    } | null>(null);
    const swallowClick = useRef(false);
    const [dragH, setDragH] = useState<number | null>(null);
    const onGripDown = (event: React.PointerEvent<HTMLDivElement>) => {
        swallowClick.current = false;
        if (event.button > 0 || !panel.current || !window.matchMedia('(max-width: 767px)').matches) return;
        drag.current = {
            id: event.pointerId, y: event.clientY, lastY: event.clientY, lastT: event.timeStamp, v: 0,
            startH: panel.current.getBoundingClientRect().height, active: false,
        };
    };
    const onGripMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.id !== event.pointerId) return;
        const dy = event.clientY - d.y;
        if (!d.active) {
            if (Math.abs(dy) < 6) return;
            d.active = true;
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        const dt = event.timeStamp - d.lastT;
        if (dt > 0) d.v = (event.clientY - d.lastY) / dt;
        d.lastY = event.clientY;
        d.lastT = event.timeStamp;
        setDragH(Math.min(window.innerHeight * 0.94, Math.max(0, d.startH - dy)));
    };
    const endDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
        const d = drag.current;
        drag.current = null;
        if (!d || !d.active) return;
        // Cleared by the next press, not a timer: when the click lands varies.
        swallowClick.current = true;
        setDragH(null);
        if (cancelled) return;
        const vh = window.innerHeight;
        const half = vh * 0.62;
        const full = vh * 0.94;
        const height = Math.min(full, Math.max(0, d.startH - (event.clientY - d.y)));
        // A flick that stopped before lifting is not a flick.
        const v = event.timeStamp - d.lastT > 120 ? 0 : d.v;
        let next: 'closed' | 'half' | 'full';
        if (v > 0.5) next = tall ? 'half' : 'closed';
        else if (v < -0.5) next = 'full';
        else if (height < half * 0.6) next = 'closed';
        else next = height > (half + full) / 2 ? 'full' : 'half';
        if (next === 'closed') { attempt(); return; }
        setTall(next === 'full');
    };

    if ((!open && !leaving) || typeof document === 'undefined') return null;

    // Where it sits on a laptop. Off the right edge until it has entered, and
    // again while it leaves.
    const viewport = host?.viewport ?? (typeof window === 'undefined' ? 1280 : window.innerWidth);
    const place = slot ?? lastSlot;
    const w = place?.width ?? Math.min(WIDTHS[width], viewport);
    const atX = place?.x ?? viewport - w;
    const single = host?.mode === 'single';
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // In "one drawer" mode a drawer opened over another appears in place.
    const appears = single && (slot?.index ?? 0) > 0;
    const x = open && (entered || appears) ? atX : viewport + 8;
    const index = slot?.index ?? 0;
    const desktop: React.CSSProperties | undefined = phone ? undefined : {
        width: w,
        transform: `translateX(${x}px)`,
        transitionProperty: 'transform',
        transitionDuration: leaving ? '320ms' : appears || reduced ? '0ms' : '500ms',
        transitionTimingFunction: EASE,
        visibility: hidden ? 'hidden' : undefined,
    };
    const trail = single && host ? host.entries.slice(0, index) : [];
    const folded = !phone && (place?.folded ?? false);
    const behind = !phone && (place?.behind ?? false) && !hidden;

    return createPortal((
        <div
            ref={panel}
            data-sheet-panel
            data-drawer={folded ? 'folded' : behind ? 'behind' : 'top'}
            role="dialog"
            aria-modal={modal}
            aria-label={label || undefined}
            aria-hidden={hidden || undefined}
            inert={hidden || undefined}
            {...dataAttrs}
            style={{ zIndex: 56 + index, ...(dragH != null ? { height: dragH } : null), ...desktop }}
            className={`fixed inset-x-0 bottom-0 flex flex-col bg-white shadow-2xl rounded-t-3xl border border-gray-200/70
                ${dragH != null ? '' : 'transition-[height] duration-300 ease-out motion-reduce:transition-none'}
                ${tall ? 'h-[94dvh]' : 'h-[62dvh]'}
                md:inset-y-0 md:left-0 md:right-auto md:top-0 md:h-full md:max-h-none md:rounded-none md:rounded-l-3xl`}
        >
            {/* Folded: only this strip shows. Pressing it goes back to this drawer. */}
            {folded && (
                <button
                    type="button"
                    onClick={() => host?.closeAfter(id)}
                    aria-label={`Back to ${label}`}
                    title={label}
                    className="absolute inset-y-0 left-0 z-10 flex flex-col items-center gap-3 rounded-l-3xl
                        border-r border-gray-200 bg-gray-50 pt-6 text-gray-600 transition-colors hover:bg-accent/10"
                    style={{ width: SPINE }}
                >
                    <span className="max-h-[70vh] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold [writing-mode:vertical-rl] rotate-180">
                        {label}
                    </span>
                </button>
            )}
            {/* Behind another: a shade, so the newest reads as the one in front. */}
            {behind && !folded && (
                <div aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-l-3xl bg-gray-900/[0.04]" />
            )}

            {/* The grip on a phone: the handle and the title row together.
                `touch-none` so the browser hands the finger to us instead of scrolling. */}
            <div
                data-sheet-grip
                onPointerDown={onGripDown}
                onPointerMove={onGripMove}
                onPointerUp={(e) => endDrag(e, false)}
                onPointerCancel={(e) => endDrag(e, true)}
                onClickCapture={(e) => {
                    if (!swallowClick.current) return;
                    e.preventDefault();
                    e.stopPropagation();
                }}
                className="shrink-0 max-md:touch-none max-md:select-none"
            >
                {/* A tap on the handle toggles half and full height. Full width and
                    44px tall, so a thumb cannot miss it. */}
                <button
                    type="button"
                    data-sheet-handle
                    onClick={() => setTall((v) => !v)}
                    aria-label={tall ? 'Shrink the panel (drag down to close)' : 'Expand the panel (drag down to close)'}
                    className="md:hidden flex h-11 w-full items-center justify-center rounded-t-3xl
                        cursor-grab active:cursor-grabbing"
                >
                    <span className="h-1.5 w-12 rounded-full bg-gray-300" />
                </button>
                <div className="flex shrink-0 items-start gap-2 border-b border-gray-100 px-4 pb-3 pt-0 md:pt-4">
                    {trail.length > 0 && (
                        <button
                            type="button"
                            onClick={attempt}
                            aria-label={`Back to ${trail[trail.length - 1].label}`}
                            className="-ml-1 hidden size-9 shrink-0 items-center justify-center rounded-full
                                text-gray-500 hover:bg-gray-50 hover:text-gray-900 md:flex"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                                strokeLinejoin="round" className="size-5" aria-hidden>
                                <path d="m15 5-7 7 7 7" />
                            </svg>
                        </button>
                    )}
                    <div ref={titleRef} className="min-w-0 flex-1">{title}</div>
                    {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
                    <button
                        type="button"
                        onClick={attempt}
                        aria-label="Close"
                        className="-mr-1 flex size-11 md:size-9 shrink-0 items-center justify-center
                            rounded-full text-2xl leading-none text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                    >
                        ×
                    </button>
                </div>
                {trail.length > 0 && (
                    <nav aria-label="Where you came from" className="hidden flex-wrap items-center gap-1 px-4 pt-2 text-xs text-gray-400 md:flex">
                        {trail.map((entry) => (
                            <span key={entry.id} className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => host?.closeAfter(entry.id)}
                                    className="max-w-[12rem] truncate text-gray-500 underline underline-offset-2 hover:text-gray-800"
                                >
                                    {entry.label}
                                </button>
                                <span aria-hidden>›</span>
                            </span>
                        ))}
                        <span className="max-w-[12rem] truncate">{label}</span>
                    </nav>
                )}
            </div>
            <div
                ref={body}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4
                    pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-5"
            >
                {open ? children : <Quiet>{children}</Quiet>}
            </div>
        </div>
    ), document.body);
}
