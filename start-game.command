#!/usr/bin/env bash
# يشغّل اللعبة + السيرفر المصغّر، ويطفيه تلقائياً عند إغلاق اللعبة
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
[ -f dist/index.html ] || npm run build
node server.js --auto --open
