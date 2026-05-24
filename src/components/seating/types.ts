export type TableType = 'round' | 'rectangular' | 'head';

export interface SeatData {
  seat_index: number;
  guest_list_id: number | null;
  guest_name: string | null;
  plus_one_name: string | null;
  party_size: number;
}

export interface SeatingTableData {
  id: number;
  name: string;
  table_type: TableType;
  seat_count: number;
  x: number;
  y: number;
  rotation: number;
  seats: SeatData[];
}

export interface FloorPlan {
  id: number;
  name: string;
  room_width: number | null;
  room_height: number | null;
}

export interface GuestListEntry {
  id: number;
  guest_name: string;
  plus_one_name: string | null;
  party_size: number;
  side: string | null;
  assigned_seat?: { table_name: string; seat_index: number } | null;
}
