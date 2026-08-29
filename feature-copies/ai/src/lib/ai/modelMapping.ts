const APP_TO_DB_MODEL: Record<string, string> = {
  "gemini-flash":      "gemini-2.0-flash",
  "gemini-2.0-flash":  "gemini-2.0-flash",
  "gemini-2.5-flash":  "gemini-2.0-flash",
  "gemini-2.5-flash-lite": "gemini-2.0-flash",
  "gemini-pro":        "gemini-1-5-pro",
  "gemini-2.5-pro":    "gemini-1-5-pro",
  "gpt-4o":            "gpt-4o",
  "gpt-4o-mini":       "gpt-4o-mini",
  "claude":            "claude-3-5-sonnet",
  "claude-3-5-sonnet": "claude-3-5-sonnet",
  "claude-3-haiku":    "claude-3-haiku",
  "gemini-1-5-pro":    "gemini-1-5-pro",
  "gemini-1-5-flash":  "gemini-1-5-flash",
};

const DB_AI_MODELS = new Set(Object.values(APP_TO_DB_MODEL));

export function toDbModel(appModel: string): string {
  const mapped = APP_TO_DB_MODEL[appModel] ?? appModel;
  // sessions.model_used is public.ai_model — never write unknown labels.
  if (DB_AI_MODELS.has(mapped)) return mapped;
  return "gemini-2.0-flash";
}
