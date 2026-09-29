#!/usr/bin/env sh
# IgniSense - Smart Engine Health Diagnostic (Team Revora)
# Run with: sh start-ignisense.sh   (macOS / Linux)
# The first run needs internet once (npm install); after that it runs offline.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org (20.19 or newer), then run this again."
  exit 1
fi

# check for the tools, not just the folder (an interrupted install leaves node_modules half-filled)
if [ ! -x node_modules/.bin/tsc ] || [ ! -x node_modules/.bin/vite ]; then
  echo "Installing dependencies. This needs internet and takes a minute or two..."
  npm install || { echo "npm install failed. Check the internet connection and try again."; exit 1; }
fi

echo "Building IgniSense..."
npm run build || { echo "The build failed. See the messages above."; exit 1; }

echo
echo "IgniSense is running at http://localhost:4173 (Ctrl+C to stop)"
npx vite preview --port 4173 --strictPort --open
