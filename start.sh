#!/usr/bin/env bash
# Start the app.
# Usage (from the repo root):
#   ./start.sh                # local emulators (safe, never touches prod data)
#   ./start.sh --production   # production build against real Firebase (.env.local)
set -euo pipefail

cd "$(dirname "$0")"

command -v node >/dev/null || { echo "node not found — install Node.js 18+ first." >&2; exit 1; }
[ -d node_modules ] || { echo "node_modules missing — running npm install..."; npm install; }

if [ "${1:-}" = "--production" ]; then
  [ -f .env.local ] || { echo ".env.local missing — copy .env.local.example and fill in Firebase credentials." >&2; exit 1; }
  echo "Building production bundle..."
  npm run build
  # Standalone root can be nested one level (project dir name) — locate server.js.
  STANDALONE="$(dirname "$(find .next/standalone -maxdepth 2 -name server.js | head -1)")"
  [ -n "$STANDALONE" ] || { echo "server.js not found under .next/standalone — build output unexpected." >&2; exit 1; }
  rm -rf "$STANDALONE/.next/static" "$STANDALONE/public"
  mkdir -p "$STANDALONE/.next"
  cp -r .next/static "$STANDALONE/.next/static"
  cp -r public "$STANDALONE/public"
  echo "Serving production build on http://localhost:3000 ..."
  # The standalone server chdir's into .next/standalone and never loads the
  # repo-root .env.local, so export server-side secrets (Admin SDK, cron, ...)
  # explicitly. NEXT_PUBLIC_* are already baked in at build time.
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
  node "$STANDALONE/server.js"
  exit 0
fi

java_major() { "$1" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1; }

# The Firestore emulator needs Java >= 21. Prefer an existing JAVA_HOME if it
# qualifies, else the portable Temurin JRE in ~/.jdk (no sudo needed), else a
# system-wide 21 in /usr/lib/jvm, else whatever java is on PATH.
pick_java21() {
  local bin major
  for bin in ${JAVA_HOME:+"$JAVA_HOME/bin/java"} "$HOME"/.jdk/*/bin/java /usr/lib/jvm/*/bin/java "$(command -v java)"; do
    [ -x "$bin" ] || continue
    major="$(java_major "$bin")"
    if [ -n "$major" ] && [ "$major" -ge 21 ] 2>/dev/null; then
      echo "$bin"
      return 0
    fi
  done
  return 1
}

JAVA_BIN="$(pick_java21)" || {
  echo "No Java >= 21 found. Install one, e.g.:" >&2
  echo "  sudo apt install -y openjdk-21-jre-headless" >&2
  echo "or a portable Temurin 21 JRE into ~/.jdk (see SETUP.md, Step 6)." >&2
  exit 1
}
export JAVA_HOME="$(dirname "$(dirname "$JAVA_BIN")")"
export PATH="$JAVA_HOME/bin:$PATH"
echo "Using Java $(java_major "$JAVA_BIN") at $JAVA_HOME"

cleanup() {
  echo "Stopping emulators..."
  kill "$EMULATOR_PID" 2>/dev/null || true
  wait "$EMULATOR_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm run emulators &
EMULATOR_PID=$!

echo "Waiting for emulators (Firestore :8080, Auth :9099)..."
for _ in $(seq 1 60); do
  if (echo > /dev/tcp/127.0.0.1/8080) >/dev/null 2>&1 && (echo > /dev/tcp/127.0.0.1/9099) >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
(echo > /dev/tcp/127.0.0.1/8080) >/dev/null 2>&1 || { echo "Firestore emulator did not start on :8080." >&2; exit 1; }

if [ ! -d .emulator-data ]; then
  echo "No saved emulator data — seeding once..."
  npm run emulators:seed
  echo "Seeded. Login: test@example.com / test1234"
fi

echo "Starting app on http://localhost:3000 (Ctrl+C stops everything)..."
npm run dev:emulator
