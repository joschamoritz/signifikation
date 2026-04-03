#!/bin/bash
# Upload wortprofil.db mit curl und 512KB Chunks
set -e

DB_PATH="D:/Schule/Kollokade/wortprofil/05_db/wortprofil.db"
URL="https://signifikation.de"
CHUNK_SIZE=$((512 * 1024))  # 512 KB

if [ -z "$ADMIN_KEY" ]; then
    echo "[FEHLER] ADMIN_KEY nicht gesetzt"
    exit 1
fi

DB_SIZE=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null)
TOTAL=$((($DB_SIZE + $CHUNK_SIZE - 1) / $CHUNK_SIZE))

echo "DB: $DB_PATH ($((DB_SIZE / 1024 / 1024)) MB)"
echo "Chunks: $TOTAL x 512 KB"
echo "URL: $URL/admin/upload-wortprofil"
echo ""

for ((i = 0; i < $TOTAL; i++)); do
    OFFSET=$((i * CHUNK_SIZE))
    LENGTH=$CHUNK_SIZE

    # Letzter Chunk: Rest lesen
    if [ $((i + 1)) -eq $TOTAL ]; then
        LENGTH=$((DB_SIZE - OFFSET))
    fi

    # Chunk extrahieren
    CHUNK=$(dd if="$DB_PATH" bs=1 skip=$OFFSET count=$LENGTH 2>/dev/null)

    # Upload mit curl
    ENDPOINT="$URL/admin/upload-wortprofil?index=$i&total=$TOTAL"

    HTTP_CODE=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/octet-stream" \
        -H "x-admin-token: $ADMIN_KEY" \
        -d "$CHUNK" \
        --connect-timeout 60 \
        --max-time 180 \
        -k \
        -o /tmp/resp.json \
        "$ENDPOINT")

    if [ "$HTTP_CODE" != "200" ]; then
        echo "[FEHLER] Chunk $i: HTTP $HTTP_CODE"
        cat /tmp/resp.json
        exit 1
    fi

    DONE=$(jq -r '.done // false' /tmp/resp.json)
    PCT=$(( (i + 1) * 100 / TOTAL ))
    echo "[$((i+1))/$TOTAL] $PCT%  done=$DONE"
done

echo ""
echo "[OK] Upload abgeschlossen!"
