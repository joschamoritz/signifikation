# Signifikation – Änderungsprotokoll (Session März 2026)

## Überblick

Diese Session hat das Projekt von einer **externen API-Abhängigkeit (DWDS/DiaCollo)**
auf eine vollständig **selbst aufgebaute, lizenzkonforme Korpus-Pipeline** umgestellt.
Alle Wortprofil-Daten kommen jetzt aus eigenen SQLite-Datenbanken.

---

## 1. Architektur: Vorher → Nachher

### Vorher
```
Spieler → App → DWDS-API (extern) → Wortprofil-Daten
                DiaCollo-API (extern) → Zeitreise-Daten
```
**Probleme:**
- Abhängigkeit von externen APIs (Verfügbarkeit, Ratenlimits)
- Keine Kontrolle über Datenbasis oder Lizenz
- Zeitreise und Bonus-Frage = Live-Abfragen mit Latenz

### Nachher
```
Spieler → App → wortprofil.db (Railway Volume) → Wortprofil + Zeitreise
              → lemmata.json (vorberechnete bonusFrage)
              → belege.db (Railway Volume) → Belegsätze
```
**Vorteile:**
- Vollständig eigenständig, keine externen Abhängigkeiten
- Alle Korpora CC BY / CC BY-SA / Gemeinfrei lizenziert
- Bonus-Frage wird beim Admin-Tag-Setzen vorberechnet (kein Live-Abruf)

---

## 2. Neue Pipeline-Skripte (`wortprofil/`)

| Phase | Skript | Aufgabe |
|---|---|---|
| 01 | `download_korpora.py` u.a. | Korpora herunterladen (HuggingFace, Zenodo, DIP etc.) |
| 02 | `extract_text.py` | Text aus verschiedenen Formaten in JSONL normalisieren |
| 03 | `parse_deps.py` | spaCy-Dependency-Parsing → Tripel-DB (`triples.db`) |
| 04 | `build_wortprofil.py` | Frequenz-Aggregation + logDice → `wortprofil.db` |
| 04 | `build_zeitreise.py` | Dekaden-Aggregation → `zeitreise`-Tabelle in `wortprofil.db` |
| 06 | `build_belege.py` | FTS5-Volltext-Index → `belege.db` |

### Korpus-Übersicht (Stand März 2026)

| Korpus | Tokens | Lizenz |
|---|---|---|
| GEI-Digital (Schulbücher 17.–20. Jh.) | 506 Mio. | CC BY-SA 4.0 |
| Leipzig (deu_news + newscrawl) | 535 Mio. | CC BY |
| Bundestag XML | 51 Mio. | DL-DE BY 2.0 |
| Bundestag PDF | 247 Mio. | DL-DE BY 2.0 |
| Reichstagsprotokolle (1867–1942) | 256 Mio. | CC BY-SA 4.0 |
| DTA Kernkorpus + Erweiterungen | 320 Mio. | CC BY-SA 4.0 |
| DTA Sondersammlungen (8 Sub-Korpora) | 81 Mio. | CC BY-SA 4.0 |
| DiBiLit (Belletristik) | 93 Mio. | CC BY-SA 4.0 |
| DiBiPhil (Philosophie) | 13 Mio. | CC BY-SA 4.0 |
| Politische Reden | 11 Mio. | CC BY-SA |
| Gesetze im Internet | 19 Mio. | Gemeinfrei |
| Wikibooks | ~28 Mio. | CC BY-SA |
| Wikivoyage | ~17 Mio. | CC BY-SA |
| Neuer Pitaval | 6 Mio. | Gemeinfrei |
| Ref. Frühneuhochdeutsch | 3 Mio. | CC BY-SA |
| Ref. Mittelhochdeutsch | 3 Mio. | CC BY-SA |
| **Gesamt** | **~2,19 Mrd.** | |

---

## 3. Geänderte Server-Dateien

### `server/wortprofil.js` (neu)
- Ersetzt `dwds.js` als Drop-in für Wortprofil-Abfragen
- `fetchLemma()`, `fetchRelation()`, `fetchBonusQuestion()` — lesen aus `wortprofil.db` (better-sqlite3)
- **Neu:** `fetchZeitreise()` — liest aus `zeitreise`-Tabelle in `wortprofil.db` (vorher: DiaCollo-API)
- Quintile-Auswahl-Algorithmus (5 Dekaden aus allen verfügbaren) identisch zu `diacollo.js`

