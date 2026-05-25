'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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

interface TableNodeProps {
  data: {
    table: SeatingTableData;
    colorMode: ColorMode;
    onDropGuest: (tableId: number, guestId: string) => void;
    onMoveSeat: (payload: SeatTransferPayload, toTableId: number) => void;
    onUnassignParty: (tableId: number, partyGroupId: number) => void;
    onReorderSeats: (tableId: number, orderedSeatIndices: { seat_index: number; display_name: string; guest_list_id: number | null; party_group_id: number | null }[]) => void;
    onDeleteTable: (tableId: number) => void;
    onRenameTable: (tableId: number, name: string) => void;
    splitPartyGroupIds: Set<number>;
  };
}

// ── Seat chip ──────────────────────────────────────────────────────────────

function SeatChip({
  seat,
  tableId,
  isSplit,
  colorMode,
  onRemoveParty,
}: {
  seat: SeatData;
  tableId: number;
  isSplit: boolean;
  colorMode: ColorMode;
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
  let chipClass: string;
  if (isLikelyNotComing) {
    chipClass = 'bg-orange-100 border-orange-400 text-orange-700';
  } else if (colorMode === 'rsvp') {
    const hasRsvp = !!seat.rsvp_status;
    chipClass = hasRsvp
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
      title={colorMode === 'rsvp'
        ? (seat.rsvp_status ? `RSVP: ${seat.rsvp_status}` : 'No RSVP yet')
        : (isSplit ? 'Party is split — drag to move' : `Drag ${name} to another table`)}
    >
      {colorMode === 'party' && isSplit && <span className="text-yellow-500 mr-0.5">⚠</span>}
      <span className="truncate max-w-[80px]">{name}</span>
      {hover && (
        <button
          className="nodrag ml-1 text-gray-400 hover:text-red-500 transition-colors leading-none"
          onClick={e => { e.stopPropagation(); onRemoveParty(); }}
          title="Remove party from table"
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

  const modal = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ zIndex: 99999 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-80 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">{table.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Drag to set seating order</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Sortable list */}
        <div className="flex-1 overflow-y-auto p-4">
          {seats.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">No one seated here yet.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={seats.map(s => s.seat_index)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {seats.map(seat => (
                    <SortableSeatRow key={seat.seat_index} seat={seat} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
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
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

// ── Table controls (rendered inside table on hover) ────────────────────────

function TableControls({
  table,
  onDelete,
  onRename,
  onReorder,
}: {
  table: SeatingTableData;
  onDelete: () => void;
  onRename: (name: string) => void;
  onReorder: () => void;
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

function TableBody({
  table,
  splitPartyGroupIds,
  onDropGuest,
  onMoveSeat,
  onUnassignParty,
  onDeleteTable,
  onRenameTable,
  onReorderSeats,
}: {
  table: SeatingTableData;
  splitPartyGroupIds: Set<number>;
  onDropGuest: (tableId: number, guestId: string) => void;
  onMoveSeat: (payload: SeatTransferPayload, toTableId: number) => void;
  onUnassignParty: (tableId: number, partyGroupId: number) => void;
  onDeleteTable: (tableId: number) => void;
  onRenameTable: (tableId: number, name: string) => void;
  onReorderSeats: (tableId: number, ordered: SeatData[]) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const seatCount = table.seats.filter(s => s.rsvp_status !== 'likely_not_coming').length;
  const totalSeatCount = table.seats.length;

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

    const guestId = e.dataTransfer.getData('guestId');
    if (guestId) onDropGuest(table.id, guestId);
  };

  const isRound = table.table_type === 'round';
  const isHead = table.table_type === 'head';

  const tableW = isRound ? 160 : isHead ? Math.max(240, totalSeatCount * 48) : 200;
  const tableH = isRound ? 160 : isHead ? 80 : 100;

  const baseClasses = `relative flex flex-col items-center justify-center
    border-2 transition-colors cursor-grab select-none
    ${dragOver ? 'border-blue-400 bg-blue-50' : hovered ? 'border-gray-400 bg-gray-50' : 'border-gray-300 bg-white'}
    ${isRound ? 'rounded-full' : 'rounded-xl'}`;

  return (
    <>
      <div
        className={baseClasses}
        style={{ width: tableW, height: tableH }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span className="text-xs font-semibold text-gray-600 px-3 text-center leading-tight">
          {table.name}
        </span>
        <span className="text-xs text-gray-400 mt-0.5">
          {totalSeatCount === 0
            ? 'Drop guests here'
            : seatCount < totalSeatCount
              ? `${seatCount} people (+${totalSeatCount - seatCount} likely not coming)`
              : `${seatCount} ${seatCount === 1 ? 'person' : 'people'}`
          }
        </span>

        {hovered && (
          <TableControls
            table={table}
            onDelete={() => onDeleteTable(table.id)}
            onRename={name => onRenameTable(table.id, name)}
            onReorder={() => setReorderOpen(true)}
          />
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

// ── Seat chips rendered around/below the table ─────────────────────────────

function SeatsDisplay({
  table,
  splitPartyGroupIds,
  colorMode,
  onUnassignParty,
}: {
  table: SeatingTableData;
  splitPartyGroupIds: Set<number>;
  colorMode: ColorMode;
  onUnassignParty: (tableId: number, partyGroupId: number) => void;
}) {
  if (table.seats.length === 0) return null;

  const isRound = table.table_type === 'round';
  const tableW = isRound ? 160 : table.table_type === 'head' ? Math.max(240, table.seats.length * 48) : 200;
  const tableH = isRound ? 160 : table.table_type === 'head' ? 80 : 100;
  const orbitPad = isRound ? 52 : 0;

  const cx = orbitPad + tableW / 2;
  const cy = orbitPad + tableH / 2;

  if (isRound) {
    const n = table.seats.length;
    const r = tableW / 2 + 28;
    return (
      <>
        {table.seats.map((seat, i) => {
          const angle = (2 * Math.PI * i) / n - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          const isSplit = seat.party_group_id !== null && splitPartyGroupIds.has(seat.party_group_id);
          return (
            <div
              key={seat.seat_index}
              className="absolute"
              style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
            >
              <SeatChip
                seat={seat}
                tableId={table.id}
                isSplit={isSplit}
                colorMode={colorMode}
                onRemoveParty={() => seat.party_group_id !== null && onUnassignParty(table.id, seat.party_group_id)}
              />
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div
      className="absolute flex flex-wrap gap-1 justify-center"
      style={{ top: tableH + 8, left: 0, right: 0 }}
    >
      {table.seats.map(seat => {
        const isSplit = seat.party_group_id !== null && splitPartyGroupIds.has(seat.party_group_id);
        return (
          <SeatChip
            key={seat.seat_index}
            seat={seat}
            tableId={table.id}
            isSplit={isSplit}
            colorMode={colorMode}
            onRemoveParty={() => seat.party_group_id !== null && onUnassignParty(table.id, seat.party_group_id)}
          />
        );
      })}
    </div>
  );
}

// ── Main node export ───────────────────────────────────────────────────────

export default function TableNode({ data }: TableNodeProps) {
  const { table, colorMode, onDropGuest, onMoveSeat, onUnassignParty, onReorderSeats, onDeleteTable, onRenameTable, splitPartyGroupIds } = data;

  const isRound = table.table_type === 'round';
  const tableW = isRound ? 160 : table.table_type === 'head' ? Math.max(240, table.seats.length * 48) : 200;
  const tableH = isRound ? 160 : table.table_type === 'head' ? 80 : 100;
  const orbitPad = isRound ? 52 : 0;
  const belowPad = !isRound && table.seats.length > 0 ? 40 : 0;

  return (
    <div
      style={{
        width: tableW + orbitPad * 2,
        height: tableH + orbitPad * 2 + belowPad,
        position: 'relative',
      }}
    >
      <Handle type="source" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />

      <div
        style={{
          position: 'absolute',
          left: orbitPad,
          top: orbitPad,
          width: tableW,
          height: tableH,
        }}
      >
        <TableBody
          table={table}
          splitPartyGroupIds={splitPartyGroupIds}
          onDropGuest={onDropGuest}
          onMoveSeat={onMoveSeat}
          onUnassignParty={onUnassignParty}
          onDeleteTable={onDeleteTable}
          onRenameTable={onRenameTable}
          onReorderSeats={onReorderSeats}
        />
      </div>

      <SeatsDisplay
        table={table}
        splitPartyGroupIds={splitPartyGroupIds}
        colorMode={colorMode}
        onUnassignParty={onUnassignParty}
      />
    </div>
  );
}
