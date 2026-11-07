'use client';

import { useState, useRef, useEffect } from 'react';
import { Drawer } from '@/components/admin/Drawer';
import { Handle, Position } from '@xyflow/react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SeatingTableData, SeatData, SeatTransferPayload, ColorMode } from './types';
import { normaliseRotation, seatRunDirection, sideCounts, sideName, snapRotation, tableLayout, type TableLayout } from '@/lib/tableLayout';

interface TableNodeProps {
  data: {
    table: SeatingTableData;
    colorMode: ColorMode;
    onDropGuest: (tableId: number, guestId: string) => void;
    onDropPerson: (tableId: number, payload: string) => void;
    onMoveSeat: (payload: SeatTransferPayload, toTableId: number) => void;
    onUnassignParty: (tableId: number, partyGroupId: number) => void;
    onUnassignSeat: (tableId: number, seatIndex: number) => void;
    onReorderSeats: (tableId: number, orderedSeatIndices: { seat_index: number; display_name: string; guest_list_id: number | null; party_group_id: number | null }[]) => void;
    onDeleteTable: (tableId: number) => void;
    onRenameTable: (tableId: number, name: string) => void;
    onRotateTable: (tableId: number, rotation: number) => void;
    splitPartyGroupIds: Set<number>;
  };
}

// ── Seat chip ──────────────────────────────────────────────────────────────

