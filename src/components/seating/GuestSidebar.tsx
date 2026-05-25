'use client';

import { useState, useMemo } from 'react';
import { GuestListEntry } from './types';

interface GuestSidebarProps {
  guests: GuestListEntry[];
  onDragGuest: (guest: GuestListEntry) => void;
  onAssignGuest: (guestId: number, tableId: number, seatIndex: number) => void;
  splitPartyGuestIds: Set<number>;
}

export default function GuestSidebar({
  guests,
  onDragGuest,
  splitPartyGuestIds,
}: GuestSidebarProps) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'unassigned' | 'all'>('unassigned');
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [filterSide, setFilterSide] = useState<string>('all');
  const [filterRsvp, setFilterRsvp] = useState<string>('all');
  const [filterInvited, setFilterInvited] = useState<string>('all');
  const [filterPartySize, setFilterPartySize] = useState<string>('all');

  // Collect unique rsvp statuses
  const rsvpStatuses = useMemo(() => {
    const set = new Set<string>();
    guests.forEach(g => { if (g.rsvp_status) set.add(g.rsvp_status); });
    return Array.from(set).sort();
  }, [guests]);

  const activeFilterCount = [
    filterSide !== 'all',
    filterRsvp !== 'all',
    filterInvited !== 'all',
    filterPartySize !== 'all',
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    let list = guests;
    if (tab === 'unassigned') list = list.filter(g => !g.assigned_seat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        g => g.guest_name.toLowerCase().includes(q) || g.plus_one_name?.toLowerCase().includes(q)
      );
    }
    if (filterSide !== 'all') list = list.filter(g => (g.side ?? 'unspecified') === filterSide);
    if (filterRsvp !== 'all') {
      if (filterRsvp === 'none') list = list.filter(g => !g.rsvp_status);
      else list = list.filter(g => g.rsvp_status === filterRsvp);
    }
    if (filterInvited !== 'all') list = list.filter(g => String(g.invited) === filterInvited);
    if (filterPartySize !== 'all') {
      if (filterPartySize === '1') list = list.filter(g => g.party_size === 1);
      else if (filterPartySize === '2') list = list.filter(g => g.party_size === 2);
      else if (filterPartySize === '3+') list = list.filter(g => g.party_size >= 3);
    }
    return list;
  }, [guests, tab, search, filterSide, filterRsvp, filterInvited, filterPartySize]);

  const unassignedCount = guests.filter(g => !g.assigned_seat).length;
  const totalCount = guests.length;

  const clearFilters = () => {
    setFilterSide('all');
    setFilterRsvp('all');
    setFilterInvited('all');
    setFilterPartySize('all');
  };

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">Guests</h2>
          <div className="flex gap-1.5 text-xs">
            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {unassignedCount} unassigned
            </span>
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {totalCount} total
            </span>
          </div>
        </div>

        {/* Search + filter toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
              placeholder="Search guests..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`relative px-2.5 py-1.5 rounded-md border text-sm transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-indigo-50 border-indigo-300 text-indigo-600'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
            title="Filters"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">Filters</span>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-indigo-500 hover:underline">
                  Clear all
                </button>
              )}
            </div>

            {/* Side */}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Side</label>
              <select
                className="mt-0.5 w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white outline-none"
                value={filterSide}
                onChange={e => setFilterSide(e.target.value)}
              >
                <option value="all">All sides</option>
                <option value="bride">Bride</option>
                <option value="groom">Groom</option>
                <option value="unspecified">Unspecified</option>
              </select>
            </div>

            {/* RSVP Status */}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">RSVP Status</label>
              <select
                className="mt-0.5 w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white outline-none"
                value={filterRsvp}
                onChange={e => setFilterRsvp(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="none">No RSVP</option>
                {rsvpStatuses.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Invited */}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Invited</label>
              <select
                className="mt-0.5 w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white outline-none"
                value={filterInvited}
                onChange={e => setFilterInvited(e.target.value)}
              >
                <option value="all">All</option>
                <option value="true">Invited</option>
                <option value="false">Not invited</option>
              </select>
            </div>

            {/* Party Size */}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Party Size</label>
              <select
                className="mt-0.5 w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white outline-none"
                value={filterPartySize}
                onChange={e => setFilterPartySize(e.target.value)}
              >
                <option value="all">Any size</option>
                <option value="1">Solo (1)</option>
                <option value="2">Pair (2)</option>
                <option value="3+">Group (3+)</option>
              </select>
            </div>
          </div>
        )}

        {/* Tab toggle */}
        <div className="flex mt-3 bg-gray-100 rounded-md p-0.5">
          <button
            className={`flex-1 text-xs py-1 rounded transition-colors font-medium ${
              tab === 'unassigned' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('unassigned')}
          >
            Unassigned
          </button>
          <button
            className={`flex-1 text-xs py-1 rounded transition-colors font-medium ${
              tab === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('all')}
          >
            All
          </button>
        </div>
      </div>

      {/* Guest list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 text-xs py-8">
            {search || activeFilterCount > 0 ? 'No guests match.' : 'No guests to show.'}
          </div>
        )}

        {filtered.map(guest => {
          const isSplit = splitPartyGuestIds.has(guest.id);
          const isAssigned = !!guest.assigned_seat;
          const isLikely = guest.rsvp_status === 'likely_not_coming';

          return (
            <div
              key={guest.id}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('guestId', String(guest.id));
                onDragGuest(guest);
              }}
              className={`group flex flex-col gap-0.5 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all select-none
                ${isLikely
                  ? 'bg-orange-50 border-orange-200 hover:border-orange-300'
                  : isAssigned
                    ? 'bg-green-50 border-green-200 hover:border-green-300'
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <svg className="text-gray-300 group-hover:text-gray-400 shrink-0 transition-colors" width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                    <circle cx="3" cy="2" r="1.5" /><circle cx="3" cy="7" r="1.5" /><circle cx="3" cy="12" r="1.5" />
                    <circle cx="7" cy="2" r="1.5" /><circle cx="7" cy="7" r="1.5" /><circle cx="7" cy="12" r="1.5" />
                  </svg>
                  <span className={`text-sm font-medium truncate ${isLikely ? 'text-orange-700' : 'text-gray-800'}`}>{guest.guest_name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {guest.side && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium border ${
                      guest.side === 'bride' ? 'bg-pink-50 text-pink-600 border-pink-200' : 'bg-blue-50 text-blue-600 border-blue-200'
                    }`}>{guest.side}</span>
                  )}
                  {guest.party_size > 1 && (
                    <span className={`text-xs border rounded-full px-1.5 py-0.5 font-medium ${
                      isLikely ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-blue-50 text-blue-600 border-blue-200'
                    }`}>
                      {guest.party_size}
                    </span>
                  )}
                  {isSplit && (
                    <span title="Party is split across tables" className="text-yellow-500 text-sm">⚠</span>
                  )}
                </div>
              </div>

              {guest.plus_one_name && (
                <div className={`text-xs pl-4 truncate ${isLikely ? 'text-orange-400' : 'text-gray-500'}`}>+1 {guest.plus_one_name}</div>
              )}

              {isLikely && (
                <div className="text-[10px] text-orange-500 pl-4 font-medium">Likely not coming</div>
              )}

              {isAssigned && guest.assigned_seat && (
                <div className={`text-xs pl-4 truncate ${isLikely ? 'text-orange-500' : 'text-green-600'}`}>
                  {guest.assigned_seat.table_name}, Seat {guest.assigned_seat.seat_index + 1}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
