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
import { tabAwareAuthStorage } from "@/lib/auth/tabLocalLogout";
import { shouldDetectSessionInUrl } from "@/lib/auth/accountBootstrap";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Shared localStorage for multi-tab login; tab-local logout hides the session
    // in this tab only (see tabAwareAuthStorage / softClearTabSession).
    storage: tabAwareAuthStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Only consume ?code= / hash tokens on callback/recovery URLs. Leftover
    // query params on /login would POST /auth/v1/token and return HTTP 400.
    detectSessionInUrl: shouldDetectSessionInUrl(),
    flowType: "pkce",
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
