#!/usr/bin/env pwsh

# Stop executing script on any error
$ErrorActionPreference = 'Stop'
# Do not show download progress
$ProgressPreference = 'SilentlyContinue'

# Taken from https://stackoverflow.com/a/34559554/6537420
function New-TemporaryDirectory {
  $parent = [System.IO.Path]::GetTempPath()
  [string] $name = [System.Guid]::NewGuid()
  New-Item -ItemType Directory -Path (Join-Path $parent $name)
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     Tsundere Framework Web Installer" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "==> Fetching latest Tsundere release info from GitHub..." -ForegroundColor Yellow

$ApiUrl = "https://api.github.com/repos/TsundereLang/tsundere/releases/latest"
$ReleaseData = try { Invoke-RestMethod -Uri $ApiUrl -UseBasicParsing } catch { throw "Failed to fetch latest release from GitHub." }

$ZipAsset = $ReleaseData.assets | Where-Object { $_.name -match "\.zip$" } | Select-Object -First 1

if (-not $ZipAsset) {
  Write-Warning "No explicit .zip asset found in the latest release. Attempting to use the source code zipball..."
  $ReleaseZipUrl = $ReleaseData.zipball_url
} else {
  $ReleaseZipUrl = $ZipAsset.browser_download_url
}

Write-Host "==> Downloading Tsundere Release..." -ForegroundColor Yellow
Write-Host "URL: $ReleaseZipUrl" -ForegroundColor Gray

$TsundereTempDir = New-TemporaryDirectory
$ZipPath = Join-Path $TsundereTempDir.FullName "TsundereRelease.zip"

Invoke-WebRequest -Uri $ReleaseZipUrl -OutFile $ZipPath -UseBasicParsing

Write-Host "==> Extracting files..." -ForegroundColor Yellow
Expand-Archive -Path $ZipPath -DestinationPath $TsundereTempDir.FullName -Force

# Find the extracted tsundere-cli.tgz
$CliPackage = Get-ChildItem -Path $TsundereTempDir.FullName -Recurse -Filter "tsundere-cli.tgz" | Select-Object -First 1

if (-not $CliPackage) {
  # Cleanup before throwing
  Remove-Item $TsundereTempDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
  throw "Could not find tsundere-cli.tgz inside the downloaded archive. Are you sure the release zip contains the CLI package?"
}

try {
  Write-Host "==> Checking Node.js and npm..." -ForegroundColor Yellow
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js first, then run this again."
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Reinstall Node.js with npm enabled."
  }
  Write-Host "Node.js: $(node --version)" -ForegroundColor Green
  Write-Host "npm: $(npm --version)" -ForegroundColor Green

  Write-Host "==> Checking pnpm..." -ForegroundColor Yellow
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    npm install -g pnpm
  }
  Write-Host "pnpm ready." -ForegroundColor Green

  Write-Host "==> Installing Tsundere CLI..." -ForegroundColor Yellow
  npm install -g $CliPackage.FullName

  $vsix = Get-ChildItem -Path $TsundereTempDir.FullName -Recurse -Filter "vscode-tsundere-*.vsix" | Select-Object -First 1
  if ($vsix -and ((Get-Command code -ErrorAction SilentlyContinue) -or (Get-Command cursor -ErrorAction SilentlyContinue) -or (Get-Command antigravity -ErrorAction SilentlyContinue))) {
    Write-Host ""
    $installExt = Read-Host "Would you like to install the Tsundere extension for VS Code / Cursor / Antigravity? (Y/n)"
    if ($installExt -match "^[Yy]?$") {
      Write-Host "==> Installing extension..." -ForegroundColor Yellow
      if (Get-Command code -ErrorAction SilentlyContinue) {
        Write-Host "Installing for VS Code..." -ForegroundColor Gray
        code --install-extension $vsix.FullName --force
      }
      if (Get-Command cursor -ErrorAction SilentlyContinue) {
        Write-Host "Installing for Cursor..." -ForegroundColor Gray
        cursor --install-extension $vsix.FullName --force
      }
      if (Get-Command antigravity -ErrorAction SilentlyContinue) {
        Write-Host "Installing for Antigravity IDE..." -ForegroundColor Gray
        antigravity --install-extension $vsix.FullName --force
      }
    } else {
      Write-Host "Skipping extension installation." -ForegroundColor Gray
    }
  }

  Write-Host "==> Verifying Installation..." -ForegroundColor Yellow
  tsundere help
} catch {
  Write-Host "Installation failed!" -ForegroundColor Red
  throw $_
} finally {
  Write-Host "==> Cleaning up temporary files..." -ForegroundColor Yellow
  Remove-Item $TsundereTempDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Web install process completed." -ForegroundColor Green
