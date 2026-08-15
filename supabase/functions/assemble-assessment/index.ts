import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, createUserScopedClient } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authenticateRequest(req);
  if (auth.error || !auth.context) return auth.error ?? json(req, { error: "Unauthorized" }, 401);

  const rateLimited = await enforceSessionRateLimitAsync(
    createServiceClient(),
    "assemble-assessment",
    auth.context.user.id,
  );
  if (rateLimited) return rateLimited;

  const body = await req.json().catch(() => null);
  const templateId = String(body?.template_id ?? "").trim();
  if (!templateId) return json(req, { error: "template_id is required" }, 400);

  const userDb = createUserScopedClient(auth.context.accessToken);
  const { data, error } = await userDb.rpc("assemble_assessment_from_template", {
    p_template_id: templateId,
  });
  if (error) return json(req, { error: error.message }, 400);
  return json(req, data);
});
