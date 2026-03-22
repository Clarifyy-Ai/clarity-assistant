// @ts-nocheck
import type { InterviewType } from "@/types/session.types";
import type { SessionQuestion } from "@/types/session.types";
import { generateId } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Local Question Bank
// Curated fallback questions used when:
//   • No internet connection
//   • Edge Function is unavailable / not yet deployed
//   • User has no AI keys configured
// These ensure the mock session ALWAYS works.
// ─────────────────────────────────────────────────────────────────

type QuestionBank = Record<InterviewType, string[]>;

const BEHAVIOURAL: string[] = [
  "Tell me about a time you faced a significant challenge at work. How did you handle it?",
  "Describe a situation where you had to work with a difficult team member. What did you do?",
  "Give me an example of when you took initiative beyond your job description.",
  "Tell me about a time you failed. What did you learn from it?",
  "Describe a project where you had to manage conflicting priorities.",
  "Tell me about a time you had to influence someone without direct authority.",
  "Give an example of when you received critical feedback. How did you respond?",
  "Describe a situation where you had to make a decision without enough information.",
  "Tell me about a time you led a team through a major change.",
  "Give an example of when you went above and beyond for a customer or stakeholder.",
  "Describe a time when you disagreed with a manager's decision. What did you do?",
  "Tell me about a time you had to deliver bad news to a stakeholder.",
  "Give me an example of a time you had to learn something new very quickly.",
  "Describe a situation where you identified a problem before it became critical.",
  "Tell me about your greatest professional achievement so far.",
];

const TECHNICAL: string[] = [
  "Explain the difference between a process and a thread. When would you use each?",
  "How would you design a URL shortening service like bit.ly?",
  "Explain how HTTP/2 differs from HTTP/1.1 and what improvements it brings.",
  "Walk me through how you would reverse a linked list in place.",
  "What is the difference between SQL and NoSQL databases? When would you choose each?",
  "Explain the concept of memoisation and when you'd apply it.",
  "How does garbage collection work in a language of your choice?",
  "Explain the CAP theorem and give a real-world example of a trade-off.",
  "Walk me through how you'd implement a rate limiter for an API.",
  "What are SOLID principles? Give an example of each in practice.",
  "Explain the difference between synchronous and asynchronous programming.",
  "How would you debug a memory leak in a production system?",
  "What is the difference between a stack and a queue? Implement each.",
  "Explain database indexing — when does it help and when can it hurt?",
  "What is the Big-O notation of a binary search? Walk me through the logic.",
];

const SYSTEM_DESIGN: string[] = [
  "Design a scalable notification system (email, push, SMS) for 10 million users.",
  "How would you architect a real-time chat application like Slack?",
  "Design a distributed file storage system similar to Dropbox.",
  "How would you build a ride-sharing service like Uber?",
  "Design a recommendation engine for an e-commerce platform.",
  "How would you design a global content delivery network (CDN)?",
  "Design a search autocomplete system that handles millions of queries per second.",
  "How would you build a rate limiting system at scale?",
  "Design a news feed system like Twitter's timeline.",
  "How would you architect a payment processing system?",
  "Design a web crawler for indexing the entire web.",
  "How would you build a video streaming platform like YouTube?",
  "Design an API gateway for a microservices architecture.",
  "How would you implement a distributed caching layer?",
  "Design a real-time collaborative document editing system like Google Docs.",
];

const HR: string[] = [
  "Tell me about yourself and why you're interested in this role.",
  "Where do you see yourself in five years?",
  "What are your greatest strengths and where are you still growing?",
  "Why are you leaving your current position?",
  "What does your ideal work environment look like?",
  "How do you handle stress and pressure?",
  "What motivates you most in your work?",
  "Tell me about a time you had to adapt to a major change.",
  "How do you prioritise when you have multiple deadlines?",
  "What questions do you have for us about this role or the company?",
  "Describe your working style in three words.",
  "How do you handle receiving criticism?",
  "What are you most proud of in your career so far?",
  "How do you stay current with trends in your field?",
  "What does success look like to you in this role?",
];

const SYSTEM_DESIGN_MIXED: string[] = [...SYSTEM_DESIGN.slice(0, 5)];

const MIXED: string[] = [
  ...BEHAVIOURAL.slice(0, 5),
  ...TECHNICAL.slice(0, 4),
  ...HR.slice(0, 3),
  ...SYSTEM_DESIGN_MIXED.slice(0, 3),
];

const PRODUCT: string[] = [
  "How would you improve our core product based on what you know about it?",
  "Walk me through how you'd prioritise a product roadmap with conflicting stakeholder requests.",
  "How do you decide what to build versus what to buy or partner on?",
  "Describe a product you love and what makes it great from a UX perspective.",
  "How would you design a feature to improve user retention by 20%?",
  "Walk me through how you'd launch a product in a new market.",
  "How do you define and measure product success?",
  "Tell me about a product decision you made that didn't work. What did you learn?",
  "How do you balance short-term wins with long-term product vision?",
  "How would you approach building an MVP for a new feature under time pressure?",
];

const LEADERSHIP: string[] = [
  "Describe a time when you had to align a team around a vision they initially resisted.",
  "How do you handle underperforming team members?",
  "Tell me about a time you had to make an unpopular decision as a leader.",
  "How do you build trust within a newly formed team?",
  "Describe your approach to giving feedback to a senior colleague.",
  "How have you developed other people's careers in previous roles?",
  "Tell me about a time you had to lead through a crisis.",
  "How do you ensure psychological safety on your team?",
  "Describe a time you had to manage competing priorities across multiple teams.",
  "How do you balance being a player-coach versus a pure manager?",
];

const BANK: QuestionBank = {
  behavioural:   BEHAVIOURAL,
  technical:     TECHNICAL,
  system_design: SYSTEM_DESIGN,
  hr:            HR,
  mixed:         MIXED,
  product:       PRODUCT,
  leadership:    LEADERSHIP,
};

// ── Shuffle helper (Fisher-Yates) ─────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Public API ────────────────────────────────────────────────────

export function generateLocalQuestions(
  interviewType: InterviewType,
  count: number,
  company?: string | null,
): SessionQuestion[] {
  const pool   = BANK[interviewType] ?? BANK.behavioural;
  const picked = shuffle(pool).slice(0, Math.min(count, pool.length));

  return picked.map((text, i) => ({
    id:             generateId(),
    question:       company
      ? injectCompany(text, company)
      : text,
    type:           interviewType,
    difficulty:     (["easy", "medium", "hard"] as const)[i % 3],
    expected_duration_seconds: 120,
    tags:           [interviewType],
    order:          i + 1,
  }));
}

function injectCompany(question: string, company: string): string {
  if (question.toLowerCase().includes("our")) {
    return question.replace(/our\s+(core\s+)?product/i, `${company}'s product`);
  }
  return question;
}
