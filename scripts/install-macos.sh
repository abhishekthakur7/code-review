#!/usr/bin/env bash
# Build Review, install it to /Applications, and put the `review` CLI on PATH.
# Run with: pnpm install:app
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SOURCE="$REPO_ROOT/apps/review-desktop/VSCode-darwin-arm64/Review.app"
APP_TARGET="/Applications/Review.app"
CLI_TARGET="/usr/local/bin/review"

if [[ "$OSTYPE" != darwin* ]]; then
  echo "This installer targets macOS. On Linux run: pnpm desktop:package:linux" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 24 ]]; then
  echo "Review needs Node.js 24 (found $(node -v 2>/dev/null || echo none))." >&2
  echo "The repo pins it in .nvmrc: nvm use" >&2
  exit 1
fi

# Packaging calls notarize-macos.sh unconditionally, which needs an Apple
# Developer ID. A locally built app is never quarantined, so Gatekeeper does not
# require a signature to run it -- skip signing unless an identity is
# configured, in which case honour it.
if [[ -z "${CODESIGN_IDENTITY:-}" && -z "${APPLE_SIGN_IDENTITY:-}" ]]; then
  export SKIP_NOTARIZE=1
  echo "No signing identity set: building unsigned (fine for a local install)."
fi

echo "==> 1/3 Building (first build takes a while and needs network access)"
pnpm --dir "$REPO_ROOT" install
pnpm --dir "$REPO_ROOT" desktop:package:macos

if [[ ! -d "$APP_SOURCE" ]]; then
  echo "Build finished but $APP_SOURCE does not exist." >&2
  exit 1
fi

echo "==> 2/3 Installing to $APP_TARGET (needs sudo)"
# Remove first: moving into an existing bundle nests it instead of replacing it.
sudo rm -rf "$APP_TARGET"
sudo mv "$APP_SOURCE" "$APP_TARGET"

echo "==> 3/3 Adding the review CLI to PATH at $CLI_TARGET (needs sudo)"
# The shim runs the CLI inside the bundle using the app's own Electron binary
# as Node, so using the CLI needs no system Node.js -- only building does.
printf '%s\n' \
  '#!/bin/sh' \
  'APP=/Applications/Review.app/Contents' \
  '[ -x "$APP/MacOS/Review" ] || { echo "Review is not installed in /Applications." >&2; exit 1; }' \
  'export ELECTRON_RUN_AS_NODE=1' \
  'exec "$APP/MacOS/Review" "$APP/Resources/app/review-runtime/dist/cli.js" "$@"' |
  sudo sh -c "cat > '$CLI_TARGET' && chmod 755 '$CLI_TARGET'"

echo
echo "Done. Open Review from Applications, or run: review --help"
