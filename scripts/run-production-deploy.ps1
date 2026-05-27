# Production deploy runner — validates repo, then runs db push + edge deploy.
# Requires: Supabase CLI logged in and project linked.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "`n=== Clarify AI production deploy ===`n" -ForegroundColor Cyan

Write-Host "Step 1/4: Pre-deploy check..." -ForegroundColor Yellow
node scripts/pre-deploy-check.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nStep 2/4: Database migrations..." -ForegroundColor Yellow
npx supabase db push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nStep 3/4: Edge functions..." -ForegroundColor Yellow
node scripts/deploy-all-edge-functions.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nStep 4/4: Smoke test (requires env)..." -ForegroundColor Yellow
if ($env:SUPABASE_URL -and $env:ANON_KEY) {
  bash scripts/smoke-edge.sh
} else {
  Write-Host "  Skip: set SUPABASE_URL and ANON_KEY to run smoke-edge.sh" -ForegroundColor DarkYellow
}

Write-Host "`nDone. Manual smoke: signup -> onboarding -> live hint -> mock test -> admin.`n" -ForegroundColor Green
