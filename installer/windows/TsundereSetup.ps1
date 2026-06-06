param(
  [string]$Version = "0.1.0",
  [string]$Channel = "stable"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$script:Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:InstallRoot = Join-Path $env:LOCALAPPDATA "Tsundere"
$script:ConfigRoot = Join-Path $env:APPDATA "Tsundere"
$script:BinRoot = Join-Path $script:InstallRoot "bin"
$script:Components = @{
  Cli = $true
  YuriLS = $true
  VSCode = $true
  Docs = $true
  Examples = $true
}
$script:EditorMode = "both"
$script:UpdateMode = "notify"
$script:TelemetryMode = "crash"

function Find-CommandPath($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Add-PathEntry($entry) {
  $path = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if ($path) { $parts = $path -split ";" | Where-Object { $_ } }
  if ($parts -notcontains $entry) {
    [Environment]::SetEnvironmentVariable("Path", (($parts + $entry) -join ";"), "User")
  }
}

function Write-InstallerConfig {
  New-Item -ItemType Directory -Path $script:ConfigRoot -Force | Out-Null
  $config = [ordered]@{
    version = $Version
    channel = $Channel
    installedAt = (Get-Date).ToString("o")
    updateMode = $script:UpdateMode
    telemetry = $script:TelemetryMode
    installRoot = $script:InstallRoot
  }
  $config | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $script:ConfigRoot "installer.json") -Encoding UTF8
}

function Register-Uninstaller {
  $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Tsundere"
  New-Item -Path $regPath -Force | Out-Null
  $uninstall = Join-Path $script:InstallRoot "uninstall.ps1"
  New-ItemProperty -Path $regPath -Name DisplayName -Value "Tsundere" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $regPath -Name DisplayVersion -Value $Version -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $regPath -Name Publisher -Value "TsundereLang" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $regPath -Name InstallLocation -Value $script:InstallRoot -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $regPath -Name UninstallString -Value "powershell -ExecutionPolicy Bypass -File `"$uninstall`"" -PropertyType String -Force | Out-Null
}

function Install-Tsundere {
  $ProgressText.Text = "Preparing folders..."
  New-Item -ItemType Directory -Path $script:InstallRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $script:BinRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $script:ConfigRoot -Force | Out-Null

  $uninstaller = Join-Path $script:Root "TsundereUninstall.ps1"
  if (Test-Path $uninstaller) {
    Copy-Item $uninstaller (Join-Path $script:InstallRoot "uninstall.ps1") -Force
  }

  if ($script:Components.Cli) {
    $ProgressText.Text = "Installing Tsundere CLI..."
    $tgz = Get-ChildItem $script:Root -Filter "tsundere-cli*.tgz" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($tgz) {
      npm install -g $tgz.FullName | Out-Null
    }
  }

  if ($script:Components.VSCode -and ($script:EditorMode -eq "vscode" -or $script:EditorMode -eq "both")) {
    $ProgressText.Text = "Installing VS Code extension..."
    $vsix = Get-ChildItem $script:Root -Filter "vscode-tsundere*.vsix" -ErrorAction SilentlyContinue | Select-Object -First 1
    $code = Find-CommandPath "code"
    if ($vsix -and $code) {
      & $code --install-extension $vsix.FullName --force | Out-Null
    }
  }

  if ($script:Components.VSCode -and ($script:EditorMode -eq "cursor" -or $script:EditorMode -eq "both")) {
    $ProgressText.Text = "Installing Cursor extension..."
    $vsix = Get-ChildItem $script:Root -Filter "vscode-tsundere*.vsix" -ErrorAction SilentlyContinue | Select-Object -First 1
    $cursor = Find-CommandPath "cursor"
    if ($vsix -and $cursor) {
      & $cursor --install-extension $vsix.FullName --force | Out-Null
    }
  }

  if ($script:Components.Docs) {
    $ProgressText.Text = "Installing documentation..."
    $docs = Join-Path $script:Root "docs"
    if (Test-Path $docs) {
      Copy-Item $docs (Join-Path $script:InstallRoot "docs") -Recurse -Force
    }
  }

  Add-PathEntry $script:BinRoot
  Write-InstallerConfig
  Register-Uninstaller

  if ($script:UpdateMode -ne "manual") {
    $ProgressText.Text = "Scheduling update checks..."
    $cli = Join-Path $env:APPDATA "npm\node_modules\@tsundere\cli\dist\cli.js"
    if (Test-Path $cli) {
      schtasks /Create /SC DAILY /TN "Tsundere Daily Update Check" /TR "`"node`" `"$cli`" updater check" /ST 10:00 /F | Out-Null
    }
  }

  $ProgressText.Text = "Installation complete."
}

