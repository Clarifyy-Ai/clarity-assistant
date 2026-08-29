/**
 * Gap Analysis validation schemas and bounded AI JSON repair.
 */
import { z } from "zod";
import { stripMarkdownFences } from "../ai/structuredParse";

export const gapAnalysisRequestSchema = z.object({
  resume_id: z.string().uuid("Invalid Resume ID"),
  jd_id: z.string().uuid("Invalid Job Description ID"),
  force_rerun: z.boolean().optional().default(false),
});

export const gapAnalysisResultSchema = z.object({
  match_score: z
    .number()
    .min(0, "Match score cannot be negative")
    .max(100, "Match score cannot exceed 100")
    .default(0),
  matching_skills: z.array(z.string()).default([]),
  missing_skills: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  experience_gap: z.string().default(""),
  education_fit: z.string().default(""),
  matched_evidence: z.array(z.string()).optional().default([]),
  missing_evidence: z.array(z.string()).optional().default([]),
  parse_failed: z.boolean().optional().default(false),
});

export type GapAnalysisOutput = z.infer<typeof gapAnalysisResultSchema>;

/**
 * Attempts bounded structural repair of malformed AI JSON strings.
 */
export function repairJsonString(raw: string): string {
  let text = stripMarkdownFences(raw).trim();

  // Find outermost JSON object
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  // Remove trailing commas before closing braces/brackets
  text = text.replace(/,\s*([}\]])/g, "$1");

  // Fix unescaped control characters
  text = text.replace(/[\u0000-\u001F]+/g, (match) => (match === "\n" || match === "\r" || match === "\t" ? match : " "));

  return text;
}

export interface BoundedParseResult {
  success: boolean;
  data: GapAnalysisOutput;
  repaired: boolean;
  error?: string;
}

/**
 * Validates AI output with bounded repair. Never exposes raw parser errors.
 */
export function validateAndRepairGapAnalysis(rawAiOutput: string): BoundedParseResult {
  const defaultFallback: GapAnalysisOutput = {
    match_score: 0,
    matching_skills: [],
    missing_skills: [],
    recommendations: [
      "The analysis output could not be parsed safely. Please retry the analysis.",
    ],
    experience_gap: "Unable to parse experience alignment.",
    education_fit: "Unable to parse education fit.",
    matched_evidence: [],
    missing_evidence: [],
    parse_failed: true,
  };

  if (!rawAiOutput || !rawAiOutput.trim()) {
    return {
      success: false,
      data: defaultFallback,
      repaired: false,
      error: "Empty AI response.",
    };
  }

  // Attempt 1: direct parse
  try {
    const directClean = stripMarkdownFences(rawAiOutput);
    const parsed = JSON.parse(directClean);
    const validated = gapAnalysisResultSchema.parse(parsed);
    return {
      success: true,
      data: validated,
      repaired: false,
    };
  } catch {
    // Attempt 2: bounded repair
    try {
      const repaired = repairJsonString(rawAiOutput);
      const parsedRepaired = JSON.parse(repaired);
      const validatedRepaired = gapAnalysisResultSchema.parse(parsedRepaired);
      return {
        success: true,
        data: validatedRepaired,
        repaired: true,
      };
    } catch {
      // Return recoverable fallback without throwing or exposing raw internal syntax error
      return {
        success: false,
        data: defaultFallback,
        repaired: false,
        error: "Failed to parse structured analysis safely.",
      };
    }
  }
}
