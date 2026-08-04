# Phase E2 - Validierungs-Report `lemma_corrections`

Erzeugt: 2026-08-04 01:23 · DB: `C:\wortprofil_v2\wortprofil_v2.db` · Mapping: **13,138 Zeilen**, alle `freigegeben=0`

> **Nichts an den Daten wurde veraendert.** Es existiert nur die neue Tabelle `lemma_corrections`. Sicherungskopie: `D:\wortprofil_v2_backup\wortprofil_v2.db.pre-e2`.

## 1. Bloecke - hier gibst du frei

| Block | Regel | Paare | betroffene Frequenz | Freigabe |
|---|---|---:|---:|---|
| **A** | th -> t (Orthographische Konferenz 1901, Erbwoerter) | 3,569 | 6,698,487 | ☐ |
| **B** | ss / -nis (Rechtschreibreform 1996) | 2,144 | 1,725,302 | ☐ |
| **C** | ey / ieng / -iren (Schreibgebrauch 18./19. Jahrhundert) | 1,746 | 622,487 | ☐ |
| **D** | c -> k / z, ck -> k (Fremdwortschreibung 1901) | 4,109 | 1,241,440 | ☐ |
| **E** | ph -> f, y -> i, dt -> t (gemischt, hoeheres Risiko) | 1,570 | 303,127 | ☐ |
| | **Summe** | **13,138** | **10,590,843** | |

## 2. Top-500 nach Frequenz der alten Form