### `server/belege.js` (neu)
- FTS5-Volltext-Suche in `belege.db`
- Liefert Belegsätze mit Zitation und Lizenz pro Treffer

### `server/routes/admin.js`
- Import: `fetchZeitreise` kommt jetzt aus `wortprofil.js` (nicht mehr `diacollo.js`)
- **Neu:** Beim Speichern eines Tags (`POST /admin/tag`) wird `fetchBonusQuestion()` aufgerufen und das Ergebnis als `entry.bonusFrage` in `lemmata.json` gespeichert
- **Neu:** Temporärer Endpoint `POST /admin/upload-db?name=wortprofil|belege` — streamt eine SQLite-DB direkt auf das Railway-Volume (pure Node.js, keine externe Abhängigkeit)

### `server/routes/public.js`
- `/api/v1/bonus` war: async Live-Abfrage `fetchBonusQuestion()` → DB
- `/api/v1/bonus` jetzt: sync Lesen von `entry.bonusFrage` aus `lemmata.json` — kein DB-Aufruf mehr

### `scripts/backfill-bonus.mjs` (neu)
- Einmalig-Skript: befüllt `bonusFrage` für alle bestehenden Lemmata in `lemmata.json`
- Aufruf: `node scripts/backfill-bonus.mjs` (lokal) oder `railway run node scripts/backfill-bonus.mjs`

---

## 4. Pipeline-Bugfixes (Runde 1)

### `wortprofil/02_parse/extract_text.py`
- **Bug:** `german_commons.jsonl` hatte falsche `quelle`-Werte (`pol_reden` statt `reichtagsprotokolle`, `dibilit` statt `dibiphil`)
- **Fix:** `META`-Dict in `extrahiere_german_commons()` korrigiert
- **Fix:** `CHUNK_MAX=3000` eingeführt — HuggingFace-Dokumente (teils MB-groß) werden vor spaCy-Übergabe gesplittet

### `wortprofil/06_belege/build_belege.py`
- Fehlende `QUELLEN_META`-Einträge ergänzt: `humboldt-digital`, `dta-dingler`, `dta-patiententexte`, `reichtagsprotokolle`, `dibiphil`

---

## 5. Parser-Migration: TIGER → Universal Dependencies

### Problem
Der ursprüngliche Parser (`de_core_news_lg`, TIGER-Labels) hatte drei kritische Fehler:
1. **Adjektiv-Lemmatisierung falsch**: „hohen" → „hohen" statt „hoch"
2. **KON-Koordination dünn**: TIGER `cj`-via-CCONJ-Struktur erfasste nur Bruchteil aller Koordinationen
3. **Substantive kleingeschrieben**: spaCy gibt Lemmata lowercase zurück

### Lösung: `de_zdl_lg` + Universal Dependencies
Kompletter Neubau von `parse_deps.py`:
- **Modell:** `de_zdl_lg` v4 (ZDL/BBAW, trainiert auf DWDSmor-lemmatisiertem HDT-Treebank)
  - 98,62 % Lemmatisierungsgenauigkeit, korrekte Adjektiv-Normalisierung
- **UD-Label-Mapping:**

| UD-Label | Relation | Beispiel |
|---|---|---|
| `nsubj`, `nsubj:pass` | SUBJA | „Der Hund bellt" |
| `obj` | OBJA | „Er trinkt Wasser" |
| `iobj` | OBJD | „Er gibt ihr Blumen" |
| `nmod` (NOUN→NOUN, kein `case`) | GMOD | „Das Haus des Vaters" |
| `amod` (ADJ→NOUN) | ATTR | „runder Tisch" |
| `advmod` (ADV→VERB) | ADV | „schnell laufen" |
| `obl`/`obl:arg` + `case`-Kind | PP | „auf dem Tisch" |
| `conj` (bidirektional) | KON | „essen und trinken" |
| `xcomp` | PRED | „Er nennt ihn gefährlich" |

- **KON bidirektional:** Jedes Koordinationspaar wird als zwei Triples gespeichert → doppelte Abdeckung
- **Substantiv-Großschreibung:** In `wortprofil.js` via `normalizeLemma()` beim Output korrigiert (nicht im Schema)

