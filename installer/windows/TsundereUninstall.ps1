param(
  [switch]$RemoveCache,
  [switch]$RemoveSettings
)

$ErrorActionPreference = "Stop"
$installRoot = Join-Path $env:LOCALAPPDATA "Tsundere"
$configRoot = Join-Path $env:APPDATA "Tsundere"
$cacheRoot = Join-Path $env:LOCALAPPDATA "Tsundere\Cache"
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Tsundere"

function Remove-PathEntry($entry) {
  $path = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $path) { return }
  $parts = $path -split ";" | Where-Object { $_ -and $_.Trim() -ne $entry }
  [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")
}

Remove-PathEntry (Join-Path $installRoot "bin")

if (Test-Path $installRoot) {
  Remove-Item $installRoot -Recurse -Force
}

if ($RemoveCache -and (Test-Path $cacheRoot)) {
  Remove-Item $cacheRoot -Recurse -Force
}

if ($RemoveSettings -and (Test-Path $configRoot)) {
  Remove-Item $configRoot -Recurse -Force
}

if (Test-Path $regPath) {
  Remove-Item $regPath -Recurse -Force
}

Write-Host "Tsundere was removed. User-created projects were not touched."
