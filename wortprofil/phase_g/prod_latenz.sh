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
# eigenen Cache-Key und eine echte DB-Abfrage. Nebeneffekt: damit wird der
# jahrgefilterte Pfad gemessen, der laut Gate F nicht langsamer ist als der
# ungefilterte.

set -uo pipefail

BASIS=${1:-https://signifikation.de}
JAHRE=(1975 1985 1995 2005 2015)

# Paare aus dem Gate-F-Report: von sehr selten bis sehr häufig. Die häufigen sind
# die interessanten — dort verschneidet FTS5 zwei lange Trefferlisten.
PAARE=(
  "Lüge:auftischen"      # sehr selten  – unter 15 ms lokal
  "Freund:treu"          # selten
  "Tisch:rund"           # mittel
  "Angst:haben"          # häufig       – ~280 ms lokal
  "Recht:haben"          # sehr häufig  – ~590 ms lokal
  "Zeit:haben"           # extrem       – ~822 ms lokal
)

median() {
  printf '%s\n' "$@" | sort -n | awk '{a[NR]=$1} END {print (NR%2) ? a[(NR+1)/2] : (a[NR/2]+a[NR/2+1])/2}'
}

hole() {
  curl -s -o /dev/null -w '%{time_total}' --max-time 30 --get \
    --data-urlencode "lemma=$1" --data-urlencode "collocate=$2" --data-urlencode "year=$3" \
    "$BASIS/api/v1/belege" 2>/dev/null || echo 99
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
# Seiten ohne eigenen Antwort-Cache-Key-Trick: hier ist der ERSTE Wert der
# aussagekräftige (SSR-Seiten cachen intern 1 h, siehe buildWortDetailCached).
for pfad in "/wort/wasser" "/archiv" "/api/v1/heute"; do
  t=$(curl -s -o /dev/null -w '%{time_total}' --max-time 30 "$BASIS$pfad?cb=$RANDOM" 2>/dev/null || echo 99)
  printf '%-26s %9ss %10s\n' "$pfad" "$t" "(1 Lauf)"
done

echo
echo "Richtwerte: alles unter 1 s ist unauffällig. Sticht ein häufiges Paar"
echo "(Zeit/Recht/Angst + haben) deutlich heraus, ist der erste Hebel"
echo "BELEGE_MMAP_MB in der .env — nach OBEN, nicht nach unten."
