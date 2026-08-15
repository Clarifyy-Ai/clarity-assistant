import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, createUserScopedClient } from "../_shared/auth.ts";

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

  const body = await req.json().catch(() => null);
  const courseId = String(body?.course_id ?? "").trim();
  if (!courseId) return json(req, { error: "course_id is required" }, 400);

  const userDb = createUserScopedClient(auth.context.accessToken);
  const { data, error } = await userDb.rpc("issue_course_certificate", { p_course_id: courseId });
  if (error) return json(req, { error: error.message }, 400);
  return json(req, data);
});
