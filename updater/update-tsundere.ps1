param(
  [string]$Repo = "TsundereLang/tsundere",
  [switch]$PreferGitHub,
  [switch]$SkipExtension,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Yellow
}

function New-TempDir {
  $path = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $path -Force | Out-Null
  return $path
}

function Find-LocalAsset {
  param(
    [string]$Root,
    [string]$Filter
  )
  if (-not (Test-Path $Root)) {
    return $null
  }
  return Get-ChildItem -Path $Root -Recurse -File -Filter $Filter -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Get-GitHubReleasePackage {
  param([string]$RepoName)

  Step "Fetching latest Tsundere release from GitHub"
  $apiUrl = "https://api.github.com/repos/$RepoName/releases/latest"
  $releaseData = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing

  $cliAsset = $releaseData.assets |
    Where-Object { $_.name -match "^tsundere-cli-\d+\.\d+\.\d+.*\.tgz$" } |
    Select-Object -First 1

  if (-not $cliAsset) {
    $cliAsset = $releaseData.assets |
      Where-Object { $_.name -eq "tsundere-cli.tgz" -or $_.name -match "^tsundere-cli.*\.tgz$" } |
      Select-Object -First 1
  }

  if (-not $cliAsset) {
    $zipAsset = $releaseData.assets |
      Where-Object { $_.name -match "\.zip$" } |
      Select-Object -First 1

    if (-not $zipAsset) {
      throw "Latest release does not include a Tsundere CLI tarball or zip asset."
    }

    $tempDir = New-TempDir
    $zipPath = Join-Path $tempDir "TsundereRelease.zip"
    Step "Downloading release zip"
    Invoke-WebRequest -Uri $zipAsset.browser_download_url -OutFile $zipPath -UseBasicParsing
    Step "Extracting release zip"
    Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
    $package = Find-LocalAsset -Root $tempDir -Filter "tsundere-cli*.tgz"
    if (-not $package) {
      throw "Downloaded release zip did not contain a Tsundere CLI tarball."
    }
    return @{
      Package = $package.FullName
      TempDir = $tempDir
      Release = $releaseData.tag_name
    }
  }

  $directTempDir = New-TempDir
  $packagePath = Join-Path $directTempDir $cliAsset.name
  Step "Downloading $($cliAsset.name)"
  Invoke-WebRequest -Uri $cliAsset.browser_download_url -OutFile $packagePath -UseBasicParsing
  return @{
    Package = $packagePath
    TempDir = $directTempDir
    Release = $releaseData.tag_name
  }
}

function Install-Extension {
  param([string]$SearchRoot)

  if ($SkipExtension) {
    Write-Host "Skipping editor extension install." -ForegroundColor Gray
    return
  }

  $vsix = Find-LocalAsset -Root $SearchRoot -Filter "vscode-tsundere-*.vsix"
  if (-not $vsix) {
    return
  }

  foreach ($command in @("code", "cursor", "antigravity")) {
    if (Get-Command $command -ErrorAction SilentlyContinue) {
      Step "Installing Tsundere extension with $command"
      if ($DryRun) {
        Write-Host "Dry run: $command --install-extension $($vsix.FullName) --force"
      } else {
        & $command --install-extension $vsix.FullName --force
      }
    }
  }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "        Tsundere Automatic Updater" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Tsundere Runtime was not found. Install Node.js first, then run this updater again."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Reinstall Node.js with npm enabled."
}

$localPackage = $null
if (-not $PreferGitHub) {
  $localPackage = Find-LocalAsset -Root $PSScriptRoot -Filter "tsundere-cli*.tgz"
}

$tempDir = $null
$searchRoot = $PSScriptRoot
try {
  if ($localPackage) {
    $packagePath = $localPackage.FullName
    Step "Using local release package"
  } else {
    $download = Get-GitHubReleasePackage -RepoName $Repo
    $packagePath = $download.Package
    $tempDir = $download.TempDir
    $searchRoot = $tempDir
    Step "Using GitHub release $($download.Release)"
  }

  Write-Host "Package: $packagePath" -ForegroundColor Gray
  Step "Installing Tsundere CLI"
  if ($DryRun) {
    Write-Host "Dry run: npm install -g `"$packagePath`""
  } else {
    npm install -g $packagePath
  }

  Install-Extension -SearchRoot $searchRoot

  Step "Verifying installation"
  if ($DryRun) {
    Write-Host "Dry run: tsundere version"
  } else {
    tsundere version
  }

  Write-Host ""
  Write-Host "Tch... Tsundere is updated." -ForegroundColor Green
} finally {
  if ($tempDir -and (Test-Path $tempDir)) {
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
