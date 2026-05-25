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
import { SeatingTableData, GuestListEntry, FloorPlan, SeatTransferPayload, ColorMode } from '@/components/seating/types';

const nodeTypes = { tableNode: TableNode };

// ─── Inner canvas (needs useReactFlow) ──────────────────────────────────────

function SeatingCanvas({
  floorPlan,
  tables,
  guests,
  room,
  onRefresh,
  onRoomChange,
}: {
  floorPlan: FloorPlan | null;
  tables: SeatingTableData[];
  guests: GuestListEntry[];
  room: RoomShape | null;
  onRefresh: () => void;
  onRoomChange: (room: RoomShape | null) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>('party');
  const [roomWidth, setRoomWidth] = useState(floorPlan?.room_width ?? '');
  const [roomHeight, setRoomHeight] = useState(floorPlan?.room_height ?? '');
  const [roomEditMode, setRoomEditMode] = useState(false);
  const [localRoom, setLocalRoom] = useState<RoomShape | null>(room);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const dragGuestRef = useRef<GuestListEntry | null>(null);

  // Sync local room when prop changes
  React.useEffect(() => { setLocalRoom(room); }, [room]);

  // Compute split party group IDs using party_group_id
  const splitPartyGroupIds = useCallback((): Set<number> => {
    const split = new Set<number>();
    // Map party_group_id → set of table IDs it appears in
    const partyTableMap = new Map<number, Set<number>>();
    for (const table of tables) {
      for (const seat of table.seats) {
        if (seat.party_group_id !== null) {
          if (!partyTableMap.has(seat.party_group_id)) partyTableMap.set(seat.party_group_id, new Set());
          partyTableMap.get(seat.party_group_id)!.add(table.id);
        }
      }
    }
    for (const [groupId, tableIds] of partyTableMap) {
      if (tableIds.size > 1) split.add(groupId);
    }
    return split;
  }, [tables]);

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

    // Next available seat index at this table
    const usedIndices = new Set(table.seats.map(s => s.seat_index));
    const nextIndex = () => {
      let i = 0;
      while (usedIndices.has(i)) i++;
      usedIndices.add(i);
      return i;
    };

    const payload = [];

    // Primary guest
    payload.push({
      seating_table_id: tableId,
      seat_index: nextIndex(),
      guest_list_id: guest.id,
      display_name: guest.guest_name,
      party_group_id: guest.id,
    });

    // Plus one (by name)
    if (guest.plus_one_name) {
      payload.push({
        seating_table_id: tableId,
        seat_index: nextIndex(),
        guest_list_id: null,
        display_name: guest.plus_one_name,
        party_group_id: guest.id,
      });
    }

    // Additional party members beyond primary + plus_one
    const extraCount = (guest.party_size ?? 1) - (guest.plus_one_name ? 2 : 1);
    for (let i = 0; i < extraCount; i++) {
      payload.push({
        seating_table_id: tableId,
        seat_index: nextIndex(),
        guest_list_id: null,
        display_name: `${guest.guest_name.split(' ')[0]}'s guest ${i + 1}`,
        party_group_id: guest.id,
      });
    }

    await fetch('/api/admin/seating/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    onRefresh();
  }, [guests, tables, onRefresh]);

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
    // Delete all existing seats for this table then re-insert with new indices
    // We send the ordered list as a bulk re-assign: delete old, insert new
    await fetch('/api/admin/seating/assign', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seating_table_id: tableId, delete_all: true }),
    });

    const payload = ordered.map((seat, newIndex) => ({
      seating_table_id: tableId,
      seat_index: newIndex,
      guest_list_id: seat.guest_list_id,
      display_name: seat.display_name,
      party_group_id: seat.party_group_id,
    }));

    await fetch('/api/admin/seating/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
    onRefresh();
  }, [floorPlan, onRefresh]);

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
        onDeleteTable: handleDeleteTable,
        onRenameTable: handleRenameTable,
        splitPartyGroupIds: split,
      },
      draggable: true,
    }));
    setNodes(newNodes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, guests, colorMode]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Guest sidebar */}
      <GuestSidebar
        guests={guestsWithAssignment()}
        onDragGuest={g => { dragGuestRef.current = g; }}
        onAssignGuest={() => {}}
        splitPartyGuestIds={splitPartyGroupIds()}
      />

      {/* Canvas area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-2 px-4 shrink-0">
          <button
            onClick={() => setShowAddModal(true)}
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
            <div className="flex items-center gap-3 text-xs text-gray-400">
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
                    RSVPed
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-white border border-gray-300 inline-block" />
                    No RSVP
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* React Flow canvas */}
        <div
          ref={canvasContainerRef}
          className="flex-1 min-h-0 relative"
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
            <MiniMap
              nodeColor={() => '#e5e7eb'}
              maskColor="rgba(255,255,255,0.6)"
              style={{ bottom: 16, right: 16 }}
            />
          </ReactFlow>
        </div>
      </div>

      {/* Add Table Modal */}
      {showAddModal && (
        <AddTableModal
          defaultName={`Table ${tables.length + 1}`}
          onAdd={handleAddTable}
          onClose={() => setShowAddModal(false)}
        />
      )}

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
  const [room, setRoom] = useState<RoomShape | null>(null);
  const [loading, setLoading] = useState(true);

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
    setRoom(roomData.room ?? null);
    setGuests(
      (guestData.guests ?? guestData ?? []).map((g: GuestListEntry) => ({
        id: g.id,
        guest_name: g.guest_name,
        plus_one_name: g.plus_one_name ?? null,
        party_size: g.party_size ?? 1,
        side: g.side ?? null,
        rsvp_status: g.rsvp_status ?? null,
        invited: g.invited ?? true,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400 text-sm">Loading seating chart…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="px-8 py-4 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-2xl font-serif font-bold text-gray-800">Seating Chart</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {tables.length} table{tables.length !== 1 ? 's' : ''} · {guests.length} guests
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ReactFlowProvider>
          <SeatingCanvas
            floorPlan={floorPlan}
            tables={tables}
            guests={guests}
            room={room}
            onRefresh={refresh}
            onRoomChange={setRoom}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
