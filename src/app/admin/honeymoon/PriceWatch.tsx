'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, Card, TextArea } from './ui';

/**
 * The bookmarklet, and the box you paste its answer into.
 *
 * Booking.com serves a challenge page to a server-side fetch — which is why the
 * "get photos" button already fails on some listings — so a price watcher cannot
 * poll from here. The registry's Target import solved the same problem the same
 * way: the browser you are already browsing in does the reading.
 *
 * Run the bookmarklet on a listing (or on several tabs in turn) and it copies a
 * line per page. Paste them here and each is matched to a stay by its link, the
 * price is recorded against today, and the change since last time is shown.
 */
const BOOKMARKLET = `javascript:(function(){
var sel=['[data-testid="price-and-discounted-price"]','[data-testid="price"]','.prco-valign-middle-helper','._1p7iugi','[data-section-id="BOOK_IT_SIDEBAR"] span','[class*="price"]'];
var t='';for(var i=0;i<sel.length&&!t;i++){var e=document.querySelector(sel[i]);if(e&&e.textContent)t=e.textContent.trim();}
if(!t){t=prompt('Could not find a price on this page. Type it in?','')||'';}
if(!t)return;
var line=location.href+'\\t'+t.replace(/\\s+/g,' ');
navigator.clipboard.writeText(line).then(function(){alert('Copied:\\n'+line+'\\n\\nPaste it into the honeymoon portal.');},function(){prompt('Copy this line:',line);});
})();`.replace(/\n/g, '');

export default function PriceWatch({ api }: { api: HoneymoonApi }) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [showHow, setShowHow] = useState(false);

    const record = async () => {
        const entries = text.split('\n').map((line) => {
            const [url, price] = line.split('\t');
            return { url: (url ?? '').trim(), price: (price ?? '').trim() };
        }).filter((entry) => entry.url);
        if (!entries.length) return;

        setBusy(true);
        setResult(null);
        try {
            const res = await fetch('/api/admin/honeymoon/price-checks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { setResult(body.error ?? 'Could not record those.'); return; }
            await api.refresh();
            const moved = (body.recorded ?? []).filter(
                (row: { change: number | null }) => row.change != null && row.change !== 0,
            );
            setResult([
                `Recorded ${body.recorded?.length ?? 0}.`,
                moved.length
                    ? moved.map((row: { name: string; change: number }) => (
                        `${row.name} ${row.change > 0 ? 'up' : 'down'} ${Math.abs(row.change)}`
                    )).join(', ')
                    : 'No changes since last time.',
                body.unmatched?.length
                    ? `${body.unmatched.length} link${body.unmatched.length === 1 ? '' : 's'} matched no stay.`
                    : '',
            ].filter(Boolean).join(' '));
            setText('');
        } finally {
            setBusy(false);
        }
    };

    const history = api.data?.price_checks ?? [];
    const latest = history.filter((_, index, all) => (
        all.findIndex((row) => row.place_id === all[index].place_id) === index
    ));

    return (
        <Card className="space-y-2 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Watch the prices</h3>
                <button
                    onClick={() => setShowHow((v) => !v)}
                    className="text-[11px] text-gray-500 underline decoration-dotted"
                >
                    {showHow ? 'Hide' : 'How this works'}
                </button>
            </div>

            {showHow && (
                <div className="space-y-2 rounded-2xl bg-gray-50 p-3">
                    <p className="text-xs text-gray-600">
                        Drag this to your bookmarks bar (or right-click → bookmark the link):
                    </p>
                    {/* A javascript: href is the whole point — this is a
                        bookmarklet, not navigation. */}
                    <a
                        href={BOOKMARKLET}
                        onClick={(e) => e.preventDefault()}
                        className="inline-block cursor-grab rounded-full bg-gray-900 px-4 py-2
                            text-xs font-semibold text-white"
                    >
                        💰 Grab this price
                    </a>
                    <ol className="list-inside list-decimal space-y-0.5 text-xs text-gray-600">
                        <li>Open a stay&apos;s booking page with your dates and guests set</li>
                        <li>Click the bookmark — it copies the URL and the price</li>
                        <li>Paste it below (several lines at once is fine)</li>
                    </ol>
                    <p className="text-[11px] text-gray-400">
                        A shortlist sits for weeks and prices move; this is how you find out without
                        opening six tabs and trying to remember what they said last time.
                    </p>
                </div>
            )}

            <TextArea
                rows={2}
                value={text}
                placeholder="https://www.booking.com/hotel/…	US$420"
                onChange={(e) => setText(e.target.value)}
                className="font-mono text-[11px]"
            />
            <div className="flex items-center gap-2">
                <Button tone="primary" onClick={record} disabled={!text.trim() || busy}>
                    {busy ? 'Recording…' : 'Record prices'}
                </Button>
                {result && <span className="text-[11px] text-gray-600">{result}</span>}
            </div>

            {latest.length > 0 && (
                <ul className="space-y-1 border-t border-gray-100 pt-2">
                    {latest.slice(0, 6).map((row) => {
                        const place = api.placeById.get(row.place_id);
                        const previous = history.find(
                            (other) => other.place_id === row.place_id && other !== row,
                        );
                        const change = row.amount != null && previous?.amount != null
                            ? row.amount - previous.amount
                            : null;
                        return (
                            <li
                                key={`${row.place_id}-${row.checked_at}`}
                                className="flex items-baseline gap-2 text-xs"
                            >
                                <span className="min-w-0 flex-1 truncate text-gray-700">
                                    {place?.name ?? 'A stay'}
                                </span>
                                <span className="shrink-0 tabular-nums text-gray-500">
                                    {row.price_note ?? row.amount ?? '—'}
                                </span>
                                {change != null && change !== 0 && (
                                    <span className={`shrink-0 tabular-nums ${change > 0
                                        ? 'text-rose-700' : 'text-emerald-700'}`}>
                                        {change > 0 ? '↑' : '↓'} {Math.abs(Math.round(change))}
                                    </span>
                                )}
                                <span className="shrink-0 text-[10px] text-gray-400">
                                    {row.checked_at ? formatDate(row.checked_at.slice(0, 10)) : ''}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}
