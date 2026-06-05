param(
  [string]$Repo = $(if ($env:TSUNDERE_GITHUB_REPO) { $env:TSUNDERE_GITHUB_REPO } else { "TsundereLang/tsundere" }),
  [string]$Version,
  [switch]$Draft,
  [switch]$NoBuild,
  [switch]$DryRun
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

if (-not $Version) {
  $package = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
  $Version = Ask "Release version" $package.version
}
$Version = $Version.Trim().TrimStart("v")
$Tag = "v$Version"

$Repo = Ask "GitHub repo" $Repo
if (-not $DryRun) {
  $Draft = [bool]$Draft -or (Ask-YesNo "Create as draft release" $false)
}

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

if ($DryRun) {
  Write-Host "Dry run complete." -ForegroundColor Green
  Write-Host "Repo: $Repo"
  Write-Host "Tag: $Tag"
  Write-Host "Bundle: $($Bundle.FullName)"
  Write-Host "Notes: $Notes"
  exit 0
}

$Gh = Get-Command gh -ErrorAction SilentlyContinue
if ($Gh) {
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
  exit 0
}

function Get-GitHubToken {
  if ($env:GH_TOKEN) {
    return $env:GH_TOKEN
  }
  if ($env:GITHUB_TOKEN) {
    return $env:GITHUB_TOKEN
  }
  $credentialInput = "protocol=https`nhost=github.com`npath=$Repo.git`n`n"
  $credentialOutput = $credentialInput | git credential fill 2>$null
  $credential = @{}
  foreach ($line in $credentialOutput) {
    $index = $line.IndexOf("=")
    if ($index -gt 0) {
      $credential[$line.Substring(0, $index)] = $line.Substring($index + 1)
    }
  }
  return $credential.password
}

function Invoke-GitHubApi {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null,
    [string]$ContentType = "application/json"
  )
  $params = @{
    Method = $Method
    Uri = $Uri
    Headers = @{
      Authorization = "Bearer $Token"
      Accept = "application/vnd.github+json"
      "X-GitHub-Api-Version" = "2022-11-28"
      "User-Agent" = "tsundere-release-script"
    }
    ContentType = $ContentType
  }
  if ($null -ne $Body) {
    if ($ContentType -eq "application/json") {
      $params.Body = ($Body | ConvertTo-Json -Depth 8)
    }
    else {
      $params.Body = $Body
    }
  }
  Invoke-RestMethod @params
}

$Token = Get-GitHubToken
if (-not $Token) {
  throw "No GitHub auth found. Install GitHub CLI, set GH_TOKEN, set GITHUB_TOKEN, or sign in with Git Credential Manager."
}

$ExistingRelease = $null
try {
  $ExistingRelease = Invoke-GitHubApi -Method Get -Uri "https://api.github.com/repos/$Repo/releases/tags/$Tag"
}
catch {
  $ExistingRelease = $null
}

$notesText = Get-Content $Notes -Raw
if ($ExistingRelease) {
  Write-Host "Updating existing release $Tag in $Repo" -ForegroundColor Yellow
  $ReleaseObject = Invoke-GitHubApi -Method Patch -Uri "https://api.github.com/repos/$Repo/releases/$($ExistingRelease.id)" -Body @{
    tag_name = $Tag
    name = "Tsundere $Tag"
    body = $notesText
    draft = [bool]$Draft
  }
}
else {
  Write-Host "Creating release $Tag in $Repo" -ForegroundColor Yellow
  $ReleaseObject = Invoke-GitHubApi -Method Post -Uri "https://api.github.com/repos/$Repo/releases" -Body @{
    tag_name = $Tag
    target_commitish = "master"
    name = "Tsundere $Tag"
    body = $notesText
    draft = [bool]$Draft
    prerelease = $false
  }
}

$assetName = $Bundle.Name
foreach ($asset in @($ReleaseObject.assets)) {
  if ($asset.name -eq $assetName) {
    Invoke-GitHubApi -Method Delete -Uri "https://api.github.com/repos/$Repo/releases/assets/$($asset.id)" | Out-Null
  }
}

$uploadUrl = $ReleaseObject.upload_url.Split("{")[0] + "?name=$([uri]::EscapeDataString($assetName))"
$bytes = [System.IO.File]::ReadAllBytes($Bundle.FullName)
$assetType = if ($assetName.EndsWith(".zip")) { "application/zip" } elseif ($assetName.EndsWith(".rar")) { "application/vnd.rar" } else { "application/octet-stream" }
Invoke-GitHubApi -Method Post -Uri $uploadUrl -Body $bytes -ContentType $assetType | Out-Null

Write-Host "Release publish complete: $Repo $Tag" -ForegroundColor Green