| # | alt | -> | korrekt | POS | f_alt | f_korrekt | Block | Verdacht |
|---:|---|---|---|---|---:|---:|---|---|
| 1 | `theil` | → | `teil` | Substantiv | 1,184,613 | 3,951,999 | A |  |
| 2 | `thun` | → | `tun` | Verb | 746,492 | 3,167,921 | A |  |
| 3 | `thier` | → | `tier` | Substantiv | 253,810 | 587,113 | A |  |
| 4 | `berathung` | → | `beratung` | Substantiv | 251,079 | 982,281 | A |  |
| 5 | `ausschuß` | → | `ausschuss` | Substantiv | 178,811 | 408,550 | B | laenger |
| 6 | `veranlaßen` | → | `veranlassen` | Verb | 170,208 | 239,962 | B | laenger,schwache_dominanz |
| 7 | `theilen` | → | `teilen` | Verb | 160,700 | 653,332 | A |  |
| 8 | `thätigkeit` | → | `tätigkeit` | Substantiv | 145,719 | 836,414 | A |  |
| 9 | `werth` | → | `wert` | Substantiv | 136,814 | 945,237 | A |  |
| 10 | `vortheil` | → | `vorteil` | Substantiv | 129,154 | 362,516 | A |  |
| 11 | `rußland` | → | `russland` | Substantiv | 126,712 | 268,030 | B | laenger |
| 12 | `ertheilen` | → | `erteilen` | Verb | 124,546 | 598,863 | A |  |
| 13 | `theils` | → | `teils` | Adverb | 110,519 | 132,650 | A | schwache_dominanz |
| 14 | `mittheilen` | → | `mitteilen` | Verb | 106,408 | 934,113 | A |  |
| 15 | `urtheil` | → | `urteil` | Substantiv | 106,178 | 1,558,240 | A |  |
| 16 | `club` | → | `klub` | Substantiv | 94,642 | 151,415 | D | schwache_dominanz,riskante_regel |
| 17 | `abschluß` | → | `abschluss` | Substantiv | 93,784 | 389,303 | B | laenger |
| 18 | `verhältniß` | → | `verhältnis` | Substantiv | 87,956 | 1,129,202 | B |  |
| 19 | `rath` | → | `rat` | Substantiv | 82,408 | 523,663 | A |  |
| 20 | `thür` | → | `tür` | Substantiv | 79,078 | 240,563 | A |  |
| 21 | `that` | → | `tat` | Substantiv | 77,731 | 431,034 | A |  |
| 22 | `nöthigen` | → | `nötigen` | Verb | 77,333 | 94,153 | A | schwache_dominanz |
| 23 | `seyn` | → | `sein` | Verb | 69,335 | 3,803,403 | C |  |
| 24 | `thal` | → | `tal` | Substantiv | 69,125 | 242,630 | A |  |
| 25 | `nöthig` | → | `nötig` | Adjektiv | 68,473 | 138,143 | A |  |
| 26 | `muth` | → | `mut` | Substantiv | 64,423 | 218,285 | A |  |
| 27 | `carl` | → | `karl` | Substantiv | 63,733 | 306,768 | D | riskante_regel |
| 28 | `nothwendig` | → | `notwendig` | Adjektiv | 62,502 | 382,141 | A |  |
| 29 | `gerathen` | → | `geraten` | Verb | 62,499 | 815,960 | A |  |
| 30 | `kenntniß` | → | `kenntnis` | Substantiv | 61,929 | 448,020 | B |  |
| 31 | `thor` | → | `tor` | Substantiv | 61,906 | 541,335 | A |  |
| 32 | `noth` | → | `not` | Substantiv | 61,890 | 201,027 | A |  |
| 33 | `mittheilung` | → | `mitteilung` | Substantiv | 61,502 | 158,984 | A |  |
| 34 | `vertheidigen` | → | `verteidigen` | Verb | 61,484 | 450,472 | A |  |
| 35 | `vertheilen` | → | `verteilen` | Verb | 56,442 | 355,462 | A |  |
| 36 | `mißbrauch` | → | `missbrauch` | Substantiv | 55,250 | 86,676 | B | laenger,schwache_dominanz |
| 37 | `beschlußempfehlung` | → | `beschlussempfehlung` | Substantiv | 54,637 | 115,609 | B | laenger |
| 38 | `abtheilung` | → | `abteilung` | Substantiv | 54,234 | 288,234 | A |  |
| 39 | `dabey` | → | `dabei` | Adverb | 52,520 | 2,726,935 | C |  |
| 40 | `nothwendigkeit` | → | `notwendigkeit` | Substantiv | 48,150 | 206,467 | A |  |
| 41 | `antheil` | → | `anteil` | Substantiv | 46,875 | 610,053 | A |  |
| 42 | `bedürfniß` | → | `bedürfnis` | Substantiv | 46,045 | 279,568 | B |  |
| 43 | `thräne` | → | `träne` | Substantiv | 45,359 | 75,423 | A | schwache_dominanz |
| 44 | `bestandtheil` | → | `bestandteil` | Substantiv | 43,852 | 302,148 | A |  |
| 45 | `roth` | → | `rot` | Adjektiv | 41,842 | 531,148 | A |  |
| 46 | `mißbrauchen` | → | `missbrauchen` | Verb | 40,304 | 45,643 | B | laenger,schwache_dominanz |
| 47 | `bundesrath` | → | `bundesrat` | Substantiv | 38,531 | 191,481 | A |  |
| 48 | `beeinflußen` | → | `beeinflussen` | Verb | 38,077 | 260,305 | B | laenger |
| 49 | `eigenthum` | → | `eigentum` | Substantiv | 37,403 | 182,024 | A |  |
| 50 | `thatsache` | → | `tatsache` | Substantiv | 37,361 | 337,608 | A |  |
| 51 | `nachtheil` | → | `nachteil` | Substantiv | 37,234 | 231,416 | A |  |
| 52 | `vermuthen` | → | `vermuten` | Verb | 37,039 | 206,829 | A |  |
| 53 | `reichthum` | → | `reichtum` | Substantiv | 36,240 | 99,361 | A |  |
| 54 | `verurtheilen` | → | `verurteilen` | Verb | 36,155 | 906,111 | A |  |
| 55 | `wirthschaftlich` | → | `wirtschaftlich` | Adjektiv | 35,877 | 766,343 | A |  |
| 56 | `beurtheilen` | → | `beurteilen` | Verb | 33,785 | 280,888 | A |  |
| 57 | `todt` | → | `tot` | Adjektiv | 32,504 | 96,517 | E | riskante_regel |
| 58 | `landwirthschaftlich` | → | `landwirtschaftlich` | Adjektiv | 31,859 | 223,355 | A |  |
| 59 | `thierisch` | → | `tierisch` | Adjektiv | 31,309 | 32,117 | A | schwache_dominanz |
| 60 | `freyheit` | → | `freiheit` | Substantiv | 31,237 | 575,905 | C |  |
| 61 | `landwirthschaft` | → | `landwirtschaft` | Substantiv | 30,501 | 293,881 | A |  |
| 62 | `zwey` | → | `zwei` | Adjektiv | 29,578 | 107,107 | C |  |
| 63 | `mercken` | → | `merken` | Verb | 28,728 | 419,622 | D | riskante_regel |
| 64 | `betheiligen` | → | `beteiligen` | Verb | 27,272 | 829,185 | A |  |
| 65 | `blüthe` | → | `blüte` | Substantiv | 27,148 | 233,807 | A |  |
| 66 | `gemüth` | → | `gemüt` | Substantiv | 27,024 | 56,504 | A |  |
| 67 | `gedencken` | → | `gedenken` | Verb | 26,714 | 238,914 | D | riskante_regel |
| 68 | `existiren` | → | `existieren` | Verb | 26,529 | 381,114 | C | laenger |
| 69 | `vertheilung` | → | `verteilung` | Substantiv | 26,217 | 136,875 | A |  |
| 70 | `christenthum` | → | `christentum` | Substantiv | 25,859 | 62,897 | A |  |
| 71 | `capitel` | → | `kapitel` | Substantiv | 25,531 | 186,522 | D | riskante_regel |
| 72 | `zeugniß` | → | `zeugnis` | Substantiv | 25,437 | 120,326 | B |  |
| 73 | `theilung` | → | `teilung` | Substantiv | 25,199 | 112,324 | A |  |
| 74 | `urtheilen` | → | `urteilen` | Verb | 24,959 | 68,351 | A |  |
| 75 | `erlaubniß` | → | `erlaubnis` | Substantiv | 24,160 | 103,176 | B |  |
| 76 | `verrathen` | → | `verraten` | Verb | 24,071 | 187,958 | A |  |
| 77 | `volck` | → | `volk` | Substantiv | 23,321 | 1,548,684 | D | riskante_regel |
| 78 | `thurm` | → | `turm` | Substantiv | 23,109 | 315,663 | A |  |
| 79 | `graphisch` | → | `grafisch` | Adjektiv | 22,983 | 30,845 | E | schwache_dominanz,riskante_regel |
| 80 | `corps` | → | `korps` | Substantiv | 22,844 | 45,055 | D | schwache_dominanz,riskante_regel |
| 81 | `theilnahme` | → | `teilnahme` | Substantiv | 22,759 | 160,537 | A |  |
| 82 | `erkenntniß` | → | `erkenntnis` | Substantiv | 22,711 | 303,616 | B |  |
| 83 | `anschluß` | → | `anschluss` | Substantiv | 21,675 | 179,516 | B | laenger |
| 84 | `werck` | → | `werk` | Substantiv | 21,522 | 1,335,535 | D | riskante_regel |
| 85 | `thon` | → | `ton` | Substantiv | 21,073 | 353,933 | A |  |
| 86 | `heirathen` | → | `heiraten` | Verb | 20,705 | 696,887 | A |  |
| 87 | `gegentheil` | → | `gegenteil` | Substantiv | 20,486 | 72,070 | A |  |
| 88 | `ausschluß` | → | `ausschluss` | Substantiv | 20,428 | 55,850 | B | laenger |
| 89 | `vertheidigung` | → | `verteidigung` | Substantiv | 20,410 | 201,580 | A |  |
| 90 | `wuth` | → | `wut` | Substantiv | 20,084 | 48,949 | A |  |
| 91 | `passiren` | → | `passieren` | Verb | 19,932 | 458,965 | C | laenger |
| 92 | `beurtheilung` | → | `beurteilung` | Substantiv | 19,906 | 323,003 | A |  |
| 93 | `thätig` | → | `tätig` | Adjektiv | 19,780 | 78,925 | A |  |
| 94 | `cultur` | → | `kultur` | Substantiv | 18,931 | 440,095 | D | riskante_regel |
| 95 | `starck` | → | `stark` | Adjektiv | 18,742 | 993,124 | D | riskante_regel |
| 96 | `thatsächlich` | → | `tatsächlich` | Adjektiv | 18,327 | 263,587 | A |  |
| 97 | `stephan` | → | `stefan` | Substantiv | 17,291 | 43,979 | E | riskante_regel |
| 98 | `kongreß` | → | `kongress` | Substantiv | 16,870 | 105,500 | B | laenger |
| 99 | `eintheilung` | → | `einteilung` | Substantiv | 16,482 | 37,056 | A |  |
| 100 | `bewußt` | → | `bewusst` | Adjektiv | 16,353 | 31,397 | B | laenger,schwache_dominanz |
| 101 | `berathen` | → | `beraten` | Verb | 16,164 | 335,036 | A |  |
| 102 | `roth` | → | `rot` | Substantiv | 16,111 | 30,168 | A | schwache_dominanz |
| 103 | `alterthum` | → | `altertum` | Substantiv | 15,796 | 31,101 | A | schwache_dominanz |
| 104 | `verzeichniß` | → | `verzeichnis` | Substantiv | 15,632 | 58,158 | B |  |
| 105 | `herzogthum` | → | `herzogtum` | Substantiv | 15,403 | 85,271 | A |  |
| 106 | `befugniß` | → | `befugnis` | Substantiv | 15,187 | 135,369 | B |  |
| 107 | `betheiligt` | → | `beteiligt` | Adjektiv | 15,135 | 138,595 | A |  |
| 108 | `dancken` | → | `danken` | Verb | 15,079 | 418,164 | D | riskante_regel |
| 109 | `thun` | → | `tun` | Substantiv | 14,792 | 24,591 | A | schwache_dominanz |
| 110 | `colonie` | → | `kolonie` | Substantiv | 14,755 | 186,270 | D | riskante_regel |
| 111 | `geheimniß` | → | `geheimnis` | Substantiv | 14,576 | 97,798 | B |  |
| 112 | `schlußfolgerung` | → | `schlussfolgerung` | Substantiv | 14,519 | 22,728 | B | laenger,schwache_dominanz |
| 113 | `irrthum` | → | `irrtum` | Substantiv | 14,442 | 43,461 | A |  |
| 114 | `haushaltsausschuß` | → | `haushaltsausschuss` | Substantiv | 14,305 | 36,064 | B | laenger |
| 115 | `beyspiel` | → | `beispiel` | Substantiv | 13,926 | 626,447 | C |  |
| 116 | `ergebniß` | → | `ergebnis` | Substantiv | 13,867 | 1,079,395 | B |  |
| 117 | `meynung` | → | `meinung` | Substantiv | 13,641 | 594,393 | C |  |
| 118 | `thee` | → | `tee` | Substantiv | 13,336 | 32,502 | A |  |
| 119 | `rathen` | → | `raten` | Verb | 13,074 | 118,891 | A |  |
| 120 | `wachsthum` | → | `wachstum` | Substantiv | 12,987 | 209,213 | A |  |
| 121 | `gefängniß` | → | `gefängnis` | Substantiv | 12,612 | 86,683 | B |  |
| 122 | `drey` | → | `drei` | Adjektiv | 12,351 | 17,564 | C | schwache_dominanz |
| 123 | `dencken` | → | `denken` | Verb | 12,162 | 2,166,563 | D | riskante_regel |
| 124 | `jacob` | → | `jakob` | Substantiv | 12,157 | 30,289 | D | riskante_regel |
| 125 | `nachtheilig` | → | `nachteilig` | Adjektiv | 11,988 | 18,915 | A | schwache_dominanz |
| 126 | `consul` | → | `konsul` | Substantiv | 11,965 | 55,130 | D | riskante_regel |
| 127 | `demographisch` | → | `demografisch` | Adjektiv | 11,783 | 19,689 | E | schwache_dominanz,riskante_regel |
| 128 | `aufschluß` | → | `aufschluss` | Substantiv | 11,777 | 26,033 | B | laenger |
| 129 | `werth` | → | `wert` | Adjektiv | 11,648 | 17,374 | A | schwache_dominanz |
| 130 | `meynen` | → | `meinen` | Verb | 11,566 | 1,544,497 | C |  |
| 131 | `canal` | → | `kanal` | Substantiv | 11,551 | 174,101 | D | riskante_regel |
| 132 | `verfaßen` | → | `verfassen` | Verb | 11,519 | 283,468 | B | laenger |
| 133 | `theilweise` | → | `teilweise` | Adverb | 11,175 | 387,317 | A |  |
| 134 | `verständniß` | → | `verständnis` | Substantiv | 11,171 | 264,421 | B |  |
| 135 | `armuth` | → | `armut` | Substantiv | 11,045 | 78,141 | A |  |
| 136 | `fluth` | → | `flut` | Substantiv | 10,995 | 93,495 | A |  |
| 137 | `vermuthung` | → | `vermutung` | Substantiv | 10,879 | 74,995 | A |  |
| 138 | `heimath` | → | `heimat` | Substantiv | 10,352 | 245,598 | A |  |
| 139 | `photographisch` | → | `fotografisch` | Adjektiv | 10,309 | 13,586 | E | schwache_dominanz,riskante_regel |
| 140 | `eigenthümer` | → | `eigentümer` | Substantiv | 10,196 | 155,517 | A |  |
| 141 | `nebenfluß` | → | `nebenfluss` | Substantiv | 10,106 | 49,871 | B | laenger |
| 142 | `kaiserthum` | → | `kaisertum` | Substantiv | 9,899 | 29,248 | A |  |
| 143 | `elephant` | → | `elefant` | Substantiv | 9,861 | 37,568 | E | riskante_regel |
| 144 | `laßen` | → | `lassen` | Verb | 9,813 | 9,665,927 | B | laenger |
| 145 | `ertheilung` | → | `erteilung` | Substantiv | 9,699 | 91,594 | A |  |
| 146 | `marcus` | → | `markus` | Substantiv | 9,586 | 31,801 | D | riskante_regel |
| 147 | `regierungsrath` | → | `regierungsrat` | Substantiv | 9,584 | 32,168 | A |  |
| 148 | `kranckheit` | → | `krankheit` | Substantiv | 9,411 | 312,658 | D | riskante_regel |
| 149 | `vorrath` | → | `vorrat` | Substantiv | 9,404 | 43,821 | A |  |
| 150 | `classe` | → | `klasse` | Substantiv | 9,340 | 506,939 | D | riskante_regel |
| 151 | `willy` | → | `willi` | Substantiv | 9,271 | 10,155 | E | schwache_dominanz,riskante_regel |
| 152 | `bedencken` | → | `bedenken` | Verb | 9,234 | 275,914 | D | riskante_regel |
| 153 | `vertical` | → | `vertikal` | Adjektiv | 9,104 | 32,202 | D | riskante_regel |
| 154 | `mißlingen` | → | `misslingen` | Verb | 8,941 | 11,628 | B | laenger,schwache_dominanz |
| 155 | `abfluß` | → | `abfluss` | Substantiv | 8,832 | 24,291 | B | laenger |
| 156 | `mißverständnis` | → | `missverständnis` | Substantiv | 8,763 | 13,773 | B | laenger,schwache_dominanz |
| 157 | `wirth` | → | `wirt` | Substantiv | 8,701 | 44,274 | A |  |
| 158 | `gedächtniß` | → | `gedächtnis` | Substantiv | 8,691 | 44,666 | B |  |
| 159 | `erdtheil` | → | `erdteil` | Substantiv | 8,681 | 35,142 | A |  |
| 160 | `vorurtheil` | → | `vorurteil` | Substantiv | 8,492 | 26,313 | A |  |
| 161 | `wirthschaft` | → | `wirtschaft` | Substantiv | 8,458 | 554,332 | A |  |
| 162 | `anmuthig` | → | `anmutig` | Adjektiv | 8,441 | 12,925 | A | schwache_dominanz |
| 163 | `sacrament` | → | `sakrament` | Substantiv | 8,435 | 27,495 | D | riskante_regel |
| 164 | `gothisch` | → | `gotisch` | Adjektiv | 8,384 | 67,237 | A |  |
| 165 | `beyde` | → | `beide` | Adjektiv | 8,198 | 1,406,445 | C |  |
| 166 | `vortheilhaft` | → | `vorteilhaft` | Adjektiv | 8,165 | 15,843 | A | schwache_dominanz |
| 167 | `vertheidiger` | → | `verteidiger` | Substantiv | 8,158 | 135,639 | A |  |
| 168 | `linck` | → | `link` | Adjektiv | 8,134 | 416,920 | D | riskante_regel |
| 169 | `bündniß` | → | `bündnis` | Substantiv | 8,121 | 235,414 | B |  |
| 170 | `ertheilt` | → | `erteilt` | Adjektiv | 8,042 | 126,014 | A |  |
| 171 | `thau` | → | `tau` | Substantiv | 7,986 | 22,258 | A |  |
| 172 | `mitgetheilt` | → | `mitgeteilt` | Adjektiv | 7,941 | 10,930 | A | schwache_dominanz |
| 173 | `athmen` | → | `atmen` | Verb | 7,865 | 41,854 | A |  |
| 174 | `creatur` | → | `kreatur` | Substantiv | 7,859 | 10,602 | D | schwache_dominanz,riskante_regel |
| 175 | `trincken` | → | `trinken` | Verb | 7,785 | 395,235 | D | riskante_regel |
| 176 | `finsterniß` | → | `finsternis` | Substantiv | 7,782 | 14,543 | B | schwache_dominanz |
| 177 | `interessiren` | → | `interessieren` | Verb | 7,767 | 313,887 | C | laenger |
| 178 | `kayser` | → | `kaiser` | Substantiv | 7,703 | 1,006,865 | E | riskante_regel |
| 179 | `centner` | → | `zentner` | Substantiv | 7,662 | 11,358 | D | schwache_dominanz,riskante_regel |
| 180 | `centrum` | → | `zentrum` | Substantiv | 7,633 | 376,848 | D | riskante_regel |
| 181 | `verurtheilung` | → | `verurteilung` | Substantiv | 7,624 | 177,508 | A |  |
| 182 | `construiren` | → | `konstruieren` | Verb | 7,589 | 56,787 | D | laenger,riskante_regel |
| 183 | `hinderniß` | → | `hindernis` | Substantiv | 7,571 | 88,274 | B |  |
| 184 | `constant` | → | `konstant` | Adjektiv | 7,555 | 37,155 | D | riskante_regel |
| 185 | `theuer` | → | `teuer` | Adjektiv | 7,419 | 131,106 | A |  |
| 186 | `bethätigen` | → | `betätigen` | Verb | 7,373 | 97,095 | A |  |
| 187 | `muthig` | → | `mutig` | Adjektiv | 7,367 | 39,869 | A |  |
| 188 | `stärcken` | → | `stärken` | Verb | 7,354 | 384,196 | D | riskante_regel |
| 189 | `gußeisern` | → | `gusseisern` | Adjektiv | 7,345 | 9,334 | B | laenger,schwache_dominanz |
| 190 | `daseyn` | → | `dasein` | Substantiv | 7,327 | 60,563 | C |  |
| 191 | `studiren` | → | `studieren` | Verb | 7,275 | 1,375,751 | C | laenger |
| 192 | `genugthuung` | → | `genugtuung` | Substantiv | 7,260 | 12,215 | A | schwache_dominanz |
| 193 | `einflußreich` | → | `einflussreich` | Adjektiv | 7,182 | 28,917 | B | laenger |
| 194 | `fürstenthum` | → | `fürstentum` | Substantiv | 7,106 | 40,974 | A |  |
| 195 | `college` | → | `kollege` | Substantiv | 7,056 | 782,031 | D | riskante_regel |
| 196 | `mißhandeln` | → | `misshandeln` | Verb | 7,038 | 13,233 | B | laenger,schwache_dominanz |
| 197 | `walther` | → | `walter` | Substantiv | 6,979 | 65,217 | A |  |
| 198 | `photographie` | → | `fotografie` | Substantiv | 6,851 | 48,752 | E | riskante_regel |
| 199 | `thatbestand` | → | `tatbestand` | Substantiv | 6,766 | 129,813 | A |  |
| 200 | `unnöthig` | → | `unnötig` | Adjektiv | 6,732 | 26,326 | A |  |
| 201 | `wüthen` | → | `wüten` | Verb | 6,656 | 35,076 | A |  |
| 202 | `zufluß` | → | `zufluss` | Substantiv | 6,624 | 67,327 | B | laenger |
| 203 | `beytragen` | → | `beitragen` | Verb | 6,530 | 674,327 | C |  |
| 204 | `heyland` | → | `heiland` | Substantiv | 6,508 | 22,409 | C |  |
| 205 | `commune` | → | `kommune` | Substantiv | 6,432 | 158,482 | D | riskante_regel |
| 206 | `rathe` | → | `rate` | Substantiv | 6,401 | 58,263 | A |  |
| 207 | `besorgniß` | → | `besorgnis` | Substantiv | 6,375 | 46,231 | B |  |
| 208 | `errathen` | → | `erraten` | Verb | 6,371 | 10,693 | A | schwache_dominanz |
| 209 | `collegium` | → | `kollegium` | Substantiv | 6,370 | 10,603 | D | schwache_dominanz,riskante_regel |
| 210 | `confession` | → | `konfession` | Substantiv | 6,340 | 54,902 | D | riskante_regel |
| 211 | `überschuß` | → | `überschuss` | Substantiv | 6,285 | 32,341 | B | laenger |
| 212 | `wüthend` | → | `wütend` | Adjektiv | 6,284 | 22,295 | A |  |
| 213 | `selbstbewußtsein` | → | `selbstbewusstsein` | Substantiv | 6,281 | 13,310 | B | laenger |
| 214 | `scala` | → | `skala` | Substantiv | 6,230 | 7,886 | D | schwache_dominanz,riskante_regel |
| 215 | `autobiographisch` | → | `autobiografisch` | Adjektiv | 6,228 | 8,042 | E | schwache_dominanz,riskante_regel |
| 216 | `werthvoll` | → | `wertvoll` | Adjektiv | 6,209 | 110,915 | A |  |
| 217 | `röthlich` | → | `rötlich` | Adjektiv | 6,140 | 20,696 | A |  |
| 218 | `demuth` | → | `demut` | Substantiv | 6,122 | 11,699 | A | schwache_dominanz |
| 219 | `styl` | → | `stil` | Substantiv | 6,035 | 329,393 | E | riskante_regel |
| 220 | `größtentheils` | → | `größtenteils` | Adverb | 6,012 | 63,669 | A |  |
| 221 | `ereigniß` | → | `ereignis` | Substantiv | 5,991 | 334,172 | B |  |
| 222 | `ceremonie` | → | `zeremonie` | Substantiv | 5,958 | 22,754 | D | riskante_regel |
| 223 | `proceß` | → | `process` | Substantiv | 5,905 | 7,444 | B | laenger,schwache_dominanz |
| 224 | `continent` | → | `kontinent` | Substantiv | 5,900 | 66,041 | D | riskante_regel |
| 225 | `locomotive` | → | `lokomotive` | Substantiv | 5,884 | 138,573 | D | riskante_regel |
| 226 | `frey` | → | `frei` | Adjektiv | 5,819 | 979,666 | C |  |
| 227 | `räthsel` | → | `rätsel` | Substantiv | 5,789 | 28,835 | A |  |
| 228 | `würckung` | → | `würkung` | Substantiv | 5,741 | 5,822 | D | schwache_dominanz,riskante_regel |
| 229 | `herzogthümer` | → | `herzogtümer` | Substantiv | 5,628 | 32,680 | A |  |
| 230 | `fürstenthümer` | → | `fürstentümer` | Substantiv | 5,489 | 18,516 | A |  |
| 231 | `constitution` | → | `konstitution` | Substantiv | 5,422 | 10,509 | D | schwache_dominanz,riskante_regel |
| 232 | `eintheilen` | → | `einteilen` | Verb | 5,408 | 68,017 | A |  |
| 233 | `secunde` | → | `sekunde` | Substantiv | 5,338 | 91,903 | D | riskante_regel |
| 234 | `legationsrath` | → | `legationsrat` | Substantiv | 5,331 | 7,884 | A | schwache_dominanz |
| 235 | `classisch` | → | `klassisch` | Adjektiv | 5,246 | 205,500 | D | riskante_regel |
| 236 | `betheiligung` | → | `beteiligung` | Substantiv | 5,243 | 272,475 | A |  |
| 237 | `rechtsausschuß` | → | `rechtsausschuss` | Substantiv | 5,194 | 18,171 | B | laenger |
| 238 | `geschrey` | → | `geschrei` | Substantiv | 5,168 | 49,008 | C |  |
| 239 | `ralph` | → | `ralf` | Substantiv | 5,132 | 10,509 | E | riskante_regel |
| 240 | `danck` | → | `dank` | Substantiv | 5,116 | 146,193 | D | riskante_regel |
| 241 | `freylich` | → | `freilich` | Adverb | 5,112 | 212,747 | C |  |
| 242 | `zusammenschluß` | → | `zusammenschluss` | Substantiv | 5,083 | 57,313 | B | laenger |
| 243 | `gutmüthig` | → | `gutmütig` | Adjektiv | 5,062 | 7,898 | A | schwache_dominanz |
| 244 | `oberregierungsrath` | → | `oberregierungsrat` | Substantiv | 5,047 | 6,269 | A | schwache_dominanz |
| 245 | `civilisation` | → | `zivilisation` | Substantiv | 5,007 | 22,168 | D | riskante_regel |
| 246 | `königthum` | → | `königtum` | Substantiv | 4,965 | 23,932 | A |  |
| 247 | `wehmuth` | → | `wehmut` | Substantiv | 4,884 | 8,064 | A | schwache_dominanz |
| 248 | `unbewußt` | → | `unbewusst` | Adjektiv | 4,881 | 5,132 | B | laenger,schwache_dominanz |
| 249 | `beyfall` | → | `beifall` | Substantiv | 4,865 | 198,013 | C |  |
| 250 | `modification` | → | `modifikation` | Substantiv | 4,839 | 16,065 | D | riskante_regel |
| 251 | `großherzogthum` | → | `großherzogtum` | Substantiv | 4,814 | 21,094 | A |  |
| 252 | `autobiographie` | → | `autobiografie` | Substantiv | 4,809 | 7,396 | E | schwache_dominanz,riskante_regel |
| 253 | `constitutionell` | → | `konstitutionell` | Adjektiv | 4,798 | 19,708 | D | riskante_regel |
| 254 | `thäter` | → | `täter` | Substantiv | 4,754 | 252,463 | A |  |
| 255 | `heyde` | → | `heide` | Substantiv | 4,702 | 77,692 | C |  |
| 256 | `mißachtung` | → | `missachtung` | Substantiv | 4,642 | 9,693 | B | laenger |
| 257 | `winckel` | → | `winkel` | Substantiv | 4,619 | 129,505 | D | riskante_regel |
| 258 | `vermittlungsausschuß` | → | `vermittlungsausschuss` | Substantiv | 4,617 | 9,451 | B | laenger |
| 259 | `geheimnißvoll` | → | `geheimnisvoll` | Adjektiv | 4,611 | 19,967 | B |  |
| 260 | `schencken` | → | `schenken` | Verb | 4,593 | 411,336 | D | riskante_regel |
| 261 | `reguliren` | → | `regulieren` | Verb | 4,582 | 26,290 | C | laenger |
| 262 | `verschluß` | → | `verschluss` | Substantiv | 4,565 | 10,134 | B | laenger |
| 263 | `prozeßbevollmächtigt` | → | `prozessbevollmächtigt` | Substantiv | 4,541 | 5,987 | B | laenger,schwache_dominanz |
| 264 | `conisch` | → | `konisch` | Adjektiv | 4,537 | 9,918 | D | riskante_regel |
| 265 | `thatkraft` | → | `tatkraft` | Substantiv | 4,431 | 8,613 | A | schwache_dominanz |
| 266 | `conrad` | → | `konrad` | Substantiv | 4,390 | 39,734 | D | riskante_regel |
| 267 | `stärcke` | → | `stärke` | Substantiv | 4,374 | 245,154 | D | riskante_regel |
| 268 | `absorbiren` | → | `absorbieren` | Verb | 4,351 | 8,214 | C | laenger,schwache_dominanz |
| 269 | `werthpapier` | → | `wertpapier` | Substantiv | 4,347 | 32,014 | A |  |
| 270 | `ungewißheit` | → | `ungewissheit` | Substantiv | 4,272 | 4,645 | B | laenger,schwache_dominanz |
| 271 | `demüthigen` | → | `demütigen` | Verb | 4,234 | 13,348 | A |  |
| 272 | `flüßig` | → | `flüssig` | Adjektiv | 4,230 | 74,910 | B | laenger |
| 273 | `mißverhältnis` | → | `missverhältnis` | Substantiv | 4,225 | 5,125 | B | laenger,schwache_dominanz |
| 274 | `mißbräuchlich` | → | `missbräuchlich` | Adjektiv | 4,197 | 7,839 | B | laenger,schwache_dominanz |
| 275 | `gluth` | → | `glut` | Substantiv | 4,169 | 31,492 | A |  |
| 276 | `capital` | → | `kapital` | Substantiv | 4,163 | 183,583 | D | riskante_regel |
| 277 | `zumuthen` | → | `zumuten` | Verb | 4,124 | 67,601 | A |  |
| 278 | `verwerthung` | → | `verwertung` | Substantiv | 4,120 | 51,694 | A |  |
| 279 | `verläßlich` | → | `verlässlich` | Adjektiv | 4,115 | 27,882 | B | laenger |
| 280 | `geständniß` | → | `geständnis` | Substantiv | 4,083 | 37,434 | B |  |
| 281 | `graph` | → | `graf` | Substantiv | 4,078 | 397,936 | E | riskante_regel |
| 282 | `sky` | → | `ski` | Substantiv | 4,077 | 5,270 | E | schwache_dominanz,riskante_regel |
| 283 | `vertheuern` | → | `verteuern` | Verb | 4,071 | 30,649 | A |  |
| 284 | `übermüthig` | → | `übermütig` | Adjektiv | 4,071 | 7,722 | A | schwache_dominanz |
| 285 | `publicum` | → | `publikum` | Substantiv | 4,059 | 233,537 | D | riskante_regel |
| 286 | `beystand` | → | `beistand` | Substantiv | 4,042 | 48,238 | C |  |
| 287 | `schwerdt` | → | `schwert` | Substantiv | 4,027 | 214,869 | E | riskante_regel |
| 288 | `sylbe` | → | `silbe` | Substantiv | 4,016 | 31,295 | E | riskante_regel |
| 289 | `bekenntniß` | → | `bekenntnis` | Substantiv | 4,011 | 68,285 | B |  |
| 290 | `zertheilen` | → | `zerteilen` | Verb | 4,009 | 5,351 | A | schwache_dominanz |
| 291 | `einverständniß` | → | `einverständnis` | Substantiv | 4,008 | 38,418 | B |  |
| 292 | `heiligthum` | → | `heiligtum` | Substantiv | 3,968 | 18,540 | A |  |
| 293 | `verrath` | → | `verrat` | Substantiv | 3,941 | 15,481 | A |  |
| 294 | `seyn` | → | `sein` | Substantiv | 3,908 | 20,078 | C |  |
| 295 | `haupttheil` | → | `hauptteil` | Substantiv | 3,892 | 16,329 | A |  |
| 296 | `fixiren` | → | `fixieren` | Verb | 3,878 | 30,419 | C | laenger |
| 297 | `getheilt` | → | `geteilt` | Adjektiv | 3,874 | 28,701 | A |  |
| 298 | `westphälisch` | → | `westfälisch` | Adjektiv | 3,874 | 41,419 | E | riskante_regel |
| 299 | `landestheil` | → | `landesteil` | Substantiv | 3,837 | 24,117 | A |  |
| 300 | `theer` | → | `teer` | Substantiv | 3,836 | 3,921 | A | schwache_dominanz |
| 301 | `demüthig` | → | `demütig` | Adjektiv | 3,829 | 5,645 | A | schwache_dominanz |
| 302 | `röthe` | → | `röte` | Substantiv | 3,821 | 3,966 | A | schwache_dominanz |
| 303 | `thierchen` | → | `tierchen` | Substantiv | 3,807 | 13,523 | A |  |
| 304 | `sclave` | → | `sklave` | Substantiv | 3,782 | 62,520 | D | riskante_regel |
| 305 | `credit` | → | `kredit` | Substantiv | 3,750 | 124,322 | D | riskante_regel |
| 306 | `protestiren` | → | `protestieren` | Verb | 3,749 | 80,805 | C | laenger |
| 307 | `cement` | → | `zement` | Substantiv | 3,739 | 5,210 | D | schwache_dominanz,riskante_regel |
| 308 | `cap` | → | `kap` | Substantiv | 3,728 | 29,577 | D | riskante_regel |
| 309 | `gyps` | → | `gips` | Substantiv | 3,724 | 8,664 | E | riskante_regel |
| 310 | `wirckung` | → | `wirkung` | Substantiv | 3,706 | 743,807 | D | riskante_regel |
| 311 | `raphael` | → | `rafael` | Substantiv | 3,691 | 3,833 | E | schwache_dominanz,riskante_regel |
| 312 | `columbus` | → | `kolumbus` | Substantiv | 3,681 | 4,909 | D | schwache_dominanz,riskante_regel |
| 313 | `carst` | → | `karst` | Substantiv | 3,678 | 5,137 | D | schwache_dominanz,riskante_regel |
| 314 | `zitiren` | → | `zitieren` | Verb | 3,653 | 319,032 | C | laenger |
| 315 | `central` | → | `zentral` | Adjektiv | 3,621 | 348,912 | D | riskante_regel |
| 316 | `bewußtseyn` | → | `bewußtsein` | Substantiv | 3,609 | 69,628 | C |  |
| 317 | `rathgeber` | → | `ratgeber` | Substantiv | 3,600 | 15,500 | A |  |
| 318 | `gewaltthat` | → | `gewalttat` | Substantiv | 3,590 | 18,334 | A |  |
| 319 | `brodt` | → | `brot` | Substantiv | 3,581 | 175,630 | E | riskante_regel |
| 320 | `beylegen` | → | `beilegen` | Verb | 3,580 | 102,312 | C |  |
| 321 | `charakterisiren` | → | `charakterisieren` | Verb | 3,571 | 42,854 | C | laenger |
| 322 | `mehrwerth` | → | `mehrwert` | Substantiv | 3,566 | 9,972 | A |  |
| 323 | `may` | → | `mai` | Substantiv | 3,534 | 592,638 | E | riskante_regel |
| 324 | `selbstthätig` | → | `selbsttätig` | Adjektiv | 3,515 | 3,796 | A | schwache_dominanz |
| 325 | `volkswirthschaftlich` | → | `volkswirtschaftlich` | Adjektiv | 3,515 | 30,070 | A |  |
| 326 | `eyd` | → | `eid` | Substantiv | 3,493 | 59,989 | C |  |
| 327 | `basilica` | → | `basilika` | Substantiv | 3,483 | 18,568 | D | riskante_regel |
| 328 | `prozeßkostenhilfe` | → | `prozesskostenhilfe` | Substantiv | 3,421 | 15,865 | B | laenger |
| 329 | `landrath` | → | `landrat` | Substantiv | 3,416 | 69,157 | A |  |
| 330 | `gewaltthätigkeit` | → | `gewalttätigkeit` | Substantiv | 3,411 | 5,143 | A | schwache_dominanz |
| 331 | `flüßigkeit` | → | `flüssigkeit` | Substantiv | 3,410 | 151,044 | B | laenger |
| 332 | `academie` | → | `akademie` | Substantiv | 3,385 | 393,296 | D | riskante_regel |
| 333 | `telephon` | → | `telefon` | Substantiv | 3,332 | 31,426 | E | riskante_regel |
| 334 | `curve` | → | `kurve` | Substantiv | 3,285 | 45,926 | D | riskante_regel |
| 335 | `schenckel` | → | `schenkel` | Substantiv | 3,281 | 27,070 | D | riskante_regel |
| 336 | `erpreßen` | → | `erpressen` | Verb | 3,259 | 10,343 | B | laenger |
| 337 | `cleve` | → | `kleve` | Substantiv | 3,255 | 4,334 | D | schwache_dominanz,riskante_regel |
| 338 | `hungersnoth` | → | `hungersnot` | Substantiv | 3,223 | 14,069 | A |  |
| 339 | `innenausschuß` | → | `innenausschuss` | Substantiv | 3,222 | 13,510 | B | laenger |
| 340 | `fabrication` | → | `fabrikation` | Substantiv | 3,220 | 13,309 | D | riskante_regel |
| 341 | `raubthier` | → | `raubtier` | Substantiv | 3,218 | 11,637 | A |  |
| 342 | `ersparniß` | → | `ersparnis` | Substantiv | 3,207 | 28,981 | B |  |
| 343 | `bruchtheil` | → | `bruchteil` | Substantiv | 3,206 | 17,254 | A |  |
| 344 | `ruthe` | → | `rute` | Substantiv | 3,202 | 5,131 | A | schwache_dominanz |
| 345 | `hausthier` | → | `haustier` | Substantiv | 3,198 | 11,459 | A |  |
| 346 | `graphik` | → | `grafik` | Substantiv | 3,187 | 35,346 | E | riskante_regel |
| 347 | `celle` | → | `zelle` | Substantiv | 3,180 | 126,822 | D | riskante_regel |
| 348 | `parthei` | → | `partei` | Substantiv | 3,177 | 1,603,889 | A |  |
| 349 | `tyrol` | → | `tirol` | Substantiv | 3,174 | 19,672 | E | riskante_regel |
| 350 | `canon` | → | `kanon` | Substantiv | 3,142 | 6,934 | D | riskante_regel |
| 351 | `rathhaus` | → | `rathaus` | Substantiv | 3,142 | 122,785 | A |  |
| 352 | `composition` | → | `komposition` | Substantiv | 3,138 | 85,222 | D | riskante_regel |
| 353 | `anthun` | → | `antun` | Verb | 3,096 | 65,843 | A |  |
| 354 | `consistenz` | → | `konsistenz` | Substantiv | 3,095 | 6,849 | D | riskante_regel |
| 355 | `nothstand` | → | `notstand` | Substantiv | 3,069 | 17,343 | A |  |
| 356 | `constantin` | → | `konstantin` | Substantiv | 3,065 | 8,724 | D | riskante_regel |
| 357 | `bley` | → | `blei` | Substantiv | 3,059 | 52,346 | C |  |
| 358 | `koth` | → | `kot` | Substantiv | 3,057 | 5,044 | A | schwache_dominanz |
| 359 | `motiviren` | → | `motivieren` | Verb | 3,051 | 40,549 | C | laenger |
| 360 | `probiren` | → | `probieren` | Verb | 3,026 | 44,569 | C | laenger |
| 361 | `neutralisiren` | → | `neutralisieren` | Verb | 3,011 | 4,814 | C | laenger,schwache_dominanz |
| 362 | `untersuchungsausschuß` | → | `untersuchungsausschuss` | Substantiv | 3,003 | 27,718 | B | laenger |
| 363 | `pornographisch` | → | `pornografisch` | Adjektiv | 2,998 | 3,496 | E | schwache_dominanz,riskante_regel |
| 364 | `hochmuth` | → | `hochmut` | Substantiv | 2,995 | 6,095 | A |  |
| 365 | `cron` | → | `kron` | Substantiv | 2,979 | 3,412 | D | schwache_dominanz,riskante_regel |
| 366 | `theilnehmer` | → | `teilnehmer` | Substantiv | 2,974 | 195,334 | A |  |
| 367 | `civilprozeßordnung` | → | `zivilprozeßordnung` | Substantiv | 2,966 | 4,868 | D | schwache_dominanz,riskante_regel |
| 368 | `mißstand` | → | `missstand` | Substantiv | 2,947 | 14,617 | B | laenger |
| 369 | `cultus` | → | `kultus` | Substantiv | 2,944 | 8,550 | D | riskante_regel |
| 370 | `produziren` | → | `produzieren` | Verb | 2,914 | 464,409 | C | laenger |
| 371 | `thatkräftig` | → | `tatkräftig` | Adjektiv | 2,894 | 10,869 | A |  |
| 372 | `finanzausschuß` | → | `finanzausschuss` | Substantiv | 2,890 | 16,651 | B | laenger |
| 373 | `ey` | → | `ei` | Substantiv | 2,863 | 291,337 | C |  |
| 374 | `unterausschuß` | → | `unterausschuss` | Substantiv | 2,844 | 8,165 | B | laenger |
| 375 | `contrast` | → | `kontrast` | Substantiv | 2,827 | 23,293 | D | riskante_regel |
| 376 | `verhängnißvoll` | → | `verhängnisvoll` | Adjektiv | 2,822 | 12,120 | B |  |
| 377 | `commission` | → | `kommission` | Substantiv | 2,816 | 604,793 | D | riskante_regel |
| 378 | `corpus` | → | `korpus` | Substantiv | 2,814 | 4,526 | D | schwache_dominanz,riskante_regel |
| 379 | `franckreich` | → | `frankreich` | Substantiv | 2,790 | 627,453 | D | riskante_regel |
| 380 | `canton` | → | `kanton` | Substantiv | 2,770 | 201,736 | D | riskante_regel |
| 381 | `constantinopel` | → | `konstantinopel` | Substantiv | 2,770 | 14,820 | D | riskante_regel |
| 382 | `verwerthen` | → | `verwerten` | Verb | 2,769 | 70,095 | A |  |
| 383 | `sproß` | → | `spross` | Substantiv | 2,768 | 4,412 | B | laenger,schwache_dominanz |
| 384 | `facultät` | → | `fakultät` | Substantiv | 2,756 | 194,558 | D | riskante_regel |
| 385 | `muthwillig` | → | `mutwillig` | Adjektiv | 2,744 | 4,218 | A | schwache_dominanz |
| 386 | `marschiren` | → | `marschieren` | Verb | 2,728 | 61,820 | C | laenger |
| 387 | `citadelle` | → | `zitadelle` | Substantiv | 2,721 | 5,020 | D | schwache_dominanz,riskante_regel |
| 388 | `colleg` | → | `kolleg` | Substantiv | 2,721 | 6,148 | D | riskante_regel |
| 389 | `einflußnahme` | → | `einflussnahme` | Substantiv | 2,715 | 13,812 | B | laenger |
| 390 | `heldenmüthig` | → | `heldenmütig` | Adjektiv | 2,710 | 7,409 | A |  |
| 391 | `verfaßt` | → | `verfasst` | Adjektiv | 2,698 | 24,546 | B | laenger |
| 392 | `diskutiren` | → | `diskutieren` | Verb | 2,685 | 446,736 | C | laenger |
| 393 | `theilnehmen` | → | `teilnehmen` | Verb | 2,677 | 1,281,380 | A |  |
| 394 | `codieren` | → | `kodieren` | Verb | 2,673 | 4,248 | D | schwache_dominanz,riskante_regel |
| 395 | `focus` | → | `fokus` | Substantiv | 2,654 | 70,069 | D | riskante_regel |
| 396 | `censur` | → | `zensur` | Substantiv | 2,648 | 16,204 | D | riskante_regel |
| 397 | `selbstbewußt` | → | `selbstbewusst` | Adjektiv | 2,627 | 8,752 | B | laenger |
| 398 | `canne` | → | `kanne` | Substantiv | 2,621 | 8,867 | D | riskante_regel |
| 399 | `variiren` | → | `variieren` | Verb | 2,615 | 71,372 | C | laenger |
| 400 | `marck` | → | `mark` | Substantiv | 2,599 | 500,649 | D | riskante_regel |
| 401 | `gefängnißstrafe` | → | `gefängnisstrafe` | Substantiv | 2,594 | 20,914 | B |  |
| 402 | `verheirathen` | → | `verheiraten` | Verb | 2,588 | 258,401 | A |  |
| 403 | `zweigeschoßig` | → | `zweigeschossig` | Adjektiv | 2,577 | 30,813 | B | laenger |
| 404 | `congreß` | → | `kongress` | Substantiv | 2,550 | 105,500 | D | laenger,riskante_regel |
| 405 | `wißen` | → | `wissen` | Verb | 2,496 | 4,758,213 | B | laenger |
| 406 | `concurrenz` | → | `konkurrenz` | Substantiv | 2,491 | 141,103 | D | riskante_regel |
| 407 | `heylig` | → | `heilig` | Adjektiv | 2,484 | 647,643 | C |  |
| 408 | `combination` | → | `kombination` | Substantiv | 2,481 | 105,257 | D | riskante_regel |
| 409 | `ruiniren` | → | `ruinieren` | Verb | 2,475 | 17,511 | C | laenger |
| 410 | `kärnthen` | → | `kärnten` | Substantiv | 2,474 | 11,901 | A |  |
| 411 | `luca` | → | `luka` | Substantiv | 2,460 | 9,652 | D | riskante_regel |
| 412 | `orinoco` | → | `orinoko` | Substantiv | 2,456 | 4,456 | D | schwache_dominanz,riskante_regel |
| 413 | `wehmüthig` | → | `wehmütig` | Adjektiv | 2,449 | 3,679 | A | schwache_dominanz |
| 414 | `nuth` | → | `nut` | Substantiv | 2,440 | 5,299 | A |  |
| 415 | `todesurtheil` | → | `todesurteil` | Substantiv | 2,416 | 13,207 | A |  |
| 416 | `zusammenfaßen` | → | `zusammenfassen` | Verb | 2,411 | 184,152 | B | laenger |
| 417 | `armeecorps` | → | `armeekorps` | Substantiv | 2,406 | 16,121 | D | riskante_regel |
| 418 | `bisthum` | → | `bistum` | Substantiv | 2,401 | 118,290 | A |  |
| 419 | `fäulniß` | → | `fäulnis` | Substantiv | 2,398 | 3,273 | B | schwache_dominanz |
| 420 | `commando` | → | `kommando` | Substantiv | 2,392 | 84,060 | D | riskante_regel |
| 421 | `hiebey` | → | `hiebei` | Adverb | 2,388 | 2,662 | C | schwache_dominanz |
| 422 | `orth` | → | `ort` | Substantiv | 2,384 | 1,482,720 | A |  |
| 423 | `mißlungen` | → | `misslungen` | Adjektiv | 2,382 | 2,413 | B | laenger,schwache_dominanz |
| 424 | `conservativ` | → | `konservativ` | Adjektiv | 2,370 | 109,286 | D | riskante_regel |
| 425 | `oxydiren` | → | `oxidieren` | Verb | 2,366 | 4,659 | E | laenger,schwache_dominanz,riskante_regel |
| 426 | `gewaltthätig` | → | `gewalttätig` | Adjektiv | 2,356 | 23,137 | A |  |
| 427 | `vorschuß` | → | `vorschuss` | Substantiv | 2,347 | 4,287 | B | laenger,schwache_dominanz |
| 428 | `ehrenwerth` | → | `ehrenwert` | Adjektiv | 2,345 | 4,113 | A | schwache_dominanz |
| 429 | `franck` | → | `frank` | Substantiv | 2,340 | 64,464 | D | riskante_regel |
| 430 | `heyl` | → | `heil` | Substantiv | 2,339 | 50,404 | C |  |
| 431 | `bemerkenswerth` | → | `bemerkenswert` | Adjektiv | 2,338 | 35,390 | A |  |
| 432 | `juncker` | → | `junker` | Substantiv | 2,334 | 15,830 | D | riskante_regel |
| 433 | `kriegsrath` | → | `kriegsrat` | Substantiv | 2,318 | 6,388 | A |  |
| 434 | `großmuth` | → | `großmut` | Substantiv | 2,307 | 2,542 | A | schwache_dominanz |
| 435 | `verräther` | → | `verräter` | Substantiv | 2,307 | 6,606 | A |  |
| 436 | `westphale` | → | `westfale` | Substantiv | 2,307 | 17,435 | E | riskante_regel |
| 437 | `secundär` | → | `sekundär` | Adjektiv | 2,302 | 17,580 | D | riskante_regel |
| 438 | `verhältnißmäßig` | → | `verhältnismäßig` | Adjektiv | 2,301 | 4,379 | B | schwache_dominanz |
| 439 | `geräthschaft` | → | `gerätschaft` | Substantiv | 2,280 | 8,176 | A |  |
| 440 | `demüthigung` | → | `demütigung` | Substantiv | 2,255 | 10,501 | A |  |
| 441 | `leuthe` | → | `leute` | Substantiv | 2,229 | 923,795 | A |  |
| 442 | `veranlaßt` | → | `veranlasst` | Adjektiv | 2,226 | 5,685 | B | laenger |
| 443 | `kapitalwerth` | → | `kapitalwert` | Substantiv | 2,222 | 3,447 | A | schwache_dominanz |
| 444 | `discussion` | → | `diskussion` | Substantiv | 2,219 | 403,760 | D | riskante_regel |
| 445 | `congress` | → | `kongress` | Substantiv | 2,215 | 105,500 | D | riskante_regel |
| 446 | `beysammen` | → | `beisammen` | Verb | 2,206 | 3,021 | C | schwache_dominanz |
| 447 | `feldspath` | → | `feldspat` | Substantiv | 2,204 | 2,221 | A | schwache_dominanz |
| 448 | `eßbar` | → | `essbar` | Adjektiv | 2,201 | 2,498 | B | laenger,schwache_dominanz |
| 449 | `eygen` | → | `eigen` | Adjektiv | 2,184 | 2,174,225 | C |  |
| 450 | `epheu` | → | `efeu` | Substantiv | 2,168 | 2,481 | E | schwache_dominanz,riskante_regel |
| 451 | `america` | → | `amerika` | Substantiv | 2,158 | 31,871 | D | riskante_regel |
| 452 | `bewusstseyn` | → | `bewusstsein` | Substantiv | 2,142 | 54,697 | C |  |
| 453 | `formiren` | → | `formieren` | Verb | 2,136 | 29,526 | C | laenger |
| 454 | `centralgewalt` | → | `zentralgewalt` | Substantiv | 2,121 | 2,456 | D | schwache_dominanz,riskante_regel |
| 455 | `beybringen` | → | `beibringen` | Verb | 2,118 | 104,286 | C |  |
| 456 | `africa` | → | `afrika` | Substantiv | 2,117 | 32,836 | D | riskante_regel |
| 457 | `rathschlag` | → | `ratschlag` | Substantiv | 2,115 | 21,453 | A |  |
| 458 | `circulation` | → | `zirkulation` | Substantiv | 2,109 | 2,569 | D | schwache_dominanz,riskante_regel |
| 459 | `flußbett` | → | `flussbett` | Substantiv | 2,106 | 5,636 | B | laenger |
| 460 | `röthen` | → | `röten` | Verb | 2,103 | 8,612 | A |  |
| 461 | `säugethier` | → | `säugetier` | Substantiv | 2,097 | 24,904 | A |  |
| 462 | `heidenthum` | → | `heidentum` | Substantiv | 2,091 | 5,133 | A |  |
| 463 | `rudolph` | → | `rudolf` | Substantiv | 2,066 | 59,688 | E | riskante_regel |
| 464 | `zumuthung` | → | `zumutung` | Substantiv | 2,059 | 4,107 | A | schwache_dominanz |
| 465 | `mexico` | → | `mexiko` | Substantiv | 2,055 | 46,960 | D | riskante_regel |
| 466 | `nothlage` | → | `notlage` | Substantiv | 2,051 | 35,133 | A |  |
| 467 | `flüßchen` | → | `flüsschen` | Substantiv | 2,048 | 5,224 | B | laenger |
| 468 | `erforderniß` | → | `erfordernis` | Substantiv | 2,036 | 79,134 | B |  |
| 469 | `vertheuerung` | → | `verteuerung` | Substantiv | 2,031 | 11,081 | A |  |
| 470 | `miethen` | → | `mieten` | Verb | 2,025 | 48,612 | A |  |
| 471 | `verantwortungsbewußt` | → | `verantwortungsbewusst` | Adjektiv | 2,015 | 2,783 | B | laenger,schwache_dominanz |
| 472 | `zweyte` | → | `zweite` | Adjektiv | 2,012 | 3,122,127 | C |  |
| 473 | `mercklich` | → | `merklich` | Adjektiv | 2,009 | 12,699 | D | riskante_regel |
| 474 | `landwirth` | → | `landwirt` | Substantiv | 2,006 | 104,830 | A |  |
| 475 | `consequenz` | → | `konsequenz` | Substantiv | 2,004 | 206,665 | D | riskante_regel |
| 476 | `heyrathen` | → | `heiraten` | Verb | 2,003 | 696,887 | C |  |
| 477 | `einflußreichst` | → | `einflussreichst` | Adjektiv | 1,980 | 11,795 | B | laenger |
| 478 | `mißverständniß` | → | `missverständnis` | Substantiv | 1,977 | 13,773 | B | laenger |
| 479 | `convent` | → | `konvent` | Substantiv | 1,976 | 17,351 | D | riskante_regel |
| 480 | `dreyfaltigkeit` | → | `dreifaltigkeit` | Substantiv | 1,968 | 9,869 | C |  |
| 481 | `adolph` | → | `adolf` | Substantiv | 1,967 | 27,074 | E | riskante_regel |
| 482 | `bewirthen` | → | `bewirten` | Verb | 1,967 | 12,447 | A |  |
| 483 | `advocat` | → | `advokat` | Substantiv | 1,956 | 8,078 | D | riskante_regel |
| 484 | `wircken` | → | `wirken` | Verb | 1,953 | 903,509 | D | riskante_regel |
| 485 | `coalition` | → | `koalition` | Substantiv | 1,943 | 321,081 | D | riskante_regel |
| 486 | `erbtheil` | → | `erbteil` | Substantiv | 1,943 | 5,107 | A |  |
| 487 | `esthland` | → | `estland` | Substantiv | 1,934 | 15,061 | A |  |
| 488 | `überflüßig` | → | `überflüssig` | Adjektiv | 1,931 | 38,433 | B | laenger |
| 489 | `morgenröthe` | → | `morgenröte` | Substantiv | 1,921 | 3,416 | A | schwache_dominanz |
| 490 | `graphiker` | → | `grafiker` | Substantiv | 1,920 | 15,543 | E | riskante_regel |
| 491 | `eßig` | → | `essig` | Substantiv | 1,918 | 18,280 | B | laenger |
| 492 | `kassiren` | → | `kassieren` | Verb | 1,913 | 93,652 | C | laenger |
| 493 | `betrübniß` | → | `betrübnis` | Substantiv | 1,908 | 1,942 | B | schwache_dominanz |
| 494 | `gewerbthätigkeit` | → | `gewerbtätigkeit` | Substantiv | 1,902 | 2,117 | A | schwache_dominanz |
| 495 | `verheirathet` | → | `verheiratet` | Adjektiv | 1,892 | 32,640 | A |  |
| 496 | `concret` | → | `konkret` | Adjektiv | 1,885 | 368,850 | D | riskante_regel |
| 497 | `bethätigung` | → | `betätigung` | Substantiv | 1,882 | 50,929 | A |  |
| 498 | `cardinal` | → | `kardinal` | Substantiv | 1,878 | 39,296 | D | riskante_regel |
| 499 | `austheilen` | → | `austeilen` | Verb | 1,872 | 10,138 | A |  |
| 500 | `hochmüthig` | → | `hochmütig` | Adjektiv | 1,872 | 3,286 | A | schwache_dominanz |

