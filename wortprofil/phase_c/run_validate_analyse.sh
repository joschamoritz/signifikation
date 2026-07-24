#!/bin/bash
cd "D:/Schule/Kollokade/wortprofil"
PY=./wortprofil-env/Scripts/python.exe
D="C:/Users/JOSCHA~1/AppData/Local/Temp/claude/D--Schule-Kollokade/7438df8d-42cf-4ad9-bd3a-49efad55e9a0/scratchpad/db"
BEL=$D/belege_subset.db
KAL=../server/data/signifikation.db
R=phase_c
echo "############## VALIDIERUNG ##############"
for v in mc1 mc3 mc5 wiki_mc3 wiki_mc5; do
  echo ""; echo ">>>>>>>> validate $v <<<<<<<<"
  $PY 05_db/validate_v2.py --wortprofil-db "$D/wp_$v.db" --belege-db "$BEL" \
    --kalender-db "$KAL" \
    \
    --report "$R/validate_$v.md" --label "Phase C – $v" 2>&1 | grep -E "PASS|FAIL|SKIP|===" | head -20
done
echo ""; echo "############## ANALYSE (F12/Rausch/Abdeckung) ##############"
for v in mc3 mc5 wiki_mc3 wiki_mc5; do
  echo ""; echo ">>>>>>>> analyse $v <<<<<<<<"
  $PY phase_c/analyse_wortprofil.py --db "$D/wp_$v.db" --label "$v" \
    --kalender-db "$KAL" --sample 30 --seed 42 --out-json "$R/analyse_$v.json" 2>&1 | tail -40
done
echo ""; echo "############## VALIDATE/ANALYSE FERTIG ##############"
