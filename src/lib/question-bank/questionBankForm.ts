/** Shared Question Bank form helpers — MCQ, TRUE_FALSE, images. */

export const TRUE_FALSE_OPTIONS = [
  { label: "A", text: "True" },
  { label: "B", text: "False" },
] as const;

const IMAGE_URL_RE =
  /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i;

export function isLikelyImageUrl(value: string): boolean {
  const t = value.trim();
  return IMAGE_URL_RE.test(t) || /supabase\.co\/storage\/v1\/object\/public\/question-images\//i.test(t);
}

/** Split stored option text into display text + optional trailing image URL. */
export function parseOptionText(stored: string): { text: string; imageUrl: string } {
  const trimmed = stored.trim();
  if (!trimmed) return { text: "", imageUrl: "" };

  const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1) {
    if (isLikelyImageUrl(lines[0])) return { text: "", imageUrl: lines[0] };
    return { text: lines[0], imageUrl: "" };
  }

  const last = lines[lines.length - 1];
  if (isLikelyImageUrl(last)) {
    return {
      text: lines.slice(0, -1).join("\n"),
      imageUrl: last,
    };
  }
  return { text: trimmed, imageUrl: "" };
}

export function buildOptionText(text: string, imageUrl: string): string {
  const t = text.trim();
  const img = imageUrl.trim();
  if (img && !t) return img;
  if (img && t) return `${t}\n${img}`;
  return t;
}

export function normalizeTrueFalseAnswer(value: string): "A" | "B" {
  const v = value.trim().toUpperCase();
  if (v === "A" || v === "TRUE" || v === "T" || v === "YES") return "A";
  if (v === "B" || v === "FALSE" || v === "F" || v === "NO") return "B";
  return "A";
}

export function trueFalseLabelFromAnswer(value: string): "True" | "False" {
  return normalizeTrueFalseAnswer(value) === "A" ? "True" : "False";
}

export type McqOptionFields = {
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_a_image: string;
  option_b_image: string;
  option_c_image: string;
  option_d_image: string;
};

export function buildMcqOptions(fields: McqOptionFields): Array<{ label: string; text: string }> {
  const pairs: Array<[string, string, string]> = [
    ["A", fields.option_a, fields.option_a_image],
    ["B", fields.option_b, fields.option_b_image],
    ["C", fields.option_c, fields.option_c_image],
    ["D", fields.option_d, fields.option_d_image],
  ];
  return pairs
    .map(([label, text, image]) => ({
      label,
      text: buildOptionText(text, image),
    }))
    .filter((o) => o.text.trim());
}

export function mcqFieldsFromOptions(
  options: Array<{ label: string; text: string }> | null | undefined,
): McqOptionFields {
  const empty: McqOptionFields = {
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    option_a_image: "",
    option_b_image: "",
    option_c_image: "",
    option_d_image: "",
  };
  for (const opt of options ?? []) {
    const key = opt.label.toUpperCase();
    const parsed = parseOptionText(opt.text ?? "");
    if (key === "A") {
      empty.option_a = parsed.text;
      empty.option_a_image = parsed.imageUrl;
    } else if (key === "B") {
      empty.option_b = parsed.text;
      empty.option_b_image = parsed.imageUrl;
    } else if (key === "C") {
      empty.option_c = parsed.text;
      empty.option_c_image = parsed.imageUrl;
    } else if (key === "D") {
      empty.option_d = parsed.text;
      empty.option_d_image = parsed.imageUrl;
    }
  }
  return empty;
}

export function optionsForQuestionType(input: {
  question_type: string;
  mcq: McqOptionFields;
  correct_answer: string;
}): { options: Array<{ label: string; text: string }>; correct_answer: string } {
  const type = input.question_type.toUpperCase();
  if (type === "TRUE_FALSE") {
    const correct = normalizeTrueFalseAnswer(input.correct_answer);
    return { options: [...TRUE_FALSE_OPTIONS], correct_answer: correct };
  }
  if (type === "MCQ") {
    return {
      options: buildMcqOptions(input.mcq),
      correct_answer: input.correct_answer.trim().toUpperCase(),
    };
  }
  return {
    options: [],
    correct_answer: input.correct_answer.trim(),
  };
}