## 3. Verdaechtige Faelle (separat gelistet)

### `riskante_regel` - 5,679 Faelle

Regel aus Block D/E (c/y/ph/dt) - hoehere Fehlerneigung.

| alt | -> | korrekt | POS | f_alt | f_korrekt | Regel |
|---|---|---|---|---:|---:|---|
| `club` | → | `klub` | Substantiv | 94,642 | 151,415 | regel:c->k |
| `carl` | → | `karl` | Substantiv | 63,733 | 306,768 | regel:c->k |
| `todt` | → | `tot` | Adjektiv | 32,504 | 96,517 | regel:dt->t |
| `mercken` | → | `merken` | Verb | 28,728 | 419,622 | regel:Ck->k |
| `gedencken` | → | `gedenken` | Verb | 26,714 | 238,914 | regel:Ck->k |
| `capitel` | → | `kapitel` | Substantiv | 25,531 | 186,522 | regel:c->k |
| `volck` | → | `volk` | Substantiv | 23,321 | 1,548,684 | regel:Ck->k |
| `graphisch` | → | `grafisch` | Adjektiv | 22,983 | 30,845 | regel:ph->f |
| `corps` | → | `korps` | Substantiv | 22,844 | 45,055 | regel:c->k |
| `werck` | → | `werk` | Substantiv | 21,522 | 1,335,535 | regel:Ck->k |
| `cultur` | → | `kultur` | Substantiv | 18,931 | 440,095 | regel:c->k |
| `starck` | → | `stark` | Adjektiv | 18,742 | 993,124 | regel:Ck->k |
| `stephan` | → | `stefan` | Substantiv | 17,291 | 43,979 | regel:ph->f |
| `dancken` | → | `danken` | Verb | 15,079 | 418,164 | regel:Ck->k |
| `colonie` | → | `kolonie` | Substantiv | 14,755 | 186,270 | regel:c->k |
| `dencken` | → | `denken` | Verb | 12,162 | 2,166,563 | regel:Ck->k |
| `jacob` | → | `jakob` | Substantiv | 12,157 | 30,289 | regel:c->k |
| `consul` | → | `konsul` | Substantiv | 11,965 | 55,130 | regel:c->k |
| `demographisch` | → | `demografisch` | Adjektiv | 11,783 | 19,689 | regel:ph->f |
| `canal` | → | `kanal` | Substantiv | 11,551 | 174,101 | regel:c->k |
| `photographisch` | → | `fotografisch` | Adjektiv | 10,309 | 13,586 | regel:ph->f |
| `elephant` | → | `elefant` | Substantiv | 9,861 | 37,568 | regel:ph->f |
| `marcus` | → | `markus` | Substantiv | 9,586 | 31,801 | regel:c->k |
| `kranckheit` | → | `krankheit` | Substantiv | 9,411 | 312,658 | regel:Ck->k |
| `classe` | → | `klasse` | Substantiv | 9,340 | 506,939 | regel:c->k |
| `willy` | → | `willi` | Substantiv | 9,271 | 10,155 | regel:y->i |
| `bedencken` | → | `bedenken` | Verb | 9,234 | 275,914 | regel:Ck->k |
| `vertical` | → | `vertikal` | Adjektiv | 9,104 | 32,202 | regel:c->k |
| `sacrament` | → | `sakrament` | Substantiv | 8,435 | 27,495 | regel:c->k |
| `linck` | → | `link` | Adjektiv | 8,134 | 416,920 | regel:Ck->k |
| `creatur` | → | `kreatur` | Substantiv | 7,859 | 10,602 | regel:c->k |
| `trincken` | → | `trinken` | Verb | 7,785 | 395,235 | regel:Ck->k |
| `kayser` | → | `kaiser` | Substantiv | 7,703 | 1,006,865 | regel:y->i |
| `centner` | → | `zentner` | Substantiv | 7,662 | 11,358 | regel:c->z |
| `centrum` | → | `zentrum` | Substantiv | 7,633 | 376,848 | regel:c->z |
| `construiren` | → | `konstruieren` | Verb | 7,589 | 56,787 | regel:iren->ieren+c->k |
| `constant` | → | `konstant` | Adjektiv | 7,555 | 37,155 | regel:c->k |
| `stärcken` | → | `stärken` | Verb | 7,354 | 384,196 | regel:Ck->k |
| `college` | → | `kollege` | Substantiv | 7,056 | 782,031 | regel:c->k |
| `photographie` | → | `fotografie` | Substantiv | 6,851 | 48,752 | regel:ph->f |
| `commune` | → | `kommune` | Substantiv | 6,432 | 158,482 | regel:c->k |
| `collegium` | → | `kollegium` | Substantiv | 6,370 | 10,603 | regel:c->k |
| `confession` | → | `konfession` | Substantiv | 6,340 | 54,902 | regel:c->k |
| `scala` | → | `skala` | Substantiv | 6,230 | 7,886 | regel:c->k |
| `autobiographisch` | → | `autobiografisch` | Adjektiv | 6,228 | 8,042 | regel:ph->f |
| `styl` | → | `stil` | Substantiv | 6,035 | 329,393 | regel:y->i |
| `ceremonie` | → | `zeremonie` | Substantiv | 5,958 | 22,754 | regel:c->z |
| `continent` | → | `kontinent` | Substantiv | 5,900 | 66,041 | regel:c->k |
| `locomotive` | → | `lokomotive` | Substantiv | 5,884 | 138,573 | regel:c->k |
| `würckung` | → | `würkung` | Substantiv | 5,741 | 5,822 | regel:Ck->k |
| `constitution` | → | `konstitution` | Substantiv | 5,422 | 10,509 | regel:c->k |
| `secunde` | → | `sekunde` | Substantiv | 5,338 | 91,903 | regel:c->k |
| `classisch` | → | `klassisch` | Adjektiv | 5,246 | 205,500 | regel:c->k |
| `ralph` | → | `ralf` | Substantiv | 5,132 | 10,509 | regel:ph->f |
| `danck` | → | `dank` | Substantiv | 5,116 | 146,193 | regel:Ck->k |
| `civilisation` | → | `zivilisation` | Substantiv | 5,007 | 22,168 | regel:c->z |
| `modification` | → | `modifikation` | Substantiv | 4,839 | 16,065 | regel:c->k |
| `autobiographie` | → | `autobiografie` | Substantiv | 4,809 | 7,396 | regel:ph->f |
| `constitutionell` | → | `konstitutionell` | Adjektiv | 4,798 | 19,708 | regel:c->k |
| `winckel` | → | `winkel` | Substantiv | 4,619 | 129,505 | regel:Ck->k |
| `schencken` | → | `schenken` | Verb | 4,593 | 411,336 | regel:Ck->k |
| `conisch` | → | `konisch` | Adjektiv | 4,537 | 9,918 | regel:c->k |
| `conrad` | → | `konrad` | Substantiv | 4,390 | 39,734 | regel:c->k |
| `stärcke` | → | `stärke` | Substantiv | 4,374 | 245,154 | regel:Ck->k |
| `capital` | → | `kapital` | Substantiv | 4,163 | 183,583 | regel:c->k |
| `graph` | → | `graf` | Substantiv | 4,078 | 397,936 | regel:ph->f |
| `sky` | → | `ski` | Substantiv | 4,077 | 5,270 | regel:y->i |
| `publicum` | → | `publikum` | Substantiv | 4,059 | 233,537 | regel:c->k |
| `schwerdt` | → | `schwert` | Substantiv | 4,027 | 214,869 | regel:dt->t |
| `sylbe` | → | `silbe` | Substantiv | 4,016 | 31,295 | regel:y->i |
| `westphälisch` | → | `westfälisch` | Adjektiv | 3,874 | 41,419 | regel:ph->f |
| `sclave` | → | `sklave` | Substantiv | 3,782 | 62,520 | regel:c->k |
| `credit` | → | `kredit` | Substantiv | 3,750 | 124,322 | regel:c->k |
| `cement` | → | `zement` | Substantiv | 3,739 | 5,210 | regel:c->z |
| `cap` | → | `kap` | Substantiv | 3,728 | 29,577 | regel:c->k |
| `gyps` | → | `gips` | Substantiv | 3,724 | 8,664 | regel:y->i |
| `wirckung` | → | `wirkung` | Substantiv | 3,706 | 743,807 | regel:Ck->k |
| `raphael` | → | `rafael` | Substantiv | 3,691 | 3,833 | regel:ph->f |
| `columbus` | → | `kolumbus` | Substantiv | 3,681 | 4,909 | regel:c->k |
| `carst` | → | `karst` | Substantiv | 3,678 | 5,137 | regel:c->k |
| `central` | → | `zentral` | Adjektiv | 3,621 | 348,912 | regel:c->z |
| `brodt` | → | `brot` | Substantiv | 3,581 | 175,630 | regel:dt->t |
| `may` | → | `mai` | Substantiv | 3,534 | 592,638 | regel:y->i |
| `basilica` | → | `basilika` | Substantiv | 3,483 | 18,568 | regel:c->k |
| `academie` | → | `akademie` | Substantiv | 3,385 | 393,296 | regel:c->k |
| `telephon` | → | `telefon` | Substantiv | 3,332 | 31,426 | regel:ph->f |
| `curve` | → | `kurve` | Substantiv | 3,285 | 45,926 | regel:c->k |
| `schenckel` | → | `schenkel` | Substantiv | 3,281 | 27,070 | regel:Ck->k |
| `cleve` | → | `kleve` | Substantiv | 3,255 | 4,334 | regel:c->k |
| `fabrication` | → | `fabrikation` | Substantiv | 3,220 | 13,309 | regel:c->k |
| `graphik` | → | `grafik` | Substantiv | 3,187 | 35,346 | regel:ph->f |
| `celle` | → | `zelle` | Substantiv | 3,180 | 126,822 | regel:c->z |
| `tyrol` | → | `tirol` | Substantiv | 3,174 | 19,672 | regel:y->i |
| `canon` | → | `kanon` | Substantiv | 3,142 | 6,934 | regel:c->k |
| `composition` | → | `komposition` | Substantiv | 3,138 | 85,222 | regel:c->k |
| `consistenz` | → | `konsistenz` | Substantiv | 3,095 | 6,849 | regel:c->k |
| `constantin` | → | `konstantin` | Substantiv | 3,065 | 8,724 | regel:c->k |
| `pornographisch` | → | `pornografisch` | Adjektiv | 2,998 | 3,496 | regel:ph->f |
| `cron` | → | `kron` | Substantiv | 2,979 | 3,412 | regel:c->k |
| `civilprozeßordnung` | → | `zivilprozeßordnung` | Substantiv | 2,966 | 4,868 | regel:c->z |
| … | | | | | | *(5,579 weitere)* |

