#!/usr/bin/env bash
# Download Apache Gravitino Trino connector and extract into ./plugin/gravitino (no arguments).
set -euo pipefail

URL="${GRAVITINO_TRINO_CONNECTOR_URL:-https://dlcdn.apache.org/gravitino/1.2.0/gravitino-trino-connector-473-478-1.2.0.tar.gz}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$SCRIPT_DIR/plugin/gravitino"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "Downloading: $URL"
if command -v curl >/dev/null 2>&1; then
  curl -fL --retry 3 --retry-delay 2 -o "$TMP" "$URL"
else
  wget -q -O "$TMP" "$URL"
fi

rm -rf "$DEST"
mkdir -p "$DEST"
# Archive layout: gravitino-trino-connector-.../ (*.jar, README.md, licenses/, …)
tar -xzf "$TMP" -C "$DEST" --strip-components=1

echo "Gravitino Trino connector installed under: $DEST"
