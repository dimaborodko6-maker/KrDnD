#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 24 LTS from https://nodejs.org/en/download'; exit 1; }
if [ ! -f node_modules/express/package.json ]; then npm ci --ignore-scripts; fi
echo 'Open http://localhost:3000 after the server starts. Keep this terminal open.'
exec npm start
