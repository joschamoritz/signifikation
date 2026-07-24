# Gate-C-Report — End-to-End-Testlauf (1 %-Subset)

Erstellt: 2026-07-24 · planning/DB-Neuaufbau.md Abschnitt 5 „Phase C" + Abschnitt 8 (F6/F9/F12) + F1-A/B (Wikipedia, auf User-Wunsch)

## 0. Kurzfazit

Die komplette v2-Kette (extract → parse → wortprofil → zeitreise → belege → validate) läuft auf dem 1 %-Subset **fehlerfrei durch**. Strukturell ist die Pipeline korrekt (mc1: **10/11 Golden Queries PASS**, der eine SKIP ist Phase E2). Der einzige FAIL bei min_count ≥ 3 (test1 auftischen) ist ein **Frequenz-Artefakt des 1 %-Subsets**, kein Strukturfehler.

**Gate C ist technisch erreicht** — offen sind nur die vier datenbasierten Entscheidungen **F6, F9, F12, F1** (unten mit Datenbasis + Empfehlung). Drei gravierende **Infrastruktur-Befunde** (Abschnitt 5) müssen vor dem Voll-Lauf (Phase D) adressiert werden.

## 1. Subset & Datenbasis

- Subset = jede 100. Zeile jeder v2-JSONL (deterministisch): **37.191 Dokumente (0,966 %)**.
- wortprofil-Korpora: **2,47 Mrd** split-Tokens (Subset 23,46 Mio); wikipedia (nur belege bzw. F1-Test) 0,98 Mrd; alle Korpora 3,45 Mrd.
- Sampling-Faktor **105×** für Hochrechnungen.
- Geparste Triples: ohne wiki **6,16 M** distinkt, mit wiki **8,21 M**.

## 2. Golden Queries (validate_v2.py)

| Test | mc1 (min1+Canary) | mc3 | mc5 | wiki_mc3 | wiki_mc5 |
|---|---|---|---|---|---|
| 1 Lüge+auftischen | **PASS** | FAIL¹ | FAIL¹ | FAIL¹ | FAIL¹ |
| 2 Elend→Subst. | PASS | PASS | PASS | PASS | PASS |
| 3 grün→~PRED | PASS | PASS | PASS | PASS | PASS |
| 4 Tisch+ATTR | PASS | PASS | PASS | PASS | PASS |
| 5 Zeitreise-Dekaden | PASS | PASS | PASS | PASS | PASS |
| 6 Belege ≥2+ref | PASS | PASS | PASS | PASS | PASS |
| 7 keine „Lizenz unbekannt" | PASS | PASS | PASS | PASS | PASS |
| 8 E-Mail-Lemma | PASS | PASS | PASS | PASS | PASS |
| 9 kein ſ | PASS | PASS | PASS | PASS | PASS |
| 10 Tageslemmata | PASS | PASS | PASS | PASS | PASS |
| 11 thier→tier (E2) | SKIP² | SKIP² | SKIP² | SKIP² | SKIP² |

¹ **1 %-Subset-Artefakt:** Das seltene Paar „Lüge + auftischen" (im Canary nur 1–2×) fällt unter die min_count≥3-Schwelle. mc1 (min_count 1) beweist die strukturelle Korrektheit (auftischen wird korrekt extrahiert, **nicht** „tischen"). Auf dem Vollkorpus (100×) läge das Paar über der Schwelle → dort PASS erwartet.
² Phase E2 (lemma_corrections) noch nicht gelaufen — erwartet.

**Zeitreise:** 41 Dekaden, 595.771 Einträge, Lücke 1880–1940 geschlossen (test5 PASS). Wikipedia trägt nichts bei (keine Jahresangaben) → zeitreise identisch mit/ohne wiki.

## 3. App-Test (Live-Funktionen gegen die Subset-DBs)

| Spielmodus / Pfad | Ergebnis |
|---|---|
| Kollokationen (fetchRelation, alle POS-Runden) | ✅ 20–30 Kollokatoren je Runde |
| Verb-/Adjektiv-Runden | ✅ (Adjektiv-Verben via PRED_REV auf 1 % dünn) |
| Zeitenwende (fetchZeitenwende) | ✅ (Krieg/Haus) |
| fetchLemma + Bonus | ✅ |
| **Belege (fetchBelege)** | ⚠️ **`no such table: belege`** |

