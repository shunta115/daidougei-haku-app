#!/bin/sh
set -eu
cd "$(dirname "$0")"
../node_modules/.bin/tsc -p tsconfig.json
cp index.html styles.css dist/
