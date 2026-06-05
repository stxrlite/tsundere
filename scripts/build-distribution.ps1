param(
  [string]$OutDir = "release",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$release = Join-Path $root $OutDir
$cache = Join-Path $root ".npm-cache"

function Fresh-Directory {
  param([string]$Path)
  if (Test-Path $Path) {
    Remove-Item $Path -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Ensure-Directory {
  param([string]$Path)
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Copy-Required {
  param(
    [string]$Source,
    [string]$Destination
  )
  if (-not (Test-Path $Source)) {
    throw "Missing release asset: $Source"
  }
  Ensure-Directory (Split-Path -Parent $Destination)
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

Push-Location $root
try {
  if (-not $Version) {
    $package = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
    $Version = $package.version
  }
  $Version = $Version.Trim().TrimStart("v")
  $bundleName = "Tsundere-v$Version"
  $bundleDir = Join-Path $release $bundleName
  $bundleZip = Join-Path $release "$bundleName.zip"
  $bundleRar = Join-Path $release "$bundleName.rar"

  Fresh-Directory $release
  Ensure-Directory $cache

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

  $vsix = Get-ChildItem (Join-Path $root "packages/vscode-tsundere") -Filter "vscode-tsundere-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $vsix) {
    throw "VS Code extension package was not created."
  }
  Copy-Item -LiteralPath $vsix.FullName -Destination $release -Force

  $installer = @'
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "        Tsundere Installer v1.0" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$Root = $PSScriptRoot
$LogFile = Join-Path $Root "tsundere-install.log"
$PackageRoot = Join-Path $Root "packages"
if (-not (Test-Path $PackageRoot)) {
  $PackageRoot = $Root
}

function Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Yellow
}

try {
  Start-Transcript -Path $LogFile -Force | Out-Null

  Step "Checking Tsundere Runtime prerequisites"
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js first, then run this again."
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Reinstall Node.js with npm enabled."
  }
  Write-Host "Tsundere Runtime: $(node --version)" -ForegroundColor Green
  Write-Host "npm: $(npm --version)" -ForegroundColor Green

  Step "Checking pnpm"
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    npm install -g pnpm
  }
  Write-Host "pnpm ready." -ForegroundColor Green

  Step "Installing Tsundere CLI"
  $CliPackage = Join-Path $PackageRoot "tsundere-cli.tgz"
  if (-not (Test-Path $CliPackage)) {
    throw "Missing tsundere-cli.tgz in $PackageRoot"
  }
  npm install -g $CliPackage

  Step "Checking bundled Discord runtime"
  $DiscordPackage = Join-Path $PackageRoot "tsundere-discord.tgz"
  if (Test-Path $DiscordPackage) {
    Write-Host "Bundled @tsundere/discord package found." -ForegroundColor Green
  }
  else {
    Write-Warning "tsundere-discord.tgz missing. New projects can still use the CLI-bundled runtime."
  }

  Step "Installing VS Code/Cursor extension"
  $vsix = Get-ChildItem -Path $Root -Filter "vscode-tsundere-*.vsix" -Recurse | Select-Object -First 1
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

  Copy-Required (Join-Path $root "scripts/install-tsundere-windows.ps1") (Join-Path $release "install-tsundere-windows.ps1")
  Copy-Required (Join-Path $root "scripts/install-tsundere-linux.sh") (Join-Path $release "install-tsundere-linux.sh")

  $cliTgz = Get-ChildItem $release -Filter "tsundere-cli-*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $cliTgz) {
    throw "Missing tsundere-cli package tarball."
  }
  Copy-Item -LiteralPath $cliTgz.FullName -Destination (Join-Path $release "tsundere-cli.tgz") -Force

  $discordTgz = Get-ChildItem $release -Filter "tsundere-discord-*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $discordTgz) {
    throw "Missing tsundere-discord package tarball."
  }
  Copy-Item -LiteralPath $discordTgz.FullName -Destination (Join-Path $release "tsundere-discord.tgz") -Force

  Fresh-Directory $bundleDir
  Ensure-Directory (Join-Path $bundleDir "packages")
  Ensure-Directory (Join-Path $bundleDir "editor")
  Ensure-Directory (Join-Path $bundleDir "checksums")
  Ensure-Directory (Join-Path $bundleDir "docs")

  Copy-Required (Join-Path $release "install-tsundere.ps1") (Join-Path $bundleDir "install-tsundere.ps1")
  Copy-Required (Join-Path $release "installer.bat") (Join-Path $bundleDir "installer.bat")
  Copy-Required (Join-Path $release "install-tsundere-windows.ps1") (Join-Path $bundleDir "install-tsundere-windows.ps1")
  Copy-Required (Join-Path $release "install-tsundere-linux.sh") (Join-Path $bundleDir "install-tsundere-linux.sh")
  Copy-Required (Join-Path $release "tsundere-cli.tgz") (Join-Path $bundleDir "packages/tsundere-cli.tgz")
  Copy-Required (Join-Path $release "tsundere-discord.tgz") (Join-Path $bundleDir "packages/tsundere-discord.tgz")
  Copy-Required $cliTgz.FullName (Join-Path $bundleDir "packages/$($cliTgz.Name)")
  Copy-Required $discordTgz.FullName (Join-Path $bundleDir "packages/$($discordTgz.Name)")
  Copy-Required (Join-Path $release $vsix.Name) (Join-Path $bundleDir "editor/$($vsix.Name)")

  $readme = @"
# Tsundere v$Version

Run the installer from this folder:

```powershell
.\install-tsundere.ps1
```

Windows web installer:

```powershell
.\install-tsundere-windows.ps1
```

Linux web installer:

```sh
sh ./install-tsundere-linux.sh
```

## Layout

- `packages/tsundere-cli.tgz`: CLI package alias for the installer.
- `packages/tsundere-discord.tgz`: bundled Discord runtime package alias.
- `packages/tsundere-cli-$Version.tgz`: versioned CLI package.
- `packages/tsundere-discord-$Version.tgz`: versioned Discord runtime package.
- `editor/$($vsix.Name)`: VS Code and Cursor extension.
- `checksums/SHA256SUMS.txt`: SHA256 checksums for release files.

For an existing bot project after installing this release:

```powershell
tsundere runtime install
tsundere install
tsundere dev
```
"@
  Set-Content -Path (Join-Path $bundleDir "README.md") -Value $readme -Encoding UTF8

  $layout = @"
# Release Layout

This bundle is intentionally self-contained. The top-level installer reads packages from `packages/` and searches recursively for the VSIX under `editor/`.

Use `install-tsundere.ps1` for local bundle installs. Use `install-tsundere-windows.ps1` or `install-tsundere-linux.sh` when installing from GitHub-hosted assets.
"@
  Set-Content -Path (Join-Path $bundleDir "docs/RELEASE_LAYOUT.md") -Value $layout -Encoding UTF8

  $hashFiles = Get-ChildItem $bundleDir -File -Recurse | Where-Object {
    $_.FullName -notlike (Join-Path $bundleDir "checksums/*")
  } | Sort-Object FullName
  $hashLines = foreach ($file in $hashFiles) {
    $relative = $file.FullName.Substring($bundleDir.Length + 1).Replace("\", "/")
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
    "$hash  $relative"
  }
  Set-Content -Path (Join-Path $bundleDir "checksums/SHA256SUMS.txt") -Value $hashLines -Encoding ASCII

  $manifest = [ordered]@{
    name = "Tsundere"
    version = $Version
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    bundle = $bundleName
    files = @($hashFiles | ForEach-Object {
      [ordered]@{
        path = $_.FullName.Substring($bundleDir.Length + 1).Replace("\", "/")
        bytes = $_.Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
      }
    })
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $bundleDir "release-manifest.json") -Encoding UTF8

  if (Test-Path $bundleZip) {
    Remove-Item $bundleZip -Force
  }
  if (Test-Path $bundleRar) {
    Remove-Item $bundleRar -Force
  }

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
    Compress-Archive -Path $bundleDir -DestinationPath $bundleZip -Force
    Write-Warning "WinRAR/RAR was not found. Created zip bundle instead: $bundleZip"
  }

  Write-Host "Release layout written to $bundleDir"
  Write-Host "Distribution files written to $release"
}
finally {
  Pop-Location
}
