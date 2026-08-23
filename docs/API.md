# Edge Function API Reference

All edge functions are deployed to:
```
https://<project-ref>.supabase.co/functions/v1/<function-name>
```

## Authentication

Every function (except OPTIONS preflight) requires a Bearer token:

```
Authorization: Bearer <supabase_access_token>
```

Obtain the token from `supabase.auth.getSession()` on the client.

## Response Envelope

All responses use a consistent envelope:

```typescript
// Success
{ "success": true, "data": <T>, "meta": { model, tokensUsed, creditsCharged, latencyMs } }

// Error
{ "success": false, "error": "Human-readable message", "code": "ERROR_CODE" }
```

### Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_REQUIRED` | 401 | Missing Authorization header |
| `AUTH_INVALID` | 401 | Expired or invalid token |
| `INSUFFICIENT_CREDITS` | 402 | Not enough credits for this action |
| `VALIDATION_ERROR` | 400 | Missing or invalid request field |
| `NOT_FOUND` | 404 | Resource does not exist |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Functions

### `ai-coach-chat`
**POST** — Multi-turn AI interview coach chat (SSE). Overlay Chat tab (Live and Mock).

**Credits:** 2 (`ai_coach_message`)  
**Rate limit:** 5 requests / 60s per user  
**Auth:** Bearer JWT required · capability `live_rehearsal` · active owned session

```jsonc
// Request
{
  "session_id": "uuid",                 // required — active session you own
  "conversation_id": "uuid" | null,     // optional — must match session thread
  "message": "How should I structure this?",
  "context": {
    "current_question": "Tell me about yourself",
    "recent_transcript": "...",         // bounded
    "resume_context": "...",
    "job_description": "...",
    "recent_answers": ["..."]
  },
  "coach_tone": "encouraging",          // encouraging|direct|formal|casual
  "hint_style": "short_hints",          // short_hints|keywords_only|full_answer
  "model": "gemini-2.5-flash"           // optional; Gemini family only
}

// Headers
// Authorization: Bearer <access_token>
// Idempotency-Key: <stable key>
// Accept: text/event-stream
```

**Response:** `text/event-stream` (SSE)

```jsonc
// data: meta
{ "type": "meta", "conversation_id": "uuid", "message_id": "uuid", "correlation_id": "uuid" }

// data: text chunks
{ "text": "partial…" }

// data: done
{
  "type": "done",
  "success": true,
  "conversation_id": "uuid",
  "message_id": "uuid",
  "reply": "full coaching reply",
  "source": "ai" | "python" | "deterministic",
  "correlation_id": "uuid",
  "provider": "gemini" | "python" | "deterministic",
  "model": "gemini-2.5-flash"
}
```

Pre-stream errors are JSON (not SSE):

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_REQUIRED` / `AUTH_INVALID` | 401 | Missing/invalid JWT |
| `PAYMENT_REQUIRED` | 402 | Insufficient credits |
| `VALIDATION_ERROR` | 422 | Bad payload / injection |
| `RATE_LIMITED` | 429 | Too many requests |
| `SESSION_NOT_FOUND` / `INVALID_SESSION_STATE` | 404/400 | Session issues |
| `AI_UNAVAILABLE` | via SSE `type:error` | Provider + Python + deterministic all failed (credits refunded) |

**Fallback:** Gemini → Python `/v1/process` `practice_coach` (`operation_type: coach_chat`) → deterministic template. One credit deduction per logical message.

**Persistence:** `coach_conversations` (1 per session) + `coach_messages` (user/coach roles). History is loaded from DB (last 12 turns sent to the model).

**Not used for:** full spoken answers (`generate-answer`) or 3-bullet hints (`generate-hint`).

---

### `ai-feedback`
**POST** — Generate structured feedback on a recorded answer.

```jsonc
// Request
{
  "questionText": "Describe a conflict you resolved.",
  "answerText":   "In my previous role...",
  "answerType":   "behavioral",       // behavioral | technical | hr
  "model":        "gpt-4o"
}

// Response data
{
  "score":       82,                  // 0–100
  "grade":       "B+",
  "summary":     "Strong STAR structure but lacks quantified results.",
  "strengths":   ["Clear situation", "Strong action steps"],
  "improvements": ["Add metrics to Result section"],
  "rewrittenAnswer": "In my role at...",
  "tags":        ["communication", "conflict-resolution"]
}
```
**Credits:** 3

---

### `generate-star-answer`
**POST** — Generate a full STAR-format answer for a behavioural question.

```jsonc
// Request
{
  "questionText":    "Tell me about a time you led a team through change.",
  "resumeText":      "...",            // optional — grounds answer in experience
  "jobDescription":  "...",            // optional
  "company":         "Stripe",         // optional
  "role":            "Engineering Manager",
  "model":           "gpt-4o"
}

