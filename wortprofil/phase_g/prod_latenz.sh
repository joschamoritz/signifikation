#!/usr/bin/env bash
#
# Phase G – Latenzmessung gegen die Produktion, vor und nach dem Umschalten.
#
#   bash prod_latenz.sh [basis-url]        # Default https://signifikation.de
#
# Warum: Gate F hat die Beleg-Latenz LOKAL auf SSD mit warmem Cache gemessen
# („Zeit+haben" 822 ms). Der Server hat 3,7 GB RAM (2,8 GB verfügbar) für künftig
# 52,6 GB Datenbank — dort ist mit deutlich mehr zu rechnen, weil der Page-Cache
# nur einen Bruchteil der FTS-Struktur halten kann.
#
# Vor dem Umschalten einmal laufen lassen (v1-Basiswerte), danach noch einmal.
# Erst dann lässt sich sagen, ob eine Verschlechterung real ist oder gefühlt.
#
# Gemessen wird die Gesamtzeit der HTTP-Anfrage (inkl. TLS + nginx), jeweils der
# Median aus mehreren Läufen — ein Einzelwert sagt bei kaltem Cache nichts.
#
# WICHTIG: Die Belege-Route cacht Antworten im Prozess (`cacheGet` in
# routes/public.js, Key = lemma:collocate:year). Wiederholt man dieselbe Anfrage,
# misst man ab dem zweiten Lauf den Cache und nicht die Datenbank — die erste
# Fassung dieses Skripts lieferte deshalb für „Zeit+haben" dieselben 0,09 s wie
# für ein seltenes Paar. Jeder Lauf bekommt darum ein anderes `year`, also einen
# eigenen Cache-Key und eine echte DB-Abfrage.
#
# Seit dem Latenz-Fix (2026-08-05) ist `year` kein eigener SQL-Pfad mehr, sondern
# ein JavaScript-Filter über denselben Fenster-Pool. Der Cache-Buster misst damit
# genau den Pfad, den auch das Spiel nimmt — vorher war es der langsamere.

set -uo pipefail

BASIS=${1:-https://signifikation.de}
JAHRE=(1975 1985 1995 2005 2015)

# Paare aus dem Gate-F-Report: von sehr selten bis sehr häufig. Die häufigen sind
# die interessanten — dort verschneidet FTS5 zwei lange Trefferlisten.
# Die Kommentare nennen die LOKAL gemessene DB-Zeit nach dem Latenz-Fix
# (Median über 10 Läufe, warmer Page-Cache) und in Klammern den Stand davor.
PAARE=(
  "Lüge:auftischen"      # sehr selten  –   3 ms  (vorher   1 ms)
  "Freund:treu"          # selten       –   8 ms  (vorher  12 ms)
  "Tisch:rund"           # mittel       –  24 ms  (vorher  35 ms)
  "Angst:haben"          # häufig       –  50 ms  (vorher 284 ms)
  "Recht:haben"          # sehr häufig  –  76 ms  (vorher 568 ms)
  "Zeit:haben"           # extrem       – 125 ms  (vorher 839 ms)
)

median() {
  printf '%s\n' "$@" | sort -n | awk '{a[NR]=$1} END {print (NR%2) ? a[(NR+1)/2] : (a[NR/2]+a[NR/2+1])/2}'
}

# Abstand zwischen zwei Beleg-Abfragen. `belegeLimiter` erlaubt 30 Anfragen je
# 60 s und Client-IP (server/middleware/rateLimiter.js). 6 Paare x 5 Jahre sind
# genau 30 — ohne Pause landet der Lauf also auf der Kante, und ein zweiter Lauf
# in derselben Minute misst 429er statt der Datenbank. 3 s halten uns bei 20/min.
PAUSE=${PAUSE:-3}

hole() {
  curl -s -o /dev/null -w '%{time_total}' --max-time 30 --get \
    --data-urlencode "lemma=$1" --data-urlencode "collocate=$2" --data-urlencode "year=$3" \
    "$BASIS/api/v1/belege" 2>/dev/null || echo 99
  sleep "$PAUSE"
}

echo "Basis: $BASIS   (${#JAHRE[@]} Läufe je Abfrage mit verschiedenem year, Median)"
echo
printf '%-26s %10s %10s\n' "Abfrage" "Median" "Maximum"
printf '%-26s %10s %10s\n' "--------------------------" "----------" "----------"

for paar in "${PAARE[@]}"; do
  lemma=${paar%%:*}; kollokator=${paar##*:}
  zeiten=()
  for jahr in "${JAHRE[@]}"; do zeiten+=("$(hole "$lemma" "$kollokator" "$jahr")"); done
  m=$(median "${zeiten[@]}")
  max=$(printf '%s\n' "${zeiten[@]}" | sort -n | tail -1)
  printf '%-26s %9ss %9ss\n' "belege $lemma+$kollokator" "$m" "$max"
done

echo
# Das Archiv kennt NUR gespielte Lemmata. `/wort/wasser` stand hier lange fest
# verdrahtet und lieferte in Wahrheit die „Eintrag nicht gefunden"-Seite: 1,4 kB
# ohne einen einzigen Korpusbeleg, gemessen 0,14 s statt der echten 0,33 s. Die
# Zeile sah unauffällig aus und maß gar nichts. Deshalb wird das Lemma jetzt aus
# `/archiv` gezogen; `alkohol` ist nur der Notnagel, falls das fehlschlägt.
ARCHIV_LEMMA=$(curl -s --max-time 20 "$BASIS/archiv" 2>/dev/null \
  | grep -o 'href="/wort/[^"]*"' | sed 's|href="/wort/||; s|"||' | grep -v '^archiv$' \
  | head -1)
ARCHIV_LEMMA=${ARCHIV_LEMMA:-alkohol}

# SSR-Seiten cachen intern 1 h (buildWortDetailCached) und der Cache-Key ist das
# Lemma, nicht die Query — `?cb=` bustet ihn also NICHT. Aussagekräftig ist der
# erste Abruf nach einem Neustart bzw. nach Ablauf der Stunde.
for pfad in "/wort/$ARCHIV_LEMMA" "/archiv" "/api/v1/heute"; do
  t=$(curl -s -o /tmp/prod_latenz_seite.$$ -w '%{time_total}' --max-time 30 "$BASIS$pfad?cb=$RANDOM" 2>/dev/null || echo 99)
  hinweis="(1 Lauf)"
  case "$pfad" in
    /wort/*) grep -q 'Aus dem Korpus' /tmp/prod_latenz_seite.$$ \
               || hinweis="(1 Lauf, OHNE Belege!)" ;;
  esac
  printf '%-26s %9ss %10s\n' "$pfad" "$t" "$hinweis"
  rm -f /tmp/prod_latenz_seite.$$
done

echo
echo "Richtwerte seit dem Latenz-Fix: die DB-Zeit selbst liegt lokal bei 3-125 ms"
echo "(siehe PAARE oben), der Rest ist TLS + nginx + Netz. Bleibt ein häufiges"
echo "Paar deutlich über einer halben Sekunde, ist die Fenstersuche vermutlich"
echo "gar nicht aktiv — sie greift NUR im v2-Schema und NUR ohne Prefix-Query."
echo "Dann zuerst prüfen: zeigt das Log beim Start 'Belege-DB geladen (Schema v2)'?"
echo
echo "BELEGE_MMAP_MB ist hier KEIN Hebel: mit und ohne mmap gemessen identisch."
