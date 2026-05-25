'use client';

import { useState, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { SeatingTableData, SeatData } from './types';

interface TableNodeProps {
  data: {
    table: SeatingTableData;
    onDropGuest: (tableId: number, guestId: string) => void;
    onUnassignParty: (tableId: number, partyGroupId: number) => void;
    onDeleteTable: (tableId: number) => void;
    onRenameTable: (tableId: number, name: string) => void;
    splitPartyGroupIds: Set<number>;
  };
}

// ── Seat chip ──────────────────────────────────────────────────────────────

function SeatChip({
  seat,
  isSplit,
  onRemoveParty,
}: {
  seat: SeatData;
  isSplit: boolean;
  onRemoveParty: () => void;
}) {
  const [hover, setHover] = useState(false);
  const name = seat.display_name || seat.guest_name || '?';

  return (
    <div
      className={`nodrag relative flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border select-none cursor-default
        ${isSplit
          ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
          : 'bg-green-50 border-green-300 text-green-800'
        }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={isSplit ? 'Party is split across tables' : name}
    >
      {isSplit && <span className="text-yellow-500 mr-0.5">⚠</span>}
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

// ── Table controls (rendered inside table on hover) ────────────────────────

function TableControls({
  table,
  onDelete,
  onRename,
}: {
  table: SeatingTableData;
  onDelete: () => void;
  onRename: (name: string) => void;
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
  onUnassignParty,
  onDeleteTable,
  onRenameTable,
}: {
  table: SeatingTableData;
  splitPartyGroupIds: Set<number>;
  onDropGuest: (tableId: number, guestId: string) => void;
  onUnassignParty: (tableId: number, partyGroupId: number) => void;
  onDeleteTable: (tableId: number) => void;
  onRenameTable: (tableId: number, name: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const seatCount = table.seats.length;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const guestId = e.dataTransfer.getData('guestId');
    if (guestId) onDropGuest(table.id, guestId);
  };

  const isRound = table.table_type === 'round';
  const isHead = table.table_type === 'head';

  // Table surface sizing
  const tableW = isRound ? 160 : isHead ? Math.max(240, seatCount * 48) : 200;
  const tableH = isRound ? 160 : isHead ? 80 : 100;

  const baseClasses = `nodrag relative flex flex-col items-center justify-center
    border-2 transition-colors cursor-default select-none
    ${dragOver ? 'border-blue-400 bg-blue-50' : hovered ? 'border-gray-400 bg-gray-50' : 'border-gray-300 bg-white'}
    ${isRound ? 'rounded-full' : 'rounded-xl'}`;

  return (
    <div
      className={baseClasses}
      style={{ width: tableW, height: tableH }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Table name */}
      <span className="text-xs font-semibold text-gray-600 px-3 text-center leading-tight">
        {table.name}
      </span>

      {/* People count */}
      <span className="text-xs text-gray-400 mt-0.5">
        {seatCount === 0 ? 'Drop guests here' : `${seatCount} ${seatCount === 1 ? 'person' : 'people'}`}
      </span>

      {/* Controls — inside table, shown on hover */}
      {hovered && (
        <TableControls
          table={table}
          onDelete={() => onDeleteTable(table.id)}
          onRename={name => onRenameTable(table.id, name)}
        />
      )}
    </div>
  );
}

// ── Seat chips rendered around/below the table ─────────────────────────────

function SeatsDisplay({
  table,
  splitPartyGroupIds,
  onUnassignParty,
}: {
  table: SeatingTableData;
  splitPartyGroupIds: Set<number>;
  onUnassignParty: (tableId: number, partyGroupId: number) => void;
}) {
  if (table.seats.length === 0) return null;

  const isRound = table.table_type === 'round';
  const tableW = isRound ? 160 : table.table_type === 'head' ? Math.max(240, table.seats.length * 48) : 200;
  const tableH = isRound ? 160 : table.table_type === 'head' ? 80 : 100;
  const cx = tableW / 2;
  const cy = tableH / 2;

  if (isRound) {
    const n = table.seats.length;
    const r = tableW / 2 + 28; // orbit radius outside the circle
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
                isSplit={isSplit}
                onRemoveParty={() => seat.party_group_id !== null && onUnassignParty(table.id, seat.party_group_id)}
              />
            </div>
          );
        })}
      </>
    );
  }

  // Rectangular / head: chips in a flex row below the table
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
            isSplit={isSplit}
            onRemoveParty={() => seat.party_group_id !== null && onUnassignParty(table.id, seat.party_group_id)}
          />
        );
      })}
    </div>
  );
}

// ── Main node export ───────────────────────────────────────────────────────

export default function TableNode({ data }: TableNodeProps) {
  const { table, onDropGuest, onUnassignParty, onDeleteTable, onRenameTable, splitPartyGroupIds } = data;

  const isRound = table.table_type === 'round';
  const tableW = isRound ? 160 : table.table_type === 'head' ? Math.max(240, table.seats.length * 48) : 200;
  const tableH = isRound ? 160 : table.table_type === 'head' ? 80 : 100;
  // Extra space for seat chips around/below
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

      {/* Table body positioned in the center of the node */}
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
          onUnassignParty={onUnassignParty}
          onDeleteTable={onDeleteTable}
          onRenameTable={onRenameTable}
        />
      </div>

      {/* Seat chips — positioned relative to node origin */}
      <SeatsDisplay
        table={table}
        splitPartyGroupIds={splitPartyGroupIds}
        onUnassignParty={onUnassignParty}
      />
    </div>
  );
}
