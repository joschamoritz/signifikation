#!/bin/bash
set -e
cd "D:/Schule/Kollokade/wortprofil"
PY=./wortprofil-env/Scripts/python.exe
D="C:/Users/JOSCHA~1/AppData/Local/Temp/claude/D--Schule-Kollokade/7438df8d-42cf-4ad9-bd3a-49efad55e9a0/scratchpad/db"
T=$D/triples_subset.db
TW=$D/triples_subset_wiki.db
echo "===== wortprofil OHNE wiki ====="
for mc in 1 3 5; do
  echo "--- mc$mc ---"; date +%T
  $PY -u 04_score/build_wortprofil_v2.py --deps-db "$T" --out-db "$D/wp_mc$mc.db" --min-count $mc --reset
  $PY -u 04_score/build_zeitreise_v2.py --deps-db "$T" --wortprofil-db "$D/wp_mc$mc.db" --reset
done
echo "===== wortprofil MIT wiki ====="
for mc in 3 5; do
  echo "--- wiki mc$mc ---"; date +%T
  $PY -u 04_score/build_wortprofil_v2.py --deps-db "$TW" --out-db "$D/wp_wiki_mc$mc.db" --min-count $mc --reset
  $PY -u 04_score/build_zeitreise_v2.py --deps-db "$TW" --wortprofil-db "$D/wp_wiki_mc$mc.db" --reset
done
echo "===== belege_subset ====="; date +%T
$PY -u 06_belege/build_belege_v2.py --parsed-dir 02_parsed_v2_subset --out-db "$D/belege_subset.db" --reset
$PY -u 06_belege/build_belege_v2.py --parsed-dir 02_parsed_v2_subset --out-db "$D/belege_subset.db" --korpora testkorpus_canary.jsonl
echo "===== BUILDS-SSD FERTIG ====="; date +%T
