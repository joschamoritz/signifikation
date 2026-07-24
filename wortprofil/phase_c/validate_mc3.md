# Golden-Query-Report: Phase C – mc3

Erstellt: 2026-07-24 12:53

**9 PASS · 1 FAIL · 1 SKIP** (von 11 Tests)

| # | Test | Status | Detail |
|---|---|---|---|
| 1 | Lüge + OBJA-Kollokatoren | FAIL | 'auftischen' fehlt: ['beginnen', 'strafen'] |
| 2 | Elend → Substantiv (POS-Mehrheit) | PASS | Substantiv dominiert: {'Adjektiv': 212, 'Substantiv': 737} |
| 3 | grün (Adj.) → ~PRED-Einträge | PASS | ~PRED vorhanden: ['bleiben'] |
| 4 | Tisch + ATTR | PASS | rund+gedeckt vorhanden, 13 ATTR-Kollokatoren, logDice plausibel |
| 5 | Zeitreise: Dekaden-Abdeckung | PASS | 41 Dekaden, davon 183777 Einträge zwischen 1880 und 1940 |
| 6 | Belege: Paare mit ≥2 Belegen + ref | PASS | alle Testwörter mit ≥2 Belegen inkl. ref: {'lüge': 170, 'elend': 466, 'grün': 987, 'tisch': 1240, 'e-mail': 374} |
| 7 | Belege: keine 'Lizenz unbekannt' | PASS | keine Quelle mit 'Lizenz unbekannt' |
| 8 | Bindestrich-Lemma (E-Mail) | PASS | 'e-mail' als Lemma vorhanden |
| 9 | Kein Glyphen-Rest (ſ) | PASS | kein ſ in saetze gefunden |
| 10 | Tageslemmata (letzte 60 Tage) | PASS | alle 6 Tageslemmata liefern Kollokatoren |
| 11 | Lemma-Normalisierung (thier→tier) | SKIP | Tabelle lemma_corrections fehlt (Phase E2 noch nicht gelaufen) |

## Kennzahlen

| Kennzahl | Wert | zum Vergleich (alt) |
|---|---|---|
| collocations | 573,507 | 9,311,475 |
| distinct_lemma | 36,129 | – |
| lemma_corpus_freq | 896,184 | – |
| zeitreise_zeilen | 595,771 | – |
| zeitreise_dekaden | 41 | – |
| wortprofil_db_bytes | 330 MB | 3 GB |
| dokumente | 34,841 | – |
| saetze | 1,386,714 | – |
| quellen | 21 | – |
| belege_db_bytes | 305 MB | 15 GB |

### build_info

- **built_at**: 2026-07-24T10:36:06Z
- **pipeline_version**: v2
- **git_commit**: 20da90a
- **source_db**: triples_subset.db
- **korpora**: bag, bfh, bgh, bgh_strafsachen_hist, bpatg, bundestag, bundestagskorpus_pdf, bverfg, bverfg_amtlich, bverwg, deu_news, deu_newscrawl, dibilit, dibiphil, dta-dingler, dta-patiententexte, dta-soldatenbriefe, dta_erweiterungen, dta_kern, gei_digital, gesetze, humboldt-digital, humboldt-publizistik, jean-paul-briefe, neuer_pitaval, pol_reden, ref_fnh, ref_mhd, reichtagsprotokolle, testkorpus, wikibooks, wikivoyage
- **min_count**: 3
- **min_dice**: 0.0
- **n_direct**: 336361
- **n_inverse**: 237146
- **n_filtered**: 6022
- **n_lemma_corpus_freq**: 896184