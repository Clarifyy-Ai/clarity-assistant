/**
 * process-paper-generation-job — claim a leased job and run assembly.
 *
 * Hybrid routing is plan-driven (MATRIX `gov_exam_assemble` via
 * `decideGenerationPlan` + `govPaperAssembly`), not request-scoped
 * `executeHybridOperation`. AI gap-fill failure falls back to Python/bank
 * inside the assembler (`pythonFallbackOnAiFailure`).
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
  releasePaperJobForPythonFactory,
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
  let claimedJobId: string | null = null;
  let claimedWorkerId: string | null = null;

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
      if (claimed.message === "PYTHON_FACTORY_OWNED" && jobId) {
        const { data: owned } = await db
          .from("gov_paper_generation_jobs")
          .select(
            "id, status, mock_test_id, generated_paper_id, error_code, user_id, request_json, lease_expires_at, started_at",
          )
          .eq("id", jobId)
          .maybeSingle();

        const leaseActive =
          owned?.lease_expires_at &&
          new Date(String(owned.lease_expires_at)).getTime() > Date.now();
        if (owned && !leaseActive && owned.status !== "completed" && owned.status !== "cancelled") {
          const prevJson =
            owned.request_json && typeof owned.request_json === "object"
              ? (owned.request_json as Record<string, unknown>)
              : {};
          await db
            .from("gov_paper_generation_jobs")
            .update({
              request_json: { ...prevJson, generator: "edge_assembler", pythonFallback: "stale_python_lease" },
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
          const fallback = await claimPaperGenerationJob(db, {
            jobId,
            workerId,
            userId: actor === "owner" && userId ? userId : undefined,
          });
          if (fallback.ok) {
            claimedJobId = String(fallback.job.id);
            claimedWorkerId = fallback.workerId;
            const result = await assembleClaimedPaperJob(db, fallback.job, fallback.workerId);
            if (result.ok) {
              return json(req, {
                jobId: fallback.job.id,
                status: "completed",
                mockTestId: result.mockTestId,
                paperId: result.paperId,
                questionCount: result.questionCount,
                paperClass: result.paperClass,
                workerId: fallback.workerId,
                attemptCount: fallback.attemptCount,
                pythonFallback: true,
              });
            }
            return json(req, {
              jobId: fallback.job.id,
              status: result.status,
              errorCode: result.errorCode,
              error: result.error,
              pythonFallback: true,
            }, result.status === "cancelled" ? 202 : (result.httpStatus ?? 500));
          }
        }

        return json(req, {
          jobId,
          status: owned?.status ?? "queued",
          mockTestId: owned?.mock_test_id ?? null,
          paperId: owned?.generated_paper_id ?? null,
          code: "PYTHON_FACTORY_OWNED",
          error: "This job is owned by the Python paper-factory worker.",
        }, 202);
      }
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
        if (
          existing.status === "queued" ||
          existing.status === "failed_retryable" ||
          existing.status === "failed"
        ) {
          await db
            .from("gov_paper_generation_jobs")
            .update({
              worker_id: null,
              lease_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId)
            .in("status", ["queued", "failed_retryable", "failed"]);
          const stolen = await claimPaperGenerationJob(db, {
            jobId,
            workerId,
            userId: actor === "owner" && userId ? userId : undefined,
          });
          if (stolen.ok) {
            claimedJobId = String(stolen.job.id);
            claimedWorkerId = stolen.workerId;
            const result = await assembleClaimedPaperJob(db, stolen.job, stolen.workerId);
            if (result.ok) {
              return json(req, {
                jobId: stolen.job.id,
                status: "completed",
                mockTestId: result.mockTestId,
                paperId: result.paperId,
                questionCount: result.questionCount,
                paperClass: result.paperClass,
                workerId: stolen.workerId,
                attemptCount: stolen.attemptCount,
                recovered: true,
              });
            }
            return json(req, {
              jobId: stolen.job.id,
              status: result.status,
              errorCode: result.errorCode,
              error: result.error,
              recovered: true,
            }, result.status === "cancelled" ? 202 : (result.httpStatus ?? 500));
          }
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
      // Safety net: restore attempt_count if Edge claimed before routing was visible.
      await releasePaperJobForPythonFactory(
        db,
        String(claimed.job.id),
        claimed.workerId,
        Math.max(0, claimed.attemptCount - 1),
      );
      return json(req, {
        jobId: claimed.job.id,
        status: "queued",
        code: "PYTHON_FACTORY_OWNED",
        error: "Job released for Python paper-factory worker.",
        generator: claimedGenerator,
      }, 202);
    }

    claimedJobId = String(claimed.job.id);
    claimedWorkerId = claimed.workerId;
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
    if (claimedJobId && claimedWorkerId) {
      const now = new Date().toISOString();
      await db
        .from("gov_paper_generation_jobs")
        .update({
          status: "failed_retryable",
          progress_stage: "failed_retryable",
          retryable: true,
          error_code: "WORKER_EXCEPTION",
          error_message: "Generation worker failed unexpectedly. Retry is available.",
          worker_id: null,
          lease_expires_at: null,
          completed_at: null,
          updated_at: now,
        })
        .eq("id", claimedJobId)
        .eq("worker_id", claimedWorkerId)
        .filter("status", "not.in", "(completed,cancelled,failed_permanent)");
    }
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