### `laenger` - 2,677 Faelle

korrekte Form ist LAENGER als die alte (Plan-Laengencheck). Bei Block B ist das der Normalfall (ss -> ss), sonst pruefen.

| alt | -> | korrekt | POS | f_alt | f_korrekt | Regel |
|---|---|---|---|---:|---:|---|
| `ausschuß` | → | `ausschuss` | Substantiv | 178,811 | 408,550 | regel:sz->ss |
| `veranlaßen` | → | `veranlassen` | Verb | 170,208 | 239,962 | regel:sz->ss |
| `rußland` | → | `russland` | Substantiv | 126,712 | 268,030 | regel:sz->ss |
| `abschluß` | → | `abschluss` | Substantiv | 93,784 | 389,303 | regel:sz->ss |
| `mißbrauch` | → | `missbrauch` | Substantiv | 55,250 | 86,676 | regel:sz->ss |
| `beschlußempfehlung` | → | `beschlussempfehlung` | Substantiv | 54,637 | 115,609 | regel:sz->ss |
| `mißbrauchen` | → | `missbrauchen` | Verb | 40,304 | 45,643 | regel:sz->ss |
| `beeinflußen` | → | `beeinflussen` | Verb | 38,077 | 260,305 | regel:sz->ss |
| `existiren` | → | `existieren` | Verb | 26,529 | 381,114 | regel:iren->ieren |
| `anschluß` | → | `anschluss` | Substantiv | 21,675 | 179,516 | regel:sz->ss |
| `ausschluß` | → | `ausschluss` | Substantiv | 20,428 | 55,850 | regel:sz->ss |
| `passiren` | → | `passieren` | Verb | 19,932 | 458,965 | regel:iren->ieren |
| `kongreß` | → | `kongress` | Substantiv | 16,870 | 105,500 | regel:sz->ss |
| `bewußt` | → | `bewusst` | Adjektiv | 16,353 | 31,397 | regel:sz->ss |
| `schlußfolgerung` | → | `schlussfolgerung` | Substantiv | 14,519 | 22,728 | regel:sz->ss |
| `haushaltsausschuß` | → | `haushaltsausschuss` | Substantiv | 14,305 | 36,064 | regel:sz->ss |
| `aufschluß` | → | `aufschluss` | Substantiv | 11,777 | 26,033 | regel:sz->ss |
| `verfaßen` | → | `verfassen` | Verb | 11,519 | 283,468 | regel:sz->ss |
| `nebenfluß` | → | `nebenfluss` | Substantiv | 10,106 | 49,871 | regel:sz->ss |
| `laßen` | → | `lassen` | Verb | 9,813 | 9,665,927 | regel:sz->ss |
| `mißlingen` | → | `misslingen` | Verb | 8,941 | 11,628 | regel:sz->ss |
| `abfluß` | → | `abfluss` | Substantiv | 8,832 | 24,291 | regel:sz->ss |
| `mißverständnis` | → | `missverständnis` | Substantiv | 8,763 | 13,773 | regel:sz->ss |
| `interessiren` | → | `interessieren` | Verb | 7,767 | 313,887 | regel:iren->ieren |
| `construiren` | → | `konstruieren` | Verb | 7,589 | 56,787 | regel:iren->ieren+c->k |
| `gußeisern` | → | `gusseisern` | Adjektiv | 7,345 | 9,334 | regel:sz->ss |
| `studiren` | → | `studieren` | Verb | 7,275 | 1,375,751 | regel:iren->ieren |
| `einflußreich` | → | `einflussreich` | Adjektiv | 7,182 | 28,917 | regel:sz->ss |
| `mißhandeln` | → | `misshandeln` | Verb | 7,038 | 13,233 | regel:sz->ss |
| `zufluß` | → | `zufluss` | Substantiv | 6,624 | 67,327 | regel:sz->ss |
| `überschuß` | → | `überschuss` | Substantiv | 6,285 | 32,341 | regel:sz->ss |
| `selbstbewußtsein` | → | `selbstbewusstsein` | Substantiv | 6,281 | 13,310 | regel:sz->ss |
| `proceß` | → | `process` | Substantiv | 5,905 | 7,444 | regel:sz->ss |
| `rechtsausschuß` | → | `rechtsausschuss` | Substantiv | 5,194 | 18,171 | regel:sz->ss |
| `zusammenschluß` | → | `zusammenschluss` | Substantiv | 5,083 | 57,313 | regel:sz->ss |
| `unbewußt` | → | `unbewusst` | Adjektiv | 4,881 | 5,132 | regel:sz->ss |
| `mißachtung` | → | `missachtung` | Substantiv | 4,642 | 9,693 | regel:sz->ss |
| `vermittlungsausschuß` | → | `vermittlungsausschuss` | Substantiv | 4,617 | 9,451 | regel:sz->ss |
| `reguliren` | → | `regulieren` | Verb | 4,582 | 26,290 | regel:iren->ieren |
| `verschluß` | → | `verschluss` | Substantiv | 4,565 | 10,134 | regel:sz->ss |
| `prozeßbevollmächtigt` | → | `prozessbevollmächtigt` | Substantiv | 4,541 | 5,987 | regel:sz->ss |
| `absorbiren` | → | `absorbieren` | Verb | 4,351 | 8,214 | regel:iren->ieren |
| `ungewißheit` | → | `ungewissheit` | Substantiv | 4,272 | 4,645 | regel:sz->ss |
| `flüßig` | → | `flüssig` | Adjektiv | 4,230 | 74,910 | regel:sz->ss |
| `mißverhältnis` | → | `missverhältnis` | Substantiv | 4,225 | 5,125 | regel:sz->ss |
| `mißbräuchlich` | → | `missbräuchlich` | Adjektiv | 4,197 | 7,839 | regel:sz->ss |
| `verläßlich` | → | `verlässlich` | Adjektiv | 4,115 | 27,882 | regel:sz->ss |
| `fixiren` | → | `fixieren` | Verb | 3,878 | 30,419 | regel:iren->ieren |
| `protestiren` | → | `protestieren` | Verb | 3,749 | 80,805 | regel:iren->ieren |
| `zitiren` | → | `zitieren` | Verb | 3,653 | 319,032 | regel:iren->ieren |
| `charakterisiren` | → | `charakterisieren` | Verb | 3,571 | 42,854 | regel:iren->ieren |
| `prozeßkostenhilfe` | → | `prozesskostenhilfe` | Substantiv | 3,421 | 15,865 | regel:sz->ss |
| `flüßigkeit` | → | `flüssigkeit` | Substantiv | 3,410 | 151,044 | regel:sz->ss |
| `erpreßen` | → | `erpressen` | Verb | 3,259 | 10,343 | regel:sz->ss |
| `innenausschuß` | → | `innenausschuss` | Substantiv | 3,222 | 13,510 | regel:sz->ss |
| `motiviren` | → | `motivieren` | Verb | 3,051 | 40,549 | regel:iren->ieren |
| `probiren` | → | `probieren` | Verb | 3,026 | 44,569 | regel:iren->ieren |
| `neutralisiren` | → | `neutralisieren` | Verb | 3,011 | 4,814 | regel:iren->ieren |
| `untersuchungsausschuß` | → | `untersuchungsausschuss` | Substantiv | 3,003 | 27,718 | regel:sz->ss |
| `mißstand` | → | `missstand` | Substantiv | 2,947 | 14,617 | regel:sz->ss |
| `produziren` | → | `produzieren` | Verb | 2,914 | 464,409 | regel:iren->ieren |
| `finanzausschuß` | → | `finanzausschuss` | Substantiv | 2,890 | 16,651 | regel:sz->ss |
| `unterausschuß` | → | `unterausschuss` | Substantiv | 2,844 | 8,165 | regel:sz->ss |
| `sproß` | → | `spross` | Substantiv | 2,768 | 4,412 | regel:sz->ss |
| `marschiren` | → | `marschieren` | Verb | 2,728 | 61,820 | regel:iren->ieren |
| `einflußnahme` | → | `einflussnahme` | Substantiv | 2,715 | 13,812 | regel:sz->ss |
| `verfaßt` | → | `verfasst` | Adjektiv | 2,698 | 24,546 | regel:sz->ss |
| `diskutiren` | → | `diskutieren` | Verb | 2,685 | 446,736 | regel:iren->ieren |
| `selbstbewußt` | → | `selbstbewusst` | Adjektiv | 2,627 | 8,752 | regel:sz->ss |
| `variiren` | → | `variieren` | Verb | 2,615 | 71,372 | regel:iren->ieren |
| `zweigeschoßig` | → | `zweigeschossig` | Adjektiv | 2,577 | 30,813 | regel:sz->ss |
| `congreß` | → | `kongress` | Substantiv | 2,550 | 105,500 | regel:sz->ss+c->k |
| `wißen` | → | `wissen` | Verb | 2,496 | 4,758,213 | regel:sz->ss |
| `ruiniren` | → | `ruinieren` | Verb | 2,475 | 17,511 | regel:iren->ieren |
| `zusammenfaßen` | → | `zusammenfassen` | Verb | 2,411 | 184,152 | regel:sz->ss |
| `mißlungen` | → | `misslungen` | Adjektiv | 2,382 | 2,413 | regel:sz->ss |
| `oxydiren` | → | `oxidieren` | Verb | 2,366 | 4,659 | regel:iren->ieren+y->i |
| `vorschuß` | → | `vorschuss` | Substantiv | 2,347 | 4,287 | regel:sz->ss |
| `veranlaßt` | → | `veranlasst` | Adjektiv | 2,226 | 5,685 | regel:sz->ss |
| `eßbar` | → | `essbar` | Adjektiv | 2,201 | 2,498 | regel:sz->ss |
| `formiren` | → | `formieren` | Verb | 2,136 | 29,526 | regel:iren->ieren |
| `flußbett` | → | `flussbett` | Substantiv | 2,106 | 5,636 | regel:sz->ss |
| `flüßchen` | → | `flüsschen` | Substantiv | 2,048 | 5,224 | regel:sz->ss |
| `verantwortungsbewußt` | → | `verantwortungsbewusst` | Adjektiv | 2,015 | 2,783 | regel:sz->ss |
| `einflußreichst` | → | `einflussreichst` | Adjektiv | 1,980 | 11,795 | regel:sz->ss |
| `mißverständniß` | → | `missverständnis` | Substantiv | 1,977 | 13,773 | regel:sz->ss+nisz->nis |
| `überflüßig` | → | `überflüssig` | Adjektiv | 1,931 | 38,433 | regel:sz->ss |
| `eßig` | → | `essig` | Substantiv | 1,918 | 18,280 | regel:sz->ss |
| `kassiren` | → | `kassieren` | Verb | 1,913 | 93,652 | regel:iren->ieren |
| `mißerfolg` | → | `misserfolg` | Substantiv | 1,867 | 8,428 | regel:sz->ss |
| `patentiren` | → | `patentieren` | Verb | 1,839 | 4,167 | regel:iren->ieren |
| `repräsentiren` | → | `repräsentieren` | Verb | 1,824 | 70,592 | regel:iren->ieren |
| `mißachten` | → | `missachten` | Verb | 1,816 | 17,043 | regel:sz->ss |
| `prozeßbevollmächtigte` | → | `prozessbevollmächtigte` | Substantiv | 1,735 | 38,601 | regel:sz->ss |
| `orientiren` | → | `orientieren` | Verb | 1,722 | 194,321 | regel:iren->ieren |
| `zusammenfluß` | → | `zusammenfluss` | Substantiv | 1,661 | 6,517 | regel:sz->ss |
| `akzeptiren` | → | `akzeptieren` | Verb | 1,604 | 198,012 | regel:iren->ieren |
| `beschluß` | → | `beschluss` | Substantiv | 1,597 | 1,314,982 | regel:sz->ss |
| `garantiren` | → | `garantieren` | Verb | 1,572 | 113,969 | regel:iren->ieren |
| `revidiren` | → | `revidieren` | Verb | 1,536 | 23,305 | regel:iren->ieren |
| … | | | | | | *(2,577 weitere)* |

