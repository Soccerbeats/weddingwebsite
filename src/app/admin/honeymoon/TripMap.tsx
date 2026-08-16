'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import type * as LeafletNS from 'leaflet';
import { boundsOf, categoryMeta, hasCoords, type Place } from '@/lib/honeymoon';

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

export interface TripMapProps {
    places: Place[];
    /** Ordered points to draw as a day's route, if a day is selected. */
    route?: { lat: number; lng: number; label: string }[];
    selectedId?: number | null;
    onSelect?: (id: number) => void;
    /** Bumped by the parent to force a re-fit after a filter change. */
    fitKey?: string;
    className?: string;
}

export default function TripMap({
    places, route = [], selectedId = null, onSelect, fitKey = '', className = '',
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

    /* Create the map once. */
    useEffect(() => {
        let cancelled = false;

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
        })();

        return () => {
            cancelled = true;
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

        const clustered = route.length === 0;
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
            const ring = place.needs_review
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
            marker.on('click', () => onSelectRef.current?.(place.id));
            marker.addTo(layer);
        }
    }, [places, selectedId, route.length, ready]);

    /* Draw the selected day's route. */
    useEffect(() => {
        const L = leafletRef.current;
        const layer = routeLayerRef.current;
        if (!L || !layer) return;

        layer.clearLayers();
        if (route.length < 2) return;

        L.polyline(route.map((p) => [p.lat, p.lng] as [number, number]), {
            color: '#0f172a',
            weight: 2,
            opacity: 0.65,
            dashArray: '6 6',
        }).addTo(layer);

        // Numbered badges make the order readable without opening a popup.
        route.forEach((point, index) => {
            L.marker([point.lat, point.lng], {
                icon: L.divIcon({
                    className: 'honeymoon-route-step',
                    html: `<span style="
                        display:flex;align-items:center;justify-content:center;
                        width:22px;height:22px;background:#0f172a;color:#fff;
                        border:2px solid #fff;border-radius:9999px;
                        font-size:11px;font-weight:700;line-height:1;
                        box-shadow:0 1px 4px rgba(0,0,0,.4);
                    ">${index + 1}</span>`,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11],
                }),
                zIndexOffset: 2000,
            }).bindPopup(`<strong>${index + 1}.</strong> ${escapeHtml(point.label)}`).addTo(layer);
        });
    }, [route, ready]);

    /**
     * Fit the view to whatever is currently showing.
     *
     * This is the behaviour the whole map was chosen for: all pins frames
     * Singapore and Bali together; filter to one day or one region and it zooms
     * itself to that island or that neighbourhood.
     */
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const points = route.length
            ? route.map((p) => ({ lat: p.lat, lng: p.lng }))
            : places.filter(hasCoords).map((p) => ({ lat: p.lat, lng: p.lng }));

        const bounds = boundsOf(points);
        if (!bounds) return;

        // A frame or two of delay lets a freshly shown tab finish laying out;
        // fitting against a zero-height container produces a nonsense zoom.
        const timer = setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        }, 60);
        return () => clearTimeout(timer);
    }, [places, route, fitKey, ready]);

    return <div ref={containerRef} className={`rounded-2xl overflow-hidden z-0 ${className}`} />;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
