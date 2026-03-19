// ─── Primary Client (use this everywhere) ────────────────────────────────────
export { supabase, auth, table, bucket, realtimeChannel, checkSupabaseConnection } from "./client";

// ─── Types (auto-generated from Supabase CLI) ─────────────────────────────────
export type { Database } from "./types";

// ─── Convenience Type Extractors ─────────────────────────────────────────────
/**
 * Extract the Row type from any table.
 * @example
 * type Session = Tables<"sessions">;
 */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/**
 * Extract the Insert type from any table.
 * @example
 * type NewSession = TablesInsert<"sessions">;
 */
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/**
 * Extract the Update type from any table.
 * @example
 * type UpdateSession = TablesUpdate<"sessions">;
 */
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

/**
 * Extract an enum value type from the database schema.
 * @example
 * type UserRole = Enums<"user_role">;
 */
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
