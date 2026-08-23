'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import type * as LeafletNS from 'leaflet';
import {
    arcPoints, boundsOf, categoryMeta, hasCoords, placesInPolygon,
    type LatLng, type Place,
} from '@/lib/honeymoon';

/**
 * The trip map.
 *
 * Leaflet is imported inside an effect rather than at module scope: it touches
 * `window` the moment it loads, and this component is still server-rendered for
 * the initial HTML even though it is a client component.
 *
 * Markers are divIcons rather than image pins, which sidesteps Leaflet's
 * well-known broken-default-icon problem under bundlers and lets each category
 * carry its own colour without shipping seventeen PNGs.
 *
 * Pins are clustered. Framing Singapore and Bali together puts ~1,700 km on
 * screen, at which zoom 118 individual pins collapse into two unreadable blobs;
 * clustering turns those into counts that split apart as you zoom in. Clustering
 * is switched off while a day's route is displayed, where merging consecutive
 * stops would hide the very ordering the route exists to show.
 */

export interface DayRoute {
    /** Ordered stops for one day. */
    points: { lat: number; lng: number; label: string }[];
    color: string;
    label: string;
}

/** One travel leg, ready to draw: two ends and how it should look. */
export interface TravelArc {
    id: number;
    from: LatLng;
    to: LatLng;
    color: string;
    /** SVG dash pattern — every leg is dashed, differently per mode. */
    dash: string;
    /** How far the arc bows out, as a fraction of its length. */
    curve: number;
    /** Emoji for the mode, drawn at the top of the arc. */
    icon: string;
    /** Popup text: "Flight · DPS → SIN · Day 3". */
    label: string;
}

export interface TripMapProps {
    places: Place[];
    /** Ordered routes to draw — one per day being shown. */
    routes?: DayRoute[];
    /** Travel legs to draw as curved dashed arcs. */
    legs?: TravelArc[];
    selectedId?: number | null;
    onSelect?: (id: number) => void;
    /**
     * Change this to re-frame the map. It is a signal, not a filter key: the
     * viewport is yours once you have panned or zoomed, and toggling what is
     * drawn must never yank it out from under you. The parent bumps it on first
     * load and when the fit button is pressed.
     */
    fitSignal?: number;
    /**
     * Points to frame on the *next* fit, instead of everything drawn.
     *
     * Set it to one day's stops and bump `fitSignal` to fly to that day; null
     * means "frame everything on screen", which is what the fit button does.
     * Read through a ref, so changing it never re-frames on its own — only a
     * bumped signal does.
     */
    fitPoints?: { lat: number; lng: number }[] | null;
    /** While true, dragging draws a lasso instead of panning the map. */
    selectMode?: boolean;
    /** Ids currently lasso-selected, drawn with a highlight ring. */
    selectedIds?: Set<number>;
    /** Fired on release with everything inside the drawn loop. */
    onLassoSelect?: (ids: number[], additive: boolean) => void;
    className?: string;
}