### `schwache_dominanz` - 1,997 Faelle

das Ziel ist weniger als doppelt so haeufig wie die Ausgangsform - der Frequenzwaechter greift hier nur knapp.

| alt | -> | korrekt | POS | f_alt | f_korrekt | Regel |
|---|---|---|---|---:|---:|---|
| `veranlaßen` | → | `veranlassen` | Verb | 170,208 | 239,962 | regel:sz->ss |
| `theils` | → | `teils` | Adverb | 110,519 | 132,650 | regel:th->t |
| `club` | → | `klub` | Substantiv | 94,642 | 151,415 | regel:c->k |
| `nöthigen` | → | `nötigen` | Verb | 77,333 | 94,153 | regel:th->t |
| `mißbrauch` | → | `missbrauch` | Substantiv | 55,250 | 86,676 | regel:sz->ss |
| `thräne` | → | `träne` | Substantiv | 45,359 | 75,423 | regel:th->t |
| `mißbrauchen` | → | `missbrauchen` | Verb | 40,304 | 45,643 | regel:sz->ss |
| `thierisch` | → | `tierisch` | Adjektiv | 31,309 | 32,117 | regel:th->t |
| `graphisch` | → | `grafisch` | Adjektiv | 22,983 | 30,845 | regel:ph->f |
| `corps` | → | `korps` | Substantiv | 22,844 | 45,055 | regel:c->k |
| `bewußt` | → | `bewusst` | Adjektiv | 16,353 | 31,397 | regel:sz->ss |
| `roth` | → | `rot` | Substantiv | 16,111 | 30,168 | regel:th->t |
| `alterthum` | → | `altertum` | Substantiv | 15,796 | 31,101 | regel:th->t |
| `thun` | → | `tun` | Substantiv | 14,792 | 24,591 | regel:th->t |
| `schlußfolgerung` | → | `schlussfolgerung` | Substantiv | 14,519 | 22,728 | regel:sz->ss |
| `drey` | → | `drei` | Adjektiv | 12,351 | 17,564 | regel:ey->ei |
| `nachtheilig` | → | `nachteilig` | Adjektiv | 11,988 | 18,915 | regel:th->t |
| `demographisch` | → | `demografisch` | Adjektiv | 11,783 | 19,689 | regel:ph->f |
| `werth` | → | `wert` | Adjektiv | 11,648 | 17,374 | regel:th->t |
| `photographisch` | → | `fotografisch` | Adjektiv | 10,309 | 13,586 | regel:ph->f |
| `willy` | → | `willi` | Substantiv | 9,271 | 10,155 | regel:y->i |
| `mißlingen` | → | `misslingen` | Verb | 8,941 | 11,628 | regel:sz->ss |
| `mißverständnis` | → | `missverständnis` | Substantiv | 8,763 | 13,773 | regel:sz->ss |
| `anmuthig` | → | `anmutig` | Adjektiv | 8,441 | 12,925 | regel:th->t |
| `vortheilhaft` | → | `vorteilhaft` | Adjektiv | 8,165 | 15,843 | regel:th->t |
| `mitgetheilt` | → | `mitgeteilt` | Adjektiv | 7,941 | 10,930 | regel:th->t |
| `creatur` | → | `kreatur` | Substantiv | 7,859 | 10,602 | regel:c->k |
| `finsterniß` | → | `finsternis` | Substantiv | 7,782 | 14,543 | regel:nisz->nis |
| `centner` | → | `zentner` | Substantiv | 7,662 | 11,358 | regel:c->z |
| `gußeisern` | → | `gusseisern` | Adjektiv | 7,345 | 9,334 | regel:sz->ss |
| `genugthuung` | → | `genugtuung` | Substantiv | 7,260 | 12,215 | regel:th->t |
| `mißhandeln` | → | `misshandeln` | Verb | 7,038 | 13,233 | regel:sz->ss |
| `errathen` | → | `erraten` | Verb | 6,371 | 10,693 | regel:th->t |
| `collegium` | → | `kollegium` | Substantiv | 6,370 | 10,603 | regel:c->k |
| `scala` | → | `skala` | Substantiv | 6,230 | 7,886 | regel:c->k |
| `autobiographisch` | → | `autobiografisch` | Adjektiv | 6,228 | 8,042 | regel:ph->f |
| `demuth` | → | `demut` | Substantiv | 6,122 | 11,699 | regel:th->t |
| `proceß` | → | `process` | Substantiv | 5,905 | 7,444 | regel:sz->ss |
| `würckung` | → | `würkung` | Substantiv | 5,741 | 5,822 | regel:Ck->k |
| `constitution` | → | `konstitution` | Substantiv | 5,422 | 10,509 | regel:c->k |
| `legationsrath` | → | `legationsrat` | Substantiv | 5,331 | 7,884 | regel:th->t |
| `gutmüthig` | → | `gutmütig` | Adjektiv | 5,062 | 7,898 | regel:th->t |
| `oberregierungsrath` | → | `oberregierungsrat` | Substantiv | 5,047 | 6,269 | regel:th->t |
| `wehmuth` | → | `wehmut` | Substantiv | 4,884 | 8,064 | regel:th->t |
| `unbewußt` | → | `unbewusst` | Adjektiv | 4,881 | 5,132 | regel:sz->ss |
| `autobiographie` | → | `autobiografie` | Substantiv | 4,809 | 7,396 | regel:ph->f |
| `prozeßbevollmächtigt` | → | `prozessbevollmächtigt` | Substantiv | 4,541 | 5,987 | regel:sz->ss |
| `thatkraft` | → | `tatkraft` | Substantiv | 4,431 | 8,613 | regel:th->t |
| `absorbiren` | → | `absorbieren` | Verb | 4,351 | 8,214 | regel:iren->ieren |
| `ungewißheit` | → | `ungewissheit` | Substantiv | 4,272 | 4,645 | regel:sz->ss |
| `mißverhältnis` | → | `missverhältnis` | Substantiv | 4,225 | 5,125 | regel:sz->ss |
| `mißbräuchlich` | → | `missbräuchlich` | Adjektiv | 4,197 | 7,839 | regel:sz->ss |
| `sky` | → | `ski` | Substantiv | 4,077 | 5,270 | regel:y->i |
| `übermüthig` | → | `übermütig` | Adjektiv | 4,071 | 7,722 | regel:th->t |
| `zertheilen` | → | `zerteilen` | Verb | 4,009 | 5,351 | regel:th->t |
| `theer` | → | `teer` | Substantiv | 3,836 | 3,921 | regel:th->t |
| `demüthig` | → | `demütig` | Adjektiv | 3,829 | 5,645 | regel:th->t |
| `röthe` | → | `röte` | Substantiv | 3,821 | 3,966 | regel:th->t |
| `cement` | → | `zement` | Substantiv | 3,739 | 5,210 | regel:c->z |
| `raphael` | → | `rafael` | Substantiv | 3,691 | 3,833 | regel:ph->f |
| `columbus` | → | `kolumbus` | Substantiv | 3,681 | 4,909 | regel:c->k |
| `carst` | → | `karst` | Substantiv | 3,678 | 5,137 | regel:c->k |
| `selbstthätig` | → | `selbsttätig` | Adjektiv | 3,515 | 3,796 | regel:th->t |
| `gewaltthätigkeit` | → | `gewalttätigkeit` | Substantiv | 3,411 | 5,143 | regel:th->t |
| `cleve` | → | `kleve` | Substantiv | 3,255 | 4,334 | regel:c->k |
| `ruthe` | → | `rute` | Substantiv | 3,202 | 5,131 | regel:th->t |
| `koth` | → | `kot` | Substantiv | 3,057 | 5,044 | regel:th->t |
| `neutralisiren` | → | `neutralisieren` | Verb | 3,011 | 4,814 | regel:iren->ieren |
| `pornographisch` | → | `pornografisch` | Adjektiv | 2,998 | 3,496 | regel:ph->f |
| `cron` | → | `kron` | Substantiv | 2,979 | 3,412 | regel:c->k |
| `civilprozeßordnung` | → | `zivilprozeßordnung` | Substantiv | 2,966 | 4,868 | regel:c->z |
| `corpus` | → | `korpus` | Substantiv | 2,814 | 4,526 | regel:c->k |
| `sproß` | → | `spross` | Substantiv | 2,768 | 4,412 | regel:sz->ss |
| `muthwillig` | → | `mutwillig` | Adjektiv | 2,744 | 4,218 | regel:th->t |
| `citadelle` | → | `zitadelle` | Substantiv | 2,721 | 5,020 | regel:c->z |
| `codieren` | → | `kodieren` | Verb | 2,673 | 4,248 | regel:c->k |
| `orinoco` | → | `orinoko` | Substantiv | 2,456 | 4,456 | regel:c->k |
| `wehmüthig` | → | `wehmütig` | Adjektiv | 2,449 | 3,679 | regel:th->t |
| `fäulniß` | → | `fäulnis` | Substantiv | 2,398 | 3,273 | regel:nisz->nis |
| `hiebey` | → | `hiebei` | Adverb | 2,388 | 2,662 | regel:ey->ei |
| `mißlungen` | → | `misslungen` | Adjektiv | 2,382 | 2,413 | regel:sz->ss |
| `oxydiren` | → | `oxidieren` | Verb | 2,366 | 4,659 | regel:iren->ieren+y->i |
| `vorschuß` | → | `vorschuss` | Substantiv | 2,347 | 4,287 | regel:sz->ss |
| `ehrenwerth` | → | `ehrenwert` | Adjektiv | 2,345 | 4,113 | regel:th->t |
| `großmuth` | → | `großmut` | Substantiv | 2,307 | 2,542 | regel:th->t |
| `verhältnißmäßig` | → | `verhältnismäßig` | Adjektiv | 2,301 | 4,379 | regel:nisz->nis |
| `kapitalwerth` | → | `kapitalwert` | Substantiv | 2,222 | 3,447 | regel:th->t |
| `beysammen` | → | `beisammen` | Verb | 2,206 | 3,021 | regel:ey->ei |
| `feldspath` | → | `feldspat` | Substantiv | 2,204 | 2,221 | regel:th->t |
| `eßbar` | → | `essbar` | Adjektiv | 2,201 | 2,498 | regel:sz->ss |
| `epheu` | → | `efeu` | Substantiv | 2,168 | 2,481 | regel:ph->f |
| `centralgewalt` | → | `zentralgewalt` | Substantiv | 2,121 | 2,456 | regel:c->z |
| `circulation` | → | `zirkulation` | Substantiv | 2,109 | 2,569 | regel:c->k+c->z |
| `zumuthung` | → | `zumutung` | Substantiv | 2,059 | 4,107 | regel:th->t |
| `verantwortungsbewußt` | → | `verantwortungsbewusst` | Adjektiv | 2,015 | 2,783 | regel:sz->ss |
| `morgenröthe` | → | `morgenröte` | Substantiv | 1,921 | 3,416 | regel:th->t |
| `betrübniß` | → | `betrübnis` | Substantiv | 1,908 | 1,942 | regel:nisz->nis |
| `gewerbthätigkeit` | → | `gewerbtätigkeit` | Substantiv | 1,902 | 2,117 | regel:th->t |
| `hochmüthig` | → | `hochmütig` | Adjektiv | 1,872 | 3,286 | regel:th->t |
| `wohlthätigkeit` | → | `wohltätigkeit` | Substantiv | 1,862 | 1,865 | regel:th->t |
| … | | | | | | *(1,897 weitere)* |

