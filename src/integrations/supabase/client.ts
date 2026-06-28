// Canonical Supabase client. Single createClient() instance for the whole app.
// Both import paths resolve here:
//   import { supabase } from "@/integrations/supabase/client";
//   import { supabase } from "@/lib/supabase/client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "@/lib/env";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

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
