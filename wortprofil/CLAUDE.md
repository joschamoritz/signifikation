# Wortprofil Pipeline

Subprojekt von Signifikation (`D:\Schule\Kollokade\`).
Ziel: SQLite-Kollokationsdatenbank als Ersatz für den inoffiziellen DWDS `wp/single_relation`-Endpunkt.

## Umgebung

- Python 3.12 in Virtualenv `wortprofil-env` (nicht Python 3.14!)
- NVIDIA GTX 1660 Super, CUDA 7.5 (6 GB VRAM)
- spaCy-Modell: `de_zdl_lg` (CPU, ~12h) oder `de_zdl_dist` (GPU, ~28h)
- Primärtool: DWDS `wordprofile`-Toolkit (GPL v3.0, zentrum-lexikographie/wordprofile)

## Befehle

```bash
# Virtualenv aktivieren (Windows)
.\wortprofil-env\Scripts\activate

# ZDL-Modell installieren
pip install de-zdl-lg --index-url https://gitup.uni-potsdam.de/api/v4/projects/21461/packages/pypi/simple
# GPU-Variante:
pip install de-zdl-dist --index-url https://gitup.uni-potsdam.de/api/v4/projects/21461/packages/pypi/simple

# Wikipedia-Extraktion
python -m wikiextractor.WikiExtractor dewiki.xml.bz2 -o 02_extract/raw/

# Kollokationsextraktion (wordprofile)
python -m wordprofile.cli.extract_collocations --input 03_parse/*.conll.gz --dest 04_colloc/ --njobs 4

# Statistik + logDice (wordprofile)
python -m wordprofile.cli.compute_statistics 04_colloc/* --dest 05_stats/ --min-rel-freq 5
```

## Pipeline-Reihenfolge

| Phase | Verzeichnis | Aufgabe |
|---|---|---|
| 0 | `00_setup/` | Python 3.12, venv, CUDA, pip-Pakete |
| 1 | `01_download/` | Wikipedia-Dump herunterladen (~25 GB) |
| 2 | `02_extract/` | WikiExtractor → Text-Chunks |
| 3 | `03_parse/` | spaCy → gzip-CoNLL (Checkpoint/Resume!) |
| 4 | `04_colloc/` | wordprofile `extract_collocations` |
| 5 | `05_stats/` | wordprofile `compute_statistics` |
| 6 | `06_db/` | SQLite-Adapter (statt MariaDB) + Laden |

## Wichtige Entscheidungen

- **Modell `de_zdl_lg` statt `de_core_news_lg`**: Auf HDT trainiert, explizit für Kollokationsextraktion optimiert. Lemmatisierung nach DWDS-Konventionen via DWDSmor.
- **`wordprofile`-Toolkit verwenden statt neu schreiben**: Gleiche Relationslogik wie echtes DWDS Wortprofil (GPL v3.0 erlaubt das).
- **SQLite statt MariaDB**: Portabel, kein Server-Overhead, direkt in Signifikation nutzbar.
- **Checkpoint/Resume in Phase 3**: Wikipedia-Parsing dauert Stunden – jede Chunk-Datei nach Verarbeitung markieren, sodass Absturz = kein Datenverlust.
- **Filter**: min-rel-freq 5, logDice > 0 (wie DWDS Wortprofil 2026v1).

## Relationen (HDT-Labels → Signifikation)

| HDT | Relation in DB | Signifikation-Modus |
|---|---|---|
| `NK` (ADJ→NN) | `ATTR` | Adjektiv-Runde (~ATTR) |
| `OA` | `OBJ` | Verb-Runde (~OBJ) |
| `CD` | `KON` | Nomen-Runde (KON) |
| `SB` | `SUBJ` | – |
| `AG` | `GATTR` | – |
| `MO`+Präp | `PREP` | – |
| `PD` | `PRED` | – |

## SQLite-Schema (Kurzform)

```sql
CREATE TABLE token_freq (lemma TEXT, pos TEXT, freq INTEGER, PRIMARY KEY (lemma, pos));
CREATE TABLE collocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lemma TEXT, pos TEXT, relation TEXT,
    collocate TEXT, collocate_pos TEXT,
    freq INTEGER, log_dice REAL
);
CREATE INDEX idx_lemma_rel ON collocations(lemma, relation);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
```

## Arbeitsweise

- Jede Phase separat testen (kleines Test-Subset von ~1000 Sätzen zuerst)
- Zwischendaten als TSV/Parquet speichern, nicht nur im RAM halten
- Laufzeit-Logs mit Timestamp + Token-Zähler (wie weit sind wir?)
- Kein Code in Signifikation-Produktion bis SQLite-DB vollständig getestet
- User entscheidet über Integration in Signifikation (`server/dwds.js`)
- Commits erst nach User-Freigabe, nicht nach jeder Änderung

## Lizenzen

- `wordprofile`: GPL v3.0 | `de_zdl_*`: GPL v3.0 | `dwdsmor`: GPL v2.0 | Wikipedia: CC BY-SA
- Projekt ist nicht-kommerziell (Bildungszweck) → alle Lizenzen erlaubt