function New-Text($text, $size = 14, $weight = "Normal", $color = "#F5F0F7") {
  $block = New-Object Windows.Controls.TextBlock
  $block.Text = $text
  $block.FontSize = $size
  $block.FontWeight = $weight
  $block.Foreground = $color
  $block.TextWrapping = "Wrap"
  $block.Margin = "0,0,0,12"
  return $block
}

function New-Button($text) {
  $button = New-Object Windows.Controls.Button
  $button.Content = $text
  $button.Height = 42
  $button.MinWidth = 132
  $button.Margin = "8,0,0,0"
  $button.Background = "#ff7ab6"
  $button.Foreground = "#1D151D"
  $button.BorderThickness = 0
  $button.FontWeight = "SemiBold"
  return $button
}

function New-Check($text, $checked) {
  $box = New-Object Windows.Controls.CheckBox
  $box.Content = $text
  $box.IsChecked = $checked
  $box.Foreground = "#F5F0F7"
  $box.Margin = "0,6,0,6"
  $box.FontSize = 14
  return $box
}

function Set-Page($title, $bodyBuilder, $backAction, $nextText, $nextAction) {
  $Content.Children.Clear()
  $Title.Text = $title
  & $bodyBuilder
  $BackButton.Visibility = if ($backAction) { "Visible" } else { "Hidden" }
  $BackButton.Tag = $backAction
  $NextButton.Content = $nextText
  $NextButton.Tag = $nextAction
}

function Show-Welcome {
  Set-Page "Welcome to the Tsundere Setup Wizard" {
    $Content.Children.Add((New-Text "Install the Tsundere language, tooling, and developer ecosystem in just a few minutes." 16)) | Out-Null
    $Content.Children.Add((New-Text "Version $Version - $Channel channel" 13 "Normal" "#CDBCCC")) | Out-Null
    $Content.Children.Add((New-Text "This installer configures the CLI, editor support, documentation, PATH access, updater preferences, and onboarding links." 13 "Normal" "#CDBCCC")) | Out-Null
  } $null "Install" { Show-Options }
}

function Show-Options {
  Set-Page "Choose Components" {
    $script:CliBox = New-Check "Tsundere CLI - command line tools and runtime" $script:Components.Cli
    $script:YuriBox = New-Check "YuriLS Language Server - IntelliSense and diagnostics" $script:Components.YuriLS
    $script:CodeBox = New-Check "VS Code Extension - syntax highlighting and commands" $script:Components.VSCode
    $script:DocsBox = New-Check "Documentation Pack - local docs and onboarding" $script:Components.Docs
    $script:ExamplesBox = New-Check "Example Projects - starter bot and templates" $script:Components.Examples
    @($script:CliBox,$script:YuriBox,$script:CodeBox,$script:DocsBox,$script:ExamplesBox) | ForEach-Object { $Content.Children.Add($_) | Out-Null }
  } { Show-Welcome } "Next" {
    $script:Components.Cli = [bool]$script:CliBox.IsChecked
    $script:Components.YuriLS = [bool]$script:YuriBox.IsChecked
    $script:Components.VSCode = [bool]$script:CodeBox.IsChecked
    $script:Components.Docs = [bool]$script:DocsBox.IsChecked
    $script:Components.Examples = [bool]$script:ExamplesBox.IsChecked
    Show-Editors
  }
}

