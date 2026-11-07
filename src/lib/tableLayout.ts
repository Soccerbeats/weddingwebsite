/**
 * Where a table's chairs go, and how big the table is — one answer for the
 * canvas (`TableNode`) and the printed floor plan (`seatingExport`), so the
 * paper cannot drift from the screen. Pure; covered by `check:seating`.
 *
 * Coordinates are the table node's own: (0, 0) is the node's top-left, which
 * is the position stored on `seating_tables` (x, y).
 *
 *   round        the node includes a margin for the chairs (ORBIT_PAD); chairs
 *                go clockwise from the top, and the table grows so no two
 *                names touch.
 *   rectangular  chairs on both long sides, clockwise: the first half along the
 *                top from the left, the rest back along the bottom from the
 *                right — so a party stays side by side round the end. The table
 *                grows along its length as people sit.
 *   head         every chair on one side, facing the room.
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

const ROUND_MIN = 160;
export const ORBIT_PAD = 52;
/** The arc each name needs round a circle; less than its width, as names near the sides stack. */
const ROUND_ARC_PER_SEAT = 86;

const RECT_MIN_LENGTH = 200;
const RECT_DEPTH = 100;
const HEAD_MIN_LENGTH = 240;
const HEAD_DEPTH = 80;
const END_MARGIN = 8;

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

export function tableLayout(shape: TableShape | string, seatCount: number, rotationDegrees = 0): TableLayout {
    const n = Math.max(0, Math.floor(seatCount));
    const kind: TableShape = shape === 'round' || shape === 'head' ? shape : 'rectangular';

    if (kind === 'round') {
        const seatRadius = Math.max(ROUND_MIN / 2 + 28, (n * ROUND_ARC_PER_SEAT) / (2 * Math.PI));
        const size = Math.max(ROUND_MIN, Math.round((seatRadius - 28) * 2));
        const centre = { x: ORBIT_PAD + size / 2, y: ORBIT_PAD + size / 2 };
        const seats = Array.from({ length: n }, (_, i) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2;
            return { x: centre.x + seatRadius * Math.cos(angle), y: centre.y + seatRadius * Math.sin(angle) };
        });
        return {
            shape: kind,
            body: { x: ORBIT_PAD, y: ORBIT_PAD, width: size, height: size },
            centre,
            // A circle looks the same at every angle; there is nothing to turn.
            rotation: 0,
            seats,
            node: { width: size + ORBIT_PAD * 2, height: size + ORBIT_PAD * 2 },
            box: {
                minX: centre.x - seatRadius - CHIP_WIDTH / 2,
                maxX: centre.x + seatRadius + CHIP_WIDTH / 2,
                minY: centre.y - seatRadius - CHIP_HEIGHT / 2,
                maxY: centre.y + seatRadius + CHIP_HEIGHT / 2,
            },
        };
    }

    const rotation = normaliseRotation(rotationDegrees);
    const { first, second } = sideCounts(kind, n);
    const minLength = kind === 'head' ? HEAD_MIN_LENGTH : RECT_MIN_LENGTH;
    const width = Math.max(minLength, Math.max(first, second) * SEAT_SLOT + END_MARGIN * 2);
    const height = kind === 'head' ? HEAD_DEPTH : RECT_DEPTH;
    const centre = { x: width / 2, y: height / 2 };
    // Each side's chairs are centred along it.
    const startOf = (count: number) => (width - count * SEAT_SLOT) / 2;
    const flat: SeatSpot[] = [];
    for (let i = 0; i < first; i++) {
        flat.push({ x: startOf(first) + SEAT_SLOT * (i + 0.5), y: -EDGE_GAP, side: 'first' });
    }
    // The second side runs back from the right, so the order goes round the table.
    for (let j = 0; j < second; j++) {
        flat.push({ x: startOf(second) + SEAT_SLOT * (second - j - 0.5), y: height + EDGE_GAP, side: 'second' });
    }
    const seats = flat.map(s => ({ ...turn(s, centre, rotation), side: s.side }));

    const corners = [
        { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height },
    ].map(p => turn(p, centre, rotation));
    const xs = [...corners.map(p => p.x), ...seats.flatMap(s => [s.x - CHIP_WIDTH / 2, s.x + CHIP_WIDTH / 2])];
    const ys = [...corners.map(p => p.y), ...seats.flatMap(s => [s.y - CHIP_HEIGHT / 2, s.y + CHIP_HEIGHT / 2])];
    return {
        shape: kind,
        body: { x: 0, y: 0, width, height },
        centre,
        rotation,
        seats,
        node: { width, height },
        box: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
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