---

## 6. DB-Optimierungen

### `wortprofil.js` + `belege.js` – PRAGMA-Tuning
```js
// wortprofil.js
_db.pragma('cache_size = -65536')    // 64 MB Page-Cache
_db.pragma('mmap_size = 536870912')  // 512 MB Memory-mapped I/O
_db.pragma('temp_store = MEMORY')

// belege.js
_db.pragma('cache_size = -131072')             // 128 MB Page-Cache
_db.pragma(`mmap_size = ${MMAP_BYTES}`)        // konfigurierbar per BELEGE_MMAP_MB
_db.pragma('temp_store = MEMORY')
```

### Covering Index auf `collocations`
```sql
CREATE INDEX idx_collocations_lookup ON collocations (lemma, pos, relation, logDice DESC)
```
Eliminiert `USE TEMP B-TREE FOR ORDER BY` bei jeder Kollokationsabfrage.
Auch direkt auf bestehende Railway-DB angewendet (bis zum nächsten Rebuild).

### FTS5-Optimize auf `belege.db`
```sql
INSERT INTO belege(belege) VALUES('optimize')
```
14 Segmente → 1 Segment; Suchlatenz –30–60 %.

### `build_wortprofil.py` + `build_belege.py` – `page_size=16384`
Muss vor dem ersten INSERT gesetzt werden; greift beim nächsten `--reset`-Rebuild.

---

## 7. Backend-Architect-Review-Fixes

Review ergab Note **1- / A-**. Umgesetzte Verbesserungen:

| Fix | Datei | Priorität |
|---|---|---|
| Covering Index `(lemma, pos, relation, logDice DESC)` im Build-Skript verankert | `build_wortprofil.py` | HIGH |
| `build_info`-Tabelle: Bauzeitpunkt, Filter-Parameter, Row-Counts | `build_wortprofil.py` | LOW |
| `normalizeLemma(lemma, pos)` als zentraler Helper | `wortprofil.js` | HIGH |
| `fetchZeitreise` nutzt `normalizeLemma` (Substantive vorher kleingeschrieben) | `wortprofil.js` | HIGH |
| POS- und RelCode-Validierung in `queryRelation()` mit Warn-Log | `wortprofil.js` | LOW |
| `/health` prüft Wortprofil-DB und Belege-DB | `public.js` | MEDIUM |
| `BELEGE_MMAP_MB`-Env-Variable für `mmap_size` | `belege.js` | MEDIUM |
| `matchesLemma()`: Lemmata < 4 Zeichen exakt verglichen (kein False-Positive-Highlighting) | `belege.js` | LOW |
| System-Status-Leiste im Admin-Panel (Badges: Server-Uptime, RAM, DB-Status) | `admin.html` + `admin.js` | MEDIUM |

---

## 8. Öffentliche Seite (`public/ueber.html`)

**Abschnitt „Die Daten" komplett überarbeitet:**
- 6-stufige Extraktionspipeline als nummerierte Liste erklärt
- Relationen-Mapping dokumentiert
- Checkpoint-Mechanismus erwähnt

**Abschnitt „Der logDice-Wert" erweitert:**
- Formel: `logDice(a,b) = 14 + log₂(2·f_ab / (f_a + f_b))`
- Vergleich zu PMI, Hapax-Legomenon-Robustheit erklärt

**Korpus-Tabelle (neu):** Alle 16 Korpora mit Quelle, Lizenz, Tokenzahl

---

## 9. Railway-Deployment

### Upload-Endpoint
Da `railway volume cp` nicht existiert, wurde ein temporärer Streaming-Endpoint gebaut:
```
POST /admin/upload-db?name=wortprofil|belege
Content-Type: application/octet-stream
Authorization: Bearer <token>
```
Streamt die DB direkt auf das Railway-Volume via `req.pipe(createWriteStream(tmpPath))` + atomisches Rename.

### Environment Variables
```
WORTPROFIL_DB=/app/server/data/wortprofil.db
BELEGE_DB=/app/server/data/belege.db
```