### `ziel_nur_einseitig` - 65 Faelle

Zielform kommt nur als Head ODER nur als Dep vor.

| alt | -> | korrekt | POS | f_alt | f_korrekt | Regel |
|---|---|---|---|---:|---:|---|
| `gothenheere` | → | `gotenheere` | Substantiv | 58 | 312 | regel:th->t |
| `thränenleer` | → | `tränenleer` | Verb | 34 | 75 | regel:th->t |
| `elsterthor` | → | `elstertor` | Substantiv | 33 | 47 | regel:th->t |
| `weißmetall` | → | `weissmetall` | Substantiv | 30 | 54 | regel:sz->ss |
| `feindesnoth` | → | `feindesnot` | Substantiv | 26 | 168 | regel:th->t |
| `cathedral` | → | `catedral` | Substantiv | 22 | 24 | regel:th->t |
| `halbthür` | → | `halbtür` | Substantiv | 17 | 37 | regel:th->t |
| `urachthal` | → | `urachtal` | Substantiv | 17 | 77 | regel:th->t |
| `genickschuß` | → | `genickschuss` | Substantiv | 14 | 132 | regel:sz->ss |
| `lyncker` | → | `lynker` | Substantiv | 14 | 30 | regel:Ck->k |
| `mummelseethal` | → | `mummelseetal` | Substantiv | 11 | 20 | regel:th->t |
| `autoclave` | → | `autoklave` | Substantiv | 10 | 14 | regel:c->k |
| `christenthums` | → | `christentums` | Substantiv | 10 | 70 | regel:th->t |
| `recommandation` | → | `rekommandation` | Substantiv | 10 | 13 | regel:c->k |
| `außspeyen` | → | `außspeien` | Verb | 9 | 10 | regel:ey->ei |
| `rennthierhaut` | → | `renntierhaut` | Substantiv | 9 | 20 | regel:th->t |
| `seynstehen` | → | `seinstehen` | Verb | 9 | 12 | regel:ey->ei |
| `disproportioniren` | → | `disproportionieren` | Verb | 8 | 11 | regel:iren->ieren |
| `mitgetheilte` | → | `mitgeteilte` | Substantiv | 8 | 12 | regel:th->t |
| `heuthor` | → | `heutor` | Substantiv | 7 | 18 | regel:th->t |
| `rennthierkalbe` | → | `renntierkalbe` | Substantiv | 7 | 38 | regel:th->t |
| `anerbothen` | → | `anerboten` | Verb | 6 | 10 | regel:th->t |
| `ausgangsthür` | → | `ausgangstür` | Substantiv | 6 | 11 | regel:th->t |
| `carlshaf` | → | `karlshaf` | Substantiv | 6 | 18 | regel:c->k |
| `cellophan` | → | `zellophan` | Substantiv | 6 | 9 | regel:c->z |
| `centnerlast` | → | `zentnerlast` | Substantiv | 6 | 9 | regel:c->z |
| `ehristenthume` | → | `ehristentume` | Substantiv | 6 | 15 | regel:th->t |
| `extrusionsprozeß` | → | `extrusionsprozess` | Substantiv | 6 | 7 | regel:sz->ss |
| `morgeroth` | → | `morgerot` | Substantiv | 6 | 16 | regel:th->t |
| `sonnenroth` | → | `sonnenrot` | Substantiv | 6 | 7 | regel:th->t |
| `thürhaken` | → | `türhaken` | Substantiv | 6 | 34 | regel:th->t |
| `vorangiengen` | → | `vorangingen` | Verb | 6 | 14 | regel:ieng->ing |
| `wohlberathen` | → | `wohlberaten` | Verb | 6 | 13 | regel:th->t |
| `thaltheil` | → | `talteil` | Substantiv | 5 | 9 | regel:th->t |
| `calauria` | → | `kalauria` | Substantiv | 4 | 9 | regel:c->k |
| `christenthnme` | → | `christentnme` | Substantiv | 4 | 23 | regel:th->t |
| `christeuthume` | → | `christeutume` | Substantiv | 4 | 10 | regel:th->t |
| `kirchenthüre` | → | `kirchentüre` | Substantiv | 4 | 8 | regel:th->t |
| `vorbeygehn` | → | `vorbeigehn` | Substantiv | 4 | 71 | regel:ey->ei |
| `ausbeurtheilen` | → | `ausbeurteilen` | Verb | 4 | 17 | regel:th->t |
| `entsproßen` | → | `entsprossen` | Verb | 4 | 11 | regel:sz->ss |
| `hinausgerathen` | → | `hinausgeraten` | Verb | 4 | 8 | regel:th->t |
| `paßiret` | → | `passiret` | Verb | 4 | 16 | regel:sz->ss |
| `werthtragen` | → | `werttragen` | Verb | 4 | 5 | regel:th->t |
| `brayen` | → | `braien` | Adjektiv | 3 | 4 | regel:y->i |
| `fluthzeit` | → | `flutzeit` | Substantiv | 3 | 76 | regel:th->t |
| `freitagsschluß` | → | `freitagsschluss` | Substantiv | 3 | 8 | regel:sz->ss |
| `ja-thür` | → | `ja-tür` | Substantiv | 3 | 69 | regel:th->t |
| `lagermiethe` | → | `lagermiete` | Substantiv | 3 | 13 | regel:th->t |
| `mercklich` | → | `merklich` | Substantiv | 3 | 21 | regel:Ck->k |
| `prozeßbeschleunigung` | → | `prozessbeschleunigung` | Substantiv | 3 | 5 | regel:sz->ss |
| `thränenthau` | → | `tränentau` | Substantiv | 3 | 12 | regel:th->t |
| `vorderthor` | → | `vordertor` | Substantiv | 3 | 26 | regel:th->t |
| `wurffspieße` | → | `wurffspiesse` | Substantiv | 3 | 6 | regel:sz->ss |
| `conspiriren` | → | `konspirieren` | Verb | 3 | 12 | regel:iren->ieren+c->k |
| `dimittiren` | → | `dimittieren` | Verb | 3 | 36 | regel:iren->ieren |
| `einregistriren` | → | `einregistrieren` | Verb | 3 | 4 | regel:iren->ieren |
| `entrißen` | → | `entrissen` | Verb | 3 | 28 | regel:sz->ss |
| `gebißen` | → | `gebissen` | Verb | 3 | 8 | regel:sz->ss |
| `herabthauen` | → | `herabtauen` | Verb | 3 | 10 | regel:th->t |
| `herbeyeilten` | → | `herbeieilten` | Verb | 3 | 9 | regel:ey->ei |
| `intabuliren` | → | `intabulieren` | Verb | 3 | 7 | regel:iren->ieren |
| `konspiriren` | → | `konspirieren` | Verb | 3 | 12 | regel:iren->ieren |
| `zugetruncken` | → | `zugetrunken` | Verb | 3 | 4 | regel:Ck->k |
| `zusammenflößen` | → | `zusammenflössen` | Verb | 3 | 6 | regel:sz->ss |

