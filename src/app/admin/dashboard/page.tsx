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
    likelyNotComing: number;
  };
  photos: { total: number; hearted: number };
  timeline: { milestones: number };
  recentRsvps: { guest_name: string; attending: boolean; number_of_guests: number; created_at: string }[];
  wipToggles: { page_label: string; is_wip: boolean; is_hidden: boolean }[];
  seating: {
    tables: number;
    totalSeats: number;
    assignedSeats: number;
    tableList: { name: string; seat_count: number; assigned: number; table_type: string; x: number; y: number; rotation: number }[];
  };
}

const gs = 'var(--font-geist-sans), Arial, sans-serif';

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
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400" style={{ fontFamily: gs }}>
          {title}
        </h2>
        {action && (
          <Link href={action.href} className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)', fontFamily: gs }}>
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
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400" style={{ fontFamily: gs }}>{label}</span>
      <span className="text-3xl font-bold leading-none" style={{ fontFamily: gs, color: valueColor || '#111827' }}>{value}</span>
      {sub && <span className="text-xs text-gray-400 mt-0.5" style={{ fontFamily: gs }}>{sub}</span>}
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

type TableItem = { name: string; seat_count: number; assigned: number; table_type: string; x: number; y: number; rotation: number };

function SeatingOverviewCard({ seating }: {
  seating: { tables: number; totalSeats: number; assignedSeats: number; tableList: TableItem[] };
}) {
  if (seating.tables === 0) {
    return (
      <GroupCard title="Seating Overview">
        <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
          <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          <p className="text-sm text-gray-400" style={{ fontFamily: gs }}>No tables set up yet.</p>
          <Link href="/admin/seating" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)', fontFamily: gs }}>
            Set Up Seating Chart
          </Link>
        </div>
      </GroupCard>
    );
  }

  // Compute bounding box of all tables to scale them into the preview canvas
  const PAD = 40;
  const xs = seating.tableList.map(t => t.x);
  const ys = seating.tableList.map(t => t.y);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const maxY = Math.max(...ys) + PAD;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const CANVAS_W = 320;
  const CANVAS_H = 180;
  const scaleX = CANVAS_W / rangeX;
  const scaleY = CANVAS_H / rangeY;
  const scale = Math.min(scaleX, scaleY);

  const fillPct = seating.totalSeats > 0 ? Math.round((seating.assignedSeats / seating.totalSeats) * 100) : 0;

  return (
    <GroupCard title="Seating Overview">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Tables" value={seating.tables} />
        <Stat label="Total Seats" value={seating.totalSeats} />
        <Stat
          label="Filled"
          value={`${fillPct}%`}
          sub={`${seating.assignedSeats} of ${seating.totalSeats}`}
          valueColor={fillPct === 100 ? '#16a34a' : '#111827'}
        />
      </div>

      {/* Overall fill bar */}
      <div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className="h-2 rounded-full transition-all" style={{ width: `${fillPct}%`, background: 'var(--accent)' }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1" style={{ fontFamily: gs }}>
          <span>{seating.totalSeats - seating.assignedSeats} seats open</span>
          <span>{seating.assignedSeats} assigned</span>
        </div>
      </div>

      {/* Floor plan graphic */}
      <div className="rounded-xl overflow-hidden bg-gray-50 border border-gray-100" style={{ height: CANVAS_H + 'px', position: 'relative' }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} preserveAspectRatio="xMidYMid meet">
          {seating.tableList.map((t, i) => {
            const cx = (t.x - minX) * scale;
            const cy = (t.y - minY) * scale;
            const r = Math.max(10, Math.min(22, scale * 20));
            const isCircle = t.table_type !== 'rectangular';
            const filledRatio = t.seat_count > 0 ? t.assigned / t.seat_count : 0;
            const fillColor = filledRatio === 1 ? '#86efac' : filledRatio > 0.5 ? '#fde68a' : filledRatio > 0 ? '#fed7aa' : '#e5e7eb';
            const strokeColor = filledRatio === 1 ? '#16a34a' : '#9ca3af';
            const textSize = Math.max(5, Math.min(8, r * 0.45));

            return (
              <g key={i} transform={`translate(${cx},${cy})`}>
                {isCircle ? (
                  <circle r={r} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
                ) : (
                  <rect
                    x={-r * 1.4} y={-r * 0.85}
                    width={r * 2.8} height={r * 1.7}
                    rx="4" fill={fillColor} stroke={strokeColor} strokeWidth="1.5"
                    transform={`rotate(${t.rotation})`}
                  />
                )}
                <text
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={textSize} fill="#374151" fontWeight="600"
                  style={{ fontFamily: gs, pointerEvents: 'none' }}
                >
                  {t.name.length > 8 ? t.name.slice(0, 7) + '…' : t.name}
                </text>
                <text
                  textAnchor="middle" dominantBaseline="middle" y={textSize + 2}
                  fontSize={textSize * 0.85} fill="#6b7280"
                  style={{ fontFamily: gs, pointerEvents: 'none' }}
                >
                  {t.assigned}/{t.seat_count}
                </text>
              </g>
            );
          })}
        </svg>
        {/* Legend */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {[['#86efac','Full'],['#fde68a','>50%'],['#fed7aa','<50%'],['#e5e7eb','Empty']].map(([color, label]) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full border border-gray-300" style={{ background: color }} />
              <span className="text-xs text-gray-400" style={{ fontFamily: gs }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA button */}
      <Link
        href="/admin/seating"
        className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: 'var(--accent)', fontFamily: gs }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
        </svg>
        Edit Seating Chart
      </Link>
    </GroupCard>
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
        <div className="text-gray-400 text-sm animate-pulse" style={{ fontFamily: gs }}>Loading dashboard…</div>
      </div>
    );
  }

  if (!data) return <div className="text-red-500">Failed to load dashboard data.</div>;

  const { siteConfig, countdown, rsvp, guestList, photos, timeline, recentRsvps, wipToggles, seating } = data;
  const faqs: { question: string; answer: string }[] = siteConfig.faqs || [];

  const rsvpRate = guestList.totalInvited > 0
    ? Math.round(((guestList.confirmed + guestList.declined) / guestList.totalInvited) * 100)
    : 0;
  const attendingPct = (rsvp.attending + rsvp.declined) > 0
    ? Math.round((rsvp.attending / (rsvp.attending + rsvp.declined)) * 100)
    : 0;
  const likelyNotComing = guestList.likelyNotComing;

  const wipOn = wipToggles.filter(t => t.is_wip && !t.is_hidden);
  const wipOff = wipToggles.filter(t => !t.is_wip && !t.is_hidden);
  const wipHidden = wipToggles.filter(t => t.is_hidden);

  const heroImageUrl = siteConfig.homeHero ? `/api/photos/${siteConfig.homeHero}` : null;

  return (
    <div className="space-y-6" style={{ fontFamily: gs }}>

      {/* ── Row 1: Hero ─────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden shadow-md text-white relative"
        style={
          heroImageUrl
            ? { backgroundImage: `url(${heroImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }
        }
      >
        {/* Dark overlay so text stays readable over the photo */}
        {heroImageUrl && (
          <div className="absolute inset-0 bg-black/45 rounded-2xl" />
        )}
        <div className="relative px-8 py-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-2" style={{ fontFamily: gs }}>
              Wedding Dashboard
            </p>
            <h1 className="text-5xl leading-tight" style={{ fontFamily: 'var(--font-script), cursive', fontWeight: 400 }}>
              {siteConfig.brideName || 'Bride'} &amp; {siteConfig.groomName || 'Groom'}
            </h1>
            <p className="mt-2 opacity-75 text-sm" style={{ fontFamily: gs }}>
              {siteConfig.weddingDate || 'Date TBD'}
              {siteConfig.weddingVenue ? ` · ${siteConfig.weddingVenue}` : ''}
            </p>
            {siteConfig.weddingLocation && (
              <p className="opacity-60 text-sm" style={{ fontFamily: gs }}>{siteConfig.weddingLocation}</p>
            )}
          </div>
          <div className="text-center bg-white/15 backdrop-blur-sm rounded-2xl px-10 py-5 shrink-0">
            {countdown.daysUntil !== null && countdown.daysUntil >= 0 ? (
              <>
                <div className="text-6xl font-bold leading-none" style={{ fontFamily: gs }}>{countdown.daysUntil}</div>
                <div className="text-xs font-semibold uppercase tracking-widest opacity-75 mt-1" style={{ fontFamily: gs }}>
                  {countdown.daysUntil === 1 ? 'Day' : 'Days'} to Go
                </div>
              </>
            ) : countdown.daysUntil !== null ? (
              <>
                <div className="text-4xl leading-none">🎉</div>
                <div className="text-xs font-semibold uppercase tracking-widest opacity-75 mt-1" style={{ fontFamily: gs }}>Married!</div>
              </>
            ) : (
              <div className="text-sm opacity-60" style={{ fontFamily: gs }}>No date set</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: RSVPs · Guest List · Content ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Card 1 — RSVPs & Guests */}
        <GroupCard title="RSVPs & Guests" action={{ label: 'Manage', href: '/admin/rsvps' }}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat label="Total RSVPs" value={rsvp.total} sub="responses received" />
            <Stat label="Attending" value={rsvp.attending} sub={`${attendingPct}% of responses`} valueColor="#16a34a" />
            <Stat label="Declined" value={rsvp.declined} sub="can't make it" valueColor="#dc2626" />
            <Stat label="Headcount" value={rsvp.totalGuests} sub="guests confirmed" />
            <Stat label="Likely Not Coming" value={likelyNotComing} sub="marked in guest list" valueColor="#d97706" />
          </div>
          <div className="border-t border-gray-100" />
          {recentRsvps.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3" style={{ fontFamily: gs }}>Recent</p>
              <div className="space-y-2">
                {recentRsvps.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate" style={{ fontFamily: gs }}>{r.guest_name}</span>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${r.attending ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`} style={{ fontFamily: gs }}>
                      {r.attending ? '✓ Going' : '✗ No'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400" style={{ fontFamily: gs }}>No RSVPs yet.</p>
          )}
        </GroupCard>

        {/* Card 2 — Guest List */}
        <GroupCard title="Guest List" action={{ label: 'View list', href: '/admin/rsvps' }}>
          <div>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-bold text-gray-900 leading-none" style={{ fontFamily: gs }}>{rsvpRate}%</span>
              <span className="text-xs text-gray-400 mb-0.5" style={{ fontFamily: gs }}>response rate</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full transition-all" style={{ width: `${rsvpRate}%`, background: 'var(--accent)' }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1" style={{ fontFamily: gs }}>
              <span>{guestList.pending} pending</span>
              <span>{guestList.totalInvited} invited</span>
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3" style={{ fontFamily: gs }}>Status</p>
            <div className="space-y-2">
              {[
                { label: 'Confirmed', value: guestList.confirmed, color: 'bg-green-400' },
                { label: 'Declined', value: guestList.declined, color: 'bg-red-400' },
                { label: 'Pending', value: guestList.pending, color: 'bg-yellow-400' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${item.color}`} />
                  <span className="text-sm text-gray-600 flex-1" style={{ fontFamily: gs }}>{item.label}</span>
                  <span className="text-sm font-bold text-gray-900" style={{ fontFamily: gs }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3" style={{ fontFamily: gs }}>By Side</p>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600" style={{ fontFamily: gs }}>Bride's side</span>
                  <span className="font-bold text-gray-900" style={{ fontFamily: gs }}>{guestList.brideSide}</span>
                </div>
                <Bar pct={guestList.totalInvited ? (guestList.brideSide / guestList.totalInvited) * 100 : 0} color="bg-pink-400" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600" style={{ fontFamily: gs }}>Groom's side</span>
                  <span className="font-bold text-gray-900" style={{ fontFamily: gs }}>{guestList.groomSide}</span>
                </div>
                <Bar pct={guestList.totalInvited ? (guestList.groomSide / guestList.totalInvited) * 100 : 0} color="bg-blue-400" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2" style={{ fontFamily: gs }}>{guestList.totalPartySize} total incl. party sizes</p>
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
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400" style={{ fontFamily: gs }}>Venue</span>
              <span className="text-sm font-bold text-gray-900 leading-snug mt-0.5" style={{ fontFamily: gs }}>{siteConfig.weddingVenue || '—'}</span>
              {siteConfig.weddingTime && <span className="text-xs text-gray-400" style={{ fontFamily: gs }}>{siteConfig.weddingTime}</span>}
            </div>
          </div>
        </GroupCard>

      </div>

      {/* ── Row 3: Left col (Links & Info + Seating) · Right col (Q&A) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Left column — stacked */}
        <div className="flex flex-col gap-6">

          {/* Links & Info (quick links + page status) */}
          <GroupCard title="Links & Info">
            {/* Quick link tiles */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  href: '/admin/photos',
                  label: 'Photos',
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zM3.75 6.75h16.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75V7.5a.75.75 0 01.75-.75z" />
                    </svg>
                  ),
                },
                {
                  href: '/admin/seating',
                  label: 'Seating Chart',
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                  ),
                },
                {
                  href: '/admin/registry',
                  label: 'Registry',
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                  ),
                },
              ].map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-gray-100 bg-gray-50 hover:bg-accent/5 hover:border-accent/30 transition-all group"
                >
                  <span className="text-gray-400 group-hover:text-accent transition-colors">{icon}</span>
                  <span className="text-xs font-semibold text-gray-600 group-hover:text-accent transition-colors text-center" style={{ fontFamily: gs }}>
                    {label}
                  </span>
                </Link>
              ))}
            </div>

            {/* Page Status inside Links & Info */}
            {wipToggles.length > 0 && (
              <>
                <div className="border-t border-gray-100" />
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400" style={{ fontFamily: gs }}>Page Status</p>
                    <Link href="/admin/wip-control" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)', fontFamily: gs }}>Manage →</Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {wipToggles.map(t => {
                      const isHidden = t.is_hidden;
                      const isWip = t.is_wip && !isHidden;
                      return (
                        <div key={t.page_label} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isHidden ? 'bg-gray-400' : isWip ? 'bg-yellow-400' : 'bg-green-400'}`} />
                          <span className="text-sm text-gray-700 flex-1 truncate" style={{ fontFamily: gs }}>{t.page_label}</span>
                          <span className={`text-xs font-semibold ${isHidden ? 'text-gray-500' : isWip ? 'text-yellow-600' : 'text-green-600'}`} style={{ fontFamily: gs }}>
                            {isHidden ? 'Hidden' : isWip ? 'WIP' : 'Live'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </GroupCard>

          {/* Seating Overview */}
          <SeatingOverviewCard seating={seating} />

        </div>{/* end left column */}

        {/* Right column — Q&A at a Glance (full height) */}
        <GroupCard title="Q&A at a Glance" action={{ label: 'Edit', href: '/admin/faqs' }}>
          {faqs.length > 0 ? (
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div key={i} className={i > 0 ? 'pt-4 border-t border-gray-100' : ''}>
                  <p className="text-sm font-semibold text-gray-800 mb-1" style={{ fontFamily: gs }}>{faq.question}</p>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-3" style={{ fontFamily: gs }}>{faq.answer}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400" style={{ fontFamily: gs }}>No Q&amp;A added yet.</p>
          )}
        </GroupCard>

      </div>

    </div>
  );
}
