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
import WallOverlay, { Wall } from '@/components/seating/WallOverlay';
import { SeatingTableData, GuestListEntry, FloorPlan } from '@/components/seating/types';

const nodeTypes = { tableNode: TableNode };

// ─── Inner canvas (needs useReactFlow) ──────────────────────────────────────

function SeatingCanvas({
  floorPlan,
  tables,
  guests,
  walls,
  onRefresh,
  onWallsChange,
}: {
  floorPlan: FloorPlan | null;
  tables: SeatingTableData[];
  guests: GuestListEntry[];
  walls: Wall[];
  onRefresh: () => void;
  onWallsChange: (walls: Wall[]) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [roomWidth, setRoomWidth] = useState(floorPlan?.room_width ?? '');
  const [roomHeight, setRoomHeight] = useState(floorPlan?.room_height ?? '');
  const [pendingAssign, setPendingAssign] = useState<{ tableId: number; seatIndex: number } | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [drawMode, setDrawMode] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const dragGuestRef = useRef<GuestListEntry | null>(null);

  // Compute split party guest IDs
  // A guest is "split" if their party has members assigned to different tables
  const splitPartyGuestIds = useCallback((): Set<number> => {
    const split = new Set<number>();

    // Build map: guest_list_id → table_id they're assigned to
    const guestTableMap = new Map<number, number>();
    for (const table of tables) {
      for (const seat of table.seats) {
        if (seat.guest_list_id !== null) {
          guestTableMap.set(seat.guest_list_id, table.id);
        }
      }
    }

    // For each guest with a plus_one, find their plus_one in the guest list
    // Party = primary guest + their plus_one (matched by plus_one_name → guest_name)
    for (const guest of guests) {
      if (!guest.plus_one_name) continue;

      const primaryId = guest.id;
      const plusOneGuest = guests.find(
        g => g.guest_name.toLowerCase() === guest.plus_one_name!.toLowerCase()
      );
      if (!plusOneGuest) continue;

      const primaryTableId = guestTableMap.get(primaryId);
      const plusOneTableId = guestTableMap.get(plusOneGuest.id);

      // Both assigned but to different tables = split
      if (primaryTableId !== undefined && plusOneTableId !== undefined && primaryTableId !== plusOneTableId) {
        split.add(primaryId);
        split.add(plusOneGuest.id);
      }
    }

    return split;
  }, [tables, guests]);

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

  // Sync React Flow nodes from tables state
  useEffect(() => {
    const split = splitPartyGuestIds();
    const newNodes: Node[] = tables.map(table => ({
      id: String(table.id),
      type: 'tableNode',
      position: { x: table.x, y: table.y },
      data: {
        table,
        onAssignGuest: handleAssignGuest,
        onUnassignGuest: handleUnassignGuest,
        onDeleteTable: handleDeleteTable,
        onRenameTable: handleRenameTable,
        splitPartyGuestIds: split,
      },
      draggable: true,
    }));
    setNodes(newNodes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, guests]);

  const handleAssignGuest = useCallback((tableId: number, seatIndex: number) => {
    setPendingAssign({ tableId, seatIndex });
    setAssignSearch('');
  }, []);

  const handleUnassignGuest = useCallback(async (tableId: number, seatIndex: number) => {
    await fetch('/api/admin/seating/assign', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seating_table_id: tableId, seat_index: seatIndex }),
    });
    onRefresh();
  }, [onRefresh]);

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

  const handleAddTable = useCallback(async (opts: {
    name: string;
    table_type: string;
    seat_count: number;
  }) => {
    if (!floorPlan) return;
    await fetch('/api/admin/seating/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        floor_plan_id: floorPlan.id,
        name: opts.name,
        table_type: opts.table_type,
        seat_count: opts.seat_count,
        x: 200 + Math.random() * 400,
        y: 200 + Math.random() * 300,
      }),
    });
    setShowAddModal(false);
    onRefresh();
  }, [floorPlan, onRefresh]);

  // Assign guest from modal picker
  const handlePickGuest = useCallback(async (guestId: number) => {
    if (!pendingAssign) return;
    const { tableId, seatIndex } = pendingAssign;

    // Find adjacent empty seat for plus_one auto-fill
    const guest = guests.find(g => g.id === guestId);
    const table = tables.find(t => t.id === tableId);

    await fetch('/api/admin/seating/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seating_table_id: tableId,
        seat_index: seatIndex,
        guest_list_id: guestId,
      }),
    });

    // Auto-assign plus_one to next available adjacent seat
    if (guest?.plus_one_name && table) {
      const plusOneGuest = guests.find(
        g => g.guest_name.toLowerCase() === guest.plus_one_name!.toLowerCase()
      );
      if (plusOneGuest) {
        // Find next empty seat (wrapping around)
        const emptySeat = table.seats.find(
          s => s.guest_list_id === null && s.seat_index !== seatIndex
        );
        // Find the seat with index immediately after
        const nextIndex = (seatIndex + 1) % table.seat_count;
        const nextSeat = table.seats.find(s => s.seat_index === nextIndex);
        const targetSeat = (nextSeat?.guest_list_id === null ? nextSeat : emptySeat);

        if (targetSeat) {
          await fetch('/api/admin/seating/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              seating_table_id: tableId,
              seat_index: targetSeat.seat_index,
              guest_list_id: plusOneGuest.id,
            }),
          });
        }
      }
    }

    setPendingAssign(null);
    onRefresh();
  }, [pendingAssign, guests, tables, onRefresh]);

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

  const assignableGuests = pendingAssign
    ? guestsWithAssignment().filter(g => {
        const q = assignSearch.toLowerCase();
        return (
          !g.assigned_seat &&
          (g.guest_name.toLowerCase().includes(q) ||
            (g.plus_one_name?.toLowerCase().includes(q) ?? false))
        );
      })
    : [];

  return (
    <div className="flex h-full w-full">
      {/* Guest sidebar */}
      <GuestSidebar
        guests={guestsWithAssignment()}
        onDragGuest={g => { dragGuestRef.current = g; }}
        onAssignGuest={() => {}}
        splitPartyGuestIds={splitPartyGuestIds()}
      />

      {/* Canvas area */}
      <div className="flex-1 flex flex-col">
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

          <button
            onClick={() => setDrawMode(v => !v)}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${
              drawMode
                ? 'bg-blue-500 text-white border-blue-500'
                : 'text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 17L17 3l4 4L7 21H3v-4z" />
            </svg>
            {drawMode ? 'Drawing Walls (ESC to cancel)' : 'Draw Walls'}
          </button>

          {walls.length > 0 && !drawMode && (
            <button
              onClick={async () => {
                if (!confirm('Clear all walls?')) return;
                await Promise.all(walls.map(w =>
                  fetch('/api/admin/seating/walls', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: w.id }),
                  })
                ));
                onWallsChange([]);
              }}
              className="flex items-center gap-1.5 text-red-500 text-sm font-medium px-3 py-1.5 rounded-md border border-red-200 hover:bg-red-50 transition-colors"
            >
              Clear Walls
            </button>
          )}

          <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-200 border border-green-400 inline-block" />
              Party together
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-yellow-200 border border-yellow-400 inline-block" />
              Party split
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-white border-dashed border border-gray-400 inline-block" />
              Empty
            </span>
          </div>
        </div>

        {/* React Flow canvas */}
        <div
          ref={canvasContainerRef}
          className="flex-1 relative"
          onDrop={handleCanvasDrop}
          onDragOver={e => e.preventDefault()}
        >
          <ReactFlow
            nodes={nodes}
            edges={[]}
            onNodesChange={onNodesChange}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={nodeTypes}
            nodesDraggable={!drawMode}
            panOnDrag={!drawMode}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
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

          {/* Wall drawing overlay — always mounted so useViewport works */}
          <WallOverlay
            walls={walls}
            drawMode={drawMode}
            onWallAdded={wall => onWallsChange([...walls, wall])}
            onWallDeleted={async id => {
              await fetch('/api/admin/seating/walls', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
              });
              onWallsChange(walls.filter(w => w.id !== id));
            }}
            containerRef={canvasContainerRef}
          />
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

      {/* Guest Picker Modal (for click-to-assign) */}
      {pendingAssign && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-96 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-800">Assign Guest</h3>
              <button
                onClick={() => setPendingAssign(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <input
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-400 mb-3"
              placeholder="Search unassigned guests..."
              value={assignSearch}
              onChange={e => setAssignSearch(e.target.value)}
              autoFocus
            />

            <div className="flex-1 overflow-y-auto space-y-1">
              {assignableGuests.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-6">
                  {assignSearch ? 'No matches' : 'All guests are assigned!'}
                </p>
              )}
              {assignableGuests.map(guest => (
                <button
                  key={guest.id}
                  onClick={() => handlePickGuest(guest.id)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{guest.guest_name}</span>
                    {guest.party_size > 1 && (
                      <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-1.5 py-0.5">
                        party of {guest.party_size}
                      </span>
                    )}
                  </div>
                  {guest.plus_one_name && (
                    <div className="text-xs text-gray-500 mt-0.5">+1 {guest.plus_one_name} (auto-placed nearby)</div>
                  )}
                </button>
              ))}
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
  const [walls, setWalls] = useState<Wall[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [fpRes, guestRes, wallsRes] = await Promise.all([
      fetch('/api/admin/seating/floor-plan'),
      fetch('/api/admin/guest-list'),
      fetch('/api/admin/seating/walls'),
    ]);
    const fpData = await fpRes.json();
    const guestData = await guestRes.json();
    const wallsData = await wallsRes.json();

    setFloorPlan(fpData.floorPlan ?? null);
    setTables(fpData.tables ?? []);
    setWalls(wallsData.walls ?? []);
    setGuests(
      (guestData.guests ?? guestData ?? []).map((g: GuestListEntry) => ({
        id: g.id,
        guest_name: g.guest_name,
        plus_one_name: g.plus_one_name ?? null,
        party_size: g.party_size ?? 1,
        side: g.side ?? null,
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
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8">
      <div className="px-8 py-4 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-2xl font-serif font-bold text-gray-800">Seating Chart</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {tables.length} table{tables.length !== 1 ? 's' : ''} · {guests.length} guests
        </p>
      </div>

      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <SeatingCanvas
            floorPlan={floorPlan}
            tables={tables}
            guests={guests}
            walls={walls}
            onRefresh={refresh}
            onWallsChange={setWalls}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
