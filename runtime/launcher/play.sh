#!/bin/sh
# Server lokal untuk macOS/Linux (browser memblokir file:// untuk model 3D). Butuh python3.
cd "$(dirname "$0")" || exit 1
PORT=8765
URL="http://localhost:$PORT/"
( sleep 1; if command -v open >/dev/null 2>&1; then open "$URL"; else xdg-open "$URL" >/dev/null 2>&1; fi ) &
echo "Game berjalan di $URL (Ctrl+C untuk mengakhiri)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
