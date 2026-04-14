// schedule-interview/index.ts — FIXED, SECURE, PRODUCTION VERSION


import {
  handleCors, parseBody, requireAuth,
  successResponse, errorResponse,
  getAdminClient, deductCredits,
  callAI, requireFields, log
} from "../_shared/utils.ts";

import type {
  InterviewEvent,
  InterviewRound,
  ReminderConfig,
  ModelId
} from "../_shared/types.ts";

/* -------------------------------------------------------------------------- */
/*                                SANITIZATION                                */
/* -------------------------------------------------------------------------- */

function sanitizeText(text: any, max = 500): string {
  return String(text ?? "")
    .replace(/```/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, max)
    .trim();
}

function sanitizeAIListOutput(text: string, fallback: string[]): string[] {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => sanitizeText(item, 200))
        .filter((v) => v.length > 0)
        .slice(0, 8);
    }
  } catch (_) {}

  return fallback.slice(0, 8);
}

/* -------------------------------------------------------------------------- */
/*                        PREP CHECKLIST GENERATOR                            */
/* -------------------------------------------------------------------------- */

async function generatePrepChecklist(
  company: string,
  role: string,
  round: InterviewRound,
  model: ModelId
): Promise<string[]> {
  const roundLabels: Record<InterviewRound, string> = {
    phone_screen: "Phone Screen",
    technical: "Technical Interview",
    system_design: "System Design",
    behavioral: "Behavioural Interview",
    hr: "HR Round",
    final: "Final Round",
    offer: "Offer Discussion",
  };

  const fallback = [
    `Research ${company}'s recent news and products`,
    `Review common ${roundLabels[round]} questions for ${role}`,
    "Prepare 3 STAR stories from your experience",
    "Test your audio/video setup if remote",
    "Prepare thoughtful questions to ask",
    "Review your resume thoroughly",
    "Sleep well before the interview",
    "Confirm the schedule and interviewers",
  ];

  const ai = await callAI({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an expert interview coach. Return ONLY a JSON array of checklist item strings. No markdown.",
      },
      {
        role: "user",
        content: `Generate 8 specific preparation checklist items for a ${roundLabels[round]} at ${company} for a ${role} role. JSON array only.`,
      },
    ],
    maxTokens: 400,
    temperature: 0.6,
  });

  return sanitizeAIListOutput(ai.text, fallback);
}

