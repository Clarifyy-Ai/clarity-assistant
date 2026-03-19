// ─────────────────────────────────────────────────────────────────────────────
// pages/app/practice/index.ts — Barrel export for the Practice Rooms feature.
// NewRoom and RoomSession are aliased from rooms/ to avoid duplication.
// ─────────────────────────────────────────────────────────────────────────────

export { default as PracticeRooms } from "./PracticeRooms";
export { default as NewRoom }       from "./NewRoom";
export { default as RoomSession }   from "./RoomSession";