## 3b. Von mir beim Durchsehen als FALSCH erkannt

Diese Zeilen stehen im Mapping, sind aber nach meiner Einschaetzung keine Schreibvarianten, sondern verschiedene Woerter bzw. verschiedene Namen. Ich empfehle, sie vor dem Merge zu entfernen (`DELETE FROM lemma_corrections WHERE alt IN (...)`) oder Block E ganz zu verwerfen:

| alt | wuerde zu | warum falsch |
|---|---|---|
| `graph` | `graf` | mathematischer Graph ist kein Adelstitel |
| `sky` | `ski` | englisches Wort, kein Schreibvariante von Ski |
| `may` | `mai` | Eigenname (Karl May) faellt mit dem Monatsnamen zusammen |
| `club` | `klub` | beide Schreibungen sind heute gueltig (Duden fuehrt beide) |
| `corps` | `korps` | beide Schreibungen gueltig, unterschiedliche Verwendung |
| `graphisch` | `grafisch` | beide Schreibungen heute gueltig |
| `photographie` | `fotografie` | beide Schreibungen heute gueltig |

Dazu kommt eine ganze Klasse: **Vornamen und Eigennamen** landen in Block D/E, weil die Regeln `c→k`, `ph→f`, `y→i` auf sie zutreffen — `carl→karl`, `jacob→jakob`, `marcus→markus`, `stephan→stefan`, `ralph→ralf`, `willy→willi`, `raphael→rafael`. Das sind reale, verschiedene Namensschreibungen von realen Personen, keine Rechtschreibfehler. Die Lemmata tragen keine Wortart-Markierung `NPROP` (die Pipeline faltet Eigennamen in `Substantiv`), deshalb kann ich sie nicht automatisch aussortieren.

