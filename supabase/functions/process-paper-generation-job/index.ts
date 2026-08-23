/**
 * process-paper-generation-job — claim a leased job and run assembly.
 *
 * Auth (any one):
 *  - x-internal-secret / Bearer matching PAPER_JOB_WORKER_SECRET or INTERNAL_WORKER_SECRET
 *  - Bearer service role key
 *  - JWT admin
 *  - JWT owner (must pass jobId; owner retry / reclaim)
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  authenticateRequest,
  extractBearerToken,
  isAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  assembleClaimedPaperJob,
} from "../_shared/govPaperAssembly.ts";
import { isPythonPaperFactoryGenerator } from "../_shared/govGeneratorRouting.ts";
import {
  claimPaperGenerationJob,
  newWorkerId,
  reclaimExpiredPaperJobs,
} from "../_shared/govPaperJobLease.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    ? s
    : null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function hasInternalAuth(req: Request): boolean {
  const secrets = [
    Deno.env.get("PAPER_JOB_WORKER_SECRET"),
    Deno.env.get("INTERNAL_WORKER_SECRET"),
  ].filter((s): s is string => Boolean(s && s.length > 8));

  if (secrets.length === 0) return false;

  const headerSecret = req.headers.get("x-internal-secret")?.trim() ?? "";
  const bearer = extractBearerToken(req) ?? "";

  for (const secret of secrets) {
    if (headerSecret && timingSafeEqual(headerSecret, secret)) return true;
    if (bearer && timingSafeEqual(bearer, secret)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const db = createServiceClient();

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = uuidOrNull(
      body && typeof body === "object"
        ? (body as Record<string, unknown>).jobId
        : null,
    );

    const internal = hasInternalAuth(req);
    let actor: "internal" | "admin" | "owner" | null = internal ? "internal" : null;
    let userId: string | null = null;

    if (!internal) {
      const auth = await authenticateRequest(req);
      if (auth.error) return auth.error;
      userId = auth.context.user.id;
      if (await isAdmin(userId)) {
        actor = "admin";
      } else if (jobId) {
        actor = "owner";
      } else {
        return forbiddenResponse(
          "Owner calls must include jobId; omit jobId only for admin/internal workers.",
        );
      }
    }

    if (!actor) return unauthorizedResponse();

    // Opportunistic reclaim of lease-expired jobs so nothing stays Generating forever.
    await reclaimExpiredPaperJobs(db, { limit: 10 }).catch((err) => {
      console.warn("[process-paper-generation-job] reclaim:", err);
    });

    const workerId = newWorkerId(actor === "internal" ? "svc" : actor);

    const claimed = await claimPaperGenerationJob(db, {
      jobId: jobId ?? undefined,
      workerId,
      userId: actor === "owner" && userId ? userId : undefined,
    });

    if (!claimed.ok) {
      if (claimed.reason === "max_attempts") {
        return json(req, {
          status: "failed",
          errorCode: "MAX_ATTEMPTS",
          error: "Exceeded max processing attempts",
          jobId,
        }, 422);
      }
      if (jobId) {
        const { data: existing } = await db
          .from("gov_paper_generation_jobs")
          .select("id, status, mock_test_id, generated_paper_id, error_code, user_id, request_json")
          .eq("id", jobId)
          .maybeSingle();

        if (!existing) {
          return json(req, { error: "Job not found", code: "PAPER_NOT_FOUND" }, 404);
        }
        if (actor === "owner" && userId && existing.user_id !== userId) {
          return forbiddenResponse("You do not own this job.");
        }
        if (existing.status === "completed") {
          return json(req, {
            jobId: existing.id,
            status: "completed",
            mockTestId: existing.mock_test_id,
            paperId: existing.generated_paper_id,
            idempotent: true,
          });
        }
        if (existing.status === "cancelled") {
          return json(req, {
            jobId: existing.id,
            status: "cancelled",
            errorCode: "CANCELLED",
            idempotent: true,
          });
        }
        const routedGenerator = String(
          (existing.request_json as Record<string, unknown> | null)?.generator ?? "",
        );
        if (isPythonPaperFactoryGenerator(routedGenerator)) {
          return json(req, {
            jobId: existing.id,
            status: existing.status,
            code: "PYTHON_FACTORY_OWNED",
            error: "This job is owned by the Python paper-factory worker.",
            generator: routedGenerator,
          }, 202);
        }
      }
      return json(req, {
        error: claimed.message ?? "No claimable job",
        code: "NOT_CLAIMABLE",
        jobId,
      }, 409);
    }

    // Do not Edge-assemble jobs explicitly routed to the Python factory.
    const claimedGenerator = String(
      (claimed.job.request_json as Record<string, unknown> | null | undefined)?.generator ?? "",
    );
    if (isPythonPaperFactoryGenerator(claimedGenerator)) {
      // Release the lease so the Python worker can reclaim.
      await db
        .from("gov_paper_generation_jobs")
        .update({
          status: "queued",
          worker_id: null,
          lease_expires_at: null,
          progress_stage: "queued",
        })
        .eq("id", claimed.job.id)
        .eq("worker_id", claimed.workerId);
      return json(req, {
        jobId: claimed.job.id,
        status: "queued",
        code: "PYTHON_FACTORY_OWNED",
        error: "Job released for Python paper-factory worker.",
        generator: claimedGenerator,
      }, 202);
    }

    const result = await assembleClaimedPaperJob(db, claimed.job, claimed.workerId);

    if (result.ok) {
      return json(req, {
        jobId: claimed.job.id,
        status: "completed",
        mockTestId: result.mockTestId,
        paperId: result.paperId,
        questionCount: result.questionCount,
        paperClass: result.paperClass,
        disclaimer: result.disclaimer,
        patternVersion: result.patternVersion,
        syllabusVersion: result.syllabusVersion,
        workerId: claimed.workerId,
        attemptCount: claimed.attemptCount,
      });
    }

    return json(req, {
      jobId: claimed.job.id,
      status: result.status,
      errorCode: result.errorCode,
      error: result.error,
      available: result.available,
      required: result.required,
      workerId: claimed.workerId,
      attemptCount: claimed.attemptCount,
    }, result.status === "cancelled" ? 202 : (result.httpStatus ?? 500));
  } catch (err) {
    console.error("[process-paper-generation-job]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
