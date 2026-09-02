/** Map ai_usage_logs.model to provider label for admin dashboards. */
export function inferAiProvider(modelId: string): string {
  const m = modelId.toLowerCase();
  if (m.startsWith("gpt")) return "openai";
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gemini")) return "gemini";
  if (
    m.startsWith("nova") ||
    m.startsWith("flux") ||
    m.startsWith("whisper") ||
    m.startsWith("deepgram")
  ) {
    return "deepgram";
  }
  return "other";
}
