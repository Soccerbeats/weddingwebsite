'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as LeafletNS from 'leaflet';
import { categoryMeta } from '@/lib/honeymoon';

/**
 * Single-pin preview map for the place editor.
 *
 * Separate from TripMap on purpose: that one exists to frame a whole set of
 * pins and owns its own viewport via fitBounds, while this one is a confirmation
 * aid for exactly one coordinate. Sharing them would mean bolting a "but not
 * when there's only one" mode onto every effect in TripMap.
 *
 * The marker is draggable and the map is click-to-move, because the common case
 * after a geocode is "right street, wrong side of it" — nudging beats going back
 * to Google Maps for coordinates.
 */
export default function PinMap({ lat, lng, category, onChange }: {
    lat: number;
    lng: number;
    category: string;
    onChange: (lat: number, lng: number) => void;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<LeafletNS.Map | null>(null);
    const markerRef = useRef<LeafletNS.Marker | null>(null);
    const leafletRef = useRef<typeof LeafletNS | null>(null);
    const [ready, setReady] = useState(false);

    // Held in a ref so the drag/click handlers always see the latest callback
    // without needing to be rebound.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    /* Create the map once. */
    useEffect(() => {
        let cancelled = false;
        let observer: ResizeObserver | null = null;
        const timers: ReturnType<typeof setTimeout>[] = [];

        (async () => {
            const L = (await import('leaflet')).default;
            if (cancelled || !containerRef.current || mapRef.current) return;

            leafletRef.current = L;
            const map = L.map(containerRef.current, {
                center: [lat, lng],
                zoom: 15,
                // The editor lives in a scrollable modal; wheel-zoom here would
                // swallow the scroll whenever the cursor crossed the map.
                scrollWheelZoom: false,
                zoomControl: true,
            });

            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap',
            }).addTo(map);

            map.on('click', (e: LeafletNS.LeafletMouseEvent) => {
                onChangeRef.current(
                    Number(e.latlng.lat.toFixed(6)),
                    Number(e.latlng.lng.toFixed(6)),
                );
            });

            mapRef.current = map;
            setReady(true);

            // The modal is often still animating/sizing when this mounts, which
            // otherwise leaves grey tiles until something forces a resize.
            //
            // The handles are kept so cleanup can cancel them: closing the modal
            // removes the map, and a deferred invalidateSize() landing after
            // that runs against detached panes and throws on `_leaflet_pos`.
            timers.push(setTimeout(() => map.invalidateSize(), 60));
            timers.push(setTimeout(() => map.invalidateSize(), 300));

            // Fixed timers only cover the open animation. The modal also reflows
            // later — pasting a link fills the name and address and pushes the
            // layout around — and a map sized before that reflow renders half a
            // screen of grey tiles. Watching the box covers every case.
            if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
                observer = new ResizeObserver(() => map.invalidateSize());
                observer.observe(containerRef.current);
            }
        })();

        return () => {
            cancelled = true;
            for (const t of timers) clearTimeout(t);
            observer?.disconnect();
            const map = mapRef.current;
            if (map) {
                // stop() first: closing the modal unmounts this mid-pan, and
                // Leaflet's animation frame then fires against torn-down panes
                // and throws on `_leaflet_pos`.
                map.stop();
                map.off();
                map.remove();
            }
            mapRef.current = null;
            markerRef.current = null;
            setReady(false);
        };
        // Deliberately mount-only: lat/lng changes move the existing marker in
        // the effect below rather than tearing the map down and rebuilding it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Keep the marker and viewport in step with the current coordinate. */
    useEffect(() => {
        const L = leafletRef.current;
        const map = mapRef.current;
        if (!L || !map) return;

        const meta = categoryMeta(category);
        const icon = L.divIcon({
            className: 'honeymoon-pin-preview',
            html: `<span style="
                display:block;width:22px;height:22px;border-radius:9999px;
                background:${meta.color};border:3px solid #fff;
                box-shadow:0 1px 5px rgba(0,0,0,.45);
            "></span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
        });

        if (!markerRef.current) {
            const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
            marker.on('dragend', () => {
                const p = marker.getLatLng();
                onChangeRef.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
            });
            markerRef.current = marker;
        } else {
            markerRef.current.setIcon(icon);
            markerRef.current.setLatLng([lat, lng]);
        }

        // Pan rather than jump when the pin moves a short way (a drag), but
        // recentre outright when it lands somewhere else entirely (a new search
        // result), which panning would animate across half the world.
        //
        // Guarded on the container still being in the document: this effect can
        // run on the same tick the modal closes, and an animated move against a
        // detached map throws inside Leaflet's animation frame.
        if (!map.getContainer().isConnected) return;
        const current = map.getCenter();
        const far = Math.abs(current.lat - lat) > 0.05 || Math.abs(current.lng - lng) > 0.05;
        if (far) map.setView([lat, lng], 15, { animate: false });
        else map.panTo([lat, lng]);
    }, [lat, lng, category, ready]);

    return (
        <div
            ref={containerRef}
            className="h-52 w-full rounded-2xl overflow-hidden border border-gray-200 z-0"
        />
    );
}
