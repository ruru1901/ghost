#!/usr/bin/env bash
# Generate release keystore — run once, keep output safe
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

command -v keytool &>/dev/null || { sudo apt-get install -y default-jdk-headless; }

read -rsp "Keystore password (min 6 chars): " STORE_PASS; echo
read -rsp "Confirm: " STORE_PASS2; echo
[[ "$STORE_PASS" == "$STORE_PASS2" ]] || { echo -e "${RED}Passwords don't match${NC}"; exit 1; }

read -rsp "Key password (enter to use same): " KEY_PASS; echo
[[ -z "$KEY_PASS" ]] && KEY_PASS="$STORE_PASS"

keytool -genkeypair -v \
  -keystore android/app/ghost-release.keystore \
  -alias ghost-key -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
  -dname "CN=Ghost, O=Ghost, C=SG" 2>/dev/null

B64=$(base64 -w 0 android/app/ghost-release.keystore)

echo ""
echo -e "${GREEN}Add these 4 secrets to GitHub → Settings → Secrets → Actions:${NC}"
echo ""
echo -e "${YELLOW}RELEASE_KEYSTORE_BASE64${NC}"
echo "$B64"
echo ""
echo -e "${YELLOW}STORE_PASSWORD${NC}:  $STORE_PASS"
echo -e "${YELLOW}KEY_ALIAS${NC}:       ghost-key"
echo -e "${YELLOW}KEY_PASSWORD${NC}:    $KEY_PASS"
echo ""
echo -e "${RED}Keep the .keystore file safe — losing it means you can't update the app.${NC}"