export default function TripMap({
    places, routes = [], legs = [], selectedId = null, onSelect, fitSignal = 0, fitPoints = null,
    selectMode = false, selectedIds, onLassoSelect, className = '',
}: TripMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<LeafletNS.Map | null>(null);
    const layerRef = useRef<LeafletNS.LayerGroup | LeafletNS.MarkerClusterGroup | null>(null);
    const routeLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
    const leafletRef = useRef<typeof LeafletNS | null>(null);
    /**
     * Flips once the map exists, and is a dependency of every draw effect below.
     *
     * Without it there is a race that silently empties the map: creating the map
     * awaits a dynamic import, so if the data fetch resolves first, the marker
     * effect runs while mapRef is still null, bails out, and — because `places`
     * never changes again — never runs a second time. The map then sits there
     * with tiles and no pins until you happen to touch a filter.
     */
    const [ready, setReady] = useState(false);
    // Held in a ref so the marker click handler always sees the current callback
    // without every marker being rebuilt when the parent re-renders.
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;

    // The lasso handlers are bound once and read everything current through
    // refs, so toggling a filter never rebinds them mid-draw.
    const placesRef = useRef(places);
    placesRef.current = places;
    const onLassoRef = useRef(onLassoSelect);
    onLassoRef.current = onLassoSelect;
    const selectModeRef = useRef(selectMode);
    selectModeRef.current = selectMode;

    // See the prop: held in a ref so a new target never fits by itself.
    const fitPointsRef = useRef(fitPoints);
    fitPointsRef.current = fitPoints;

    // Whether the map has ever been framed, and the last fit request seen.
    const fittedRef = useRef(false);
    const lastSignalRef = useRef(fitSignal);

    /* Create the map once. */
    useEffect(() => {
        let cancelled = false;
        let observer: ResizeObserver | null = null;

        (async () => {
            const L = (await import('leaflet')).default;
            // markercluster is a plugin that augments the Leaflet global, so it
            // has to be loaded after Leaflet and before markerClusterGroup is
            // called. Its side-effect import contributes nothing to `L`'s type,
            // which is why the cluster group is typed via @types/leaflet.markercluster.
            await import('leaflet.markercluster');
            if (cancelled || !containerRef.current || mapRef.current) return;

            leafletRef.current = L;
            const map = L.map(containerRef.current, {
                // Bali and Singapore are ~1,700 km apart; this frames both until
                // real pins arrive and fitBounds takes over.
                center: [-4.5, 112.5],
                zoom: 5,
                scrollWheelZoom: true,
                worldCopyJump: true,
            });

            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors',
            }).addTo(map);

            routeLayerRef.current = L.layerGroup().addTo(map);
            mapRef.current = map;
            setReady(true);

            // The container is often still sizing when the map initialises
            // (tab switch, modal open), which leaves grey tiles until a resize.
            setTimeout(() => map.invalidateSize(), 50);

            // Leaflet only watches the *window*. The map's box also changes
            // without one — dragging a panel divider on the split view resizes
            // it every frame — and a map that isn't told renders the new space
            // as grey tiles.
            if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
                observer = new ResizeObserver(() => map.invalidateSize());
                observer.observe(containerRef.current);
            }
        })();

        return () => {
            cancelled = true;
            observer?.disconnect();
            mapRef.current?.remove();
            mapRef.current = null;
            layerRef.current = null;
            routeLayerRef.current = null;
            setReady(false);
        };
    }, []);

    /* Redraw pins whenever the visible set changes. */
    useEffect(() => {
        const L = leafletRef.current;
        const map = mapRef.current;
        if (!L || !map) return;

        // The layer is rebuilt rather than cleared because its *type* depends on
        // whether a route is showing — a cluster group the rest of the time, a
        // plain group while a day is selected.
        if (layerRef.current) {
            map.removeLayer(layerRef.current);
            layerRef.current = null;
        }

        // Clustering is suspended while lassoing: you cannot meaningfully draw
        // around points that are hidden inside a count badge.
        const clustered = routes.length === 0 && !selectMode;
        const layer = clustered
            ? L.markerClusterGroup({
                showCoverageOnHover: false,
                maxClusterRadius: 45,
                spiderfyOnMaxZoom: true,
                iconCreateFunction: (cluster) => L.divIcon({
                    className: 'honeymoon-cluster',
                    html: `<span style="
                        display:flex;align-items:center;justify-content:center;
                        width:34px;height:34px;border-radius:9999px;
                        background:#0f172a;color:#fff;border:2px solid #fff;
                        font-size:12px;font-weight:700;line-height:1;
                        box-shadow:0 1px 6px rgba(0,0,0,.45);
                    ">${cluster.getChildCount()}</span>`,
                    iconSize: [34, 34],
                }),
            })
            : L.layerGroup();

        layer.addTo(map);
        layerRef.current = layer;

        const pinned = places.filter(hasCoords);

        for (const place of pinned) {
            const meta = categoryMeta(place.category);
            const selected = place.id === selectedId;
            // An unconfirmed pin gets a dashed amber ring so a bulk-geocoded
            // guess never looks as trustworthy as one you placed yourself.
            const lassoed = selectedIds?.has(place.id) ?? false;
            const ring = lassoed
                // A lassoed pin has to read as picked at a glance, so it wins
                // over both the review ring and the click highlight.
                ? 'border-style:solid;border-color:#0f172a;border-width:4px;'
                : place.needs_review
                    ? 'border-style:dashed;border-color:#f59e0b;border-width:2px;'
                    : `border-style:solid;border-color:#fff;border-width:${selected ? 3 : 2}px;`;

            const icon = L.divIcon({
                className: 'honeymoon-pin',
                html: `<span style="
                    display:flex;align-items:center;justify-content:center;
                    width:${selected ? 26 : 20}px;height:${selected ? 26 : 20}px;
                    background:${meta.color};${ring}
                    border-radius:9999px;
                    box-shadow:0 1px 4px rgba(0,0,0,.4);
                    font-size:${selected ? 13 : 10}px;line-height:1;
                "></span>`,
                iconSize: [selected ? 26 : 20, selected ? 26 : 20],
                iconAnchor: [selected ? 13 : 10, selected ? 13 : 10],
            });

            const marker = L.marker([place.lat, place.lng], {
                icon,
                title: place.name,
                zIndexOffset: selected ? 1000 : 0,
            });

            const reviewNote = place.needs_review
                ? '<div style="color:#b45309;font-size:11px;margin-top:4px">⚠ Pin not confirmed</div>'
                : '';
            marker.bindPopup(
                `<div style="font-weight:600;margin-bottom:2px">${escapeHtml(place.name)}</div>`
                + `<div style="color:#6b7280;font-size:12px">${meta.icon} ${meta.label}</div>`
                + reviewNote,
            );
            marker.on('click', () => {
                if (selectModeRef.current) return;
                onSelectRef.current?.(place.id);
            });
            marker.addTo(layer);
        }
    }, [places, selectedId, selectedIds, routes.length, selectMode, ready]);

    /* Draw the selected day's route. */
    useEffect(() => {
        const L = leafletRef.current;
        const layer = routeLayerRef.current;
        if (!L || !layer) return;

        layer.clearLayers();

        for (const route of routes) {
            if (route.points.length >= 2) {
                L.polyline(route.points.map((p) => [p.lat, p.lng] as [number, number]), {
                    color: route.color,
                    weight: 3,
                    opacity: 0.75,
                    dashArray: '6 6',
                }).addTo(layer);
            }

            // Numbered badges carry the order, coloured per day so overlapping
            // itineraries stay tellable apart without clicking anything.
            route.points.forEach((point, index) => {
                L.marker([point.lat, point.lng], {
                    icon: L.divIcon({
                        className: 'honeymoon-route-step',
                        html: `<span style="
                            display:flex;align-items:center;justify-content:center;
                            width:22px;height:22px;background:${route.color};color:#fff;
                            border:2px solid #fff;border-radius:9999px;
                            font-size:11px;font-weight:700;line-height:1;
                            box-shadow:0 1px 4px rgba(0,0,0,.4);
                        ">${index + 1}</span>`,
                        iconSize: [22, 22],
                        iconAnchor: [11, 11],
                    }),
                    zIndexOffset: 2000,
                })
                    .bindPopup(
                        `<div style="font-weight:600">${escapeHtml(route.label)}</div>`
                        + `<div><strong>${index + 1}.</strong> ${escapeHtml(point.label)}</div>`,
                    )
                    .addTo(layer);
            });
        }

        /*
         * Travel legs, as curved dashed arcs.
         *
         * Curved on purpose. A straight line between two pins is exactly what a
         * day route looks like, and two legs between the same pair of airports
         * — out on the Monday, back on the Friday — would sit on top of each
         * other and read as one. The bow is always to the same side of the
         * direction of travel, so an outbound and a return separate themselves.
         */
        for (const leg of legs) {
            const points = arcPoints(leg.from, leg.to, leg.curve)
                .map((p) => [p.lat, p.lng] as [number, number]);
            const line = L.polyline(points, {
                color: leg.color,
                weight: 2.5,
                opacity: 0.9,
                dashArray: leg.dash,
                // Round caps make a sparse dash read as dots rather than ticks.
                lineCap: 'round',
            }).addTo(layer);
            line.bindPopup(`<div style="font-weight:600">${escapeHtml(leg.label)}</div>`);

            // The mode, at the top of the arc: the curve says "a journey", this
            // says which kind, without a legend to look up.
            const apex = points[Math.floor(points.length / 2)];
            if (apex) {
                L.marker(apex, {
                    icon: L.divIcon({
                        className: 'honeymoon-leg-mode',
                        html: `<span style="
                            display:flex;align-items:center;justify-content:center;
                            width:24px;height:24px;background:#fff;
                            border:2px solid ${leg.color};border-radius:9999px;
                            font-size:12px;line-height:1;
                            box-shadow:0 1px 4px rgba(0,0,0,.3);
                        ">${leg.icon}</span>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12],
                    }),
                    // Under the numbered day badges: which stop is third matters
                    // more than which mode got you there.
                    zIndexOffset: 1500,
                })
                    .bindPopup(`<div style="font-weight:600">${escapeHtml(leg.label)}</div>`)
                    .addTo(layer);
            }
        }
    }, [routes, legs, ready]);

    /**
     * Freehand lasso.
     *
     * Bound to the container rather than Leaflet's own mouse events so it works
     * with a finger as well as a mouse, and so the drag can be swallowed before
     * Leaflet's pan handler ever sees it.
     */
    useEffect(() => {
        const L = leafletRef.current;
        const map = mapRef.current;
        const container = containerRef.current;
        if (!L || !map || !container) return;

        if (!selectMode) {
            map.dragging.enable();
            return;
        }

        // Panning and lassoing are the same gesture; the lasso wins while armed.
        map.dragging.disable();

        let drawing = false;
        let additive = false;
        let points: LatLng[] = [];
        let line: LeafletNS.Polyline | null = null;

        const toLatLng = (event: PointerEvent): LatLng => {
            const rect = container.getBoundingClientRect();
            const p = map.containerPointToLatLng(
                L.point(event.clientX - rect.left, event.clientY - rect.top),
            );
            return { lat: p.lat, lng: p.lng };
        };

        const clear = () => {
            if (line) { line.remove(); line = null; }
            points = [];
            drawing = false;
        };

        const onDown = (event: PointerEvent) => {
            if (event.button != null && event.button !== 0) return;
            drawing = true;
            // Hold shift/ctrl to add to the current selection rather than replace it.
            additive = event.shiftKey || event.ctrlKey || event.metaKey;
            points = [toLatLng(event)];
            line = L.polyline([[points[0].lat, points[0].lng]], {
                color: '#0f172a', weight: 2, dashArray: '5 4',
            }).addTo(map);
            container.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        };

        const onMove = (event: PointerEvent) => {
            if (!drawing || !line) return;
            const next = toLatLng(event);
            const last = points[points.length - 1];
            // Thin the path: every pixel-level move would build a polygon of
            // thousands of vertices and make the containment test crawl.
            if (last && Math.abs(next.lat - last.lat) < 1e-5 && Math.abs(next.lng - last.lng) < 1e-5) return;
            points.push(next);
            line.addLatLng([next.lat, next.lng]);
            event.preventDefault();
        };

        const onUp = (event: PointerEvent) => {
            if (!drawing) return;
            container.releasePointerCapture?.(event.pointerId);
            const loop = points;
            clear();
            // A tap is not a lasso; ignore anything too small to be deliberate.
            if (loop.length < 3) return;
            onLassoRef.current?.(placesInPolygon(placesRef.current, loop), additive);
        };

        container.addEventListener('pointerdown', onDown);
        container.addEventListener('pointermove', onMove);
        container.addEventListener('pointerup', onUp);
        container.addEventListener('pointercancel', onUp);

        return () => {
            container.removeEventListener('pointerdown', onDown);
            container.removeEventListener('pointermove', onMove);
            container.removeEventListener('pointerup', onUp);
            container.removeEventListener('pointercancel', onUp);
            clear();
            map.dragging.enable();
        };
    }, [selectMode, ready]);

    /**
     * Frame the map — on arrival, and whenever the parent asks.
     *
     * Deliberately NOT tied to what is drawn. Re-fitting on every filter change
     * meant toggling a layer threw away the view you had lined up, which is
     * infuriating mid-task. The viewport belongs to whoever is panning it; the
     * parent bumps `fitSignal` on first load and when the fit button is pressed.
     */
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const asked = fitSignal !== lastSignalRef.current;
        const firstDraw = !fittedRef.current;
        if (!asked && !firstDraw) return;

        // A target, when the parent asked for one — a single day, say — and
        // otherwise everything currently drawn.
        const target = fitPointsRef.current;
        const points = target?.length
            ? target
            : places.filter(hasCoords).map((p) => ({ lat: p.lat, lng: p.lng }));
        const bounds = boundsOf(points);
        // Nothing to frame yet — stay unfitted so the first real data still fits.
        if (!bounds) return;

        lastSignalRef.current = fitSignal;
        fittedRef.current = true;

        // A frame or two of delay lets a freshly shown tab finish laying out;
        // fitting against a zero-height container produces a nonsense zoom.
        const timer = setTimeout(() => {
            map.invalidateSize();
            const options = { padding: [40, 40] as [number, number], maxZoom: 15 };
            if (firstDraw) {
                // Arriving at the page: be where you asked to be. Flying in from
                // a default view of the Java Sea is a second of animation nobody
                // asked for, every single time the tab is opened.
                map.fitBounds(bounds, options);
            } else {
                /*
                 * Asked for while the map is already somewhere: fly.
                 *
                 * flyToBounds interpolates zoom and centre together, which pulls
                 * back far enough to show both the old and new positions before
                 * settling — so jumping from one day to another reads as a move
                 * across the island rather than a cut to somewhere unrecognisable.
                 * That arc is the point, not decoration: it is what tells you
                 * *where* you just went.
                 */
                map.flyToBounds(bounds, { ...options, duration: 1.4, easeLinearity: 0.25 });
            }
        }, 60);
        return () => clearTimeout(timer);
    }, [places, fitSignal, ready]);

    // The container's className must NEVER depend on state. Leaflet adds its own
    // classes (leaflet-container, leaflet-touch, drag targets…) to this element
    // imperatively, and React rewrites the whole class attribute whenever the
    // prop changes — silently stripping them and leaving an unstyled, broken
    // map. Anything dynamic goes through inline style instead.
    return (
        <div
            ref={containerRef}
            className={`rounded-2xl overflow-hidden z-0 ${className}`}
            style={{ cursor: selectMode ? 'crosshair' : undefined }}
        />
    );
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
