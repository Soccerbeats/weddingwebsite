import { NextResponse } from 'next/server';
import { dayWeather, weatherLabel } from '@/lib/honeymoonFetch';
import { todayIso } from '@/lib/honeymoon';

/**
 * Weather for a batch of (place, date) pairs.
 *
 * Inside sixteen days that is a forecast; beyond it, the month's normals from a
 * decade of archive — which is the honest answer while planning and the one that
 * decides a beach day from a temple day.
 */
const MAX_POINTS = 30;

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const points: { lat?: unknown; lng?: unknown; date?: unknown; key?: unknown }[] =
            Array.isArray(body?.points) ? body.points.slice(0, MAX_POINTS) : [];
        if (!points.length) return NextResponse.json({ results: [] });
        const today = todayIso();

        const results = await Promise.all(points.map(async (point, index) => {
            const lat = Number(point.lat);
            const lng = Number(point.lng);
            const date = String(point.date ?? '');
            const id = typeof point.key === 'string' ? point.key : String(index);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)
                || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return { key: id, weather: null };
            }
            const weather = await dayWeather({ lat, lng }, date, today);
            return {
                key: id,
                weather: weather ? { ...weather, label: weatherLabel(weather.code) } : null,
            };
        }));

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Error fetching weather:', error);
        return NextResponse.json({ error: 'Could not fetch the weather' }, { status: 500 });
    }
}
