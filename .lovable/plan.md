## Phase 3 — Banned-user enforcement + close stale findings

**Guardrail:** only the auth-block in two edge functions + one new shared helper. No business logic touched. No client/UI changes (admin UI already correct).

### 1. Create shared helper
**New file:** `supabase/functions/_shared/banCheck.ts`

```ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function isUserBanned(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db
    .from("profiles")
    .select("is_banned")
    .eq("id", userId)
    .maybeSingle();
  return !!data?.is_banned;
}

export function bannedResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: "Account suspended. Contact support.", code: "ACCOUNT_BANNED" }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### 2. Gate `start-session`
Insert right after rate-limit check (after line 405, before `// validate body…`):
```ts
const db0 = createServiceClient();
if (await isUserBanned(db0, user.id)) {
  return withCorsHeaders(req, bannedResponse(corsHeaders));
}
```
(Or reuse the existing `db` if one is already created before that point — re-check after the rate limit block.)

### 3. Gate `generate-answer`
Same insertion right after the rate-limit block (after line 423), reusing the existing `db` declared on line 392.

### 4. Mark stale scanner findings fixed
- `agent_security` / `admin_make_admin_broken` → fixed (verified: `AdminUsers.tsx:82-92` upserts into `user_roles`).
- `agent_security` / `admin_ban_broken` → fixed (verified: ban/unban toggles `is_banned` via `bulk_update_users` RPC; plus we are now adding the server-side enforcement gate).
- `agent_security` / `no_ratelimit_sensitive_fns` → ignored (per surfaced backend rate-limit guidance: no rate-limit primitives, will be addressed separately).

### 5. Update security memory
Note that `admin_ban_broken` is now enforced server-side; rate limiting on `send-email`/`export-user-data`/`delete-account` is an accepted gap pending platform primitives.

### Deploy + verify
- Deploy `start-session` and `generate-answer`.
- Smoke-test with `supabase--curl_edge_functions` — confirm a normal call still returns 200; (cannot easily simulate a banned user, but a static read of the modified files will confirm the gate runs before any side-effect).

After this phase I'll stop and wait for go-ahead on **Phase 4** (`.maybeSingle()` conversions + AdminDashboard error handling + N+1 elimination).