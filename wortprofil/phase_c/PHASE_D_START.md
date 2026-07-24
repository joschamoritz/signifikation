# Phase D — Voll-Parse: Startanleitung

Voll-Parse aller Korpora (inkl. Wikipedia, F1-Revision) → `triples_v2.db`.
Erwartete Dauer **~8–9+ Tage** (lokal, mit Wikipedia; F9=lokal). Danach Phase E (Stunden).

Alle Befehle aus `D:\Schule\Kollokade\wortprofil\` mit aktivem venv-Python
(`wortprofil-env\Scripts\python.exe`).

---

## 1. Vorstart-Checkliste (ZWINGEND)

- [ ] **Energiesparplan „Höchstleistung"**, Standby/Festplatte-abschalten/USB-Selektiv auf **Nie**
  (Throttling-Befund Phase C: nachts 699 vs. morgens 9.901 Tok/s = Faktor 14).
- [ ] **Windows-Updates 7 Tage aussetzen** (Einstellungen → Windows Update → Updates aussetzen),
  aktive Zeiten großzügig setzen (kein automatischer Neustart mitten im Lauf).
- [ ] **SSD-Platz** (siehe Layout unten): ~40 GB frei auf der SSD für `triples_v2.db` (+ später wortprofil_v2).
- [ ] **HDD-Platz**: ~60 GB frei für das Arbeitsverzeichnis (shards + Teil-DBs).
- [x] `wikipedia.jsonl` ist in `parse_deps_v2.DATEIEN` (erledigt, F1-Revision).
- [x] `02_parsed_v2/` vollständig (18 Korpora, Gate B).
- [ ] Laptop am Netz / kein Ruhezustand.

## 2. Speicher-Layout (wichtig — entschärft die SSD-Enge)

Der Trick: **Arbeitsverzeichnis auf die HDD, nur die Ziel-DB auf die SSD.**

| Was | Wohin | Warum |
|---|---|---|
| `--input-dir 02_parsed_v2` | HDD (liegt schon dort) | wird nur **sequenziell** gelesen → HDD ok |
| `--workdir` (shards ~24 GB + parts ~35 GB) | **HDD** | Parse ist CPU-gebunden, Writes gebündelt; Shards/Parts nur sequenziell gelesen → HDD ok |
| `--out-db triples_v2.db` (~35 GB) | **SSD** | wird in Phase E per `GROUP BY` (random-I/O) gelesen → **muss SSD** |

Damit brauchst du auf der SSD nur ~35–40 GB (nicht ~70). Das HDD-Problem aus Phase C betraf **nur** den random-I/O-`GROUP BY` von `build_wortprofil` — das sequenzielle Parse-Lesen/Schreiben ist auf der HDD unkritisch.

> `<SSD>` unten = ein Pfad auf deiner SSD mit ~40 GB frei (z. B. `C:\wortprofil_v2` oder eine andere SSD-Partition).

## 3. Parse starten (Phase D)

```powershell
cd D:\Schule\Kollokade\wortprofil
.\wortprofil-env\Scripts\python.exe -u phase_c\parallel_parse.py `
  --input-dir 02_parsed_v2 `
  --out-db "<SSD>\triples_v2.db" `
  --workdir "D:\Schule\Kollokade\wortprofil\_work_triples_v2" `
  --pool 4 --shards 6 --resume *>&1 | Tee-Object -FilePath phase_c\logs\phase_d.log
```

- `--pool 4` — bei 4 Prozessen der RAM-sichere Peak (8 Prozesse crashten in Phase C).
- `--shards 6` — große Dateien (wikipedia, leipzig, gei) werden adaptiv geteilt; kleine bleiben 1 Shard.
- `--resume` — von Anfang an setzen: bei Absturz kostet ein Neustart nur den laufenden Shard.
- Log landet in `phase_c\logs\phase_d.log`.

## 4. Fortschritt prüfen (täglicher 10-Sekunden-Blick)

```powershell
.\wortprofil-env\Scripts\python.exe phase_c\monitor_parse.py --workdir "D:\Schule\Kollokade\wortprofil\_work_triples_v2"
```

Zeigt: fertige / laufende / offene Shards, committete Chunks, Triple-Summe, letzte DB-Aktivität, und (ab dem 2. Aufruf) den Durchsatz seit dem letzten Check. „⚠️ evtl. hängt/steht" erscheint, wenn > 20 min keine DB-Aktivität bei offenen Shards.

## 5. Bei Absturz (Strom, Windows-Update, RAM-Spike)

Einfach **denselben Startbefehl aus Schritt 3 erneut ausführen**. `--resume` erkennt fertige Shards (überspringt sie), setzt angefangene ab dem letzten Chunk-Checkpoint fort. Verifiziert in Phase C: kein Datenverlust, keine Doppelzählung.

Falls einzelne Shards mit Fehler enden: Ursache in `_work_triples_v2\logs\<shard>.log` prüfen, dann erneut mit `--resume` (nur die fehlerhaften laufen neu). Bei Shard-Fehlern wird die `triples_v2.db` **nicht** gebaut (kein „falsches Fertig").

## 6. Nach Phase D → Phase E (Stunden)

```powershell
# wortprofil_v2 mit der F6-Entscheidung (min_count 3):
.\wortprofil-env\Scripts\python.exe -u 04_score\build_wortprofil_v2.py `
  --deps-db "<SSD>\triples_v2.db" --out-db "<SSD>\wortprofil_v2.db" --min-count 3 --reset
# zeitreise:
.\wortprofil-env\Scripts\python.exe -u 04_score\build_zeitreise_v2.py `
  --deps-db "<SSD>\triples_v2.db" --wortprofil-db "<SSD>\wortprofil_v2.db" --reset
```

`temp_store=MEMORY` ist in `build_wortprofil_v2.py` bereits gesetzt (Phase-C-Fix). **Beide DBs auf SSD.** Nach Phase E (+E2) wird `triples_v2.db` nicht mehr gebraucht → dann auf HDD verschiebbar/löschbar, um SSD-Platz für `belege_v2.db` (Phase F) zu schaffen.

## 7. Erwartete Meilensteine

| Punkt | Erwartung |
|---|---|
| Shard-Phase | wenige Minuten (kopiert ~24 GB in Shards) |
| Durchsatz | ~4.500 split-Tok/s (voller PC) — **prüfen**: liegt er tagsüber deutlich darunter → Throttling/Update-Last |
| Gesamt-Tokens | 3,45 Mrd (mit wiki) → ~8–9 Tage bei 4.500 Tok/s |
| triples_v2 (fertig) | grob 200–250 Mio distinkte Triples, ~30–40 GB |

Kleine Korpora laufen zuerst durch (frühe Fehler früh sichtbar), leipzig/gei/wikipedia zuletzt.
