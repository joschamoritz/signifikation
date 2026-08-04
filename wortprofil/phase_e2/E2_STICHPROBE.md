# Phase E2 - Stichprobe gemergter Paare

Vorher: `D:\wortprofil_v2_backup\wortprofil_v2.db.pre-e2` · Nachher: `C:\wortprofil_v2\wortprofil_v2.db`

Verglichen wird die Summe ueber **beide** Spalten (`lemma` und `dep_lemma`), weil der Merge beide normalisiert.

| alt | korrekt | POS | Block | f(alt) vorher | f(korrekt) vorher | erwartet | f(korrekt) nachher | Rest alt | |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| `theil` | `teil` | Substantiv | A | 1,184,401 | 3,951,265 | 5,135,782 | 5,135,782 | 0 | OK |
| `thun` | `tun` | Verb | A | 761,324 | 3,192,530 | 3,953,854 | 3,953,854 | 0 | OK |
| `thier` | `tier` | Substantiv | A | 254,824 | 587,085 | 841,909 | 841,909 | 0 | OK |
| `berathung` | `beratung` | Substantiv | A | 250,840 | 981,173 | 1,232,013 | 1,232,013 | 0 | OK |
| `thut` | `tut` | Verb | A | 249,557 | 154 | 249,711 | 249,711 | 0 | OK |
| `ausschuß` | `ausschuss` | Substantiv | B | 178,719 | 408,486 | 586,929 | 586,929 | 0 | OK |
| `veranlaßen` | `veranlassen` | Verb | B | 170,208 | 240,074 | 410,218 | 410,218 | 0 | OK |
| `theilen` | `teilen` | Verb | A | 162,226 | 653,997 | 816,223 | 816,223 | 0 | OK |
| `thätigkeit` | `tätigkeit` | Substantiv | A | 145,703 | 836,318 | 982,021 | 982,021 | 0 | OK |
| `werth` | `wert` | Substantiv | A | 148,436 | 962,393 | 1,110,829 | 1,110,829 | 0 | OK |
| `sophocle` | `sophokle` | Substantiv | D | 44 | 1,258 | 1,302 | 1,302 | 0 | OK |
| `spatziren` | `spatzieren` | Verb | C | 123 | 1,015 | 1,138 | 1,138 | 0 | OK |
| `kinroß` | `kinross` | Substantiv | B | 3 | 20 | 23 | 23 | 0 | OK |
| `erdkreyß` | `erdkreiß` | Substantiv | C | 6 | 74 | 80 | 80 | 0 | OK |
| `condemnation` | `kondemnation` | Substantiv | D | 16 | 26 | 42 | 42 | 0 | OK |
| `cottbuser` | `kottbuser` | Adjektiv | D | 2,954 | 104 | 3,058 | 3,032 | 4 | **ABWEICHUNG** |
| `collin` | `kollin` | Adjektiv | D | 1,013 | 796 | 1,809 | 1,030 | 143 | **ABWEICHUNG** |
| `ith` | `it` | Substantiv | A | 233 | 3,530 | 3,763 | 3,763 | 0 | OK |
| `thommy` | `tommy` | Substantiv | A | 22 | 4,733 | 4,755 | 4,755 | 0 | OK |
| `vertheidigungszustand` | `verteidigungszustand` | Substantiv | A | 119 | 204 | 323 | 323 | 0 | OK |
| `steuermeßbetrag` | `steuermessbetrag` | Substantiv | B | 210 | 320 | 530 | 530 | 0 | OK |
| `verbothen` | `verboten` | Adjektiv | A | 978 | 46,284 | 47,262 | 47,262 | 0 | OK |
| `miren` | `mieren` | Verb | C | 4 | 14 | 18 | 18 | 0 | OK |
| `kreisausschuß` | `kreisausschuss` | Substantiv | B | 478 | 3,990 | 4,468 | 4,468 | 0 | OK |
| `crdtheil` | `crdteil` | Substantiv | A | 6 | 12 | 18 | 18 | 0 | OK |
| `eisentheilche` | `eisenteilche` | Substantiv | A | 6 | 117 | 123 | 123 | 0 | OK |
| `traditionserlaß` | `traditionserlass` | Substantiv | B | 16 | 66 | 82 | 82 | 0 | OK |
| `immunitätsausschuß` | `immunitätsausschuss` | Substantiv | B | 44 | 236 | 280 | 280 | 0 | OK |
| `schleyer` | `schleier` | Substantiv | C | 777 | 27,513 | 28,290 | 28,290 | 0 | OK |
| `unthätigkeit` | `untätigkeit` | Substantiv | A | 1,351 | 7,429 | 8,780 | 8,780 | 0 | OK |

## Kontroll-Paare (muessen getrennt bleiben)

Zeilenzahlen duerfen sinken: steht ein Kontrollwort als Kollokator neben `theil` UND `teil`, verschmelzen diese zwei Zeilen zu einer. Beweis fuer "bleibt getrennt" ist die unveraenderte FREQUENZ.

| Wort | f vorher | f nachher | Partner | f vorher | f nachher | |
|---|---:|---:|---|---:|---:|---|
| `theater` | 249,677 | 249,677 | `teater` | 9 | 15 | getrennt |
| `maß` | 391,762 | 391,762 | `mass` | 180,599 | 180,599 | getrennt |
| `thema` | 700,805 | 700,805 | `tema` | 34 | 34 | getrennt |
| `thron` | 144,121 | 144,121 | `tron` | 142 | 142 | getrennt |
| `bayerisch` | 371,981 | 371,981 | `baierisch` | 3,482 | 3,482 | getrennt |

**30 Paare geprueft, 5 Kontroll-Paare — 2 Abweichungen.**