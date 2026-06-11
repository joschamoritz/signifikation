#!/usr/bin/env bash
# restore-db.sh — stellt das juengste (oder ein angegebenes) SQLite-Backup
# wieder her: gunzip → PRAGMA integrity_check → atomarer Swap.
#
# Verwendung:
#   scripts/restore-db.sh [backup.db.gz] [ziel.db]
#
# Defaults: juengstes signifikation-*.db.gz aus $SQLITE_BACKUP_DIR
# (bzw. server/data/backups) → server/data/signifikation.db
#
# WICHTIG: Server vorher stoppen (pm2 stop signifikation) — der Swap ist
# atomar (mv), aber ein laufender Prozess haelt die alte Inode offen.
# Smoke-Test ohne Restore: scripts/restore-db.sh --check
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT/server/data"
BACKUP_DIR="${SQLITE_BACKUP_DIR:-$DATA_DIR/backups}"
TARGET="${2:-$DATA_DIR/signifikation.db}"

CHECK_ONLY=0
if [ "${1:-}" = "--check" ]; then
  CHECK_ONLY=1
  set -- "" "${2:-}"
fi

BACKUP="${1:-}"
if [ -z "$BACKUP" ]; then
  BACKUP=$(ls -1t "$BACKUP_DIR"/signifikation-*.db.gz 2>/dev/null | head -1 || true)
fi
if [ -z "$BACKUP" ] || [ ! -f "$BACKUP" ]; then
  echo "FEHLER: kein Backup gefunden (gesucht in $BACKUP_DIR)" >&2
  exit 1
fi

echo "Backup:  $BACKUP"
echo "Ziel:    $TARGET"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
RESTORED="$TMP/restored.db"

gunzip -c "$BACKUP" > "$RESTORED"

# Integritaet pruefen, bevor irgendetwas angefasst wird
RESULT=$(node -e "
const D = require('$ROOT/node_modules/better-sqlite3');
const db = new D('$RESTORED', { readonly: true });
const r = db.prepare('PRAGMA integrity_check').get();
const users = db.prepare('SELECT COUNT(*) n FROM user').get().n;
const lemmata = db.prepare('SELECT COUNT(*) n FROM lemmata').get().n;
console.log(JSON.stringify({ check: r.integrity_check, users, lemmata }));
")
echo "Integritaet: $RESULT"
case "$RESULT" in
  *'"check":"ok"'*) ;;
  *) echo "FEHLER: integrity_check nicht ok — Abbruch" >&2; exit 1 ;;
esac

if [ "$CHECK_ONLY" = "1" ]; then
  echo "OK (--check): Backup ist wiederherstellbar, kein Restore durchgefuehrt."
  exit 0
fi

# Atomarer Swap; alte DB als .pre-restore behalten, WAL/SHM-Reste entfernen
if [ -f "$TARGET" ]; then
  mv "$TARGET" "$TARGET.pre-restore"
fi
rm -f "$TARGET-wal" "$TARGET-shm"
mv "$RESTORED" "$TARGET"

echo "Restore abgeschlossen. Vorherige DB: $TARGET.pre-restore"
echo "Jetzt: pm2 start signifikation && curl -s localhost:3001/health"