function Show-Editors {
  Set-Page "Editor Integrations" {
    $code = if (Find-CommandPath "code") { "Installed" } else { "Missing" }
    $cursor = if (Find-CommandPath "cursor") { "Installed" } else { "Missing" }
    $Content.Children.Add((New-Text "VS Code: $code`nCursor: $cursor" 14 "Normal" "#CDBCCC")) | Out-Null
    $script:EditorList = New-Object Windows.Controls.ComboBox
    $script:EditorList.Items.Add("Install Both") | Out-Null
    $script:EditorList.Items.Add("Install VS Code Extension") | Out-Null
    $script:EditorList.Items.Add("Install Cursor Extension") | Out-Null
    $script:EditorList.Items.Add("Skip Editor Extensions") | Out-Null
    $script:EditorList.SelectedIndex = 0
    $script:EditorList.Height = 36
    $Content.Children.Add($script:EditorList) | Out-Null
  } { Show-Options } "Next" {
    $script:EditorMode = @("both","vscode","cursor","skip")[$script:EditorList.SelectedIndex]
    Show-Preferences
  }
}

function Show-Preferences {
  Set-Page "Updates and Privacy" {
    $script:UpdateList = New-Object Windows.Controls.ComboBox
    $script:UpdateList.Items.Add("Enable automatic daily update checks") | Out-Null
    $script:UpdateList.Items.Add("Notify before updates") | Out-Null
    $script:UpdateList.Items.Add("Manual updates only") | Out-Null
    $script:UpdateList.SelectedIndex = 1
    $script:UpdateList.Height = 36
    $Content.Children.Add((New-Text "Update Settings" 15 "SemiBold")) | Out-Null
    $Content.Children.Add($script:UpdateList) | Out-Null
    $Content.Children.Add((New-Text "Telemetry" 15 "SemiBold")) | Out-Null
    $script:TelemetryList = New-Object Windows.Controls.ComboBox
    $script:TelemetryList.Items.Add("Anonymous usage statistics") | Out-Null
    $script:TelemetryList.Items.Add("Crash reports only") | Out-Null
    $script:TelemetryList.Items.Add("Disable telemetry entirely") | Out-Null
    $script:TelemetryList.SelectedIndex = 1
    $script:TelemetryList.Height = 36
    $Content.Children.Add($script:TelemetryList) | Out-Null
  } { Show-Editors } "Next" {
    $script:UpdateMode = @("auto","notify","manual")[$script:UpdateList.SelectedIndex]
    $script:TelemetryMode = @("usage","crash","off")[$script:TelemetryList.SelectedIndex]
    Show-Location
  }
}

function Show-Location {
  Set-Page "Installation Location" {
    $Content.Children.Add((New-Text "Default path: $script:InstallRoot" 14 "Normal" "#CDBCCC")) | Out-Null
    $Content.Children.Add((New-Text "Required disk space: about 250 MB, depending on selected components." 13 "Normal" "#CDBCCC")) | Out-Null
    $node = if (Find-CommandPath "node") { "Installed" } else { "Missing" }
    $npm = if (Find-CommandPath "npm") { "Installed" } else { "Missing" }
    $pnpm = if (Find-CommandPath "pnpm") { "Installed" } else { "Missing" }
    $Content.Children.Add((New-Text "Dependency check`nNode.js: $node`nnpm: $npm`npnpm: $pnpm" 13 "Normal" "#CDBCCC")) | Out-Null
  } { Show-Preferences } "Install" { Show-Install }
}

function Show-Install {
  Set-Page "Installing Tsundere" {
    $script:ProgressText = New-Text "Starting installation..." 15 "SemiBold"
    $Content.Children.Add($script:ProgressText) | Out-Null
    $bar = New-Object Windows.Controls.ProgressBar
    $bar.IsIndeterminate = $true
    $bar.Height = 12
    $bar.Foreground = "#ff7ab6"
    $Content.Children.Add($bar) | Out-Null
  } $null "Working..." {}
  $NextButton.IsEnabled = $false
  Install-Tsundere
  $NextButton.IsEnabled = $true
  $NextButton.Content = "Finish"
  $NextButton.Tag = { Show-Complete }
}

