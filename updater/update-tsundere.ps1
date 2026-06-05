$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Release = Join-Path $Root "release"

if (-not (Test-Path $Release)) {
  throw "Release folder not found. Run npm run dist:release first."
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
