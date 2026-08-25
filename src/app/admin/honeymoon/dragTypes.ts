/**
 * The drag payloads that cross component trees.
 *
 * The itinerary's stop list is a dnd-kit sortable and stays one — reordering
 * inside a list is what it is good at. Dropping something *onto* a day is a
 * different problem: on the map's split view the thing being dragged lives in
 * another panel entirely, and sharing a dnd-kit context across the two means
 * hoisting it into the map's layout and threading it through both tabs. The
 * browser's own drag API crosses trees for free, which is the whole reason it is
 * used for these two gestures and nothing else.
 *
 * Custom MIME types, not `text/plain`: dropping a stop onto a text field should
 * do nothing, and a stray drop from outside the app must never be read as an id.
 */
export const PLACE_DRAG = 'application/x-honeymoon-place';
export const STOP_DRAG = 'application/x-honeymoon-stop';
export const DROP_TYPES = [PLACE_DRAG, STOP_DRAG];
