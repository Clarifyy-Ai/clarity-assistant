// src/lib/session/interviewerPersonality.ts
// Defines interviewer personalities used in mock sessions (strict, friendly, panel). [file:1][file:3]

export type PersonalityId = "strict" | "friendly" | "neutral" | "panel";

export interface InterviewerPersonality {
  id: PersonalityId;
  name: string;
  tone: "directive" | "conversational" | "supportive" | "neutral";
  followUpStyle: "probing" | "accepting" | "neutral";
  pace: "fast" | "moderate" | "slow";
  systemPrompt: string;
}

export const PERSONALITIES: Record<Exclude<PersonalityId, "panel">, InterviewerPersonality> = {
  strict: {
    id: "strict",
    name: "Dr. Smith",
    tone: "directive",
    followUpStyle: "probing",
    pace: "fast",
    systemPrompt:
      "You are a tough but fair interviewer. You challenge the candidate with difficult follow-up questions, " +
      "insist on clarity and structure, and push them to quantify impact. You remain professional and respectful.",
  },
  friendly: {
    id: "friendly",
    name: "Alex",
    tone: "conversational",
    followUpStyle: "accepting",
    pace: "moderate",
    systemPrompt:
      "You are a supportive, friendly interviewer. You put the candidate at ease, encourage them, and ask clarifying " +
      "questions that help them tell their story more clearly, while still maintaining realistic expectations.",
  },
  neutral: {
    id: "neutral",
    name: "Jordan",
    tone: "neutral",
    followUpStyle: "neutral",
    pace: "moderate",
    systemPrompt:
      "You are a neutral, professional interviewer. You keep the conversation focused on the role and competencies, " +
      "ask balanced follow-up questions, and avoid emotional language.",
  },
};

/**
 * For simple sessions with a single personality configured. [file:1]
 */
export function getPersonalityById(id: PersonalityId): InterviewerPersonality | null {
  if (id === "panel") {
    // Panel is handled by rotation logic in MockSessionManager. [file:1]
    return null;
  }
  return PERSONALITIES[id] ?? null;
}

/**
 * Panel rotation helper: returns one of strict/friendly/neutral based on question index. [file:1]
 */
export function getPanelPersonalityForIndex(questionIndex: number): InterviewerPersonality {
  const ordered: InterviewerPersonality[] = [
    PERSONALITIES.strict,
    PERSONALITIES.friendly,
    PERSONALITIES.neutral,
  ];
  return ordered[questionIndex % ordered.length];
}
