import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Shared requireAuth → getUser(token) via authenticateRequest.
  const auth = await authenticateRequest(req);
  if (auth.error || !auth.context) return auth.error ?? json(req, { error: "Unauthorized", code: "UNAUTHORIZED" }, 401);

  const userId = auth.context.user.id;
  const db = createServiceClient();

  const rateLimited = await enforceSessionRateLimitAsync(db, "issue-course-certificate", userId);
  if (rateLimited) return withCorsHeaders(req, rateLimited);

  const body = await req.json().catch(() => null);
  const courseId = String(body?.course_id ?? "").trim();
  if (!courseId || !UUID_RE.test(courseId)) {
    return json(req, { error: "course_id is required", code: "INVALID_PAYLOAD" }, 400);
  }

  // Idempotent: return existing certificate without re-issuing.
  const { data: existing, error: existingErr } = await db
    .from("course_certificates")
    .select("id, certificate_code")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (existingErr) {
    console.error("[issue-course-certificate] existing lookup failed:", existingErr.message);
    return json(req, { error: "Certificate service unavailable.", code: "CERTIFICATE_UNAVAILABLE" }, 503);
  }
  const { data: course, error: courseErr } = await db
    .from("learning_courses")
    .select("id, title, duration_hours, publish_status")
    .eq("id", courseId)
    .maybeSingle();
  if (courseErr) {
    console.error("[issue-course-certificate] course lookup failed:", courseErr.message);
    return json(req, { error: "Certificate service unavailable.", code: "CERTIFICATE_UNAVAILABLE" }, 503);
  }
  if (!course || course.publish_status !== "published") {
    return json(req, { error: "Course not found.", code: "COURSE_NOT_FOUND" }, 404);
  }

  // Recompute eligibility from lesson progress (authoritative) and persist enrollment
  // in the same flow so certificate issue never races stale percentage rows.
  const { data: moduleRows, error: moduleErr } = await db
    .from("learning_modules")
    .select("id")
    .eq("course_id", courseId);
  if (moduleErr) {
    console.error("[issue-course-certificate] module lookup failed:", moduleErr.message);
    return json(req, { error: "Certificate service unavailable.", code: "CERTIFICATE_UNAVAILABLE" }, 503);
  }
  const moduleIds = (moduleRows ?? []).map((row) => row.id as string);
  let lessonIds: string[] = [];
  if (moduleIds.length > 0) {
    const { data: lessonRows, error: lessonErr } = await db
      .from("learning_lessons")
      .select("id")
      .in("module_id", moduleIds);
    if (lessonErr) {
      console.error("[issue-course-certificate] lesson lookup failed:", lessonErr.message);
      return json(req, { error: "Certificate service unavailable.", code: "CERTIFICATE_UNAVAILABLE" }, 503);
    }
    lessonIds = (lessonRows ?? []).map((row) => row.id as string);
  }
  const total = lessonIds.length;
  let completed = 0;
  if (total > 0) {
    const { data: progressRows, error: progressErr } = await db
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds)
      .not("completed_at", "is", null);
    if (progressErr) {
      console.error("[issue-course-certificate] progress lookup failed:", progressErr.message);
      return json(req, { error: "Certificate service unavailable.", code: "CERTIFICATE_UNAVAILABLE" }, 503);
    }
    completed = (progressRows ?? []).length;
  }
  const percentage = total === 0 ? 0 : Math.round((1000 * completed) / total) / 10;
  if (percentage < 100) {
    if (existing?.id) {
      await db.from("course_certificates").delete().eq("id", existing.id);
    }
    return json(
      req,
      { error: "Course is not complete.", code: "COURSE_NOT_COMPLETE", percentage },
      403,
    );
  }

  const { data: finalQuizzes, error: finalQuizErr } = await db
    .from("learning_quizzes")
    .select("id, passing_percentage")
    .eq("course_id", courseId)
    .eq("is_final", true);
  if (finalQuizErr) {
    console.error("[issue-course-certificate] final assessment lookup failed:", finalQuizErr.message);
    return json(req, { error: "Certificate service unavailable.", code: "CERTIFICATE_UNAVAILABLE" }, 503);
  }
  if ((finalQuizzes ?? []).length > 0) {
    const finalIds = (finalQuizzes ?? []).map((quiz) => quiz.id as string);
    const { data: attempts, error: attemptErr } = await db
      .from("quiz_progress")
      .select("quiz_id, score, completed_at")
      .eq("user_id", userId)
      .in("quiz_id", finalIds);
    if (attemptErr) {
      console.error("[issue-course-certificate] final assessment progress failed:", attemptErr.message);
      return json(req, { error: "Certificate service unavailable.", code: "CERTIFICATE_UNAVAILABLE" }, 503);
    }
    const byQuiz = new Map((attempts ?? []).map((row) => [row.quiz_id as string, row]));
    const passedFinals = (finalQuizzes ?? []).every((quiz) => {
      const attempt = byQuiz.get(quiz.id as string);
      return Boolean(
        attempt?.completed_at &&
        Number(attempt.score ?? -1) >= Number(quiz.passing_percentage ?? 100),
      );
    });
    if (!passedFinals) {
      if (existing?.id) {
        await db.from("course_certificates").delete().eq("id", existing.id);
      }
      return json(
        req,
        {
          error: "Pass the final assessment before requesting a certificate.",
          code: "FINAL_ASSESSMENT_NOT_PASSED",
        },
        403,
      );
    }
  }

  if (existing?.certificate_code) {
    return json(req, { certificate_code: existing.certificate_code, id: existing.id });
  }

  const now = new Date().toISOString();
  const { error: enrollErr } = await db.from("course_enrollments").upsert({
    user_id: userId,
    course_id: courseId,
    percentage,
    completed_at: now,
    last_accessed: now,
  });
  if (enrollErr) {
    console.error("[issue-course-certificate] enrollment upsert failed:", enrollErr.message);
    return json(req, { error: "Certificate service unavailable.", code: "CERTIFICATE_UNAVAILABLE" }, 503);
  }

  const { data: profile } = await db
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const studentName =
    (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
    (typeof profile?.email === "string" && profile.email.includes("@")
      ? profile.email.split("@")[0]
      : "Learner");

  const certificateCode =
    `CLR-${new Date().getUTCFullYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  const { data: inserted, error: insertErr } = await db
    .from("course_certificates")
    .insert({
      certificate_code: certificateCode,
      user_id: userId,
      course_id: courseId,
      student_name: studentName,
      course_name: course.title,
      course_duration_hours: course.duration_hours,
      completion_percentage: percentage,
      issued_at: now,
    })
    .select("id, certificate_code")
    .maybeSingle();

  // Race: another request issued first — return that row (idempotent).
  if (insertErr) {
    const { data: raced } = await db
      .from("course_certificates")
      .select("id, certificate_code")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .maybeSingle();
    if (raced?.certificate_code) {
      return json(req, { certificate_code: raced.certificate_code, id: raced.id });
    }
    console.error("[issue-course-certificate] insert failed:", insertErr.message);
    return json(req, { error: "Certificate could not be issued.", code: "CERTIFICATE_FAILED" }, 400);
  }

  return json(req, {
    certificate_code: inserted?.certificate_code ?? certificateCode,
    id: inserted?.id,
  });
});
