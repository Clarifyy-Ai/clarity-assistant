const APP_TO_DB_MODEL: Record<string, string> = {
  "gemini-flash":      "gemini-2.0-flash",
  "gemini-2.0-flash":  "gemini-2.0-flash",
  "gemini-pro":        "gemini-1-5-pro",
  "gpt-4o":            "gpt-4o",
  "gpt-4o-mini":       "gpt-4o-mini",
  "claude":            "claude-3-5-sonnet",
  "claude-3-5-sonnet": "claude-3-5-sonnet",
  "claude-3-haiku":    "claude-3-haiku",
  "gemini-1-5-pro":    "gemini-1-5-pro",
  "gemini-1-5-flash":  "gemini-1-5-flash",
};

export function toDbModel(appModel: string): string {
  return APP_TO_DB_MODEL[appModel] ?? appModel;
}
