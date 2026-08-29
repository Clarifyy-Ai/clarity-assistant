import type { InterviewType } from "@/types/session.types";
import type { HintStyle } from "@/types/user.types";

// ─────────────────────────────────────────────────────────────────
// Offline Fallback Templates
// These fire instantly with zero latency when network is red.
// They are deterministic — no AI call, no spinner, no blank screen.
// ─────────────────────────────────────────────────────────────────

type TemplateMap = Partial<Record<InterviewType, Record<HintStyle, string>>>;

const TEMPLATES: TemplateMap = {
  behavioural: {
    full_answer: `Use the STAR framework:
• Situation: Set a brief, specific context (1–2 sentences max)
• Task: Describe your responsibility and what was at stake
• Action: Detail 2–3 specific actions YOU took (use "I", not "we")
• Result: Quantify the outcome — numbers, percentages, or clear impact

Aim for 90–120 seconds. End with what you learned or how it shapes your approach today.`,

    short_hints: `• Open with context in one sentence
• Focus on YOUR specific actions, not the team's
• Quantify your result (%, time saved, revenue, users)
• Close with a lesson or lasting impact`,

    keywords_only: `STAR framework
Specific situation
Personal ownership
Quantified result
Lesson learned`,
  },

  technical: {
    full_answer: `Structure your technical answer in three layers:
1. Clarify the problem — restate it in your own words, ask one clarifying question
2. Think aloud — name the pattern or approach before diving in
3. Walk through your solution — time/space complexity, edge cases, optimisation

For coding: talk through your reasoning before writing. Interviewers want to see how you think, not just what you produce.`,

    short_hints: `• Restate the problem first
• Name the algorithm/pattern
• State time and space complexity
• Handle edge cases explicitly
• Offer to optimise if time allows`,

    keywords_only: `Problem restatement
Algorithm pattern
Time/space complexity
Edge cases
Optimisation offer`,
  },

  system_design: {
    full_answer: `Follow this proven system design structure:
1. Clarify requirements — functional vs non-functional, scale estimate
2. High-level design — core components, data flow
3. Deep dive — pick 2-3 components to detail (database schema, API design, caching)
4. Scaling — horizontal scaling, CDN, load balancing, sharding
5. Trade-offs — always acknowledge what you'd sacrifice for each choice

State assumptions openly. Interviewers reward structured thinking, not perfect answers.`,

    short_hints: `• Start with requirements + scale estimate
• Draw high-level components first
• Choose database type with reasoning
• Add caching + load balancing
• Discuss trade-offs explicitly`,

    keywords_only: `Requirements clarification
Scale estimate
Core components
Database choice
Caching strategy
Trade-offs`,
  },

  hr: {
    full_answer: `HR questions test cultural fit and self-awareness. Answer authentically:
• Be specific — give real examples, not hypothetical ones
• Show self-awareness — acknowledge strengths and genuine growth areas
• Align to the company — research their values and reflect them naturally
• Keep answers 60–90 seconds — HR interviewers value conciseness

Common traps: oversharing negatives, vague answers, memorised-sounding responses.`,

    short_hints: `• Be genuine and specific
• Show growth mindset
• Align to company values
• Stay concise (60–90 seconds)
• Avoid rehearsed-sounding answers`,

    keywords_only: `Authenticity
Specific examples
Self-awareness
Company values alignment
Concise delivery`,
  },

  mixed: {
    full_answer: `For mixed interview sessions, adapt your style to each question type:
• Behavioural → STAR framework, 90 seconds, quantified result
• Technical → clarify first, think aloud, state complexity
• System Design → requirements, components, trade-offs
• HR → authentic, specific, values-aligned

Listen carefully for signals in how the question is phrased — "tell me about a time" = behavioural, "how would you design" = system design.`,

    short_hints: `• Identify question type first
• Match structure to type
• Behavioural: STAR + quantify
• Technical: think aloud
• Design: requirements first`,

    keywords_only: `Question type identification
Appropriate framework
STAR for behavioural
Think aloud for technical
Requirements first for design`,
  },

  product: {
    full_answer: `Product Management interviews test structured thinking:
1. Clarify the goal — user group, success metric, constraints
2. User empathy — who is this for, what problem are they solving
3. Prioritise — use a framework (RICE, ICE, MoSCoW) to rank ideas
4. Go-to-market — how would you launch this, how would you measure success
5. Trade-offs — what would you cut and why

Demonstrate user empathy first, business logic second.`,

    short_hints: `• Clarify goal + success metric
• Name target user segment
• Use a prioritisation framework
• Define launch + measurement plan
• State trade-offs explicitly`,

    keywords_only: `Goal clarification
User segment
Prioritisation framework
Success metrics
Launch strategy
Trade-offs`,
  },

  leadership: {
    full_answer: `Leadership questions assess influence, judgment, and people skills:
• Use STAR but emphasise the human dynamics, not just the outcome
• Show how you brought others along — consensus building, trust, communication
• Demonstrate judgment under pressure — what would you do differently
• Quantify team impact where possible — team size, timeline, outcome

Avoid: making yourself the lone hero. Good leaders lift the team.`,

    short_hints: `• Describe the human challenge
• Show how you influenced without authority
• Quantify team/org impact
• Reflect on what you'd do differently
• Demonstrate judgment under pressure`,

    keywords_only: `Influence without authority
Team alignment
Human dynamics
Quantified team impact
Reflective judgment`,
  },
};

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

export function getOfflineTemplate(
  interviewType: InterviewType,
  hintStyle: HintStyle
): string {
  const typeTemplates = TEMPLATES[interviewType] ?? TEMPLATES.mixed;
  return typeTemplates[hintStyle] ?? typeTemplates.short_hints;
}

export function getAllOfflineTemplates(): Partial<TemplateMap> {
  return TEMPLATES;
}

// ─────────────────────────────────────────────────────────────────
// Panic response — zero latency, deterministic
// ─────────────────────────────────────────────────────────────────

export const OFFLINE_PANIC = {
  step_1: "Take a slow breath — you have more time than you think.",
  step_2: "Summarise the problem in one sentence to show you understood it.",
  step_3: "Name one concrete approach or data structure and start from there.",
} as const;

export function getPanicResponse(): typeof OFFLINE_PANIC {
  return OFFLINE_PANIC;
}
