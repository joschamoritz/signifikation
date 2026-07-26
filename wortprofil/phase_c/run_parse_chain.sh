#!/bin/bash
set -e
cd "D:/Schule/Kollokade/wortprofil"
PY=./wortprofil-env/Scripts/python.exe
echo "=== [1/3] Subset OHNE wiki → triples_subset.db ==="
date
$PY -u phase_c/parallel_parse.py --input-dir 02_parsed_v2_subset --out-db phase_c/db/triples_subset.db --shards 6 --pool 4
echo "=== [2/3] nur wikipedia → triples_wiki_only.db ==="
date
$PY -u phase_c/parallel_parse.py --input-dir 02_parsed_v2_subset --out-db phase_c/db/triples_wiki_only.db --dateien wikipedia --shards 8 --pool 4
echo "=== [3/3] Merge → triples_subset_wiki.db ==="
date
$PY -c "import sys; sys.path.insert(0,'phase_c'); from parallel_parse import merge_parts; from pathlib import Path; r=merge_parts([Path('phase_c/db/triples_subset.db'), Path('phase_c/db/triples_wiki_only.db')], Path('phase_c/db/triples_subset_wiki.db')); print('merged triples:', r)"
echo "=== PARSE-KETTE FERTIG ==="
date
