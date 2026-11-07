/**
 * Where a table's chairs go, and how big the table is — one answer for the
 * canvas (`TableNode`) and the printed floor plan (`seatingExport`), so the
 * paper cannot drift from the screen. Pure; covered by `check:seating`.
 *
 * Coordinates are the table node's own: (0, 0) is the node's top-left, which
 * is the position stored on `seating_tables` (x, y).
 *
 *   round        the node includes a margin for the chairs (ORBIT_PAD); chairs
 *                go clockwise from the top.
 *   rectangular  chairs on both long sides, clockwise: the first half along the
 *                top from the left, the rest back along the bottom from the
 *                right — so a party stays side by side round the end.
 *   head         every chair on one side, facing the room.
 *
 * **Every table of a shape is the same size** — the shape's size for the floor
 * plan (`floor_plans.table_sizes`, set by hand in Room settings), never derived
 * from how many sit at it. A crowded table keeps its size and narrows its names
 * instead (`chipWidth`); the full name is on hover. Tables used to grow with
 * their chairs (v0.10.40), which made a room of identical tables look like a
 * room of different furniture.
 *
 * A turned table spins about its own centre; the chairs move with it but their
 * names stay level, so they can be read.
 */

export type TableShape = 'round' | 'rectangular' | 'head';

/** A name chip, as the canvas draws it (names are cut off past this width). */
export const CHIP_WIDTH = 112;
export const CHIP_HEIGHT = 22;
/** One chair's share of a long table's edge. */
export const SEAT_SLOT = CHIP_WIDTH + 8;
/** The gap between a table's edge and the middle of the names along it. */
const EDGE_GAP = CHIP_HEIGHT / 2 + 6;

export const ORBIT_PAD = 52;
/** How far the names sit outside a round table's edge. */
const ROUND_SEAT_OFFSET = 28;
/** Names never narrow past this; below it they would be a letter and a dot. */
export const MIN_CHIP_WIDTH = 44;
const END_MARGIN = 8;

/** A table's size in canvas units, unturned: `width` is a long table's length, a round table's diameter. */
export interface TableSize { width: number; height: number }
export type TableSizes = Record<TableShape, TableSize>;

/** What a floor plan uses until the couple sets their own. */
export const DEFAULT_TABLE_SIZES: TableSizes = {
    round: { width: 180, height: 180 },
    rectangular: { width: 360, height: 100 },
    head: { width: 480, height: 80 },
};

/** What the size fields accept, so a typo cannot make a table vanish or fill the room. */
export const TABLE_SIZE_LIMITS = {
    length: { min: 80, max: 1200 },
    depth: { min: 40, max: 400 },
} as const;

function clampSize(value: unknown, limits: { min: number; max: number }, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(limits.max, Math.max(limits.min, Math.round(n)));
}

/**
 * The floor plan's sizes from whatever is stored — null, a partial object, or
 * an older row — filled in from the defaults and held to the limits. A round
 * table's height is its width: there is one number for a circle.
 */
export function normaliseTableSizes(raw: unknown): TableSizes {
    const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<TableShape, Partial<TableSize>>>;
    const L = TABLE_SIZE_LIMITS;
    const round = clampSize(src.round?.width, L.length, DEFAULT_TABLE_SIZES.round.width);
    return {
        round: { width: round, height: round },
        rectangular: {
            width: clampSize(src.rectangular?.width, L.length, DEFAULT_TABLE_SIZES.rectangular.width),
            height: clampSize(src.rectangular?.height, L.depth, DEFAULT_TABLE_SIZES.rectangular.height),
        },
        head: {
            width: clampSize(src.head?.width, L.length, DEFAULT_TABLE_SIZES.head.width),
            height: clampSize(src.head?.height, L.depth, DEFAULT_TABLE_SIZES.head.height),
        },
    };
}

/** The shape a stored `table_type` draws as. */
export function shapeOf(type: string): TableShape {
    return type === 'round' || type === 'head' ? type : 'rectangular';
}

