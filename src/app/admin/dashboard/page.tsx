'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardData {
  siteConfig: any;
  countdown: { daysUntil: number | null };
  rsvp: { total: number; attending: number; declined: number; totalGuests: number };
  guestList: {
    totalInvited: number;
    totalPartySize: number;
    confirmed: number;
    declined: number;
    brideSide: number;
    groomSide: number;
    pending: number;
  };
  photos: { total: number; hearted: number };
  timeline: { milestones: number };
  recentRsvps: { guest_name: string; attending: boolean; number_of_guests: number; created_at: string }[];
  wipToggles: { page_label: string; is_wip: boolean }[];
}

function StatCard({
  label,
  value,
  sub,
  color = 'accent',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <span className="text-4xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-sm text-gray-500">{sub}</span>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm animate-pulse">Loading dashboard…</div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-red-500">Failed to load dashboard data.</div>;
  }

  const { siteConfig, countdown, rsvp, guestList, photos, timeline, recentRsvps, wipToggles } = data;

  const rsvpRate = guestList.totalInvited > 0
    ? Math.round(((guestList.confirmed + guestList.declined) / guestList.totalInvited) * 100)
    : 0;

  const attendingPct = (rsvp.attending + rsvp.declined) > 0
    ? Math.round((rsvp.attending / (rsvp.attending + rsvp.declined)) * 100)
    : 0;

  const wipOn = wipToggles.filter(t => t.is_wip);
  const wipOff = wipToggles.filter(t => !t.is_wip);

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* ── Hero card ──────────────────────────────────── */}
      <div
        className="rounded-3xl overflow-hidden shadow-lg relative text-white"
        style={{ background: 'linear-gradient(135deg, var(--accent-dark) 0%, var(--accent) 100%)' }}
      >
        <div className="p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest opacity-70 mb-1">Wedding Dashboard</p>
            <h1 className="text-4xl font-serif font-bold">
              {siteConfig.brideName || 'Bride'} &amp; {siteConfig.groomName || 'Groom'}
            </h1>
            <p className="mt-2 opacity-80 text-sm">
              {siteConfig.weddingDate || 'Date TBD'} &nbsp;·&nbsp; {siteConfig.weddingVenue || 'Venue TBD'}
            </p>
            {siteConfig.weddingLocation && (
              <p className="opacity-70 text-sm">{siteConfig.weddingLocation}</p>
            )}
          </div>
          <div className="text-center bg-white/15 rounded-2xl px-8 py-5 shrink-0">
            {countdown.daysUntil !== null && countdown.daysUntil >= 0 ? (
              <>
                <div className="text-6xl font-bold leading-none">{countdown.daysUntil}</div>
                <div className="text-sm font-semibold uppercase tracking-widest opacity-80 mt-1">
                  {countdown.daysUntil === 1 ? 'Day' : 'Days'} to Go
                </div>
              </>
            ) : countdown.daysUntil !== null && countdown.daysUntil < 0 ? (
              <>
                <div className="text-4xl font-bold leading-none">🎉</div>
                <div className="text-sm font-semibold uppercase tracking-widest opacity-80 mt-1">Married!</div>
              </>
            ) : (
              <div className="text-sm opacity-60">No date set</div>
            )}
          </div>
        </div>
      </div>

      {/* ── RSVP & Guest stats ─────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">RSVPs &amp; Guests</h2>
          <Link href="/admin/rsvps" className="text-sm text-accent hover:underline font-medium">Manage →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total RSVPs" value={rsvp.total} sub="responses received" />
          <StatCard label="Attending" value={rsvp.attending} sub={`${attendingPct}% of responses`} />
          <StatCard label="Declined" value={rsvp.declined} sub="can't make it" />
          <StatCard label="Total Guests" value={rsvp.totalGuests} sub="headcount confirmed" />
        </div>
      </section>

      {/* ── Guest List breakdown + RSVP rate ──────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Guest List</h2>
          <Link href="/admin/rsvps" className="text-sm text-accent hover:underline font-medium">View list →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* RSVP progress bar card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 col-span-1 sm:col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Response Rate</p>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-4xl font-bold text-gray-900">{rsvpRate}%</span>
              <span className="text-sm text-gray-500 mb-1">
                {guestList.confirmed + guestList.declined} of {guestList.totalInvited} responded
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full transition-all"
                style={{ width: `${rsvpRate}%`, background: 'var(--accent)' }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{guestList.pending} pending</span>
              <span>{guestList.totalInvited} invited</span>
            </div>
          </div>

          {/* Bride / Groom sides */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">By Side</p>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Bride's side</span>
                  <span className="font-bold text-gray-900">{guestList.brideSide}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-pink-400"
                    style={{ width: guestList.totalInvited ? `${(guestList.brideSide / guestList.totalInvited) * 100}%` : '0%' }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Groom's side</span>
                  <span className="font-bold text-gray-900">{guestList.groomSide}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-blue-400"
                    style={{ width: guestList.totalInvited ? `${(guestList.groomSide / guestList.totalInvited) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">{guestList.totalPartySize} total incl. party sizes</p>
          </div>

          {/* Confirmed / Declined / Pending breakdown */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Status Breakdown</p>
            <div className="space-y-2">
              {[
                { label: 'Confirmed', value: guestList.confirmed, color: 'bg-green-400' },
                { label: 'Declined', value: guestList.declined, color: 'bg-red-400' },
                { label: 'Pending', value: guestList.pending, color: 'bg-yellow-400' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.color}`} />
                  <span className="text-sm text-gray-600 flex-1">{item.label}</span>
                  <span className="text-sm font-bold text-gray-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Recent RSVPs ────────────────────────────────── */}
      {recentRsvps.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Recent RSVPs</h2>
            <Link href="/admin/rsvps" className="text-sm text-accent hover:underline font-medium">View all →</Link>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Guest</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Guests</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentRsvps.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.guest_name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        r.attending
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {r.attending ? '✓ Attending' : '✗ Declined'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{r.number_of_guests}</td>
                    <td className="px-5 py-3 text-gray-400">
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Content & Site row ──────────────────────────── */}
      <section>
        <h2 className="text-lg font-bold text-gray-800 mb-4">Content &amp; Site</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link href="/admin/photos">
            <StatCard label="Photos Uploaded" value={photos.total} sub={`${photos.hearted} featured ♥`} />
          </Link>
          <Link href="/admin/timeline">
            <StatCard label="Timeline Events" value={timeline.milestones} sub="story milestones" />
          </Link>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Pages Live</span>
            <span className="text-4xl font-bold text-gray-900">{wipOff.length}</span>
            <span className="text-sm text-gray-500">
              {wipOn.length > 0 ? `${wipOn.length} still WIP` : 'All pages live!'}
            </span>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Venue</span>
            <span className="text-xl font-bold text-gray-900 leading-tight mt-1">
              {siteConfig.weddingVenue || '—'}
            </span>
            {siteConfig.weddingTime && (
              <span className="text-sm text-gray-500">{siteConfig.weddingTime}</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Page status ─────────────────────────────────── */}
      {wipToggles.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Page Status</h2>
            <Link href="/admin/wip-control" className="text-sm text-accent hover:underline font-medium">Manage →</Link>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {wipToggles.map(t => (
                <div key={t.page_label} className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.is_wip ? 'bg-yellow-400' : 'bg-green-400'}`} />
                  <span className="text-sm text-gray-700">{t.page_label}</span>
                  <span className={`ml-auto text-xs font-semibold ${t.is_wip ? 'text-yellow-600' : 'text-green-600'}`}>
                    {t.is_wip ? 'WIP' : 'Live'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

    </div>
  );
}