Der wortprofil-Teil ist **out-of-the-box v2-kompatibel**. Der Belege-Fehler ist **erwartet** (Plan §3.5): `server/belege.js` erwartet das alte Schema (Tabelle `belege`), belege_v2 hat `belege_fts`/`saetze`/`dokumente`/`quellen`. Die Daten selbst sind korrekt (validate test6/7/9 PASS direkt auf dem v2-Schema). Die belege.js-Anpassung ist Phase-G-Arbeit.

## 4. Entscheidungsvorlagen

### F6 — Filterschwelle min_count 3 vs 5

| Kennzahl | mc3 | mc5 | Verhältnis |
|---|---|---|---|
| Kollokationen | 573.507 | 278.134 | mc5 = 48 % |
| distinkte Lemma/POS | 36.129 | 20.141 | mc5 = 56 % |
| AUX-Anteil an ~OBJA | 3,1 % | 6,0 % | mc5 schlechter |
| Nomen mit AUX in Top-3 | 4,4 % | 14,1 % | mc5 schlechter |
| Tageslemma „Haus" Kollok. | 540 | 267 | mc5 = 49 % |
| Rausch-Stichprobe (30, subjektiv) | ~20 % fragwürdig | ~10 % fragwürdig | mc5 sauberer |

**Wichtiger Vorbehalt:** Auf dem 1 %-Subset ist ein Paar mit 300 Vorkommen im Vollkorpus nur ~3× vertreten. min_count 3/5 wirkt hier **relativ viel strenger** als auf dem Vollkorpus. Die Rausch-Reduktion durch mc5 ist also überzeichnet, der Abdeckungsverlust dagegen real.

**Empfehlung: min_count 3.** mc5 halbiert Abdeckung + macht AUX prominenter; die Rausch-Reduktion ist auf dem Vollkorpus geringer als der Subset suggeriert. Die Lemmatisierungs-Artefakte (`stattgehabt`, Partizipien) löst ohnehin Phase E2, nicht ein höherer min_count.

### F9 — Hardware / Laufzeit

**Harte Messungen (dwdsmor AN, Pflicht für auftischen/POS):**
- 1 Prozess: 2.891 split-Tok/s (dwdsmor AN) vs. 3.856 Tok/s (dwdsmor AUS) → **dwdsmor kostet ~25 % Durchsatz**. Nicht weglassbar (auftischen/POS), also der zu zahlende Preis.
- spaCy `n_process>1`: **unmöglich** (`cannot pickle CompactTransducer`, Windows-spawn).
- 4 Prozesse (parallel_parse.py): ~4.580 aggregiert (**nur 1,58×** — Speicherbandbreiten-Limit).
- 8 Prozesse: **RAM-Crash**.

**Lokale ETA (Peak 4.580 Tok/s): ~6,2 Tage (ohne wiki) / ~8,7 Tage (mit wiki).** Real unzuverlässig wegen Throttling (Abschnitt 5).

**Cloud (Hetzner CCX, dedizierte EPYC, 8-Kanal-Speicher, viel RAM):**
- CCX43 (16 vCPU, 64 GB): €0,44/h → ~€30–45 für den Lauf.
- CCX53 (32 vCPU, 128 GB): €0,86/h → ~€31.
- Server-CPUs heben genau die lokalen Flaschenhälse (Bandbreite, RAM, HDD, Throttling) auf.

**Empfehlung: Cloud-CPU-Server.** Der lokale Lauf ist grenzwertig (6–9 Tage) **und** unzuverlässig (nächtliches Throttling, HDD-I/O, blockiert den Arbeits-PC tagelang). Für ~€30–45 läuft er auf einem CCX zuverlässig in ~1–3 Tagen. Auf Linux entfällt zudem das Pickle-Problem (fork-basiertes `n_process` möglich). Falls doch lokal: zwingend SSD + Energiesparplan aus + parallel_parse.py.

### F12 — AUX-Verben (sein/haben/werden)