/* -------------------------------------------------------------------------- */
/*                                  HANDLER                                   */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "schedule-interview";

  try {
    /* ------------------------------ AUTH ------------------------------ */
    const auth = await requireAuth(req);
    const admin = getAdminClient();

    /* ------------------------------ BODY ------------------------------ */
    const body = await parseBody<{
      action: "create" | "update" | "delete" | "list";
      eventId?: string;
      company?: string;
      role?: string;
      round?: InterviewRound;
      scheduledAt?: string;
      durationMin?: number;
      location?: string;
      notes?: string;
      reminders?: ReminderConfig[];
      generatePrep?: boolean;
      model?: ModelId;
    }>(req);

    const { action = "create" } = body;

    /* ------------------------------ LIST ------------------------------ */
    if (action === "list") {
      const { data, error } = await admin
        .from("interview_prep")
        .select("*")
        .eq("user_id", auth.userId)
        .order("interview_date", { ascending: true });

      if (error) throw new Error(error.message);
      return successResponse(data ?? []);
    }

    /* ------------------------------ DELETE ------------------------------ */
    if (action === "delete") {
      if (!body.eventId) {
        return errorResponse("eventId is required for delete", "VALIDATION_ERROR", 400);
      }

      const { error } = await admin
        .from("interview_prep")
        .delete()
        .eq("id", body.eventId)
        .eq("user_id", auth.userId);

      if (error) throw new Error(error.message);

      log(FN, "info", "Event deleted", {
        userId: auth.userId,
        eventId: body.eventId,
      });

      return successResponse({ deleted: true, eventId: body.eventId });
    }

    /* ------------------------------ CREATE / UPDATE ------------------------------ */

    const validation = requireFields(body as Record<string, unknown>, [
      "company",
      "role",
      "round",
      "scheduledAt",
    ]);
    if (!validation.valid)
      return errorResponse(validation.errors[0].message, "VALIDATION_ERROR", 400);

    const company = sanitizeText(body.company);
    const role = sanitizeText(body.role);
    const round = body.round as InterviewRound;
    const location = sanitizeText(body.location, 300);
    const notes = sanitizeText(body.notes, 1200);
    const durationMin = Number(body.durationMin ?? 60);
    const model = body.model ?? "gpt-4o-mini";
    const generatePrep = Boolean(body.generatePrep ?? true);

    if (![
      "phone_screen",
      "technical",
      "system_design",
      "behavioral",
      "hr",
      "final",
      "offer",
    ].includes(round)) {
      return errorResponse("Invalid interview round", "VALIDATION_ERROR", 400);
    }

    /* ------------------------------ Validate Date ------------------------------ */
    const interviewDate = new Date(body.scheduledAt!);
    if (isNaN(interviewDate.getTime())) {
      return errorResponse("scheduledAt must be a valid ISO date", "VALIDATION_ERROR", 400);
    }

    /* ------------------------------ Clean Reminders ------------------------------ */
    let reminders: ReminderConfig[] = Array.isArray(body.reminders)
      ? body.reminders
      : [
          { minutesBefore: 1440, channel: "email" },
          { minutesBefore: 60, channel: "email" },
        ];

    reminders = reminders
      .filter((r) => r.minutesBefore > 0)
      .slice(0, 10);

    /* ------------------------------ Prep Generation (1 Credit) ------------------------------ */
    let prepChecklist: string[] = [];
    if (generatePrep) {
      const credit = await deductCredits(auth.userId, "schedule_interview", 1);
      if (credit.success) {
        try {
          prepChecklist = await generatePrepChecklist(company, role, round, model);
        } catch {
          log(FN, "warn", "Prep generation failed");
        }
      }
    }

    /* ------------------------------ SAVE TO DB ------------------------------ */
    const now = new Date().toISOString();
    const payload = {
      user_id: auth.userId,
      company,
      role,
      interview_date: body.scheduledAt,
      notes,
      prep_questions: prepChecklist,
      status: "pending",
      metadata: {
        round,
        durationMin,
        location,
        reminders,
      },
      updated_at: now,
    };

    let savedEvent;

    if (action === "update" && body.eventId) {
      const { data, error } = await admin
        .from("interview_prep")
        .update(payload)
        .eq("id", body.eventId)
        .eq("user_id", auth.userId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      savedEvent = data;
    } else {
      const { data, error } = await admin
        .from("interview_prep")
        .insert({ ...payload, created_at: now })
        .select()
        .single();

      if (error) throw new Error(error.message);
      savedEvent = data;
    }

    /* ------------------------------ LOG REMINDERS ------------------------------ */
    for (const r of reminders) {
      const reminderTime = new Date(
        interviewDate.getTime() - r.minutesBefore * 60_000
      );
      if (reminderTime > new Date()) {
        log(FN, "info", "Reminder queued", {
          userId: auth.userId,
          eventId: savedEvent.id,
          minutesBefore: r.minutesBefore,
          scheduledFor: reminderTime.toISOString(),
          channel: r.channel,
        });
      }
    }

    /* ------------------------------ SUCCESS ------------------------------ */
    return successResponse({
      event: savedEvent,
      prepChecklist,
      remindersSet: reminders.length,
    });

  } catch (err) {
    if (err instanceof Response) return err;

    log(FN, "error", "Unhandled error", err);
    return errorResponse(
      "Failed to process interview schedule request.",
      "INTERNAL_ERROR",
      500
    );
  }
});
