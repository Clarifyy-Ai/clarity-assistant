/**
 * Server mirror of src/lib/ai/coachQuestionClassify.ts — keep regex logic aligned.
 */

export type CoachQuestionClass =
  | "behavioural"
  | "technical"
  | "coding"
  | "system_design"
  | "product"
  | "leadership"
  | "hr"
  | "mixed";

function sessionClassAsPrior(sessionType: string | null | undefined): CoachQuestionClass {
  const t = String(sessionType ?? "").trim().toLowerCase();
  switch (t) {
    case "behavioural":
    case "behavioral":
      return "behavioural";
    case "technical":
      return "technical";
    case "coding":
      return "coding";
    case "system_design":
    case "system-design":
      return "system_design";
    case "product":
      return "product";
    case "leadership":
      return "leadership";
    case "hr":
      return "hr";
    default:
      return "mixed";
  }
}

export function classifyCoachQuestion(
  questionText: string,
  sessionType?: string | null,
): CoachQuestionClass {
  const q = String(questionText ?? "").trim().toLowerCase();
  const prior = sessionClassAsPrior(sessionType);

  if (!q) return prior;

  const systemDesign =
    /\b(system design|design (a|an|the)\s+\w+|high[- ]?level design|hld|scalability|load balanc|cdn|sharding|microservices|cap theorem|consistent hashing)\b/.test(
      q,
    ) || /\bhow would you (design|architect|scale)\b/.test(q);

  if (systemDesign) return "system_design";

  const coding =
    /\b(write (a |the )?(function|method|code|program)|leetcode|pseudocode|time complexity|space complexity|big[- ]?o|binary tree|linked list|array|hash ?map|dfs|bfs|dynamic programming|implement (a|an|the))\b/.test(
      q,
    ) || /\b(coding|algorithm|data structure)\b/.test(q);

  if (coding && !/\b(sql|database|query|join|index)\b/.test(q)) return "coding";

  const technicalSql =
    /\b(sql|select\b|join\b|index(?:es)?|normali[sz]e|acid|transaction|query plan|foreign key|primary key|nosql|postgres|mysql|mongodb|redis|database|schema|orm)\b/.test(
      q,
    ) ||
    (/\b(what is|explain|difference between|how does|define)\b/.test(q) &&
      /\b(api|http|rest|graphql|cache|concurrency|thread|lock|gc|memory|latency|throughput|tcp|udp|dns|oauth|jwt|encryption|hashing)\b/.test(
        q,
      ));

  if (technicalSql) return "technical";

  const leadership =
    /\b(lead(?:ership|ing)?|managed a team|influence without authority|conflict on (?:the )?team|mentored|performance review)\b/.test(
      q,
    );

  if (leadership) return "leadership";

  const behavioural =
    /\b(tell me about a time|describe a (?:time|situation)|give (?:me )?an example|conflict|challenging (?:situation|project)|failure|mistake you made|proud of)\b/.test(
      q,
    );

  if (behavioural) return "behavioural";

  const hr =
    /\b(why (?:do you want|this company|this role)|salary|notice period|relocation|strengths? and weaknesses?|where do you see yourself)\b/.test(
      q,
    );

  if (hr) return "hr";

  const product =
    /\b(prioriti[sz]e|rice|ice|moscow|go[- ]to[- ]market|product (?:sense|strategy|roadmap)|user persona|north star metric)\b/.test(
      q,
    );

  if (product) return "product";

  if (prior !== "mixed") return prior;
  return "mixed";
}

export function sanitizeQuestionClass(input: unknown): CoachQuestionClass {
  const value = String(input ?? "").trim().toLowerCase();
  const allowed: CoachQuestionClass[] = [
    "behavioural",
    "technical",
    "coding",
    "system_design",
    "product",
    "leadership",
    "hr",
    "mixed",
  ];
  return allowed.includes(value as CoachQuestionClass)
    ? (value as CoachQuestionClass)
    : "mixed";
}
