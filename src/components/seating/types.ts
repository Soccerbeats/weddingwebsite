export type TableType = 'round' | 'rectangular' | 'head';

export interface SeatTransferPayload {
  fromTableId: number;
  seatIndex: number;
  displayName: string;
  partyGroupId: number | null;
  guestListId: number | null;
}

export interface SeatData {
  seat_index: number;
  guest_list_id: number | null;
  display_name: string;
  party_group_id: number | null;
  // from guest_list join (only for primary guest seats)
  guest_name: string | null;
  plus_one_name: string | null;
  party_size: number | null;
  rsvp_status: string | null;
}

export type ColorMode = 'party' | 'rsvp';

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
  rsvp_status: string | null;
  invited: boolean;
  assigned_seat?: { table_name: string; seat_index: number } | null;
}
