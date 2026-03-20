# 👻 Ghost

> Anonymous P2P messenger. No account. No server. No phone number.

[![Build APK](https://github.com/YOUR_USERNAME/ghost/actions/workflows/build-apk.yml/badge.svg)](https://github.com/YOUR_USERNAME/ghost/actions/workflows/build-apk.yml)

---

## WSL → GitHub → APK

You don't need Android SDK, NDK, or Java locally. GitHub Actions builds everything.

### 1. Install only what you need

```bash
sudo apt install -y git curl
```

### 2. Extract and setup

```bash
unzip ghost-app.zip
cd ghost
chmod +x setup-wsl.sh && ./setup-wsl.sh
```

This installs Node 20 + Yarn and runs `yarn install` to generate `yarn.lock`.

### 3. Create GitHub repo and push

Go to **github.com → New repository → name it `ghost` → Create** (leave it empty).

```bash
git init
git remote add origin https://github.com/YOUR_USERNAME/ghost.git
git add .
git commit -m "initial commit"
git branch -M main
git push -u origin main
```

### 4. Download your APK

**GitHub → your repo → Actions → latest run → Artifacts → ghost-debug-N**

Unzip it, transfer the APK to your phone, enable "Install from unknown sources", tap to install.

**Every `git push` builds a new APK automatically.**

---

## Signed release APK (optional)

```bash
# Needs Java just for keytool
sudo apt install -y default-jdk-headless
chmod +x scripts/gen-keystore.sh && ./scripts/gen-keystore.sh
```

Add the 4 printed secrets to GitHub → Settings → Secrets → Actions, then:

```bash
git tag v0.1.0 && git push origin v0.1.0
# → signed APK + GitHub Release created automatically
```

---

## Features

| Feature | How |
|---|---|
| Identity | Ed25519 keypair on first launch — no account, no number |
| Encryption | X25519 DH + XSalsa20-Poly1305 (tweetnacl, pure JS) |
| P2P | WebRTC data channels — QR handshake, no server |
| VoIP | WebRTC audio on same peer connection |
| Media | Photos + videos picked from gallery, encrypted at rest |
| Screenshot | Blocked via `FLAG_SECURE` on Android |
| Delete | Both devices wiped simultaneously on delete signal |
| Backup | Dual-key (3 hex chars each), rotates every 24h |

---

## Project layout

```
ghost/
├── index.js                    # Entry point, navigation, P2P boot
├── src/
│   ├── theme/index.js          # Colors, typography, spacing
│   ├── crypto/index.js         # tweetnacl: identity, encrypt, sign
│   ├── p2p/WebRTCManager.js    # WebRTC data channels + VoIP
│   ├── storage/index.js        # MMKV + encrypted media blobs
│   ├── store/useStore.js       # Zustand global state
│   ├── components/
│   │   ├── Avatar.js           # Color-coded peer avatar
│   │   └── MessageBubble.js    # Gradient bubbles, watermark, media
│   └── screens/
│       ├── HomeScreen.js       # Conversation list
│       ├── ChatScreen.js       # E2E chat + media send
│       ├── ConnectScreen.js    # QR code handshake (2-step)
│       ├── CallScreen.js       # Encrypted VoIP
│       └── SettingsScreen.js   # Identity, nickname, wipe
├── android/                    # Full Android project (no init needed)
│   ├── app/src/main/
│   │   ├── java/com/ghost/
│   │   │   ├── MainActivity.java    # FLAG_SECURE here
│   │   │   └── MainApplication.java
│   │   ├── AndroidManifest.xml
│   │   └── res/
│   ├── app/build.gradle
│   └── build.gradle
├── .github/workflows/
│   └── build-apk.yml           # CI: installs SDK, bundles JS, builds APK
├── setup-wsl.sh                # Local setup (git + node + yarn only)
└── scripts/gen-keystore.sh     # Release signing keystore generator
```

---

## Privacy

- No login, no account, no phone number
- Screenshot blocked (`FLAG_SECURE`)
- Messages not selectable (no copy/paste)
- Encrypted at rest (MMKV + AES-256 blobs)
- Encrypted in transit (X25519 + XSalsa20-Poly1305)
- Atomic delete — both devices wiped on signal
- Zero analytics, zero telemetry, zero backend

---

## License

MIT
