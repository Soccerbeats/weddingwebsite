'use client';

import { useState, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { SeatingTableData, SeatData } from './types';

interface TableNodeProps {
  data: {
    table: SeatingTableData;
    onAssignGuest: (tableId: number, seatIndex: number) => void;
    onUnassignGuest: (tableId: number, seatIndex: number) => void;
    onDeleteTable: (tableId: number) => void;
    onRenameTable: (tableId: number, name: string) => void;
    splitPartyGuestIds: Set<number>;
  };
}

interface SeatPopoverProps {
  seat: SeatData;
  onUnassign: () => void;
  onClose: () => void;
  isSplit: boolean;
}

function SeatPopover({ seat, onUnassign, onClose, isSplit }: SeatPopoverProps) {
  return (
    <div
      className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[160px]"
      style={{ top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 4 }}
    >
      <div className="text-sm font-semibold text-gray-800 mb-1">{seat.guest_name}</div>
      {seat.plus_one_name && (
        <div className="text-xs text-gray-500 mb-1">+1: {seat.plus_one_name}</div>
      )}
      {isSplit && (
        <div className="text-xs text-yellow-600 mb-2 flex items-center gap-1">
          <span>⚠</span> Party split
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <button
          className="nodrag text-xs bg-red-50 text-red-600 border border-red-200 rounded px-2 py-1 hover:bg-red-100 transition-colors"
          onClick={(e) => { e.stopPropagation(); onUnassign(); onClose(); }}
        >
          Remove
        </button>
        <button
          className="nodrag text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded px-2 py-1 hover:bg-gray-100 transition-colors"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

interface SeatSlotProps {
  seat: SeatData;
  tableId: number;
  onAssign: () => void;
  onUnassign: () => void;
  isSplit: boolean;
  style?: React.CSSProperties;
}

function SeatSlot({ seat, tableId, onAssign, onUnassign, isSplit, style }: SeatSlotProps) {
  const [showPopover, setShowPopover] = useState(false);
  const isOccupied = seat.guest_list_id !== null;
  const firstName = seat.guest_name?.split(' ')[0] ?? '';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOccupied) {
      setShowPopover(v => !v);
    } else {
      onAssign();
    }
  };

  return (
    <div
      className="absolute"
      style={{ ...style, transform: `${style?.transform ?? ''} translate(-50%, -50%)` }}
    >
      <div className="relative">
        <button
          className={`nodrag w-8 h-8 rounded-full text-xs font-medium border-2 flex items-center justify-center transition-all cursor-pointer
            ${isOccupied
              ? isSplit
                ? 'bg-yellow-100 border-yellow-400 text-yellow-800 hover:bg-yellow-200'
                : 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100'
              : 'bg-white border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:bg-gray-50'
            }`}
          onClick={handleClick}
          title={isOccupied ? seat.guest_name ?? '' : 'Assign guest'}
        >
          {isOccupied ? (
            <span className="truncate px-0.5" style={{ fontSize: 9 }}>{firstName}</span>
          ) : (
            <span className="text-lg leading-none">+</span>
          )}
        </button>

        {showPopover && isOccupied && (
          <SeatPopover
            seat={seat}
            onUnassign={onUnassign}
            onClose={() => setShowPopover(false)}
            isSplit={isSplit}
          />
        )}
      </div>
    </div>
  );
}

function RoundTable({ table, onAssignGuest, onUnassignGuest, splitPartyGuestIds }: {
  table: SeatingTableData;
  onAssignGuest: (tableId: number, seatIndex: number) => void;
  onUnassignGuest: (tableId: number, seatIndex: number) => void;
  splitPartyGuestIds: Set<number>;
}) {
  const n = table.seat_count;
  const baseSize = 120;
  const perSeatAdd = 10;
  const radius = Math.max(baseSize, baseSize + (n - 8) * perSeatAdd);
  const outerSize = radius * 2 + 48;
  const cx = outerSize / 2;
  const cy = outerSize / 2;
  const seatRadius = radius;

  return (
    <div className="relative" style={{ width: outerSize, height: outerSize }}>
      {/* Table circle */}
      <div
        className="absolute rounded-full bg-white border-2 border-gray-300"
        style={{
          width: radius * 2,
          height: radius * 2,
          left: 24,
          top: 24,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-gray-400 text-center px-2 font-medium">{table.name}</span>
        </div>
      </div>

      {/* Seats */}
      {table.seats.map((seat) => {
        const angle = (2 * Math.PI * seat.seat_index) / n - Math.PI / 2;
        const x = cx + seatRadius * Math.cos(angle);
        const y = cy + seatRadius * Math.sin(angle);
        const isSplit = seat.guest_list_id !== null && splitPartyGuestIds.has(seat.guest_list_id);

        return (
          <SeatSlot
            key={seat.seat_index}
            seat={seat}
            tableId={table.id}
            onAssign={() => onAssignGuest(table.id, seat.seat_index)}
            onUnassign={() => onUnassignGuest(table.id, seat.seat_index)}
            isSplit={isSplit}
            style={{ left: x, top: y }}
          />
        );
      })}
    </div>
  );
}

function RectangularTable({ table, onAssignGuest, onUnassignGuest, splitPartyGuestIds }: {
  table: SeatingTableData;
  onAssignGuest: (tableId: number, seatIndex: number) => void;
  onUnassignGuest: (tableId: number, seatIndex: number) => void;
  splitPartyGuestIds: Set<number>;
}) {
  const tableW = 240;
  const tableH = 120;
  const padding = 40;
  const outerW = tableW + padding * 2;
  const outerH = tableH + padding * 2;
  const n = table.seats.length;
  const topCount = Math.ceil(n / 2);
  const bottomCount = Math.floor(n / 2);

  const getSeatPos = (index: number): { x: number; y: number } => {
    if (index < topCount) {
      const spacing = tableW / (topCount + 1);
      return { x: padding + spacing * (index + 1), y: padding };
    } else {
      const bi = index - topCount;
      const spacing = tableW / (bottomCount + 1);
      return { x: padding + spacing * (bi + 1), y: padding + tableH };
    }
  };

  return (
    <div className="relative" style={{ width: outerW, height: outerH }}>
      <div
        className="absolute bg-white border-2 border-gray-300 rounded-lg flex items-center justify-center"
        style={{ left: padding, top: padding, width: tableW, height: tableH }}
      >
        <span className="text-xs text-gray-400 font-medium">{table.name}</span>
      </div>

      {table.seats.map((seat) => {
        const pos = getSeatPos(seat.seat_index);
        const isSplit = seat.guest_list_id !== null && splitPartyGuestIds.has(seat.guest_list_id);
        return (
          <SeatSlot
            key={seat.seat_index}
            seat={seat}
            tableId={table.id}
            onAssign={() => onAssignGuest(table.id, seat.seat_index)}
            onUnassign={() => onUnassignGuest(table.id, seat.seat_index)}
            isSplit={isSplit}
            style={{ left: pos.x, top: pos.y }}
          />
        );
      })}
    </div>
  );
}

function HeadTable({ table, onAssignGuest, onUnassignGuest, splitPartyGuestIds }: {
  table: SeatingTableData;
  onAssignGuest: (tableId: number, seatIndex: number) => void;
  onUnassignGuest: (tableId: number, seatIndex: number) => void;
  splitPartyGuestIds: Set<number>;
}) {
  const n = table.seats.length;
  const tableW = Math.max(320, n * 44);
  const tableH = 80;
  const padding = 40;
  const outerW = tableW + padding * 2;
  const outerH = tableH + padding * 2;

  return (
    <div className="relative" style={{ width: outerW, height: outerH }}>
      <div
        className="absolute bg-white border-2 border-gray-300 rounded-lg flex flex-col items-center justify-center"
        style={{ left: padding, top: padding, width: tableW, height: tableH }}
      >
        <span className="text-xs text-gray-400 font-medium">{table.name}</span>
        <span className="text-xs text-gray-300">Head Table</span>
      </div>

      {table.seats.map((seat) => {
        const spacing = tableW / (n + 1);
        const x = padding + spacing * (seat.seat_index + 1);
        const y = padding;
        const isSplit = seat.guest_list_id !== null && splitPartyGuestIds.has(seat.guest_list_id);
        return (
          <SeatSlot
            key={seat.seat_index}
            seat={seat}
            tableId={table.id}
            onAssign={() => onAssignGuest(table.id, seat.seat_index)}
            onUnassign={() => onUnassignGuest(table.id, seat.seat_index)}
            isSplit={isSplit}
            style={{ left: x, top: y }}
          />
        );
      })}
    </div>
  );
}

export default function TableNode({ data }: TableNodeProps) {
  const { table, onAssignGuest, onUnassignGuest, onDeleteTable, onRenameTable, splitPartyGuestIds } = data;
  const [hovered, setHovered] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamingValue, setRenamingValue] = useState(table.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = () => {
    setRenamingValue(table.name);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const commitRename = () => {
    if (renamingValue.trim()) {
      onRenameTable(table.id, renamingValue.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowDeleteConfirm(false); }}
    >
      {/* React Flow handles (invisible, for connecting) */}
      <Handle type="source" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />

      {/* Hover controls */}
      {hovered && (
        <div className="nodrag absolute -top-8 left-1/2 -translate-x-1/2 flex gap-1 bg-white border border-gray-200 rounded-lg shadow px-2 py-1 z-40">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="text-xs border border-gray-300 rounded px-1 py-0.5 w-28 outline-none"
              value={renamingValue}
              onChange={e => setRenamingValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setIsRenaming(false); }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <button
              className="nodrag text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
              title="Rename table"
              onClick={(e) => { e.stopPropagation(); startRename(); }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}

          {showDeleteConfirm ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-600">Delete?</span>
              <button
                className="nodrag text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 hover:bg-red-200"
                onClick={(e) => { e.stopPropagation(); onDeleteTable(table.id); }}
              >
                Yes
              </button>
              <button
                className="nodrag text-xs bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 hover:bg-gray-200"
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
              >
                No
              </button>
            </div>
          ) : (
            <button
              className="nodrag text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
              title="Delete table"
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Table rendering */}
      {table.table_type === 'round' && (
        <RoundTable
          table={table}
          onAssignGuest={onAssignGuest}
          onUnassignGuest={onUnassignGuest}
          splitPartyGuestIds={splitPartyGuestIds}
        />
      )}
      {table.table_type === 'rectangular' && (
        <RectangularTable
          table={table}
          onAssignGuest={onAssignGuest}
          onUnassignGuest={onUnassignGuest}
          splitPartyGuestIds={splitPartyGuestIds}
        />
      )}
      {table.table_type === 'head' && (
        <HeadTable
          table={table}
          onAssignGuest={onAssignGuest}
          onUnassignGuest={onUnassignGuest}
          splitPartyGuestIds={splitPartyGuestIds}
        />
      )}
    </div>
  );
}
