// Default RSVP-confirmation room-block message. Shared between the admin editor
// (pre-fills the textarea so it's visible/overwritable) and the public RSVP form
// (fallback when nothing is saved). Supports {names}, {hotel}, and {book} tokens.
// Plain module with no server deps so it's safe to import in client components.
export const DEFAULT_ROOM_BLOCK_MESSAGE =
    "Need a place to rest your head? {names} have lovingly reserved a block of rooms at {hotel} just for our guests. Tap {book} to claim a spot within our block. Prefer to call and arrange your stay another way? That's perfectly wonderful too — whatever makes your trip to celebrate with us the sweetest. ♥";
