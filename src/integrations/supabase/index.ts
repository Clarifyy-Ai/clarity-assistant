// ─── Primary Client (use this everywhere) ────────────────────────────────────
export { supabase, auth, table, bucket, realtimeChannel, checkSupabaseConnection } from "./client";

// ─── Types (auto-generated from Supabase CLI) ─────────────────────────────────
export type { Database } from "./types";

// ─── Convenience Type Extractors ─────────────────────────────────────────────
import type { Database } from "./types";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
