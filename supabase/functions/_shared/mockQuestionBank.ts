/**
 * Approved offline question bank for generate-questions fallback.
 * Keep in sync conceptually with src/lib/mock/localQuestionBank.ts.
 */

export type FallbackBankQuestion = {
  question: string;
  difficulty: "easy" | "medium" | "hard";
  type: string;
  tags: string[];
};

const BEHAVIOURAL: FallbackBankQuestion[] = [
  {
    question: "Tell me about a time you had to resolve a conflict on your team.",
    difficulty: "medium",
    type: "behavioral",
    tags: ["teamwork", "conflict", "fallback_bank"],
  },
  {
    question: "Describe a project where you had to learn something new quickly.",
    difficulty: "medium",
    type: "behavioral",
    tags: ["learning", "adaptability", "fallback_bank"],
  },
  {
    question: "Give an example of when you took ownership beyond your job description.",
    difficulty: "medium",
    type: "behavioral",
    tags: ["ownership", "initiative", "fallback_bank"],
  },
  {
    question: "Tell me about a time you failed and what you learned from it.",
    difficulty: "medium",
    type: "behavioral",
    tags: ["failure", "growth", "fallback_bank"],
  },
  {
    question: "Describe a situation where you had to influence others without authority.",
    difficulty: "hard",
    type: "behavioral",
    tags: ["influence", "leadership", "fallback_bank"],
  },
];

const TECHNICAL: FallbackBankQuestion[] = [
  {
    question: "Explain the difference between a stack and a queue. When would you use each?",
    difficulty: "easy",
    type: "technical",
    tags: ["data-structures", "algorithms", "fallback_bank"],
  },
  {
    question: "How would you design an API rate limiter?",
    difficulty: "hard",
    type: "technical",
    tags: ["system-design", "backend", "api", "fallback_bank"],
  },
  {
    question: "What is the time complexity of binary search and why?",
    difficulty: "medium",
    type: "technical",
    tags: ["algorithms", "fallback_bank"],
  },
  {
    question: "Explain how you would debug a slow database query in production.",
    difficulty: "medium",
    type: "technical",
    tags: ["database", "debugging", "sql", "backend", "data", "analytics", "fallback_bank"],
  },
];

const SYSTEM_DESIGN: FallbackBankQuestion[] = [
  {
    question: "Design a URL shortener like bit.ly. What are the key components?",
    difficulty: "medium",
    type: "system_design",
    tags: ["scaling", "fallback_bank"],
  },
  {
    question: "How would you design a real-time notification system for millions of users?",
    difficulty: "hard",
    type: "system_design",
    tags: ["realtime", "scaling", "fallback_bank"],
  },
  {
    question: "Design a rate-limited chat application. What trade-offs would you make?",
    difficulty: "hard",
    type: "system_design",
    tags: ["messaging", "fallback_bank"],
  },
];

const HR: FallbackBankQuestion[] = [
  {
    question: "Why are you interested in this role and our company?",
    difficulty: "easy",
    type: "hr",
    tags: ["motivation", "fallback_bank"],
  },
  {
    question: "Where do you see yourself in three years?",
    difficulty: "easy",
    type: "hr",
    tags: ["career", "fallback_bank"],
  },
  {
    question: "What kind of work environment helps you do your best work?",
    difficulty: "easy",
    type: "hr",
    tags: ["culture", "fallback_bank"],
  },
];

function normalizeType(raw: string): string {
  const t = raw.toLowerCase().replace(/\s+/g, "_");
  if (t === "behavioural" || t === "behavioral") return "behavioral";
  if (t === "system-design" || t === "system_design") return "system_design";
  return t || "behavioral";
}

function poolForType(type: string): FallbackBankQuestion[] {
  switch (normalizeType(type)) {
    case "technical":
      return TECHNICAL;
    case "system_design":
      return SYSTEM_DESIGN;
    case "hr":
      return HR;
    case "mixed":
      return [...BEHAVIOURAL, ...TECHNICAL, ...SYSTEM_DESIGN, ...HR];
    default:
      return BEHAVIOURAL;
  }
}

function tokenizeContext(...parts: Array<string | null | undefined>): string[] {
  const raw = parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .toLowerCase();
  const tokens = raw
    .split(/[^a-z0-9+#.]/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return [...new Set(tokens)];
}

/** Score bank stems by role/domain/skill overlap (tags + question text). */
export function scoreFallbackQuestionRelevance(
  question: FallbackBankQuestion,
  contextTokens: string[],
): number {
  if (contextTokens.length === 0) return 0;
  const hay = `${question.question} ${(question.tags ?? []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const token of contextTokens) {
    if (hay.includes(token)) score += 2;
    if ((question.tags ?? []).some((t) => t.toLowerCase().includes(token))) score += 3;
  }
  // Prefer technical/system tags when role looks engineering-heavy.
  const eng =
    contextTokens.some((t) =>
      ["backend", "frontend", "engineer", "developer", "api", "react", "python", "java", "sql", "data", "analytics"].includes(t),
    );
  if (eng && (question.type === "technical" || question.type === "system_design")) {
    score += 4;
  }
  if (
    contextTokens.some((t) => ["hr", "recruiter", "people"].includes(t)) &&
    question.type === "hr"
  ) {
    score += 4;
  }
  return score;
}

export function selectApprovedFallbackQuestions(options: {
  interviewType: string;
  count: number;
  excludeTexts?: string[];
  difficulty?: string;
  role?: string | null;
  company?: string | null;
  skills?: string[];
  focusAreas?: string[];
}): FallbackBankQuestion[] {
  const exclude = new Set(
    (options.excludeTexts ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  let pool = [...poolForType(options.interviewType)];
  if (options.difficulty && options.difficulty !== "mixed") {
    const filtered = pool.filter((q) => q.difficulty === options.difficulty);
    if (filtered.length >= 1) pool = filtered;
  }

  const contextTokens = tokenizeContext(
    options.role,
    options.company,
    ...(options.skills ?? []),
    ...(options.focusAreas ?? []),
  );

  // Rank by domain relevance; break ties with exclude-size rotation for variety.
  const rotate = exclude.size % Math.max(pool.length, 1);
  pool = pool
    .map((q, index) => ({
      q,
      score: scoreFallbackQuestionRelevance(q, contextTokens),
      order: (index + rotate) % Math.max(pool.length, 1),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((row) => row.q);

  const out: FallbackBankQuestion[] = [];
  for (const q of pool) {
    const key = q.question.trim().toLowerCase();
    if (exclude.has(key)) continue;
    out.push(q);
    exclude.add(key);
    if (out.length >= options.count) break;
  }
  return out;
}
