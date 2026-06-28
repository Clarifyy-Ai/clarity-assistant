# Run the locally built Clarify AI Windows installer (bypasses web download).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$candidates = @(
  (Join-Path $root "release-new\Clarify AI Setup 1.0.0.exe"),
  (Join-Path $root "release\Clarify AI Setup 1.0.0.exe")
)

foreach ($dir in @("release-new", "release")) {
  $folder = Join-Path $root $dir
  if (Test-Path $folder) {
    $match = Get-ChildItem $folder -Filter "*Setup*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) { $candidates = @($match.FullName) + $candidates }
  }
}

$installer = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $installer) {
  Write-Host "No installer found. Build first:" -ForegroundColor Yellow
  Write-Host "  npm run dist:win" -ForegroundColor Cyan
  exit 1
}

Write-Host "Launching: $installer" -ForegroundColor Green
Start-Process -FilePath $installer