export interface Point { x: number; y: number }
export interface Box { minX: number; minY: number; maxX: number; maxY: number }

/** Which way a side of the table faces on screen, after turning. */
export type Facing = 'up' | 'right' | 'down' | 'left';

export interface SeatSpot extends Point {
    /** Round tables: undefined. Long tables: the side this chair is on. */
    side?: 'first' | 'second';
}

export interface TableLayout {
    shape: TableShape;
    /** The table top, unturned, in node coordinates. */
    body: { x: number; y: number; width: number; height: number };
    centre: Point;
    rotation: number;
    /** Each chair's centre, in seat order, already turned. */
    seats: SeatSpot[];
    /** The size the node itself takes on the canvas. */
    node: { width: number; height: number };
    /** Everything the table draws — names included — in node coordinates. */
    box: Box;
    /** How wide each name may be at this table, so neighbours never sit on each other. */
    chipWidth: number;
}

export function normaliseRotation(degrees: number): number {
    if (!Number.isFinite(degrees)) return 0;
    const r = ((Math.round(degrees * 10) / 10) % 360 + 360) % 360;
    return r === 360 ? 0 : r;
}

/** Snap to the nearest step (15° by default), unless `free`. */
export function snapRotation(degrees: number, free = false, step = 15): number {
    return normaliseRotation(free ? degrees : Math.round(degrees / step) * step);
}

function turn(p: Point, about: Point, degrees: number): Point {
    if (!degrees) return p;
    const a = (degrees * Math.PI) / 180;
    const dx = p.x - about.x;
    const dy = p.y - about.y;
    return {
        x: about.x + dx * Math.cos(a) - dy * Math.sin(a),
        y: about.y + dx * Math.sin(a) + dy * Math.cos(a),
    };
}

/** The chairs per side of a long table: the top gets the extra one. */
export function sideCounts(shape: TableShape, n: number): { first: number; second: number } {
    if (shape === 'head') return { first: n, second: 0 };
    const first = Math.ceil(n / 2);
    return { first, second: n - first };
}

const clampChip = (w: number) => Math.max(MIN_CHIP_WIDTH, Math.min(CHIP_WIDTH, Math.floor(w)));

/**
 * The widest a name can be without touching another, from where the chairs
 * actually are: two names on the same line (closer than a name's height apart
 * vertically) can be no wider than the gap between their centres. Round a
 * circle that is decided at the top and bottom, where neighbours sit side by
 * side — an arc length would overstate it.
 */
function widestClearChip(points: Point[]): number {
    let widest = CHIP_WIDTH;
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            if (Math.abs(points[i].y - points[j].y) >= CHIP_HEIGHT + 2) continue;
            widest = Math.min(widest, Math.abs(points[i].x - points[j].x) - 4);
        }
    }
    return clampChip(widest);
}

/**
 * The layout of one table. `size` is the shape's size for the floor plan —
 * the same for every table of that shape — and defaults to DEFAULT_TABLE_SIZES.
 * The number of chairs moves the chairs and narrows the names; it never changes
 * the table.
 */
