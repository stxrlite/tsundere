param(
  [string]$OutDir = "release",
  [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$release = Join-Path $root $OutDir
$cache = Join-Path $root ".npm-cache"

New-Item -ItemType Directory -Force -Path $release | Out-Null
New-Item -ItemType Directory -Force -Path $cache | Out-Null

Push-Location $root
try {
  npm.cmd install --cache $cache
  npm.cmd run build
  if (Test-Path "packages/discord/dist") {
    Remove-Item "packages/discord/dist" -Recurse -Force
  }
  Copy-Item -Path "dist/discord" -Destination "packages/discord/dist" -Recurse -Force
  npm.cmd pack --pack-destination $release --cache $cache --ignore-scripts

  Push-Location (Join-Path $root "packages/discord")
  try {
    npm.cmd pack --pack-destination $release --cache $cache --ignore-scripts
  }
  finally {
    Pop-Location
  }
  npm.cmd --prefix packages/vscode-tsundere install --cache $cache
  npm.cmd --prefix packages/vscode-tsundere run package
  Copy-Item -LiteralPath "packages/vscode-tsundere/vscode-tsundere-0.1.0.vsix" -Destination $release -Force

  $installer = @'
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "        Tsundere Installer v1.0" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$Root = $PSScriptRoot
$LogFile = Join-Path $Root "tsundere-install.log"

function Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Yellow
}

try {
  Start-Transcript -Path $LogFile -Force | Out-Null

  Step "Checking Node.js and npm"
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js first, then run this again."
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Reinstall Node.js with npm enabled."
  }
  Write-Host "Node.js: $(node --version)" -ForegroundColor Green
  Write-Host "npm: $(npm --version)" -ForegroundColor Green

  Step "Checking pnpm"
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    npm install -g pnpm
  }
  Write-Host "pnpm ready." -ForegroundColor Green

  Step "Installing Tsundere CLI"
  $CliPackage = Join-Path $Root "tsundere-cli.tgz"
  if (-not (Test-Path $CliPackage)) {
    throw "Missing tsundere-cli.tgz in $Root"
  }
  npm install -g $CliPackage

  Step "Checking bundled Discord runtime"
  $DiscordPackage = Join-Path $Root "tsundere-discord.tgz"
  if (Test-Path $DiscordPackage) {
    Write-Host "Bundled @tsundere/discord package found." -ForegroundColor Green
  }
  else {
    Write-Warning "tsundere-discord.tgz missing. New projects can still use the CLI-bundled runtime."
  }

  Step "Installing VS Code/Cursor extension"
  $vsix = Get-ChildItem -Filter "vscode-tsundere-*.vsix" | Select-Object -First 1
  if ($vsix -and (Get-Command code -ErrorAction SilentlyContinue)) {
    code --install-extension $vsix.FullName --force
  }

  Step "Verifying"
  tsundere help

  Step "Opening documentation"
  tsundere docs

  Stop-Transcript | Out-Null
  Write-Host ""
  Write-Host "Installation complete." -ForegroundColor Green
  Write-Host "For an existing bot project, run: tsundere runtime install && tsundere install" -ForegroundColor Cyan
}
catch {
  try { Stop-Transcript | Out-Null } catch {}
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Log file: $LogFile" -ForegroundColor Cyan
  exit 1
}
'@
  Set-Content -Path (Join-Path $release "install-tsundere.ps1") -Value $installer -Encoding UTF8

  $bat = @'
@echo off
title Tsundere Installer
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0install-tsundere.ps1"
'@
  Set-Content -Path (Join-Path $release "installer.bat") -Value $bat -Encoding ASCII

  Copy-Item -LiteralPath (Join-Path $root "scripts/install-tsundere-windows.ps1") -Destination (Join-Path $release "install-tsundere-windows.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $root "scripts/install-tsundere-linux.sh") -Destination (Join-Path $release "install-tsundere-linux.sh") -Force

  $tgz = Get-ChildItem $release -Filter "*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $cliTgz = Get-ChildItem $release -Filter "tsundere-cli-*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($cliTgz) {
    Copy-Item -LiteralPath $cliTgz.FullName -Destination (Join-Path $release "tsundere-cli.tgz") -Force
  }
  $discordTgz = Get-ChildItem $release -Filter "tsundere-discord-*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($discordTgz) {
    Copy-Item -LiteralPath $discordTgz.FullName -Destination (Join-Path $release "tsundere-discord.tgz") -Force
  }

  $bundleName = "Tsundere-v$Version"
  $bundleDir = Join-Path $release $bundleName
  $bundleZip = Join-Path $release "$bundleName.zip"
  $bundleRar = Join-Path $release "$bundleName.rar"
  if (Test-Path $bundleDir) {
    Remove-Item $bundleDir -Recurse -Force
  }
  if (Test-Path $bundleZip) {
    Remove-Item $bundleZip -Force
  }
  if (Test-Path $bundleRar) {
    Remove-Item $bundleRar -Force
  }
  New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

  $bundleAssets = @(
    "install-tsundere.ps1",
    "install-tsundere-windows.ps1",
    "install-tsundere-linux.sh",
    "installer.bat",
    "tsundere-cli.tgz",
    "tsundere-discord.tgz",
    "vscode-tsundere-0.1.0.vsix"
  )

  foreach ($asset in $bundleAssets) {
    $source = Join-Path $release $asset
    if (-not (Test-Path $source)) {
      throw "Missing bundle asset: $source"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $bundleDir $asset) -Force
  }

  $hashLines = foreach ($asset in $bundleAssets) {
    $file = Join-Path $bundleDir $asset
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
    "$hash  $asset"
  }
  Set-Content -Path (Join-Path $bundleDir "SHA256SUMS.txt") -Value $hashLines -Encoding ASCII

  $rar = Get-Command rar -ErrorAction SilentlyContinue
  $winrar = Get-Command winrar -ErrorAction SilentlyContinue
  if ($rar) {
    Push-Location $release
    try {
      & $rar.Source a -r "$bundleName.rar" $bundleName | Out-Host
    }
    finally {
      Pop-Location
    }
    Write-Host "Release bundle written to $bundleRar"
  }
  elseif ($winrar) {
    Push-Location $release
    try {
      & $winrar.Source a -afrar -r "$bundleName.rar" $bundleName | Out-Host
    }
    finally {
      Pop-Location
    }
    Write-Host "Release bundle written to $bundleRar"
  }
  else {
    Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $bundleZip -Force
    Write-Warning "WinRAR/RAR was not found. Created zip bundle instead: $bundleZip"
  }

  Write-Host "Distribution files written to $release"
}
finally {
  Pop-Location
}
