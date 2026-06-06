#!/bin/sh
set -e

# Terminal color formatting
if [ -t 1 ]; then
  tty_escape() { printf "\033[%sm" "$1"; }
else
  tty_escape() { :; }
fi
tty_blue="$(tty_escape "1;34")"
tty_magenta="$(tty_escape "1;35")"
tty_cyan="$(tty_escape "1;36")"
tty_yellow="$(tty_escape "1;33")"
tty_green="$(tty_escape "1;32")"
tty_red="$(tty_escape "1;31")"
tty_bold="$(tty_escape "1;39")"
tty_reset="$(tty_escape 0)"

print_step() {
  printf "\n${tty_yellow}==>${tty_bold} %s${tty_reset}\n" "$1"
}

print_error() {
  printf "\n${tty_red}Error: %s${tty_reset}\n" "$1"
}

printf "\n${tty_cyan}==========================================${tty_reset}\n"
printf "${tty_magenta}     Tsundere Framework Web Installer     ${tty_reset}\n"
printf "${tty_cyan}==========================================${tty_reset}\n\n"

# Verify dependencies
if ! command -v curl > /dev/null 2>&1; then
  print_error "curl is required but not installed. Aborting."
  exit 1
fi

if ! command -v unzip > /dev/null 2>&1; then
  print_error "unzip is required but not installed. Aborting."
  exit 1
fi

print_step "Fetching latest Tsundere release info from GitHub..."

API_URL="https://api.github.com/repos/TsundereLang/tsundere/releases/latest"
RELEASE_JSON=$(curl -fsSL "$API_URL") || { print_error "Failed to fetch latest release from GitHub."; exit 1; }

# Extract the browser_download_url for the .zip asset
ZIP_URL=$(echo "$RELEASE_JSON" | grep -o '"browser_download_url": "[^"]*\.zip"' | head -n 1 | cut -d '"' -f 4)

if [ -z "$ZIP_URL" ]; then
  printf "${tty_yellow}No explicit .zip asset found in the latest release. Attempting to use the source code zipball...${tty_reset}\n"
  ZIP_URL=$(echo "$RELEASE_JSON" | grep -o '"zipball_url": "[^"]*"' | head -n 1 | cut -d '"' -f 4)
fi

if [ -z "$ZIP_URL" ]; then
  print_error "Failed to find a .zip download URL in the latest release."
  exit 1
fi

print_step "Downloading Tsundere Release..."
printf "URL: %s\n" "$ZIP_URL"

# Check if we are running in WSL or raw Linux
if grep -qEi "(Microsoft|WSL)" /proc/version >/dev/null 2>&1; then
  printf "Environment: ${tty_cyan}WSL (Windows Subsystem for Linux)${tty_reset}\n"
  
  # To avoid catastrophic bugs with Windows npm trying to read \\wsl.localhost UNC paths,
  # we must extract the files onto the mounted C: drive so Windows sees a standard C:\ path.
  WIN_TEMP=""
  if command -v cmd.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
    WIN_TEMP_RAW=$(cmd.exe /c "echo %TEMP%" 2>/dev/null | tr -d '\r\n')
    [ -n "$WIN_TEMP_RAW" ] && WIN_TEMP=$(wslpath -u "$WIN_TEMP_RAW" 2>/dev/null)
  fi
  
  if [ -n "$WIN_TEMP" ] && [ -d "$WIN_TEMP" ]; then
    TMP_DIR=$(mktemp -d "$WIN_TEMP/tsundere-install.XXXXXX")
  elif [ -d "/mnt/c/Users/Public" ]; then
    TMP_DIR=$(mktemp -d "/mnt/c/Users/Public/tsundere-install.XXXXXX")
  else
    TMP_DIR=$(mktemp -d "$HOME/.tsundere-install.XXXXXX")
  fi
else
  printf "Environment: ${tty_cyan}Native Linux${tty_reset}\n"
  # Standard temp directory for raw Linux
  TMP_DIR=$(mktemp -d)
fi

# Automatically clean up the temporary directory on exit
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM HUP

ZIP_PATH="$TMP_DIR/TsundereRelease.zip"

curl -fsSL "$ZIP_URL" -o "$ZIP_PATH"

print_step "Extracting files..."
unzip -q "$ZIP_PATH" -d "$TMP_DIR"

# Find the extracted CLI package
CLI_PACKAGE=$(find "$TMP_DIR" -name "tsundere-cli.tgz" | head -n 1)

if [ -z "$CLI_PACKAGE" ]; then
  print_error "Could not find 'tsundere-cli.tgz' inside the downloaded archive."
  printf "Are you sure the release zip contains the CLI package?\n"
  exit 1
fi

print_step "Checking Node.js and npm..."
if ! command -v node > /dev/null 2>&1; then
  print_error "Node.js was not found. Install Node.js first, then run this again."
  exit 1
fi
if ! command -v npm > /dev/null 2>&1; then
  print_error "npm was not found. Reinstall Node.js with npm enabled."
  exit 1
fi

printf "Node.js: %s\n" "$(node --version)"
printf "npm: %s\n" "$(npm --version)"

print_step "Checking pnpm..."
if ! command -v pnpm > /dev/null 2>&1; then
  npm install -g pnpm
fi
printf "${tty_green}pnpm ready.${tty_reset}\n"

print_step "Installing Tsundere CLI..."
(
  cd "$(dirname "$CLI_PACKAGE")"
  npm install -g "./$(basename "$CLI_PACKAGE")"
)

VSIX_PACKAGE=$(find "$TMP_DIR" -name "vscode-tsundere-*.vsix" | head -n 1)
if [ -n "$VSIX_PACKAGE" ]; then
  HAS_CODE=$({ command -v code >/dev/null 2>&1 && echo "yes"; } || true)
  HAS_CURSOR=$({ command -v cursor >/dev/null 2>&1 && echo "yes"; } || true)
  HAS_ANTIGRAVITY=$({ command -v antigravity >/dev/null 2>&1 && echo "yes"; } || true)

  if [ -n "$HAS_CODE" ] || [ -n "$HAS_CURSOR" ] || [ -n "$HAS_ANTIGRAVITY" ]; then
    printf "\nWould you like to install the Tsundere extension for VS Code / Cursor / Antigravity? (Y/n): "
    read installExt < /dev/tty
    case "$installExt" in
      [nN]*)
        printf "Skipping extension installation.\n"
        ;;
      *)
        print_step "Installing extension..."
        VSIX_DIR="$(dirname "$VSIX_PACKAGE")"
        VSIX_NAME="$(basename "$VSIX_PACKAGE")"
        if [ -n "$HAS_CODE" ]; then
          printf "Installing for VS Code...\n"
          ( cd "$VSIX_DIR" && code --install-extension "./$VSIX_NAME" --force )
        fi
        if [ -n "$HAS_CURSOR" ]; then
          printf "Installing for Cursor...\n"
          ( cd "$VSIX_DIR" && cursor --install-extension "./$VSIX_NAME" --force )
        fi
        if [ -n "$HAS_ANTIGRAVITY" ]; then
          printf "Installing for Antigravity IDE...\n"
          ( cd "$VSIX_DIR" && antigravity --install-extension "./$VSIX_NAME" --force )
        fi
        ;;
    esac
  fi
fi

print_step "Verifying Installation..."
tsundere help

echo ""
printf "${tty_green}Web install process completed.${tty_reset}\n"