export function tableLayout(
    shape: TableShape | string,
    seatCount: number,
    rotationDegrees = 0,
    size?: TableSize,
): TableLayout {
    const n = Math.max(0, Math.floor(seatCount));
    const kind = shapeOf(shape);
    const dims = normaliseTableSizes(size ? { [kind]: size } : null)[kind];

    if (kind === 'round') {
        const diameter = dims.width;
        const seatRadius = diameter / 2 + ROUND_SEAT_OFFSET;
        const centre = { x: ORBIT_PAD + diameter / 2, y: ORBIT_PAD + diameter / 2 };
        const seats = Array.from({ length: n }, (_, i) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2;
            return { x: centre.x + seatRadius * Math.cos(angle), y: centre.y + seatRadius * Math.sin(angle) };
        });
        const chipWidth = widestClearChip(seats);
        return {
            shape: kind,
            body: { x: ORBIT_PAD, y: ORBIT_PAD, width: diameter, height: diameter },
            centre,
            // A circle looks the same at every angle; there is nothing to turn.
            rotation: 0,
            seats,
            node: { width: diameter + ORBIT_PAD * 2, height: diameter + ORBIT_PAD * 2 },
            box: {
                minX: centre.x - seatRadius - chipWidth / 2,
                maxX: centre.x + seatRadius + chipWidth / 2,
                minY: centre.y - seatRadius - CHIP_HEIGHT / 2,
                maxY: centre.y + seatRadius + CHIP_HEIGHT / 2,
            },
            chipWidth,
        };
    }

    const rotation = normaliseRotation(rotationDegrees);
    const { first, second } = sideCounts(kind, n);
    const { width, height } = dims;
    const centre = { x: width / 2, y: height / 2 };
    // A chair's share of the side: a full slot when there is room, otherwise
    // the side split evenly — the table stays its size and the names narrow.
    const busiest = Math.max(first, second);
    const slot = busiest === 0 ? SEAT_SLOT : Math.min(SEAT_SLOT, (width - END_MARGIN * 2) / busiest);
    const chipWidth = clampChip(slot - 8);
    // Each side's chairs are centred along it.
    const startOf = (count: number) => (width - count * slot) / 2;
    const flat: SeatSpot[] = [];
    for (let i = 0; i < first; i++) {
        flat.push({ x: startOf(first) + slot * (i + 0.5), y: -EDGE_GAP, side: 'first' });
    }
    // The second side runs back from the right, so the order goes round the table.
    for (let j = 0; j < second; j++) {
        flat.push({ x: startOf(second) + slot * (second - j - 0.5), y: height + EDGE_GAP, side: 'second' });
    }
    const seats = flat.map(s => ({ ...turn(s, centre, rotation), side: s.side }));

    const corners = [
        { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height },
    ].map(p => turn(p, centre, rotation));
    const xs = [...corners.map(p => p.x), ...seats.flatMap(s => [s.x - chipWidth / 2, s.x + chipWidth / 2])];
    const ys = [...corners.map(p => p.y), ...seats.flatMap(s => [s.y - CHIP_HEIGHT / 2, s.y + CHIP_HEIGHT / 2])];
    return {
        shape: kind,
        body: { x: 0, y: 0, width, height },
        centre,
        rotation,
        seats,
        node: { width, height },
        box: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
        chipWidth,
    };
}

/** Which way a side of a long table faces on screen once turned. */
export function sideFacing(side: 'first' | 'second', rotationDegrees: number): Facing {
    // Unturned, the first side faces up (270° in screen terms), the second down.
    const base = side === 'first' ? 270 : 90;
    const a = normaliseRotation(base + rotationDegrees);
    if (a >= 315 || a < 45) return 'right';
    if (a < 135) return 'down';
    if (a < 225) return 'left';
    return 'up';
}

const FACING_WORD: Record<Facing, string> = { up: 'top', right: 'right', down: 'bottom', left: 'left' };

/** "top" / "right" / … for a side, as the couple sees it on screen. */
export function sideName(side: 'first' | 'second', rotationDegrees: number): string {
    return FACING_WORD[sideFacing(side, rotationDegrees)];
}

const RUN_WORDS: Record<Facing, string> = {
    right: 'left to right', down: 'top to bottom', left: 'right to left', up: 'bottom to top',
};

/**
 * Which way the chairs along a side run on screen, in seat order — "left to
 * right" along the top of an unturned table, "right to left" back along the
 * bottom. Turned 90°, the top side becomes the right and runs top to bottom.
 */
export function seatRunDirection(side: 'first' | 'second', rotationDegrees: number): string {
    // Unturned, the first side runs rightwards (0°) and the second leftwards (180°).
    const a = normaliseRotation((side === 'first' ? 0 : 180) + rotationDegrees);
    const facing: Facing = a >= 315 || a < 45 ? 'right' : a < 135 ? 'down' : a < 225 ? 'left' : 'up';
    return RUN_WORDS[facing];
}
