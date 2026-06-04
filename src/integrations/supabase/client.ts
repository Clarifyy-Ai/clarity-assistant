// Canonical Supabase client. Single createClient() instance for the whole app.
// Both import paths resolve here:
//   import { supabase } from "@/integrations/supabase/client";
//   import { supabase } from "@/lib/supabase/client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = "https://qzgvjrvtkwlzxpmlddkx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6Z3ZqcnZ0a3dsenhwbWxkZGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MDE4MzAsImV4cCI6MjA4OTM3NzgzMH0.hsDv4Sk7L8on5zlr9K6LT1FQe3bEEzmav5bCYes-0so";

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
