#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  Ghost – WSL setup
#  Installs ONLY: git, node 20, yarn
#  NO Android SDK. NO NDK. NO Java.
#  GitHub Actions handles all of that.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${BLUE}→${NC} $*"; }

echo ""
echo "  👻 Ghost – WSL Setup"
echo "  (git + node 20 + yarn only)"
echo ""

info "Updating packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq git curl
ok "git, curl"

# Node 20 via nvm
if ! command -v node &>/dev/null || [[ "$(node -v)" < "v20" ]]; then
  info "Installing Node 20 via nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm install 20 --silent
  nvm alias default 20
fi

export NVM_DIR="$HOME/.nvm"
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
ok "Node $(node -v)"

# Yarn
if ! command -v yarn &>/dev/null; then
  npm install -g yarn --silent
fi
ok "yarn $(yarn --version)"

# Install JS dependencies (generates yarn.lock)
info "Installing JS dependencies..."
yarn install --non-interactive
ok "node_modules ready"

# Persist nvm in shell
for rc in ~/.bashrc ~/.zshrc; do
  if [[ -f "$rc" ]] && ! grep -q "NVM_DIR" "$rc"; then
    printf '\nexport NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"\n' >> "$rc"
  fi
done

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Done! Now push to GitHub to build your APK.${NC}"
echo ""
echo "  1. Create an empty repo at github.com"
echo "  2. git init && git remote add origin https://github.com/YOU/ghost.git"
echo "  3. git add . && git commit -m 'initial' && git push -u origin main"
echo "  4. GitHub → Actions → latest run → Artifacts → download APK"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