### Upload-Status
| DB | Größe | Status |
|---|---|---|
| `wortprofil.db` (alter Parser) | 283 MB | ✅ Live auf Railway |
| `wortprofil.db` (de_zdl_lg, neu) | ~300–350 MB (Schätzung) | ⏳ Parser läuft |
| `belege.db` | ~19 GB | ⏳ Wartet auf DigitalOcean |

---

## 10. Öffentliche Seiten – DWDS-Bereinigung (03.04.2026)

Alle verbleibenden DWDS-Erwähnungen aus der App entfernt:

| Datei | Änderung |
|---|---|
| `src/components/Home.jsx` | „DWDS-Korpusdaten" → „eigene Korpusdaten" |
| `public/datenschutz.html` | DWDS-API-Absatz → Hinweis auf eigene lokale DB |
| `public/impressum.html` | DWDS-Quellenangabe → offene Korpora + ueber.html-Link |
| `public/nutzungsbedingungen.html` | „DWDS-Wortprofil (BBAW)" → eigene Extraktionspipeline |
| `public/og-image.svg` | „DWDS-Daten der BBAW" → „offen lizenzierte Korpora (CC BY, …)" |
| `public/ueber.html` | `de_core_news_lg`/TIGER → `de_zdl_lg`/Universal Dependencies; „50 Mio. Sätze" ergänzt |

## 11. Technische Fixes (03.04.2026)

- **Upload-Backup-Cleanup**: `POST /admin/upload-wortprofil` löscht `wortprofil.db.bak` nach erfolgreichem Upload automatisch → Railway Volume läuft nicht mehr voll
- **Upload-Script**: `upload_wortprofil.py` mit `--start-from`-Flag für Resume bei Verbindungsabbruch; Retry auf 502/503/504

## 12. Offene Aufgaben (Stand 03.04.2026)

- [x] Parser (`de_zdl_lg`) → triples.db 8,5 GB, 77 Mio. Triples
- [x] `build_wortprofil.py --reset` → wortprofil.db 1,9 GB
- [x] `build_zeitreise.py --reset` (logDice) → 3,46 Mio. Einträge, 25 Dekaden
- [x] `build_belege.py --reset` → belege.db 16 GB, 50,7 Mio. Sätze
- [x] `wortprofil.db` auf signifikation.de hochgeladen (948 × 2 MB Chunks)
- [x] DiaCollo entfernt (diacollo.js, alle Endpoints/Karten)
- [x] Admin-Panel: Zeitreise-Wortanalyse (Bubble-Chart + Timeline-Rows)
- [x] Alle DWDS-Erwähnungen aus öffentlichen Seiten entfernt
- [ ] `belege.db` (16 GB) auf Railway hochladen — Railway Volume zu klein (4,4 GB), braucht größeres Volume oder externen Speicher

---

## 11. Technische Notizen

### logDice-Formel
```
logDice(a,b) = 14 + log₂(2·f_ab / (f_a + f_b))
```
- Maximum: 14 (wenn f_ab = f_a = f_b)
- Praktischer Bereich: 5–12 für bedeutsame Kollokationen
- Robust gegen Hapax Legomena (normiert auf beide Marginalfrequenzen)

### Zeitreise-Algorithmus
- Dekaden-Aggregation: `jahrzehnt = (jahr / 10) * 10`
- Score: `freq_ab / total_a_in_decade * 1000` (normalisiert)
- Quintile-Auswahl: `index = round(i * (n-1) / 4)` für i ∈ {0,1,2,3,4}

### DB-Schemata
**`wortprofil.db` – Tabelle `collocations`:**
```
(id, lemma, pos, relation, relation_full, relation_description,
 form, dep_lemma, dep_pos, prep, frequency, logDice)
Index: idx_collocations_lookup (lemma, pos, relation, logDice DESC)
```

**`wortprofil.db` – Tabelle `zeitreise`:**
```
(lemma, pos, dep_lemma, dep_pos, jahrzehnt, freq, score)
Index: idx_zt_lemma (lemma, pos, jahrzehnt)
```

**`wortprofil.db` – Tabelle `build_info`:**
```
(key, value)  — Bauzeitpunkt, Filter-Parameter, Row-Counts
```

**`belege.db` – FTS5-Tabelle `belege`:**
```
(satz, quelle UNINDEXED, zitation UNINDEXED, jahr UNINDEXED)
Tokenizer: unicode61 remove_diacritics 0
```