function Show-Complete {
  Set-Page "Tsundere is Ready" {
    $Content.Children.Add((New-Text "Installed version: $Version`nChannel: $Channel`nLocation: $script:InstallRoot" 14 "Normal" "#CDBCCC")) | Out-Null
    $Content.Children.Add((New-Text "Quick start:`ntsundere create my-app`ntsundere dev`ntsundere build" 14 "SemiBold")) | Out-Null
    $docs = New-Button "Open Documentation"
    $docs.Add_Click({ Start-Process "https://tsundere.dev" })
    $github = New-Button "Open GitHub"
    $github.Add_Click({ Start-Process "https://github.com/TsundereLang/tsundere" })
    $discord = New-Button "Join Discord"
    $discord.Add_Click({ Start-Process "https://discord.gg/Gpxj5xVXBZ" })
    $row = New-Object Windows.Controls.StackPanel
    $row.Orientation = "Horizontal"
    @($docs,$github,$discord) | ForEach-Object { $row.Children.Add($_) | Out-Null }
    $Content.Children.Add($row) | Out-Null
  } $null "Finish" { $Window.Close() }
}

$Window = New-Object Windows.Window
$Window.Title = "Tsundere Setup"
$Window.Width = 900
$Window.Height = 620
$Window.WindowStartupLocation = "CenterScreen"
$Window.ResizeMode = "NoResize"
$Window.Background = "#151018"

$Shell = New-Object Windows.Controls.Grid
$Shell.Margin = "28"
$Shell.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition -Property @{ Width = "260" }))
$Shell.ColumnDefinitions.Add((New-Object Windows.Controls.ColumnDefinition -Property @{ Width = "*" }))

$Brand = New-Object Windows.Controls.StackPanel
$Brand.Margin = "0,0,28,0"
$LogoPath = Join-Path $script:Root "assets\tsundere-logo.png"
if (Test-Path $LogoPath) {
  $Image = New-Object Windows.Controls.Image
  $Image.Source = [Windows.Media.Imaging.BitmapImage]::new([Uri]$LogoPath)
  $Image.Width = 180
  $Image.Height = 180
  $Image.Margin = "0,0,0,20"
  $Brand.Children.Add($Image) | Out-Null
}
$Brand.Children.Add((New-Text "Tsundere" 32 "Bold" "#ff7ab6")) | Out-Null
$Brand.Children.Add((New-Text "Clean .yuri tooling for Discord developers." 14 "Normal" "#CDBCCC")) | Out-Null
$Shell.Children.Add($Brand) | Out-Null

$Panel = New-Object Windows.Controls.Border
$Panel.Background = "#211827"
$Panel.CornerRadius = "16"
$Panel.Padding = "28"
[Windows.Controls.Grid]::SetColumn($Panel, 1)

$PanelStack = New-Object Windows.Controls.DockPanel
$Title = New-Text "" 26 "Bold"
[Windows.Controls.DockPanel]::SetDock($Title, "Top")
$PanelStack.Children.Add($Title) | Out-Null

$ButtonRow = New-Object Windows.Controls.StackPanel
$ButtonRow.Orientation = "Horizontal"
$ButtonRow.HorizontalAlignment = "Right"
[Windows.Controls.DockPanel]::SetDock($ButtonRow, "Bottom")
$BackButton = New-Button "Back"
$NextButton = New-Button "Next"
$BackButton.Add_Click({ if ($BackButton.Tag) { & $BackButton.Tag } })
$NextButton.Add_Click({ if ($NextButton.Tag) { & $NextButton.Tag } })
$ButtonRow.Children.Add($BackButton) | Out-Null
$ButtonRow.Children.Add($NextButton) | Out-Null
$PanelStack.Children.Add($ButtonRow) | Out-Null

$Content = New-Object Windows.Controls.StackPanel
$Content.Margin = "0,18,0,18"
$PanelStack.Children.Add($Content) | Out-Null
$Panel.Child = $PanelStack
$Shell.Children.Add($Panel) | Out-Null
$Window.Content = $Shell

Show-Welcome
$Window.ShowDialog() | Out-Null
