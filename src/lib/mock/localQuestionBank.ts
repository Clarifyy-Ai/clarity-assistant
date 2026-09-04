/**
 * Offline fallback question bank for mock interviews.
 * Used when the generate-questions edge function is unavailable (AI key, credits, network).
 */

export interface LocalQuestionInput {
  type?: string;
  count?: number;
  company?: string | null;
  role?: string | null;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  skills?: string[];
  focusAreas?: string[];
  /** Deterministic seed for ranking rotation (e.g. exclude count). */
  rotateSeed?: number;
}

export interface LocalQuestion {
  id: string;
  question_text: string;
  question: string;
  difficulty: "easy" | "medium" | "hard";
  type: string;
  tags: string[];
  order: number;
}

const BEHAVIOURAL: Omit<LocalQuestion, "id" | "order">[] = [
  {
    question_text: "Tell me about a time you had to resolve a conflict on your team.",
    question: "Tell me about a time you had to resolve a conflict on your team.",
    difficulty: "medium",
    type: "behavioural",
    tags: ["teamwork", "conflict"],
  },
  {
    question_text: "Describe a project where you had to learn something new quickly.",
    question: "Describe a project where you had to learn something new quickly.",
    difficulty: "medium",
    type: "behavioural",
    tags: ["learning", "adaptability"],
  },
  {
    question_text: "Give an example of when you took ownership beyond your job description.",
    question: "Give an example of when you took ownership beyond your job description.",
    difficulty: "medium",
    type: "behavioural",
    tags: ["ownership", "initiative"],
  },
  {
    question_text: "Tell me about a time you failed and what you learned from it.",
    question: "Tell me about a time you failed and what you learned from it.",
    difficulty: "medium",
    type: "behavioural",
    tags: ["failure", "growth"],
  },
  {
    question_text: "Describe a situation where you had to influence others without authority.",
    question: "Describe a situation where you had to influence others without authority.",
    difficulty: "hard",
    type: "behavioural",
    tags: ["influence", "leadership"],
  },
];

const TECHNICAL: Omit<LocalQuestion, "id" | "order">[] = [
  {
    question_text: "Explain the difference between a stack and a queue. When would you use each?",
    question: "Explain the difference between a stack and a queue. When would you use each?",
    difficulty: "easy",
    type: "technical",
    tags: ["data-structures"],
  },
  {
    question_text: "How would you design an API rate limiter?",
    question: "How would you design an API rate limiter?",
    difficulty: "hard",
    type: "technical",
    tags: ["system-design", "backend", "api"],
  },
  {
    question_text: "What is the time complexity of binary search and why?",
    question: "What is the time complexity of binary search and why?",
    difficulty: "medium",
    type: "technical",
    tags: ["algorithms"],
  },
  {
    question_text: "Explain how you would debug a slow database query in production.",
    question: "Explain how you would debug a slow database query in production.",
    difficulty: "medium",
    type: "technical",
    tags: ["database", "debugging", "sql", "backend", "data", "analytics"],
  },
  {
    question_text: "Describe how HTTP caching works and which headers matter.",
    question: "Describe how HTTP caching works and which headers matter.",
    difficulty: "medium",
    type: "technical",
    tags: ["web", "networking", "frontend", "react"],
  },
];

const SYSTEM_DESIGN: Omit<LocalQuestion, "id" | "order">[] = [
  {
    question_text: "Design a URL shortener like bit.ly. What are the key components?",
    question: "Design a URL shortener like bit.ly. What are the key components?",
    difficulty: "medium",
    type: "system_design",
    tags: ["scaling"],
  },
  {
    question_text: "How would you design a real-time notification system for millions of users?",
    question: "How would you design a real-time notification system for millions of users?",
    difficulty: "hard",
    type: "system_design",
    tags: ["realtime", "scaling"],
  },
  {
    question_text: "Design a rate-limited chat application. What trade-offs would you make?",
    question: "Design a rate-limited chat application. What trade-offs would you make?",
    difficulty: "hard",
    type: "system_design",
    tags: ["messaging"],
  },
];

const HR: Omit<LocalQuestion, "id" | "order">[] = [
  {
    question_text: "Why are you interested in this role and our company?",
    question: "Why are you interested in this role and our company?",
    difficulty: "easy",
    type: "hr",
    tags: ["motivation"],
  },
  {
    question_text: "Where do you see yourself in three years?",
    question: "Where do you see yourself in three years?",
    difficulty: "easy",
    type: "hr",
    tags: ["career"],
  },
  {
    question_text: "What kind of work environment helps you do your best work?",
    question: "What kind of work environment helps you do your best work?",
    difficulty: "easy",
    type: "hr",
    tags: ["culture"],
  },
];

function normalizeType(raw?: string): string {
  const t = (raw ?? "behavioural").toLowerCase().replace(/\s+/g, "_");
  if (t === "behavioral" || t === "behavioural") return "behavioural";
  return t;
}

function poolForType(type: string): Omit<LocalQuestion, "id" | "order">[] {
  switch (type) {
    case "technical":
      return TECHNICAL;
    case "system_design":
      return SYSTEM_DESIGN;
    case "hr":
      return HR;
    case "mixed":
      return [...BEHAVIOURAL, ...TECHNICAL, ...HR];
    default:
      return BEHAVIOURAL;
  }
}

function personalize(
  template: string,
  company?: string | null,
  role?: string | null,
): string {
  let text = template;
  if (company?.trim()) {
    text = text.replace(/\bthis (role|company)\b/i, `${company.trim()}`);
    if (/why are you interested/i.test(text)) {
      text = `Why are you interested in joining ${company.trim()}?`;
    }
  }
  if (role?.trim() && /this role/i.test(text)) {
    text = text.replace(/this role/i, `the ${role.trim()} role`);
  }
  return text;
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

function scoreLocalRelevance(
  question: Omit<LocalQuestion, "id" | "order">,
  contextTokens: string[],
): number {
  if (contextTokens.length === 0) return 0;
  const hay = `${question.question_text} ${(question.tags ?? []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const token of contextTokens) {
    if (hay.includes(token)) score += 2;
    if ((question.tags ?? []).some((t) => t.toLowerCase().includes(token))) score += 3;
  }
  const eng = contextTokens.some((t) =>
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

/** Return `count` questions ranked by role/domain/skills, then diversified. */
export function getLocalMockQuestions(input: LocalQuestionInput): LocalQuestion[] {
  const type = normalizeType(input.type);
  const count = Math.min(Math.max(input.count ?? 5, 1), 15);
  const difficulty = input.difficulty ?? "mixed";
  let pool = [...poolForType(type)];

  if (difficulty !== "mixed") {
    const filtered = pool.filter((q) => q.difficulty === difficulty);
    // Fall back to full pool if the bank is too thin for this level.
    if (filtered.length >= Math.min(count, 2)) {
      pool = filtered;
    }
  }

  const contextTokens = tokenizeContext(
    input.role,
    input.company,
    ...(input.skills ?? []),
    ...(input.focusAreas ?? []),
  );
  const rotate = (input.rotateSeed ?? 0) % Math.max(pool.length, 1);

  pool = pool
    .map((q, index) => ({
      q,
      score: scoreLocalRelevance(q, contextTokens),
      order: (index + rotate) % Math.max(pool.length, 1),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((row) => row.q);

  const selected = pool.slice(0, count);
  return selected.map((q, index) => {
    const text = personalize(q.question_text, input.company, input.role);
    return {
      id: crypto.randomUUID(),
      question_text: text,
      question: text,
      difficulty: q.difficulty,
      type: q.type,
      tags: q.tags,
      order: index + 1,
    };
  });
}
