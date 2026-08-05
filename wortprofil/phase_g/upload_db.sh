#!/usr/bin/env bash
#
# Phase G – wiederaufnehmbarer Upload einer großen SQLite-Datei nach Hetzner.
#
#   bash upload_db.sh <lokale-datei> <remote-pfad> [ssh-ziel]
#
# Überträgt in Blöcken fester Größe. Jeder Block wird einzeln komprimiert und per
# `dd seek=` an die passende Stelle der Zieldatei geschrieben. Ein Abbruch ist
# unkritisch: beim nächsten Start liest das Skript die Größe der Zieldatei, rundet
# auf die letzte volle Blockgrenze ab und macht dort weiter.
#
# Warum nicht die zstd-Pipe aus dem Plan: die ist nicht wiederaufnehmbar (bei 34 GB
# über eine Heimleitung ein reales Risiko) und zstd ist lokal nicht installiert.
# gzip -1 ist deutlich schneller als die Leitung und damit kein Flaschenhals.
#
# Das Ziel muss für den SSH-User beschreibbar sein → ins Staging-Verzeichnis laden
# und erst danach mit sudo ins Zielverzeichnis verschieben (Runbook Schritt 7).

set -euo pipefail

SRC=${1:?Quelle fehlt}
DST=${2:?Ziel fehlt}
SSH_TARGET=${3:-admin@signifikation.de}

CHUNK_MB=${CHUNK_MB:-256}
CHUNK=$((CHUNK_MB * 1024 * 1024))

[ -f "$SRC" ] || { echo "Quelle nicht gefunden: $SRC" >&2; exit 1; }
SIZE=$(stat -c %s "$SRC")
TOTAL_CHUNKS=$(( (SIZE + CHUNK - 1) / CHUNK ))

# Wiederholt ein SSH-Kommando, bis es klappt (oder N-mal scheitert). Auch die
# Hilfsaufrufe müssen einen Netzaussetzer überleben, nicht nur die Blöcke.
ssh_versuch() {
  local versuch=1 warte=10 ausgabe
  while :; do
    if ausgabe=$(ssh -o ConnectTimeout=20 "$SSH_TARGET" "$1" 2>/dev/null); then
      printf '%s' "$ausgabe"; return 0
    fi
    [ "$versuch" -ge 5 ] && return 1
    sleep "$warte"; versuch=$(( versuch + 1 )); warte=$(( warte * 2 ))
  done
}

# Wie viel liegt schon drüben? Auf volle Blockgrenze abrunden – ein zur Hälfte
# geschriebener Block wird lieber neu übertragen als halb geglaubt.
REMOTE_SIZE=$(ssh_versuch "stat -c %s '$DST' 2>/dev/null || echo 0") \
  || { echo "Server nicht erreichbar – Abbruch vor dem Start." >&2; exit 1; }
START_CHUNK=$(( REMOTE_SIZE / CHUNK ))

echo "Quelle : $SRC"
echo "Ziel   : $SSH_TARGET:$DST"
echo "Größe  : $(( SIZE / 1024 / 1024 )) MiB in $TOTAL_CHUNKS Blöcken à ${CHUNK_MB} MiB"
if [ "$START_CHUNK" -gt 0 ]; then
  echo "Wiederaufnahme ab Block $START_CHUNK ($(( START_CHUNK * CHUNK_MB )) MiB bereits übertragen)"
fi
echo

# Ein abgerissener Block wird wiederholt statt den Lauf zu beenden. Grund: bei
# einem mehrstündigen Upload über eine Heimleitung ist ein Aussetzer normal
# (2026-08-05 real passiert, Netz beim Nutzer weg). `dd seek=` ist idempotent —
# denselben Block noch einmal zu schreiben ist unschädlich.
MAX_VERSUCHE=6
sende_block() {
  local i=$1 versuch=1 warte=15
  while :; do
    if dd if="$SRC" bs="$CHUNK" skip="$i" count=1 status=none \
         | gzip -1 \
         | ssh -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
               "$SSH_TARGET" "gunzip | dd of='$DST' bs=$CHUNK seek=$i conv=notrunc status=none"
    then
      return 0
    fi
    if [ "$versuch" -ge "$MAX_VERSUCHE" ]; then
      echo "  ABBRUCH: Block $i nach $MAX_VERSUCHE Versuchen nicht übertragen." >&2
      return 1
    fi
    echo "  Verbindung weg bei Block $i (Versuch $versuch/$MAX_VERSUCHE) – neuer Versuch in ${warte}s" >&2
    sleep "$warte"
    versuch=$(( versuch + 1 ))
    warte=$(( warte * 2 > 240 ? 240 : warte * 2 ))
  done
}

BEGIN=$(date +%s)
for (( i = START_CHUNK; i < TOTAL_CHUNKS; i++ )); do
  sende_block "$i" || exit 1

  DONE=$(( i + 1 ))
  ELAPSED=$(( $(date +%s) - BEGIN ))
  MB=$(( (DONE - START_CHUNK) * CHUNK_MB ))
  if [ "$ELAPSED" -gt 0 ] && [ "$MB" -gt 0 ]; then
    RATE=$(( MB / ELAPSED ))
    REST=$(( TOTAL_CHUNKS - DONE ))
    ETA=$(( RATE > 0 ? REST * CHUNK_MB / RATE : 0 ))
    printf '  %3d%%  Block %d/%d  %d MiB  %d MiB/s  Rest ~%d min\n' \
      $(( DONE * 100 / TOTAL_CHUNKS )) "$DONE" "$TOTAL_CHUNKS" "$MB" "$RATE" $(( ETA / 60 ))
  else
    printf '  %3d%%  Block %d/%d\n' $(( DONE * 100 / TOTAL_CHUNKS )) "$DONE" "$TOTAL_CHUNKS"
  fi
done

# Der letzte Block ist meist kürzer als CHUNK; dd conv=notrunc lässt die Datei dann
# eventuell zu lang. Exakt auf die Quellgröße kürzen.
ssh_versuch "truncate -s $SIZE '$DST'" >/dev/null \
  || { echo "truncate fehlgeschlagen – Datei ist ggf. zu lang, Skript erneut starten." >&2; exit 1; }

echo
echo "Übertragen. Prüfsummen vergleichen (Runbook Schritt 6):"
echo "  openssl dgst -sha256 '$SRC'"
echo "  ssh $SSH_TARGET \"sha256sum '$DST'\""