## 4. Cross-Check gegen die Lemmata der App

Lokal verfuegbar sind nur **85 Lemmata** (`phase_c/tageslemmata_2026-08.json` + die 26 Eintraege der lokalen `server/data/signifikation.db`). Die produktive `kalender`-Historie liegt auf Hetzner — dieser Check ist also eine Stichprobe, kein vollstaendiger Regressionsbeweis. Die belastbare Pruefung ist Golden Query #10 nach dem Merge.

Kein von der App gespieltes Lemma steht auf der `alt`-Seite. Keine Regression bei den Tageslemmata zu erwarten.

## 5. Was der Frequenzwaechter verworfen hat

7,278 regelerzeugte Kandidaten wurden verworfen, weil die Ausgangsform haeufiger ist als das Ziel. Diese Liste zeigt, dass der Waechter die Uebernormalisierung wirklich abfaengt:

| bleibt | wuerde sonst | POS | f_bleibt | f_ziel | Regel |
|---|---|---|---:|---:|---|
| `groß` | ~~`gross`~~ | Adjektiv | 7,246,700 | 6 | sz->ss |
| `stadt` | ~~`stat`~~ | Substantiv | 3,282,390 | 5,173 | dt->t |
| `schließlich` | ~~`schliesslich`~~ | Adverb | 902,928 | 19,164 | sz->ss |
| `thema` | ~~`tema`~~ | Substantiv | 700,873 | 34 | th->t |
| `system` | ~~`sistem`~~ | Substantiv | 697,125 | 52 | y->i |
| `preußisch` | ~~`preussisch`~~ | Adjektiv | 602,243 | 7,795 | sz->ss |
| `fuß` | ~~`fuss`~~ | Substantiv | 584,316 | 4 | sz->ss |
| `größe` | ~~`grösse`~~ | Substantiv | 557,655 | 58 | sz->ss |
| `begrüßen` | ~~`begrüssen`~~ | Verb | 506,217 | 21 | sz->ss |
| `maß` | ~~`mass`~~ | Substantiv | 391,778 | 180,613 | sz->ss |
| `bayerisch` | ~~`baierisch`~~ | Adjektiv | 371,875 | 3,476 | y->i |
| `gethan` | ~~`getan`~~ | Verb | 269,546 | 6 | th->t |
| `theater` | ~~`teater`~~ | Substantiv | 249,703 | 9 | th->t |
| `entschließen` | ~~`entschliessen`~~ | Verb | 228,583 | 1,503 | sz->ss |
| `preuße` | ~~`preusse`~~ | Substantiv | 225,618 | 3,626 | sz->ss |
| `bayer` | ~~`baier`~~ | Substantiv | 219,653 | 16,784 | y->i |
| `phase` | ~~`fase`~~ | Substantiv | 210,255 | 30 | ph->f |
| `maßstab` | ~~`massstab`~~ | Substantiv | 187,003 | 8 | sz->ss |
| `vergrößern` | ~~`vergrössern`~~ | Verb | 186,521 | 8,538 | sz->ss |
| `außerordentlich` | ~~`ausserordentlich`~~ | Adjektiv | 169,848 | 10,705 | sz->ss |
| `thuen` | ~~`tuen`~~ | Verb | 163,363 | 22 | th->t |
| `thoma` | ~~`toma`~~ | Substantiv | 151,667 | 644 | th->t |
| `typ` | ~~`tip`~~ | Substantiv | 148,539 | 1,837 | y->i |
| `thron` | ~~`tron`~~ | Substantiv | 144,118 | 142 | th->t |
| `grüßen` | ~~`grüssen`~~ | Verb | 139,496 | 247 | sz->ss |
| `außenminister` | ~~`aussenminister`~~ | Substantiv | 131,151 | 3,795 | sz->ss |
| `zusammenschließen` | ~~`zusammenschliessen`~~ | Verb | 126,684 | 47 | sz->ss |
| `paragraph` | ~~`paragraf`~~ | Substantiv | 103,089 | 4,018 | ph->f |
| `luther` | ~~`luter`~~ | Substantiv | 102,738 | 3 | th->t |
| `spaß` | ~~`spass`~~ | Substantiv | 99,398 | 6 | sz->ss |
| `fleiß` | ~~`fleiss`~~ | Substantiv | 99,038 | 18 | sz->ss |
| `fußball` | ~~`fussball`~~ | Substantiv | 97,635 | 108 | sz->ss |
| `geographisch` | ~~`geografisch`~~ | Adjektiv | 93,885 | 30,807 | ph->f |
| `dreißigjährig` | ~~`dreissigjährig`~~ | Adjektiv | 90,352 | 1,274 | sz->ss |
| `veräußern` | ~~`veräussern`~~ | Verb | 82,247 | 756 | sz->ss |
| `fußballspieler` | ~~`fussballspieler`~~ | Substantiv | 80,760 | 1,061 | sz->ss |
| `philipp` | ~~`filipp`~~ | Substantiv | 79,209 | 20 | ph->f |
| `preußen` | ~~`preussen`~~ | Substantiv | 78,336 | 894 | sz->ss |
| `einbüßen` | ~~`einbüssen`~~ | Verb | 77,179 | 2,789 | sz->ss |
| `physisch` | ~~`phisisch`~~ | Adjektiv | 76,989 | 42 | y->i |
| `bewußtsein` | ~~`bewusstsein`~~ | Substantiv | 69,628 | 54,697 | sz->ss |
| `mathematisch` | ~~`matematisch`~~ | Adjektiv | 68,776 | 12 | th->t |
| `entschließung` | ~~`entschliessung`~~ | Substantiv | 68,326 | 332 | sz->ss |
| `joseph` | ~~`josef`~~ | Substantiv | 65,947 | 53,774 | ph->f |
| `roß` | ~~`ross`~~ | Substantiv | 65,692 | 45,190 | sz->ss |
| `katholik` | ~~`katolik`~~ | Substantiv | 64,970 | 10 | th->t |
| `fleißig` | ~~`fleissig`~~ | Adjektiv | 61,570 | 32 | sz->ss |
| `athen` | ~~`aten`~~ | Substantiv | 59,543 | 6 | th->t |
| `phantasie` | ~~`fantasie`~~ | Substantiv | 58,166 | 11,595 | ph->f |
| `gemäßigt` | ~~`gemässigt`~~ | Adjektiv | 56,257 | 16 | sz->ss |
| `gleichmäßig` | ~~`gleichmässig`~~ | Adjektiv | 55,453 | 105 | sz->ss |
| `angewandt` | ~~`angewant`~~ | Adjektiv | 54,463 | 78 | dt->t |
| `verwandt` | ~~`verwant`~~ | Adjektiv | 53,556 | 30 | dt->t |
| `genuß` | ~~`genuss`~~ | Substantiv | 53,517 | 32,844 | sz->ss |
| `außergewöhnlich` | ~~`aussergewöhnlich`~~ | Adjektiv | 53,441 | 827 | sz->ss |
| `beyd` | ~~`beid`~~ | Adjektiv | 53,253 | 14 | ey->ei |
| `jury` | ~~`juri`~~ | Substantiv | 52,994 | 1,559 | y->i |
| `these` | ~~`tese`~~ | Substantiv | 52,153 | 8 | th->t |
| `geographie` | ~~`geografie`~~ | Substantiv | 49,427 | 3,329 | ph->f |
| `außenpolitik` | ~~`aussenpolitik`~~ | Substantiv | 48,025 | 334 | sz->ss |

## 6. Umfang des Merges (gemessen, nicht geschaetzt)

| Tabelle | Zeilen gesamt | betroffen | Anteil |
|---|---:|---:|---:|
| `collocations` | 25,726,750 | 548,581 | 2.13 % |
| `zeitreise` | 61,199,161 | 1,667,568 | 2.72 % |
| `lemma_corpus_freq` | 25,922,727 | 79,212 | 0.31 % |

Aufteilung in `collocations`: nur `dep_lemma` betroffen 267,865 · nur `lemma` (Head) 268,161 · beide Spalten 12,555.

Von den 548,581 betroffenen Kollokations-Schluesseln fallen nach dem Merge **4,915 als Duplikate zusammen** (543,666 bleiben). Die Zeilenzahl von `collocations` sinkt entsprechend von 25,726,750 auf ~25,721,835.

## 7. Zwei Luecken in der Plan-Vorgabe zum Merge

**(a) Die Head-Spalte `lemma` muss mitgemergt werden.** Der Plan (E2, Schritt 5) nennt nur `UPDATE dep_lemma`. `collocations` enthaelt aber zu jeder direkten Relation die inverse mit vertauschten Rollen — jedes Lemma steht dort auch in `lemma`. Die Messung oben zeigt das symmetrisch: 267,865 Zeilen nur ueber `dep_lemma` betroffen, 268,161 nur ueber `lemma`. Wuerde nur `dep_lemma` normalisiert, bliebe rund die Haelfte der Faelle stehen und die DB waere in sich widerspruechlich (`thier` als Head, `tier` als Dep). Golden Query #11 prueft ohnehin **beide** Spalten (`WHERE lemma='thier' OR dep_lemma='thier'`) und wuerde auf FAIL laufen.

Mitzuziehen sind dabei `relation_full` (Bauart `lemma-pos-relation`, enthaelt das Lemma im Klartext) und `form` (Kopie von `dep_lemma`).

**(b) Die Tabelle `zeitreise` steht nicht im Plan, ist aber betroffen.** 1,667,568 von 61,199,161 Zeilen (2.72 %) enthalten ein Lemma aus dem Mapping. Ohne Mitbehandlung zeigte die Zeitenwende weiterhin `thier` und `tier` getrennt, mit aufgeteilten Dekadenfrequenzen. Der Plan nennt als Nacharbeit nur `lemma_corpus_freq` und `build_info`.

Beides sind Erweiterungen des Merge-Umfangs, keine Aenderung des Verfahrens — aber sie brauchen deine Zustimmung, bevor ich sie umsetze.

## 8. Kontroll-Paar fuer Gate E2 (Ueber-Normalisierung)

Golden Query #11 verlangt ein bewusst getrennt gehaltenes Paar. Vorschlag — beide wurden von den Regeln erzeugt und vom Frequenzwaechter verworfen, muessen also nach dem Merge noch getrennt existieren:

| bleibt getrennt | Regel haette daraus gemacht | Begruendung |
|---|---|---|
| `theater` | `teater` | griechisches ⟨th⟩, keine Erbwort-Schreibung |
| `maß` | `mass` | `Maß` behaelt das ⟨ß⟩ auch nach 1996 |

## 9. Platz und Ablauf des Merges

| Posten | Bedarf |
|---|---|
| `wortprofil_v2.db` heute | 17,77 GiB (C:) |
| Sicherungskopie (liegt bereits) | 17,77 GiB (D:, `wortprofil_v2_backup`) |
| WAL waehrend Transaktion + Index-Neubau | grob 8–15 GiB (C:) |
| `VACUUM INTO` als Zieldatei | ~17 GiB (C:) |
| SQLite-Temp (`TMP`/`TEMP`) | auf `wortprofil/_tmp` (D:) umgelenkt |

Frei aktuell: **C: 74 GB, D: 486 GB** — reicht mit deutlichem Abstand.

Statt `VACUUM` in-place schlage ich `VACUUM INTO` auf eine neue Datei vor: Die alte Datei bleibt dabei unangetastet und ist der schnellste Rollback (Umbenennen statt 17 GiB von D: zurueckkopieren). Erst nach gruenem `validate_v2.py` wird getauscht.
