# Deploy edge functions changed in Live Audio / Mock / Prep pass.
# Requires: Supabase CLI logged in (npx supabase login) and project linked.
# Usage: .\scripts\deploy-live-mock-prep.ps1

$ErrorActionPreference = "Stop"
$functions = @(
  "collect-exam-papers",
  "parse-question-pdf",
  "select-test-questions",
  "create-test",
  "prep-tool",
  "polish-star-section",
  "generate-star-answer",
  "generate-hint",
  "generate-answer",
  "deepgram-token"
)

Write-Host "Deploying $($functions.Count) priority edge functions..."
foreach ($fn in $functions) {
  Write-Host "-> $fn"
  npx supabase functions deploy $fn
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Done. Verify secrets: GEMINI_API_KEY, SYSTEM_USER_ID, DEEPGRAM_API_KEY, ALLOWED_ORIGINS"
Write-Host "Smoke: tab audio transcript, mock launch, prep-tool / STAR Builder (no CORS errors)"
