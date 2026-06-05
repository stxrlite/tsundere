$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Release = Join-Path $Root "release"

if (Get-Command tsundere -ErrorAction SilentlyContinue) {
  tsundere updater self --yes
  exit $LASTEXITCODE
}

if (-not (Test-Path $Release)) {
  throw "Tsundere is not installed and release folder was not found. Install from GitHub or run npm run dist:release first."
}

Push-Location $Release
try {
  $Installer = Join-Path $Release "install-tsundere.ps1"
  if (-not (Test-Path $Installer)) {
    throw "Missing install-tsundere.ps1 in release folder."
  }

  powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Installer
}
finally {
  Pop-Location
}