function SeatChip({
  seat,
  tableId,
  isSplit,
  colorMode,
  onRemoveSeat,
  onRemoveParty,
}: {
  seat: SeatData;
  tableId: number;
  isSplit: boolean;
  colorMode: ColorMode;
  onRemoveSeat: () => void;
  onRemoveParty: () => void;
}) {
  const [hover, setHover] = useState(false);
  const name = seat.display_name || seat.guest_name || '?';

  const transfer: SeatTransferPayload = {
    fromTableId: tableId,
    seatIndex: seat.seat_index,
    displayName: name,
    partyGroupId: seat.party_group_id,
    guestListId: seat.guest_list_id,
  };

  // Determine chip color classes based on mode
  const isLikelyNotComing = seat.rsvp_status === 'likely_not_coming';
  const hasDeclined = seat.rsvp_status === 'declined';
  let chipClass: string;
  if (isLikelyNotComing) {
    chipClass = 'bg-orange-100 border-orange-400 text-orange-700';
  } else if (hasDeclined) {
    // Red in *both* modes, not just RSVP mode: someone who said no is sitting in
    // a chair that needs freeing, which is not a fact about the colour toggle.
    chipClass = 'bg-red-100 border-red-400 text-red-800 line-through decoration-red-400/70';
  } else if (colorMode === 'rsvp') {
    // Coming green, no answer yet white.
    chipClass = seat.rsvp_status
      ? 'bg-green-100 border-green-400 text-green-800'
      : 'bg-white border-gray-300 text-gray-600';
  } else {
    // party mode
    chipClass = isSplit
      ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
      : 'bg-green-50 border-green-300 text-green-800';
  }

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('seatTransfer', JSON.stringify(transfer));
        e.stopPropagation();
      }}
      className={`nodrag relative flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border select-none cursor-grab active:cursor-grabbing ${chipClass}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={hasDeclined
        ? `${name} is not coming — remove them from this table`
        : colorMode === 'rsvp'
          ? (seat.rsvp_status ? `RSVP: ${seat.rsvp_status}` : 'No RSVP yet')
          : (isSplit ? 'Party is split — drag to move' : `Drag ${name} to another table`)}
    >
      {colorMode === 'party' && isSplit && <span className="text-yellow-500 mr-0.5">⚠</span>}
      <span className="truncate max-w-[84px]">{name}</span>
      {hover && (
        <button
          className="nodrag ml-1 text-gray-400 hover:text-red-500 transition-colors leading-none"
          // Removes this one person. It used to clear the whole party, so freeing
          // the one chair a declined plus-one was sitting in took the other two
          // with it. Hold Alt (or Shift) to remove the party, as before.
          onClick={e => {
            e.stopPropagation();
            if (e.altKey || e.shiftKey) onRemoveParty();
            else onRemoveSeat();
          }}
          title={`Remove ${name} from this table (Alt-click to remove their whole party)`}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Sortable row inside the reorder modal ─────────────────────────────────

function SortableSeatRow({ seat }: { seat: SeatData }) {
  const name = seat.display_name || seat.guest_name || '?';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: seat.seat_index,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm"
    >
      {/* drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
          <circle cx="3.5" cy="3" r="1.5" /><circle cx="3.5" cy="8" r="1.5" /><circle cx="3.5" cy="13" r="1.5" />
          <circle cx="8.5" cy="3" r="1.5" /><circle cx="8.5" cy="8" r="1.5" /><circle cx="8.5" cy="13" r="1.5" />
        </svg>
      </div>
      <span className="text-sm text-gray-800 font-medium truncate">{name}</span>
    </div>
  );
}

// ── Seat reorder modal ────────────────────────────────────────────────────

function ReorderModal({
  table,
  onSave,
  onClose,
}: {
  table: SeatingTableData;
  onSave: (ordered: SeatData[]) => void;
  onClose: () => void;
}) {
  const [seats, setSeats] = useState<SeatData[]>([...table.seats]);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSeats(prev => {
        const oldIndex = prev.findIndex(s => s.seat_index === active.id);
        const newIndex = prev.findIndex(s => s.seat_index === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  // On a long table the order decides the side: the first half sits along one
  // side, the rest along the other. Say which, in the directions on screen.
  const shape = table.table_type === 'round' || table.table_type === 'head' ? table.table_type : 'rectangular';
  const rotation = normaliseRotation(table.rotation ?? 0);
  const { first } = sideCounts(shape, seats.length);
  const sideLabel = (side: 'first' | 'second') => (
    <p className="flex items-baseline gap-2 px-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
      <span>{sideName(side, rotation)} side</span>
      <span className="font-normal normal-case tracking-normal">· {seatRunDirection(side, rotation)}</span>
    </p>
  );
  const subtitle = shape === 'round'
    ? 'Drag to set the order, clockwise from the top'
    : shape === 'head'
      ? `Drag to set the order — everyone sits on one side, ${seatRunDirection('first', rotation)}`
      : 'Drag to set the order — it decides who sits on which side';

  const modal = (
    <Drawer
      open
      onClose={onClose}
      title={
        <div className="pt-1">
          <h3 className="text-base font-semibold text-gray-800">{table.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
      }
    >
        {/* Sortable list */}
        <div>
          {seats.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">No one seated here yet.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={seats.map(s => s.seat_index)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {seats.map((seat, i) => (
                    <div key={seat.seat_index}>
                      {shape === 'rectangular' && i === 0 && sideLabel('first')}
                      {shape === 'rectangular' && i === first && sideLabel('second')}
                      <SortableSeatRow seat={seat} />
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={() => onSave(seats)}
            className="flex-1 text-sm font-medium text-white py-2 rounded-lg"
            style={{ backgroundColor: 'var(--accent, #6366f1)' }}
          >
            Save Order
          </button>
          <button
            onClick={onClose}
            className="flex-1 text-sm font-medium text-gray-600 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
    </Drawer>
  );

  if (!mounted) return null;
  return modal;
}

// ── Table controls (rendered inside table on hover) ────────────────────────

function TableControls({
  table,
  canTurn,
  onDelete,
  onRename,
  onReorder,
  onTurn90,
}: {
  table: SeatingTableData;
  canTurn: boolean;
  onDelete: () => void;
  onRename: (name: string) => void;
  onReorder: () => void;
  onTurn90: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(table.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setValue(table.name);
    setRenaming(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    if (value.trim()) onRename(value.trim());
    setRenaming(false);
  };

  return (
    <div className="nodrag flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
      {renaming ? (
        <input
          ref={inputRef}
          className="text-xs border border-gray-300 rounded px-1 py-0.5 w-24 outline-none bg-white"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setRenaming(false); }}
        />
      ) : (
        <button
          className="nodrag p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-white/50 transition-colors"
          title="Rename"
          onClick={startRename}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      )}

      {canTurn && (
        <button
          className="nodrag p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-white/50 transition-colors"
          title="Turn 90°"
          aria-label="Turn 90 degrees"
          onClick={e => { e.stopPropagation(); onTurn90(); }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      )}

      {/* Reorder seats button */}
      {table.seats.length > 1 && (
        <button
          className="nodrag p-1 rounded text-gray-400 hover:text-indigo-500 hover:bg-white/50 transition-colors"
          title="Reorder seats"
          onClick={e => { e.stopPropagation(); onReorder(); }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
            <polyline points="8 3 5 6 8 9" />
            <polyline points="16 15 19 18 16 21" />
          </svg>
        </button>
      )}

      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-red-500">Delete?</span>
          <button
            className="nodrag text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 hover:bg-red-200"
            onClick={e => { e.stopPropagation(); onDelete(); }}
          >Yes</button>
          <button
            className="nodrag text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 hover:bg-gray-200"
            onClick={e => { e.stopPropagation(); setConfirmDelete(false); }}
          >No</button>
        </div>
      ) : (
        <button
          className="nodrag p-1 rounded text-red-400 hover:text-red-600 hover:bg-white/50 transition-colors"
          title="Delete table"
          onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Table shapes ───────────────────────────────────────────────────────────

/**
 * The table top, plus the handle that turns it. The layout — its size, where
 * every chair goes, how it turns — is `tableLayout()`, which the printed floor
 * plan reads too.
 */
function TableBody({
  table,
  layout,
  rotation,
  onTurning,
  onTurned,
  onDropGuest,
  onDropPerson,
  onMoveSeat,
  onDeleteTable,
  onRenameTable,
  onReorderSeats,
}: {
  table: SeatingTableData;
  layout: TableLayout;
  /** The angle on screen right now — mid-turn, ahead of what is saved. */
  rotation: number;
  onTurning: (degrees: number | null) => void;
  onTurned: (degrees: number) => void;
  onDropGuest: (tableId: number, guestId: string) => void;
  onDropPerson: (tableId: number, payload: string) => void;
  onMoveSeat: (payload: SeatTransferPayload, toTableId: number) => void;
  onDeleteTable: (tableId: number) => void;
  onRenameTable: (tableId: number, name: string) => void;
  onReorderSeats: (tableId: number, ordered: SeatData[]) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [turning, setTurning] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const seatCount = table.seats.filter(s => s.rsvp_status !== 'likely_not_coming').length;
  const totalSeatCount = table.seats.length;
  const canTurn = layout.shape !== 'round';

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const seatTransferRaw = e.dataTransfer.getData('seatTransfer');
    if (seatTransferRaw) {
      const payload: SeatTransferPayload = JSON.parse(seatTransferRaw);
      if (payload.fromTableId !== table.id) {
        onMoveSeat(payload, table.id);
      }
      return;
    }

    // One person of a party, dragged on their own from the guest list.
    const partyPerson = e.dataTransfer.getData('partyPerson');
    if (partyPerson) { onDropPerson(table.id, partyPerson); return; }

    const guestId = e.dataTransfer.getData('guestId');
    if (guestId) onDropGuest(table.id, guestId);
  };

  // Turning: the handle sits off the table's right-hand end, so its angle from
  // the centre *is* the table's angle. Measured on screen, which already has
  // the canvas zoom in it — an angle does not care about scale.
  const angleAt = (e: React.PointerEvent) => {
    const r = bodyRef.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  };
  const startTurn = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setTurning(true);
  };
  const moveTurn = (e: React.PointerEvent) => {
    if (!turning) return;
    e.stopPropagation();
    onTurning(snapRotation(angleAt(e), e.shiftKey));
  };
  const endTurn = (e: React.PointerEvent) => {
    if (!turning) return;
    e.stopPropagation();
    setTurning(false);
    const final = snapRotation(angleAt(e), e.shiftKey);
    onTurning(null);
    if (final !== normaliseRotation(table.rotation ?? 0)) onTurned(final);
  };

  const { width: tableW, height: tableH } = layout.body;
  const isRound = layout.shape === 'round';

  const baseClasses = `relative flex flex-col items-center justify-center
    border-2 transition-colors cursor-grab select-none
    ${dragOver ? 'border-blue-400 bg-blue-50' : hovered || turning ? 'border-gray-400 bg-gray-50' : 'border-gray-300 bg-white'}
    ${isRound ? 'rounded-full' : 'rounded-xl'}`;

  return (
    <>
      <div
        ref={bodyRef}
        className={baseClasses}
        style={{
          width: tableW,
          height: tableH,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          // A turn eases in when it comes from the button; dragging follows the pointer.
          transition: turning ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), border-color 150ms, background-color 150ms',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* The words stay level, however the table is turned. */}
        <div
          className="flex flex-col items-center"
          style={{ transform: rotation ? `rotate(${-rotation}deg)` : undefined }}
        >
          {turning ? (
            <span className="rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
              {Math.round(rotation)}°
            </span>
          ) : (
            <>
              <span className="text-xs font-semibold text-gray-600 px-3 text-center leading-tight">
                {table.name}
              </span>
              {totalSeatCount === 0 ? (
                <span className="text-xs text-gray-400 mt-0.5">Drop guests here</span>
              ) : seatCount < totalSeatCount ? (
                <span className="text-center mt-0.5 leading-tight flex flex-col items-center">
                  <span className="text-xs text-gray-400">{seatCount} {seatCount === 1 ? 'person' : 'people'}</span>
                  <span className="text-[9px] text-orange-400 font-medium">+{totalSeatCount - seatCount} likely not coming</span>
                </span>
              ) : (
                <span className="text-xs text-gray-400 mt-0.5">{seatCount} {seatCount === 1 ? 'person' : 'people'}</span>
              )}

              {hovered && (
                <TableControls
                  table={table}
                  canTurn={canTurn}
                  onDelete={() => onDeleteTable(table.id)}
                  onRename={name => onRenameTable(table.id, name)}
                  onReorder={() => setReorderOpen(true)}
                  onTurn90={() => onTurned(snapRotation(rotation + 90))}
                />
              )}
            </>
          )}
        </div>

        {/* The turning handle, off the right-hand end; it turns with the table. */}
        {canTurn && (hovered || turning) && (
          <button
            type="button"
            aria-label={`Turn ${table.name} (hold Shift for any angle)`}
            title="Drag to turn · Shift for any angle"
            className="nodrag absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full
              border border-gray-300 bg-white text-gray-500 shadow-sm hover:border-gray-500 hover:text-gray-800
              cursor-grab active:cursor-grabbing touch-none"
            style={{ left: tableW + 6 }}
            onPointerDown={startTurn}
            onPointerMove={moveTurn}
            onPointerUp={endTurn}
            onPointerCancel={endTurn}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
        )}
      </div>

      {reorderOpen && (
        <ReorderModal
          table={table}
          onSave={ordered => {
            onReorderSeats(table.id, ordered);
            setReorderOpen(false);
          }}
          onClose={() => setReorderOpen(false)}
        />
      )}
    </>
  );
}

// ── Seat chips, each at its own chair ─────────────────────────────────────

function SeatsDisplay({
  table,
  layout,
  splitPartyGroupIds,
  colorMode,
  onUnassignParty,
  onUnassignSeat,
}: {
  table: SeatingTableData;
  layout: TableLayout;
  splitPartyGroupIds: Set<number>;
  colorMode: ColorMode;
  onUnassignParty: (tableId: number, partyGroupId: number) => void;
  onUnassignSeat: (tableId: number, seatIndex: number) => void;
}) {
  if (table.seats.length === 0) return null;
  return (
    <>
      {table.seats.map((seat, i) => {
        const spot = layout.seats[i];
        if (!spot) return null;
        const isSplit = seat.party_group_id !== null && splitPartyGroupIds.has(seat.party_group_id);
        return (
          <div
            key={seat.seat_index}
            className="absolute"
            style={{
              left: spot.x,
              top: spot.y,
              transform: 'translate(-50%, -50%)',
              transition: 'left 220ms cubic-bezier(0.22, 1, 0.36, 1), top 220ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <SeatChip
              seat={seat}
              tableId={table.id}
              isSplit={isSplit}
              colorMode={colorMode}
              onRemoveSeat={() => onUnassignSeat(table.id, seat.seat_index)}
              onRemoveParty={() => seat.party_group_id !== null && onUnassignParty(table.id, seat.party_group_id)}
            />
          </div>
        );
      })}
    </>
  );
}

// ── Main node export ───────────────────────────────────────────────────────

export default function TableNode({ data }: TableNodeProps) {
  const { table, colorMode, onDropGuest, onDropPerson, onMoveSeat, onUnassignParty, onUnassignSeat, onReorderSeats, onDeleteTable, onRenameTable, onRotateTable, splitPartyGroupIds } = data;

  // Mid-turn, the table follows the pointer before anything is saved; after a
  // save it shows the new angle until the refreshed table arrives with it.
  const [live, setLive] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const saved = normaliseRotation(table.rotation ?? 0);
  const rotation = live ?? (pending !== null && pending !== saved ? pending : saved);
  const layout = tableLayout(table.table_type, table.seats.length, rotation);

  return (
    <div
      style={{
        width: layout.node.width,
        height: layout.node.height,
        position: 'relative',
      }}
    >
      <Handle type="source" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />

      <div
        style={{
          position: 'absolute',
          left: layout.body.x,
          top: layout.body.y,
          width: layout.body.width,
          height: layout.body.height,
        }}
      >
        <TableBody
          table={table}
          layout={layout}
          rotation={rotation}
          onTurning={setLive}
          onTurned={degrees => { setPending(degrees); onRotateTable(table.id, degrees); }}
          onDropGuest={onDropGuest}
          onDropPerson={onDropPerson}
          onMoveSeat={onMoveSeat}
          onDeleteTable={onDeleteTable}
          onRenameTable={onRenameTable}
          onReorderSeats={onReorderSeats}
        />
      </div>

      <SeatsDisplay
        table={table}
        layout={layout}
        splitPartyGroupIds={splitPartyGroupIds}
        colorMode={colorMode}
        onUnassignParty={onUnassignParty}
        onUnassignSeat={onUnassignSeat}
      />
    </div>
  );
}