**Befund:** `sein` und `werden` tauchen **nicht** in den Top-15 der ~OBJA-Verben auf (kein typisches Akkusativobjekt-Muster). Nur **`haben`** ist prominent (Platz 1–2, ~1.300 Nomen: „Recht/Zeit/Angst haben"). AUX-Gesamtanteil an ~OBJA nur 2,5–6 %.

**Empfehlung:** Die Plan-Tendencia bestätigt sich **teilweise**: sein/werden sind unkritisch (kein Filter nötig). `haben` ist grenzwertig — viele „X haben"-Verbindungen sind legitim. Vorschlag: **`haben`/`sein`/`werden` NICHT hart in der DB filtern, sondern (analog F11-Pronomen) im App-Anzeige-Layer optional ausblenden** — hält die DB vollständig, das Spiel sauber. Alternativ: nur `haben` als ~OBJA-dep filtern. → deine Entscheidung.

### F1 — Wikipedia im wortprofil (A/B, neu)

| Kennzahl | ohne wiki (mc3) | mit wiki (mc3) | Δ |
|---|---|---|---|
| Kollokationen | 573.507 | 794.838 | **+39 %** |
| distinkte Lemma/POS | 36.129 | 48.004 | **+33 %** |
| AUX-Anteil ~OBJA | 3,1 % | 2,5 % | leicht besser |
| Tageslemma „Haus" | 540 | 721 | +34 % |

**Aber:** Wikipedia verschiebt die Verb-Verteilung zu enzyklopädischen Verben (`erhalten` 543→937 Nomen, `gehören`/`bestehen`/`erreichen`/`bilden` rücken hoch — typische Definitionsmuster „X gehört zu", „X besteht aus"). Rausch-Stichprobe enthält enzyklopädische Nischenbegriffe (`siebenten-tags-adventist`, `continuum`, `vorarlberger Landtag`). **Kosten:** +40 % Parse-Zeit → schiebt den lokalen Lauf über 7 Tage (F9-Kopplung).

**Empfehlung: eher NEIN für den Hauptlauf** (= bei der ursprünglichen F1-Entscheidung bleiben). Die Abdeckungsgewinne (+39 %) sind real, aber die enzyklopädische logDice-Verzerrung bestätigt genau das DWDS-Argument, und Wikipedia ist über belege_v2 ohnehin abgedeckt. Falls die Abdeckung seltener Lemmata Priorität hat: als **separater Test-Build nach dem Hauptlauf** mit Golden-Query-Vergleich (wie im Plan vorgesehen). → deine Bewertung der Rausch-Stichprobe entscheidet.

## 5. Infrastruktur-Befunde (vor Phase D zu adressieren)

1. **Nächtliches CPU-Throttling:** Über-Nacht-Parse 699 vs. Morgen 9.901 split-Tok/s (Faktor 14). → Energiesparplan/Standby vor dem Voll-Lauf hart deaktivieren (Plan-Vorgabe bestätigt).
2. **HDD ungeeignet für DB-Builds:** `build_wortprofil` hing 17 min am externen `GROUP BY`-Sort auf der HDD (random-I/O). Fix: `temp_store=MEMORY` (ergänzt) **+ triples/DBs auf SSD**. Der PC hat nur 51 GB SSD frei — für die vollen v2-DBs (~30–45 GB) knapp. → weiteres Argument für Cloud (SSD inklusive).
3. **Parallelisierung:** spaCy `n_process` unbrauchbar mit dwdsmor → `parallel_parse.py` (Prozess-Pool + Shard-Merge) ist der Windows-Weg; auf Linux ginge `n_process` per fork.

## 6. Neue/geänderte Artefakte (nichts committet)

- Neu: `build_subset.py`, `phase_c/benchmark_parse.py`, `phase_c/parallel_parse.py`, `phase_c/analyse_wortprofil.py`, `phase_c/app_smoke.mjs` + Runner-Skripte.
- Geändert: `count_tokens.py` (Pfad-Argument), `build_wortprofil_v2.py` (`temp_store=MEMORY` + 1 GB Cache — für Phase E essenziell).
- Subset-DBs auf der SSD (scratchpad), Reports unter `wortprofil/phase_c/`.
