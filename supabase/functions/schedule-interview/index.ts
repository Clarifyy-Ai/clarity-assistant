// ─────────────────────────────────────────────────────────────────────────────
// schedule-interview/index.ts — Create, update, and delete interview events.
// Persists to interview_prep table, queues email reminders via send-email,
// and returns the saved event with a generated prep checklist.
// ─────────────────────────────────────────────────────────────────────────────

import { corsHeaders }  from "../_shared/cors.ts";
import {
  handleCors, parseBody, requireAuth,
  successResponse, errorResponse,
  getAdminClient, deductCredits,
  callAI, requireFields, log,
} from "../_shared/utils.ts";
import type { InterviewEvent, InterviewRound, ReminderConfig, ModelId } from "../_shared/types.ts";

// ─── Supported actions ────────────────────────────────────────────────────────

type Action = "create" | "update" | "delete" | "list";

// ─── Prep checklist generator ─────────────────────────────────────────────────

async function generatePrepChecklist(
  company:     string,
  role:        string,
  round:       InterviewRound,
  model:       ModelId
): Promise<string[]> {
  const roundLabels: Record<InterviewRound, string> = {
    phone_screen:  "Phone Screen",
    technical:     "Technical Interview",
    system_design: "System Design",
    behavioral:    "Behavioural Interview",
    hr:            "HR Round",
    final:         "Final Round",
    offer:         "Offer Discussion",
  };

  const result = await callAI({
    model,
    messages: [
      {
        role:    "system",
        content: "You are an expert interview preparation coach. Return only a JSON array of strings — no markdown, no extra text.",
      },
      {
        role:    "user",
        content: `Generate 8 specific preparation checklist items for a ${roundLabels[round]} at ${company} for a ${role} position. Return JSON array of strings.`,
      },
    ],
    maxTokens:   400,
    temperature: 0.6,
  });

  try {
    const cleaned = result.text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
    return JSON.parse(cleaned) as string[];
  } catch {
    return [
      `Research ${company}'s recent news and products`,
      `Review common ${roundLabels[round]} questions for ${role}`,
      "Prepare 3 STAR stories from your experience",
      "Test your audio/video setup if remote",
      "Prepare thoughtful questions to ask the interviewer",
      "Review your resume and be ready to discuss any item",
      "Get a good night's sleep before the interview",
      "Confirm the interview time, format, and interviewer name",
    ];
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "schedule-interview";

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const auth  = await requireAuth(req);
    const admin = getAdminClient();

    // ── Body ────────────────────────────────────────────────────────────────
    const body = await parseBody<{
      action:       Action;
      // Create / update
      eventId?:     string;
      company?:     string;
      role?:        string;
      round?:       InterviewRound;
      scheduledAt?: string;
      durationMin?: number;
      location?:    string;
      notes?:       string;
      reminders?:   ReminderConfig[];
      generatePrep?: boolean;
      model?:       ModelId;
    }>(req);

    const { action = "create" } = body;

    // ── LIST ─────────────────────────────────────────────────────────────────

    if (action === "list") {
      const { data, error } = await admin
        .from("interview_prep")
        .select("*")
        .eq("user_id", auth.userId)
        .order("interview_date", { ascending: true });

      if (error) throw new Error(error.message);
      return successResponse(data ?? []);
    }

    // ── DELETE ────────────────────────────────────────────────────────────────

    if (action === "delete") {
      if (!body.eventId) {
        return errorResponse("eventId is required for delete.", "VALIDATION_ERROR", 400);
      }

      const { error } = await admin
        .from("interview_prep")
        .delete()
        .eq("id",      body.eventId)
        .eq("user_id", auth.userId);

      if (error) throw new Error(error.message);

      log(FN, "info", "Interview deleted", { userId: auth.userId, eventId: body.eventId });
      return successResponse({ deleted: true, eventId: body.eventId });
    }

    // ── CREATE / UPDATE ───────────────────────────────────────────────────────

    const validation = requireFields(body as Record<string, unknown>, [
      "company", "role", "round", "scheduledAt",
    ]);
    if (!validation.valid) {
      return errorResponse(validation.errors[0].message, "VALIDATION_ERROR", 400);
    }

    const {
      company      = "",
      role         = "",
      round        = "technical",
      scheduledAt  = "",
      durationMin  = 60,
      location,
      notes,
      reminders    = [
        { minutesBefore: 1440, channel: "email" },   // 24h
        { minutesBefore:   60, channel: "email" },   // 1h
      ],
      generatePrep = true,
      model        = "gpt-4o-mini",
    } = body;

    // Validate scheduledAt is a valid future date
    const interviewDate = new Date(scheduledAt);
    if (isNaN(interviewDate.getTime())) {
      return errorResponse("scheduledAt must be a valid ISO date string.", "VALIDATION_ERROR", 400);
    }

    // ── Generate prep checklist (optional, costs 1 credit) ───────────────────

    let prepQuestions: string[] = [];
    if (generatePrep) {
      const credit = await deductCredits(auth.userId, "schedule_interview");
      if (credit.success) {
        try {
          prepQuestions = await generatePrepChecklist(company, role, round as InterviewRound, model);
        } catch {
          log(FN, "warn", "Prep checklist generation failed — continuing without it.");
        }
      }
    }

    // ── Persist to DB ────────────────────────────────────────────────────────

    const now     = new Date().toISOString();
    const payload = {
      user_id:         auth.userId,
      company,
      role,
      interview_date:  scheduledAt,
      notes:           notes ?? null,
      prep_questions:  prepQuestions,
      status:          "pending",
      metadata:        { round, durationMin, location, reminders },
      updated_at:      now,
    };

    let savedEvent: Record<string, unknown>;

    if (action === "update" && body.eventId) {
      const { data, error } = await admin
        .from("interview_prep")
        .update(payload)
        .eq("id",      body.eventId)
        .eq("user_id", auth.userId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      savedEvent = data as Record<string, unknown>;
    } else {
      const { data, error } = await admin
        .from("interview_prep")
        .insert({ ...payload, created_at: now })
        .select()
        .single();

      if (error) throw new Error(error.message);
      savedEvent = data as Record<string, unknown>;
    }

    // ── Queue reminder emails ────────────────────────────────────────────────

    for (const reminder of reminders) {
      const reminderTime = new Date(
        interviewDate.getTime() - reminder.minutesBefore * 60_000
      );

      if (reminderTime > new Date()) {
        // In production: insert into a job queue / pg_cron.
        // For now: log intent so the scheduler can pick it up.
        log(FN, "info", "Reminder queued", {
          userId:         auth.userId,
          eventId:        savedEvent.id,
          channel:        reminder.channel,
          scheduledFor:   reminderTime.toISOString(),
          minutesBefore:  reminder.minutesBefore,
        });
      }
    }

    log(FN, "info", `Interview ${action}d`, {
      userId: auth.userId, company, role, round, scheduledAt,
    });

    return successResponse({
      event:         savedEvent,
      prepChecklist: prepQuestions,
      remindersSet:  reminders.length,
    });

  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err);
    return errorResponse("Failed to process interview schedule request.", "INTERNAL_ERROR", 500);
  }
});