// Response data
{
  "situation":   "In Q3 2024, our team of 8 engineers...",
  "task":        "I was responsible for migrating...",
  "action":      "I began by hosting a town hall...",
  "result":      "We shipped 3 weeks ahead of schedule...",
  "fullAnswer":  "Full narrative paragraph..."
}
```
**Credits:** 2

---

### `polish-star-section`
**POST** — Polish a single STAR section in place.

```jsonc
// Request
{
  "section":       "result",           // situation | task | action | result
  "currentText":   "We improved performance.",
  "questionText":  "Tell me about an optimisation you led.",  // optional
  "style":         "impactful",        // concise | detailed | impactful | natural
  "instruction":   "Add metrics.",     // optional — overrides style
  "model":         "gpt-4o-mini"
}

// Response data
{
  "section":   "result",
  "polished":  "Reduced API p99 latency by 63% (2.1s → 780ms), saving $12k/month in infra costs.",
  "original":  "We improved performance."
}
```
**Credits:** 1

---

### `generate-hint`
**POST** — Generate a hint for a question without revealing the full answer.

```jsonc
// Request
{
  "questionText": "Implement a LRU Cache.",
  "questionType": "coding",            // coding | system_design | behavioral
  "level":        "mid",               // junior | mid | senior | staff
  "model":        "gpt-4o-mini"
}

// Response data
{
  "hint":      "Consider using a HashMap combined with a doubly linked list...",
  "followUps": ["What is the time complexity?", "How would you handle thread safety?"]
}
```
**Credits:** 1

---

### `generate-debrief`
**POST** — Generate a full post-session debrief report.

```jsonc
// Request
{
  "sessionId":   "uuid",
  "answers":     [{ "questionId": "q1", "text": "...", "durationSec": 120 }],
  "sessionType": "behavioral",
  "model":       "gpt-4o"
}

// Response data
{
  "overallScore":     78,
  "grade":            "B",
  "summary":          "Strong communication skills with room to improve...",
  "questionScores":   [{ "questionId": "q1", "score": 82, "feedback": "..." }],
  "strengthAreas":    ["Clarity", "Structure"],
  "improvementAreas": ["Quantifying results", "Conciseness"],
  "recommendedTopics": ["STAR method", "Negotiation"],
  "nextSteps":        ["Practice 2 STAR answers daily", "Review system design basics"]
}
```
**Credits:** 5

---

### `company-research`
**POST** — Generate AI-powered company intelligence.

```jsonc
// Request
{
  "company": "Stripe",
  "role":    "Backend Engineer",       // optional — tailors output to role
  "model":   "gemini-2.0-flash"
}

// Response data
{
  "overview":       "Stripe is a payments infrastructure company...",
  "recentNews":     ["Launched Stablecoin payments API in 2025..."],
  "culture":        "Highly technical, documentation-first culture...",
  "interviewProcess": "Typically 5 rounds: recruiter screen, technical...",
  "likelyQuestions": ["Design a payment retry system", "Tell me about..."],
  "talkingPoints":  ["Stripe's expansion into Africa", "Stripe Sessions 2025"],
  "glassdoorRating": 4.2
}
```
**Credits:** 3

---

### `schedule-interview`
**POST** — Create, update, delete, or list interview events.

```jsonc
// Create
{
  "action":       "create",
  "company":      "Stripe",
  "role":         "Backend Engineer",
  "round":        "technical",         // phone_screen | technical | system_design | behavioral | hr | final | offer
  "scheduledAt":  "2026-04-01T14:00:00Z",
  "durationMin":  60,
  "location":     "https://meet.google.com/xyz",
  "notes":        "Focus on distributed systems",
  "reminders":    [{ "minutesBefore": 1440, "channel": "email" }],
  "generatePrep": true
}

// Response data
{
  "event":          { "id": "uuid", "company": "Stripe", ... },
  "prepChecklist":  ["Research Stripe's API design principles", ...],
  "remindersSet":   1
}

// List
{ "action": "list" }

// Delete
{ "action": "delete", "eventId": "uuid" }
```
**Credits:** 1 (only when `generatePrep: true`)

---

### `send-email`
**POST** — Send a transactional email via Resend.

```jsonc
// Request
{
  "to":       "user@example.com",
  "template": "interview_reminder",    // see types.ts EmailTemplate
  "data":     { "company": "Stripe", "scheduledAt": "2026-04-01T14:00:00Z" }
}

// Response data
{ "sent": true, "messageId": "resend_msg_id" }
```
**Credits:** 0 (internal use / admin only for most templates)

---

### `export-user-data`
**POST** — Export all user data as JSON (GDPR).

```jsonc
// Request — no body required (userId from JWT)
{}

// Response data
{
  "profile":       { ... },
  "sessions":      [ ... ],
  "answers":       [ ... ],
  "documents":     [ ... ],
  "transactions":  [ ... ],
  "exportedAt":    "2026-03-19T00:00:00Z"
}
```
**Credits:** 0

---

### `delete-account`
**POST** — Permanently delete a user account and all associated data.

```jsonc
// Request
{ "confirmEmail": "user@example.com" }

// Response data
{ "deleted": true }
```
**Credits:** 0
