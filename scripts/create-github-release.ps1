param(
  [string]$Repo = $(if ($env:TSUNDERE_GITHUB_REPO) { $env:TSUNDERE_GITHUB_REPO } else { "TsundereLang/tsundere" }),
  [string]$Version,
  [switch]$Draft,
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Release = Join-Path $Root "release"

function Ask {
  param(
    [string]$Prompt,
    [string]$Default = ""
  )
  $label = if ($Default) { "$Prompt [$Default]" } else { $Prompt }
  $value = Read-Host $label
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }
  return $value.Trim()
}

function Ask-YesNo {
  param(
    [string]$Prompt,
    [bool]$Default = $true
  )
  $suffix = if ($Default) { "Y/n" } else { "y/N" }
  $value = Read-Host "$Prompt ($suffix)"
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }
  return $value -match "^[Yy]"
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI was not found. Install it from https://cli.github.com/ or run: winget install --id GitHub.cli -e"
}

if (-not $Version) {
  $package = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
  $Version = Ask "Release version" $package.version
}
$Version = $Version.Trim().TrimStart("v")
$Tag = "v$Version"

$Repo = Ask "GitHub repo" $Repo
$Draft = [bool]$Draft -or (Ask-YesNo "Create as draft release" $false)

if (-not $NoBuild -and (Ask-YesNo "Rebuild release bundle before publishing" $true)) {
  Push-Location $Root
  try {
    npm.cmd run dist:release -- -Version $Version
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path $Release)) {
  throw "Release folder not found. Run npm run dist:release first."
}

$Bundle = Get-ChildItem $Release -Filter "Tsundere-v$Version.rar" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Bundle) {
  $Bundle = Get-ChildItem $Release -Filter "Tsundere-v$Version.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (-not $Bundle) {
  $Bundle = Get-ChildItem $Release -Filter "Tsundere-v*.rar" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $Bundle) {
  $Bundle = Get-ChildItem $Release -Filter "Tsundere-v*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $Bundle) {
  throw "Missing release bundle. Run npm run dist:release first."
}

$Notes = Join-Path $Release "RELEASE_NOTES.md"
$UpdatesPath = Join-Path $Root "updates.md"
$Updates = if (Test-Path $UpdatesPath) { Get-Content $UpdatesPath -Raw } else { "No update notes found." }

@"
# Tsundere $Tag

Tsundere is a fun, vibecoded, optimized Discord wrapper and `.yuri` language toolchain for building bots on Node.js.

## Install

Download the Tsundere release bundle, extract it, then run:

```powershell
.\install-tsundere.ps1
```

Web installers are also included:

```powershell
.\install-tsundere-windows.ps1
```

```sh
sh ./install-tsundere-linux.sh
```

## Bundle

Uploaded asset:

```txt
$($Bundle.Name)
```

## Updates

$Updates
"@ | Set-Content -Path $Notes -Encoding UTF8

$releaseExists = $false
try {
  gh release view $Tag --repo $Repo | Out-Null
  $releaseExists = $true
}
catch {
  $releaseExists = $false
}

if ($releaseExists) {
  Write-Host "Updating existing release $Tag in $Repo" -ForegroundColor Yellow
  gh release edit $Tag --repo $Repo --title "Tsundere $Tag" --notes-file $Notes
  gh release upload $Tag $Bundle.FullName --repo $Repo --clobber
}
else {
  Write-Host "Creating release $Tag in $Repo" -ForegroundColor Yellow
  $Args = @(
    "release", "create", $Tag,
    "--repo", $Repo,
    "--title", "Tsundere $Tag",
    "--notes-file", $Notes
  )
  if ($Draft) {
    $Args += "--draft"
  }
  $Args += $Bundle.FullName
  gh @Args
}

Write-Host "Release publish complete: $Repo $Tag" -ForegroundColor Green
