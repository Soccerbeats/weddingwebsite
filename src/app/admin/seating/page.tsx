'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  Node,
  ReactFlowProvider,
  useReactFlow,
  OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TableNode from '@/components/seating/TableNode';
import GuestSidebar from '@/components/seating/GuestSidebar';
import AddTableModal from '@/components/seating/AddTableModal';
import RoomEditor, { RoomShape, Vertex } from '@/components/seating/RoomEditor';
import SeatingListView from '@/components/seating/SeatingListView';
import { SeatingTableData, GuestListEntry, FloorPlan, OffListRsvp, SeatTransferPayload, ColorMode } from '@/components/seating/types';
import { buildPartySeats, headcount, splitPartyGroupIds as computeSplitParties } from '@/lib/seating';

const nodeTypes = { tableNode: TableNode };

// ─── Inner canvas (needs useReactFlow) ──────────────────────────────────────

function SeatingCanvas({
  floorPlan,
  tables,
  guests,
  room,
  fullscreen,
  onRefresh,
  onRoomChange,
  onAddTable,
  onToggleFullscreen,
}: {
  floorPlan: FloorPlan | null;
  tables: SeatingTableData[];
  guests: GuestListEntry[];
  room: RoomShape | null;
  fullscreen: boolean;
  onRefresh: () => void;
  onRoomChange: (room: RoomShape | null) => void;
  onAddTable: () => void;
  onToggleFullscreen: () => void;
}) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>('party');
  const [roomWidth, setRoomWidth] = useState(floorPlan?.room_width ?? '');
  const [roomHeight, setRoomHeight] = useState(floorPlan?.room_height ?? '');
  const [roomEditMode, setRoomEditMode] = useState(false);
  // The guest list is 288px of a 390px phone, which leaves no room to look at.
  // So on a phone the canvas starts full width and the list is a drawer over it;
  // on a desktop it starts open, as it always has. Either way the toggle is the
  // user's. Decided after mount — the server has no viewport.
  const [showGuests, setShowGuests] = useState(true);
  const [localRoom, setLocalRoom] = useState<RoomShape | null>(room);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const dragGuestRef = useRef<GuestListEntry | null>(null);

  // Sync local room when prop changes
  React.useEffect(() => { setLocalRoom(room); }, [room]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) setShowGuests(false);
  }, []);

  // The room editor's legend promises "Press Esc to exit".
  useEffect(() => {
    if (!roomEditMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRoomEditMode(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roomEditMode]);

  // Which parties sit at more than one table — shared with the list view so the
  // two never disagree about what "split" means.
  const splitPartyGroupIds = useCallback(
    (): Set<number> => computeSplitParties(tables),
    [tables],
  );

  // Build guest sidebar data: compute assigned_seat for each guest
  const guestsWithAssignment = useCallback((): GuestListEntry[] => {
    const assignmentMap = new Map<number, { table_name: string; seat_index: number }>();
    for (const table of tables) {
      for (const seat of table.seats) {
        if (seat.guest_list_id !== null) {
          assignmentMap.set(seat.guest_list_id, {
            table_name: table.name,
            seat_index: seat.seat_index,
          });
        }
      }
    }
    return guests.map(g => ({
      ...g,
      assigned_seat: assignmentMap.get(g.id) ?? null,
    }));
  }, [tables, guests]);

  // Drop a guest (and their whole party) onto a table
  const handleDropGuest = useCallback(async (tableId: number, guestIdStr: string) => {
    const guestId = parseInt(guestIdStr);
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;

    // Already assigned to this table? No-op.
    const table = tables.find(t => t.id === tableId);
    if (!table) return;
    const alreadyHere = table.seats.some(s => s.party_group_id === guestId);
    if (alreadyHere) return;

    // Who takes a chair, and which chair, is decided in one place —
    // src/lib/seating.ts — so the canvas and the list agree. It skips anyone who
    // answered "not attending" and seats everyone else in the party.
    const payload = buildPartySeats(guest, tableId, table.seats.map(s => s.seat_index));

    await fetch('/api/admin/seating/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    onRefresh();
  }, [guests, tables, onRefresh]);

  // Free one chair. The whole-party removal below is still a click away (Alt-click
  // the ×), but removing one person no longer takes their party with them.
  const handleUnassignSeat = useCallback(async (tableId: number, seatIndex: number) => {
    await fetch('/api/admin/seating/assign', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seating_table_id: tableId, seat_index: seatIndex }),
    });
    onRefresh();
  }, [onRefresh]);

  const handleUnassignParty = useCallback(async (tableId: number, partyGroupId: number) => {
    await fetch('/api/admin/seating/assign', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seating_table_id: tableId, party_group_id: partyGroupId }),
    });
    onRefresh();
  }, [onRefresh]);

  // Reorder seats within a table: re-assigns seat_index values to match the new order
  const handleReorderSeats = useCallback(async (
    tableId: number,
    ordered: { seat_index: number; display_name: string; guest_list_id: number | null; party_group_id: number | null }[]
  ) => {
    // One request, one transaction: the table's seat list is replaced in
    // place, so a network failure can never leave it empty.
    const seats = ordered.map((seat, newIndex) => ({
      seating_table_id: tableId,
      seat_index: newIndex,
      guest_list_id: seat.guest_list_id,
      display_name: seat.display_name,
      party_group_id: seat.party_group_id,
    }));

    await fetch('/api/admin/seating/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seating_table_id: tableId, replace: true, seats }),
    });
    onRefresh();
  }, [onRefresh]);

  // Move a single seat chip to a different table
  const handleMoveSeat = useCallback(async (
    payload: SeatTransferPayload,
    toTableId: number
  ) => {
    const toTable = tables.find(t => t.id === toTableId);
    if (!toTable) return;

    // Remove from old table (single seat)
    await fetch('/api/admin/seating/assign', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seating_table_id: payload.fromTableId, seat_index: payload.seatIndex }),
    });

    // Find next available index at target table
    const usedIndices = new Set(toTable.seats.map(s => s.seat_index));
    let newIndex = 0;
    while (usedIndices.has(newIndex)) newIndex++;

    // Insert at new table
    await fetch('/api/admin/seating/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seating_table_id: toTableId,
        seat_index: newIndex,
        guest_list_id: payload.guestListId,
        display_name: payload.displayName,
        party_group_id: payload.partyGroupId,
      }),
    });
    onRefresh();
  }, [tables, onRefresh]);

  const handleDeleteTable = useCallback(async (tableId: number) => {
    await fetch(`/api/admin/seating/tables/${tableId}`, { method: 'DELETE' });
    onRefresh();
  }, [onRefresh]);

  const handleRenameTable = useCallback(async (tableId: number, name: string) => {
    await fetch(`/api/admin/seating/tables/${tableId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    onRefresh();
  }, [onRefresh]);

  const handleNodeDragStop: OnNodeDrag = useCallback(async (_event: React.MouseEvent, node: Node) => {
    await fetch(`/api/admin/seating/tables/${node.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: node.position.x, y: node.position.y }),
    });
  }, []);

  // Handle drag from sidebar → drop onto canvas (drop on a seat slot)
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Seat drops are handled by the SeatSlot click → pendingAssign flow
    // This handles accidental drops on the canvas bg (no-op)
  }, []);

  const handleSaveRoomSettings = useCallback(async () => {
    await fetch('/api/admin/seating/floor-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_width: roomWidth ? Number(roomWidth) : null,
        room_height: roomHeight ? Number(roomHeight) : null,
      }),
    });
    setShowRoomSettings(false);
    onRefresh();
  }, [roomWidth, roomHeight, onRefresh]);

  // Node sync effect
  useEffect(() => {
    const split = splitPartyGroupIds();
    const newNodes: Node[] = tables.map(table => ({
      id: String(table.id),
      type: 'tableNode',
      position: { x: table.x, y: table.y },
      data: {
        table,
        colorMode,
        onDropGuest: handleDropGuest,
        onMoveSeat: handleMoveSeat,
        onReorderSeats: handleReorderSeats,
        onUnassignParty: handleUnassignParty,
        onUnassignSeat: handleUnassignSeat,
        onDeleteTable: handleDeleteTable,
        onRenameTable: handleRenameTable,
        splitPartyGroupIds: split,
      },
      draggable: true,
    }));
    setNodes(newNodes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, guests, colorMode]);

  /** The canvas just changed size; put the room back in view rather than
   *  leaving it half off-screen. */
  const refit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 120);
  }, [fitView]);

  // Entering or leaving full screen resizes the canvas by the width of the admin
  // nav and the height of the page header, which would otherwise leave the room
  // sitting off in a corner.
  useEffect(() => { refit(); }, [fullscreen, refit]);

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden">
      {/* Guest sidebar — a column beside the canvas on a desktop; on a phone a
          drawer over the canvas, deliberately starting *below* the toolbar so the
          button that opened it is still there to close it. As a flex sibling at
          full width it pushed the toolbar off-screen and there was no way back. */}
      {showGuests && (
        <GuestSidebar
          guests={guestsWithAssignment()}
          onDragGuest={g => { dragGuestRef.current = g; }}
          onAssignGuest={() => {}}
          splitPartyGuestIds={splitPartyGroupIds()}
        />
      )}

      {/* Canvas area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        {/* Scrolls sideways rather than overflowing the page on a phone; the
            Guests toggle is first, so it is the one thing always in view. */}
        <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-2 px-4 shrink-0 overflow-x-auto [&>*]:shrink-0 [&_button]:whitespace-nowrap">
          {/* First in the row so it is reachable however narrow the toolbar gets:
              on a phone this is the difference between a usable diagram and a
              100px sliver beside the guest list. */}
          <button
            onClick={() => { setShowGuests(v => !v); refit(); }}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${
              showGuests
                ? 'bg-gray-100 text-gray-700 border-gray-300'
                : 'text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
            title={showGuests ? 'Hide the guest list' : 'Show the guest list'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {showGuests ? 'Hide guests' : 'Guests'}
          </button>

          {/* Second in the row, beside the other view control: the toolbar
              scrolls sideways on a phone, so these two stay reachable together.
              While full screen this is the only way back other than Esc, so it
              is never hidden behind an overflow menu. */}
          <button
            onClick={onToggleFullscreen}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${
              fullscreen
                ? 'bg-gray-100 text-gray-700 border-gray-300'
                : 'text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
            title={fullscreen ? 'Exit full screen (Esc)' : 'Give the diagram the whole screen'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {fullscreen ? (
                <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" />
              ) : (
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
              )}
            </svg>
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </button>

          <button
            onClick={onAddTable}
            className="flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Table
          </button>
          <button
            onClick={() => setShowRoomSettings(true)}
            className="flex items-center gap-1.5 text-gray-600 text-sm font-medium px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            Room Settings
          </button>

          {!localRoom ? (
            <button
              onClick={async () => {
                // Spawn default square centered in view
                const size = 400;
                const ox = 100, oy = 100;
                const verts: Vertex[] = [
                  { x: ox, y: oy },
                  { x: ox + size, y: oy },
                  { x: ox + size, y: oy + size },
                  { x: ox, y: oy + size },
                ];
                const res = await fetch('/api/admin/seating/room', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ vertices: verts }),
                });
                const data = await res.json();
                if (data.room) {
                  onRoomChange(data.room);
                  setRoomEditMode(true);
                }
              }}
              className="flex items-center gap-1.5 text-gray-600 text-sm font-medium px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              Draw Room
            </button>
          ) : (
            <>
              <button
                onClick={() => setRoomEditMode(v => !v)}
                className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${
                  roomEditMode
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                {roomEditMode ? 'Done Editing Room' : 'Edit Room'}
              </button>
              <button
                onClick={async () => {
                  if (!confirm('Delete the room outline?')) return;
                  await fetch('/api/admin/seating/room', { method: 'DELETE' });
                  onRoomChange(null);
                  setRoomEditMode(false);
                }}
                className="flex items-center gap-1.5 text-red-500 text-sm font-medium px-3 py-1.5 rounded-md border border-red-200 hover:bg-red-50 transition-colors"
              >
                Delete Room
              </button>
            </>
          )}

          <div className="ml-auto flex items-center gap-4">
            {/* Color mode toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-medium">
              <button
                onClick={() => setColorMode('party')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  colorMode === 'party' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Party view
              </button>
              <button
                onClick={() => setColorMode('rsvp')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  colorMode === 'rsvp' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                RSVP view
              </button>
            </div>

            {/* Legend */}
            <div className="hidden md:flex items-center gap-3 text-xs text-gray-400">
              {colorMode === 'party' ? (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-green-200 border border-green-400 inline-block" />
                    Party together
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-yellow-200 border border-yellow-400 inline-block" />
                    Party split
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-green-200 border border-green-400 inline-block" />
                    Coming
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-red-200 border border-red-400 inline-block" />
                    Declined
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-white border border-gray-300 inline-block" />
                    No RSVP
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-orange-200 border border-orange-400 inline-block" />
                    Likely not coming
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* React Flow canvas — outer is relative flex-1, inner is absolute inset-0.
            This gives ReactFlow explicit pixel dimensions at render time (required
            for correct MiniMap positioning and fitView calculations). */}
        <div className="flex-1 relative min-h-0">
          <div
            ref={canvasContainerRef}
            className="absolute inset-0"
            onDrop={handleCanvasDrop}
            onDragOver={e => e.preventDefault()}
          >
          {/* Room shape editor — rendered BEFORE ReactFlow so it stays behind nodes */}
          <RoomEditor
            room={localRoom}
            active={roomEditMode}
            containerRef={canvasContainerRef}
            onRoomChange={verts => {
              if (localRoom) setLocalRoom({ ...localRoom, vertices: verts });
            }}
            onSave={async verts => {
              const res = await fetch('/api/admin/seating/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vertices: verts }),
              });
              const data = await res.json();
              if (data.room) onRoomChange(data.room);
            }}
            onDelete={async () => {
              await fetch('/api/admin/seating/room', { method: 'DELETE' });
              onRoomChange(null);
              setRoomEditMode(false);
            }}
          />

          <ReactFlow
            nodes={nodes}
            edges={[]}
            onNodesChange={onNodesChange}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={nodeTypes}
            nodesDraggable={!roomEditMode}
            panOnDrag={!roomEditMode}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            snapToGrid
            snapGrid={[20, 20]}
            deleteKeyCode={null}
          >
            <Background color="#e5e7eb" gap={24} size={1} />
            <Controls />
            {/* A quarter of a phone screen for a map of a map; the point of
                hiding the guest list was to get that space back. */}
            <MiniMap
              className="!hidden md:!block"
              nodeColor={() => '#e5e7eb'}
              maskColor="rgba(255,255,255,0.6)"
            />
          </ReactFlow>
          </div>
        </div>
      </div>

      {/* Room Settings Modal */}
      {showRoomSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Room Dimensions</h3>
            <p className="text-sm text-gray-500 mb-4">
              Optional. Sets the bounding box of the canvas to match your venue.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Width (feet)</label>
                <input
                  type="number"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-400"
                  placeholder="e.g. 80"
                  value={roomWidth}
                  onChange={e => setRoomWidth(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Height (feet)</label>
                <input
                  type="number"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-400"
                  placeholder="e.g. 60"
                  value={roomHeight}
                  onChange={e => setRoomHeight(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSaveRoomSettings}
                className="flex-1 text-sm font-medium text-white py-2 rounded-md"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Save
              </button>
              <button
                onClick={() => setShowRoomSettings(false)}
                className="flex-1 text-sm font-medium text-gray-600 py-2 rounded-md border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Outer page (data fetching) ──────────────────────────────────────────────

export default function SeatingPage() {
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [tables, setTables] = useState<SeatingTableData[]>([]);
  const [guests, setGuests] = useState<GuestListEntry[]>([]);
  const [offListRsvps, setOffListRsvps] = useState<OffListRsvp[]>([]);
  const [room, setRoom] = useState<RoomShape | null>(null);
  const [loading, setLoading] = useState(true);
  // The canvas is the room; the list is the roster. Both edit the same plan, so
  // the switch lives here and the modal that adds a table is shared.
  const [view, setView] = useState<'canvas' | 'list'>('canvas');
  const [showAddModal, setShowAddModal] = useState(false);
  // Full screen hands back the site nav and the admin sidebar by way of a class
  // on <html> — the same mechanism the honeymoon map uses, and the reason it is
  // a class and not an overlay: the site nav is `position: fixed` outside the
  // admin tree, so covering it is a z-index argument you have to keep winning.
  // The native Fullscreen API goes on top of that where the browser allows it,
  // taking the browser's own chrome too; iOS Safari refuses it on anything but a
  // <video>, so it is a bonus that is allowed to fail, never the mechanism.
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('admin-fullscreen', fullscreen);
    // Also on unmount: navigating away with the class still set would leave the
    // whole admin panel with no sidebar and nothing on screen to explain why.
    return () => root.classList.remove('admin-fullscreen');
  }, [fullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const next = !fullscreen;
    setFullscreen(next);
    try {
      if (next) {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // The browser said no. The class has already handed back the nav and the
      // sidebar, which is the part that matters.
    }
  }, [fullscreen]);

  // Leaving native full screen by any route this button does not own — Esc, F11,
  // the browser's own control — has to put the chrome back too.
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Escape leaves it, the way it leaves anything else that took the screen. Not
  // while a dialog is up — Escape belongs to whatever is on top — and not while
  // the browser is in native full screen, where the handler above answers.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.fullscreenElement) return;
      if (document.querySelector('[role="dialog"]')) return;
      setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const refresh = useCallback(async () => {
    const [fpRes, guestRes, roomRes] = await Promise.all([
      fetch('/api/admin/seating/floor-plan'),
      fetch('/api/admin/guest-list'),
      fetch('/api/admin/seating/room'),
    ]);
    const fpData = await fpRes.json();
    const guestData = await guestRes.json();
    const roomData = await roomRes.json();

    setFloorPlan(fpData.floorPlan ?? null);
    setTables(fpData.tables ?? []);
    setOffListRsvps(fpData.offListRsvps ?? []);
    setRoom(roomData.room ?? null);
    setGuests(
      (guestData.guests ?? guestData ?? []).map((g: GuestListEntry) => ({
        id: g.id,
        guest_name: g.guest_name,
        plus_one_name: g.plus_one_name ?? null,
        party_members: g.party_members ?? [],
        party_size: g.party_size ?? 1,
        side: g.side ?? null,
        rsvp_status: g.rsvp_status ?? null,
        invited: g.invited ?? true,
        rsvp_guests: g.rsvp_guests ?? null,
      }))
    );
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);

  // On a phone the canvas is a pan-and-zoom surface on a 400px screen, which is
  // no way to seat anyone — so the list is what opens there. Decided once, after
  // mount (the server has no viewport, and guessing one is a hydration
  // mismatch), and only as a default: the switch is still the user's.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia('(max-width: 768px)').matches) setView('list');
  }, []);

  const handleAddTable = useCallback(async (opts: { name: string; table_type: string }) => {
    if (!floorPlan) return;
    await fetch('/api/admin/seating/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        floor_plan_id: floorPlan.id,
        name: opts.name,
        table_type: opts.table_type,
        seat_count: 0,
        x: 200 + Math.random() * 400,
        y: 200 + Math.random() * 300,
      }),
    });
    setShowAddModal(false);
    refresh();
  }, [floorPlan, refresh]);

  // Households, chairs filled and people expected are three different numbers.
  // The header used to show only `guests.length` and call it "guests", so a
  // chart seating 102 people read as 100 — the count of households.
  const counts = headcount(tables, guests, offListRsvps);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400 text-sm">Loading seating chart…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Hidden while full screen: the canvas toolbar already carries the way
          back out, and the point of the button was the vertical space. */}
      <div className={`px-8 py-4 bg-white border-b border-gray-200 shrink-0 items-center gap-4 ${fullscreen ? 'hidden' : 'flex'}`}>
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-800">Seating Chart</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tables.length} table{tables.length !== 1 ? 's' : ''} · {counts.parties} part{counts.parties === 1 ? 'y' : 'ies'} ·{' '}
            <span className={counts.seated === counts.expected ? undefined : 'text-amber-600 font-medium'}>
              {counts.seated} of {counts.expected} guests seated
            </span>
            {counts.offList > 0 && (
              <span
                className="text-amber-600 font-medium"
                title="They answered the RSVP form under a name the guest list does not have, so they cannot be seated until they are added. The list view names them."
              >
                {' '}· {counts.offList} not on the guest list
              </span>
            )}
          </p>
        </div>

        <div className="ml-auto flex bg-gray-100 rounded-full p-0.5 text-xs font-medium">
          {(['canvas', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-full transition-colors ${
                view === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v === 'canvas' ? 'Canvas' : 'List'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {view === 'canvas' ? (
          <ReactFlowProvider>
            <SeatingCanvas
              floorPlan={floorPlan}
              tables={tables}
              guests={guests}
              room={room}
              fullscreen={fullscreen}
              onRefresh={refresh}
              onRoomChange={setRoom}
              onAddTable={() => setShowAddModal(true)}
              onToggleFullscreen={toggleFullscreen}
            />
          </ReactFlowProvider>
        ) : (
          <SeatingListView
            tables={tables}
            guests={guests}
            offListRsvps={offListRsvps}
            onRefresh={refresh}
            onAddTable={() => setShowAddModal(true)}
          />
        )}
      </div>

      {showAddModal && (
        <AddTableModal
          defaultName={`Table ${tables.length + 1}`}
          onAdd={handleAddTable}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
