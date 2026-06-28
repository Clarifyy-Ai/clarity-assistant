/**
 * Exam-specific MCQ generation prompts for gov mock tests.
 * Uses performance analytics (weak topics, accuracy) to tailor gap-fill batches.
 */

export interface WeakTopicStat {
  topic: string;
  subject?: string;
  accuracy: number;
}

export interface ExamAIContext {
  examType: string;
  subjects: string[];
  topics: string[];
  weakTopics: WeakTopicStat[];
  strongTopics: string[];
  difficultyMix: { EASY: number; MEDIUM: number; HARD: number };
  gapCount: number;
}

const EXAM_PROFILES: Record<string, { pattern: string; marking: string; focus: string }> = {
  "UPSC CSE": {
    pattern: "UPSC Civil Services Prelims — conceptual GS, current affairs, elimination-based MCQs",
    marking: "+2 / -0.66 negative marking style",
    focus: "factual accuracy, multi-statement questions, map-based and polity/economy depth",
  },
  "SSC Exams (CGL/CHSL)": {
    pattern: "SSC CGL/CHSL — speed-focused aptitude and general awareness",
    marking: "+2 / -0.5 negative marking",
    focus: "quant shortcuts, reasoning puzzles, grammar, and static GK",
  },
  "Banking (IBPS/SBI/RBI)": {
    pattern: "IBPS PO / banking — reasoning, quant DI, English, banking awareness",
    marking: "+1 / -0.25 typical sectional MCQs",
    focus: "data interpretation, seating arrangement, financial awareness",
  },
  "JEE Main": {
    pattern: "JEE Main — PCM numerical and concept MCQs",
    marking: "+4 / -1 negative marking",
    focus: "multi-step numericals, NCERT-aligned concepts, unit consistency",
  },
  "JEE Advanced": {
    pattern: "JEE Advanced — deeper PCM with multi-concept linkage",
    marking: "+4 / -1, higher difficulty",
    focus: "proof-style reasoning, advanced calculus and mechanics",
  },
  "NEET UG": {
    pattern: "NEET UG — Biology-heavy with Physics & Chemistry",
    marking: "+4 / -1 negative marking",
    focus: "NCERT biology lines, clinical application, assertion-reason style",
  },
  "HPCL Engineer": {
    pattern: "PSU technical graduate — domain engineering + aptitude",
    marking: "technical + aptitude mix",
    focus: "core engineering fundamentals plus English/quant/reasoning",
  },
  PSU: {
    pattern: "PSU recruitment — technical and aptitude blend",
    marking: "sectional MCQs with negative marking",
    focus: "domain knowledge, comprehension, analytical ability",
  },
};

function resolveExamProfile(examType: string): { pattern: string; marking: string; focus: string } {
  const key = examType.trim();
  return (
    EXAM_PROFILES[key] ?? {
      pattern: `${key || "General competitive"} examination`,
      marking: "+4 / -1 style MCQs unless specified otherwise",
      focus: "syllabus-aligned conceptual and application questions",
    }
  );
}

export function buildGapFillPrompt(ctx: ExamAIContext): string {
  const profile = resolveExamProfile(ctx.examType);
  const subj = ctx.subjects[0] ?? "General Subject";
  const topicStr =
    ctx.topics.length > 0
      ? ctx.topics.slice(0, 5).join(", ")
      : "Mixed syllabus topics";

  const weakLines =
    ctx.weakTopics.length > 0
      ? ctx.weakTopics
          .slice(0, 8)
          .map((w) => `- ${w.topic}${w.subject ? ` (${w.subject})` : ""}: ${w.accuracy}% accuracy`)
          .join("\n")
      : "No prior weak-topic data — distribute across core syllabus.";

  const strongLine =
    ctx.strongTopics.length > 0
      ? `Avoid over-testing mastered topics: ${ctx.strongTopics.slice(0, 5).join(", ")}.`
      : "";

  return `
Generate exactly ${ctx.gapCount} original MCQs for Indian competitive exam practice.

Exam: ${ctx.examType || "General Competitive Exam"}
Exam pattern: ${profile.pattern}
Marking scheme: ${profile.marking}
Exam focus: ${profile.focus}

Primary subject: ${subj}
Topic scope: ${topicStr}

Learner analytics (prioritise weak areas):
${weakLines}
${strongLine}

Difficulty mix target: EASY ${ctx.difficultyMix.EASY}%, MEDIUM ${ctx.difficultyMix.MEDIUM}%, HARD ${ctx.difficultyMix.HARD}%.

Requirements:
1. Questions must match real ${ctx.examType || "exam"} style and difficulty — not generic trivia.
2. Exactly 4 options labelled A, B, C, D; exactly one correct answer.
3. Explanations must teach the concept briefly (2–4 sentences).
4. Use LaTeX only when needed for math ($...$).
5. No duplicate or near-duplicate stems.
6. Return ONLY valid JSON — no markdown fences:

{
  "questions": [
    {
      "question_text": "...",
      "options": [
        { "label": "A", "text": "..." },
        { "label": "B", "text": "..." },
        { "label": "C", "text": "..." },
        { "label": "D", "text": "..." }
      ],
      "correct_answer": "A",
      "explanation": "...",
      "difficulty": "MEDIUM",
      "topic": "...",
      "subject": "..."
    }
  ]
}`.trim();
}

export function buildPracticeBatchPrompt(params: {
  examType: string;
  subject: string;
  topic: string;
  difficulty: string;
  weakTopics: WeakTopicStat[];
  count?: number;
}): string {
  const count = params.count ?? 10;
  const profile = resolveExamProfile(params.examType);
  const weakHint =
    params.weakTopics.length > 0
      ? `Prioritise these weak areas: ${params.weakTopics
          .slice(0, 5)
          .map((w) => w.topic)
          .join(", ")}.`
      : "";

  return `
Generate exactly ${count} high-quality MCQs.

Exam: ${params.examType || "General"}
Pattern: ${profile.pattern}
Subject: ${params.subject}
Topic: ${params.topic}
Base difficulty: ${params.difficulty}
${weakHint}

Rules:
- Match official ${params.examType || "competitive"} question style
- 4 options (A–D), one correct answer, clear explanation
- Difficulty mix: EASY (2), MEDIUM (5), HARD (3)
- JSON only, no markdown

{
  "questions": [
    {
      "question_text": "",
      "options": [{"label":"A","text":""},{"label":"B","text":""},{"label":"C","text":""},{"label":"D","text":""}],
      "correct_answer": "A",
      "explanation": "",
      "difficulty": "MEDIUM",
      "marks_positive": 4,
      "marks_negative": 1
    }
  ]
}`.trim();
}
