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
  wipToggles: { page_label: string; is_wip: boolean; is_hidden: boolean }[];
}

function GroupCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
        <h2
          className="text-xs font-semibold uppercase tracking-widest text-gray-400"
          style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif', letterSpacing: '0.1em' }}
        >
          {title}
        </h2>
        {action && (
          <Link href={action.href} className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
            {action.label} →
          </Link>
        )}
      </div>
      <div className="p-6 flex-1 flex flex-col gap-5">{children}</div>
    </div>
  );
}

function Stat({ label, value, sub, valueColor }: { label: string; value: string | number; sub?: string; valueColor?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-xs font-semibold uppercase tracking-widest text-gray-400"
        style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
      >
        {label}
      </span>
      <span
        className="text-3xl font-bold leading-none"
        style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif', color: valueColor || '#111827' }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="text-xs text-gray-400 mt-0.5"
          style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
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
        <div className="text-gray-400 text-sm animate-pulse" style={{ fontFamily: 'var(--font-geist-sans)' }}>
          Loading dashboard…
        </div>
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

  // "Likely not coming" = invited guests who never submitted an RSVP
  const likelyNotComing = guestList.pending;

  const wipOn = wipToggles.filter(t => t.is_wip && !t.is_hidden);
  const wipOff = wipToggles.filter(t => !t.is_wip && !t.is_hidden);
  const wipHidden = wipToggles.filter(t => t.is_hidden);

  return (
    <div className="space-y-6" style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}>

      {/* ── Row 1: Hero ───────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden shadow-md text-white"
        style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
      >
        <div className="px-8 py-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-2"
              style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
            >
              Wedding Dashboard
            </p>
            <h1
              className="text-5xl leading-tight"
              style={{ fontFamily: 'var(--font-script), cursive', fontWeight: 400 }}
            >
              {siteConfig.brideName || 'Bride'} &amp; {siteConfig.groomName || 'Groom'}
            </h1>
            <p
              className="mt-2 opacity-75 text-sm"
              style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
            >
              {siteConfig.weddingDate || 'Date TBD'}
              {siteConfig.weddingVenue ? ` · ${siteConfig.weddingVenue}` : ''}
            </p>
            {siteConfig.weddingLocation && (
              <p
                className="opacity-60 text-sm"
                style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
              >
                {siteConfig.weddingLocation}
              </p>
            )}
          </div>
          <div className="text-center bg-white/15 rounded-2xl px-10 py-5 shrink-0">
            {countdown.daysUntil !== null && countdown.daysUntil >= 0 ? (
              <>
                <div
                  className="text-6xl font-bold leading-none"
                  style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                >
                  {countdown.daysUntil}
                </div>
                <div
                  className="text-xs font-semibold uppercase tracking-widest opacity-75 mt-1"
                  style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                >
                  {countdown.daysUntil === 1 ? 'Day' : 'Days'} to Go
                </div>
              </>
            ) : countdown.daysUntil !== null ? (
              <>
                <div className="text-4xl leading-none">🎉</div>
                <div
                  className="text-xs font-semibold uppercase tracking-widest opacity-75 mt-1"
                  style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                >
                  Married!
                </div>
              </>
            ) : (
              <div
                className="text-sm opacity-60"
                style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
              >
                No date set
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: three group cards ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Card 1 — RSVPs & Guests */}
        <GroupCard title="RSVPs & Guests" action={{ label: 'Manage', href: '/admin/rsvps' }}>
          {/* 2×3 stat grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat label="Total RSVPs" value={rsvp.total} sub="responses received" />
            <Stat label="Attending" value={rsvp.attending} sub={`${attendingPct}% of responses`} valueColor="#16a34a" />
            <Stat label="Declined" value={rsvp.declined} sub="can't make it" valueColor="#dc2626" />
            <Stat label="Headcount" value={rsvp.totalGuests} sub="guests confirmed" />
            <Stat
              label="Likely Not Coming"
              value={likelyNotComing}
              sub="no response yet"
              valueColor="#d97706"
            />
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Recent RSVPs mini-list */}
          {recentRsvps.length > 0 ? (
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3"
                style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
              >
                Recent
              </p>
              <div className="space-y-2">
                {recentRsvps.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span
                      className="text-sm font-medium text-gray-800 truncate"
                      style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                    >
                      {r.guest_name}
                    </span>
                    <span
                      className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.attending ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}
                      style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                    >
                      {r.attending ? '✓ Going' : '✗ No'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p
              className="text-sm text-gray-400"
              style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
            >
              No RSVPs yet.
            </p>
          )}
        </GroupCard>

        {/* Card 2 — Guest List */}
        <GroupCard title="Guest List" action={{ label: 'View list', href: '/admin/rsvps' }}>
          {/* Response rate */}
          <div>
            <div className="flex items-end gap-2 mb-2">
              <span
                className="text-3xl font-bold text-gray-900 leading-none"
                style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
              >
                {rsvpRate}%
              </span>
              <span
                className="text-xs text-gray-400 mb-0.5"
                style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
              >
                response rate
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full transition-all"
                style={{ width: `${rsvpRate}%`, background: 'var(--accent)' }}
              />
            </div>
            <div
              className="flex justify-between text-xs text-gray-400 mt-1"
              style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
            >
              <span>{guestList.pending} pending</span>
              <span>{guestList.totalInvited} invited</span>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Status breakdown */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3"
              style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
            >
              Status
            </p>
            <div className="space-y-2">
              {[
                { label: 'Confirmed', value: guestList.confirmed, color: 'bg-green-400' },
                { label: 'Declined', value: guestList.declined, color: 'bg-red-400' },
                { label: 'Pending', value: guestList.pending, color: 'bg-yellow-400' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${item.color}`} />
                  <span
                    className="text-sm text-gray-600 flex-1"
                    style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                  >
                    {item.label}
                  </span>
                  <span
                    className="text-sm font-bold text-gray-900"
                    style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* By side */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3"
              style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
            >
              By Side
            </p>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span
                    className="text-gray-600"
                    style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                  >
                    Bride's side
                  </span>
                  <span
                    className="font-bold text-gray-900"
                    style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                  >
                    {guestList.brideSide}
                  </span>
                </div>
                <Bar pct={guestList.totalInvited ? (guestList.brideSide / guestList.totalInvited) * 100 : 0} color="bg-pink-400" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span
                    className="text-gray-600"
                    style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                  >
                    Groom's side
                  </span>
                  <span
                    className="font-bold text-gray-900"
                    style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                  >
                    {guestList.groomSide}
                  </span>
                </div>
                <Bar pct={guestList.totalInvited ? (guestList.groomSide / guestList.totalInvited) * 100 : 0} color="bg-blue-400" />
              </div>
            </div>
            <p
              className="text-xs text-gray-400 mt-2"
              style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
            >
              {guestList.totalPartySize} total incl. party sizes
            </p>
          </div>
        </GroupCard>

        {/* Card 3 — Content & Insights */}
        <GroupCard title="Content & Insights">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Link href="/admin/photos" className="hover:opacity-75 transition-opacity">
              <Stat label="Photos" value={photos.total} sub={`${photos.hearted} featured ♥`} />
            </Link>
            <Link href="/admin/timeline" className="hover:opacity-75 transition-opacity">
              <Stat label="Timeline" value={timeline.milestones} sub="milestones" />
            </Link>
            <Stat
              label="Pages Live"
              value={wipOff.length}
              sub={wipOn.length > 0 ? `${wipOn.length} WIP · ${wipHidden.length} hidden` : wipHidden.length > 0 ? `${wipHidden.length} hidden` : 'All live!'}
              valueColor="#16a34a"
            />
            <div className="flex flex-col gap-0.5">
              <span
                className="text-xs font-semibold uppercase tracking-widest text-gray-400"
                style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
              >
                Venue
              </span>
              <span
                className="text-sm font-bold text-gray-900 leading-snug mt-0.5"
                style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
              >
                {siteConfig.weddingVenue || '—'}
              </span>
              {siteConfig.weddingTime && (
                <span
                  className="text-xs text-gray-400"
                  style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                >
                  {siteConfig.weddingTime}
                </span>
              )}
            </div>
          </div>
        </GroupCard>

      </div>

      {/* ── Row 3: Page Status ────────────────────────────────────── */}
      {wipToggles.length > 0 && (
        <GroupCard title="Page Status" action={{ label: 'Manage', href: '/admin/wip-control' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {wipToggles.map(t => {
              const isHidden = t.is_hidden;
              const isWip = t.is_wip && !isHidden;
              const isLive = !t.is_wip && !isHidden;
              return (
                <div key={t.page_label} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    isHidden ? 'bg-gray-400' : isWip ? 'bg-yellow-400' : 'bg-green-400'
                  }`} />
                  <span
                    className="text-sm text-gray-700 flex-1 truncate"
                    style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                  >
                    {t.page_label}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      isHidden ? 'text-gray-500' : isWip ? 'text-yellow-600' : 'text-green-600'
                    }`}
                    style={{ fontFamily: 'var(--font-geist-sans), Arial, sans-serif' }}
                  >
                    {isHidden ? 'Hidden' : isWip ? 'WIP' : 'Live'}
                  </span>
                </div>
              );
            })}
          </div>
        </GroupCard>
      )}

    </div>
  );
}
