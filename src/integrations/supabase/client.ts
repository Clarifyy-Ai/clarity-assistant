// This file historically created a second Supabase client instance.
// To prevent split auth state / duplicate realtime subscriptions, it now
// re-exports the single canonical client from `src/lib/supabase/client.ts`.
//
// Both import paths continue to work:
//   import { supabase } from "@/integrations/supabase/client";
//   import { supabase } from "@/lib/supabase/client";

import { supabase } from "@/lib/supabase/client";
import type { Database } from "./types";

export { supabase };
export type { Database };

export const auth = supabase.auth;

export const table = (tableName: keyof Database["public"]["Tables"]) =>
  supabase.from(tableName as any);

export const bucket = (bucketName: string) => supabase.storage.from(bucketName);

export const realtimeChannel = (channelName: string) =>
  supabase.channel(channelName);

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.getSession();
    return !error;
  } catch {
    return false;
  }
}
