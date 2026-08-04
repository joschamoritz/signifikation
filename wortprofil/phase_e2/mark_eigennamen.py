"""Phase E2 - Eigennamen in Block D markieren (Nutzerauflage: "D ohne Eigennamen").

Die Lemmata tragen keine NPROP-Markierung (parse_deps faltet Eigennamen in
"Substantiv"). Zwei unabhaengige Signale ersetzen das:

  1. dwdsmor als GEGENPROBE (Positivkriterium): Die Edition "open" enthaelt
     nachweislich keine Eigennamen - Karl, Jakob, Frankreich, Kassel liefern
     0 Analysen, waehrend Kapitel/Volk/Werk/Kultur als NN analysiert werden.
     Kennt dwdsmor die Zielform als NN/ADJ/V/ADV, ist sie sicher KEIN Eigenname.
     Das ist die Absicherung dagegen, dass der Filter richtige Merges wie
     volck->volk zerstoert.
  2. de_zdl_lg STTS-Tag: NE = Eigenname, NN = Gattungsname. Ueber vier neutrale
     Traegersaetze, die beide Lesarten zulassen; Mehrheitsentscheid.

Nur auf dep_pos='Substantiv' angewandt - Verben und Adjektive in Block D
(mercken, starck, catholisch) koennen keine Eigennamen sein.

Setzt die Spalte `verdacht` um ",eigenname" fort. Aendert KEINE Daten ausser
lemma_corrections.
"""

import argparse
import sqlite3
import sys
import warnings
from collections import Counter
from pathlib import Path

warnings.filterwarnings("ignore")

HIER = Path(__file__).parent
WP_DB_DEFAULT = Path(r"C:\wortprofil_v2\wortprofil_v2.db")

TRAEGER = [
    "Am Montag wurde {} erwaehnt.",
    "Er sprach lange ueber {}.",
    "Nach {} kam die Wende.",
    "{} war damals bekannt.",
]
DWDS_SACHWORT = {"NN", "ADJ", "V", "ADV", "CARD", "ORD"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wp-db", type=Path, default=WP_DB_DEFAULT)
    ap.add_argument("--block", default="D")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import dwdsmor
    import spacy

    conn = sqlite3.connect(args.wp_db)
    rows = conn.execute(
        "SELECT alt, korrekt, dep_pos, f_alt FROM lemma_corrections "
        "WHERE block=? AND dep_pos='Substantiv' ORDER BY f_alt DESC",
        (args.block,),
    ).fetchall()
    print(f"Block {args.block}, Substantive: {len(rows):,}")

    analyzer = dwdsmor.analyzer()
    nlp = spacy.load("de_zdl_lg",
                     exclude=["parser", "trainable_lemmatizer", "morphologizer"])

    # Stufe 1: dwdsmor-Gegenprobe auf der Zielform
    offen, sicher_sachwort = [], 0
    for alt, korrekt, pos, f_alt in rows:
        gross = korrekt[:1].upper() + korrekt[1:]
        poss = {t.pos for t in analyzer.analyze(gross)}
        if poss & DWDS_SACHWORT:
            sicher_sachwort += 1
        else:
            offen.append((alt, korrekt, f_alt))
    print(f"  dwdsmor kennt die Zielform als Sachwort: {sicher_sachwort:,} "
          f"-> sicher kein Eigenname")
    print(f"  offen fuer die NE-Pruefung:              {len(offen):,}")

    # Stufe 2: STTS-Tag ueber vier Traegersaetze
    saetze, index = [], []
    for i, (alt, korrekt, f_alt) in enumerate(offen):
        gross = korrekt[:1].upper() + korrekt[1:]
        for muster in TRAEGER:
            saetze.append(muster.format(gross))
            index.append((i, gross))

    stimmen: dict[int, Counter] = {}
    for (i, gross), doc in zip(index, nlp.pipe(saetze, batch_size=256)):
        tok = next((t for t in doc if t.text == gross), None)
        if tok is not None:
            stimmen.setdefault(i, Counter())[tok.tag_] += 1

    eigennamen = []
    for i, (alt, korrekt, f_alt) in enumerate(offen):
        c = stimmen.get(i)
        if not c:
            continue
        # Schwelle 3 von 4: knappe 2:2-Faelle sind ueberwiegend Gattungswoerter,
        # die nur in einem Traegersatz wie ein Nachname aussehen (comet, cocon,
        # coralle, cobalt). Eindeutige Namen erreichen 3 oder 4 Stimmen.
        if c.get("NE", 0) >= 3:
            eigennamen.append((alt, korrekt, f_alt, c["NE"], sum(c.values())))

    eigennamen.sort(key=lambda x: -x[2])
    print(f"  als Eigenname erkannt:                   {len(eigennamen):,} "
          f"(Frequenz {sum(e[2] for e in eigennamen):,})")
    print("\n  Top 60:")
    for alt, korrekt, f_alt, ne, ges in eigennamen[:60]:
        print(f"    {alt:24s} -> {korrekt:24s} f={f_alt:>8,}  NE {ne}/{ges}")
    print("\n  Nicht als Eigenname erkannt, Top 40 (bleiben im Merge):")
    rest = [(a, k, f) for i, (a, k, f) in enumerate(offen)
            if not any(e[0] == a for e in eigennamen)]
    for alt, korrekt, f_alt in rest[:40]:
        print(f"    {alt:24s} -> {korrekt:24s} f={f_alt:>8,}")

    if args.dry_run:
        print("\n--dry-run: nichts geschrieben.")
        return

    conn.executemany(
        "UPDATE lemma_corrections "
        "SET verdacht = CASE WHEN verdacht='' THEN 'eigenname' "
        "                    ELSE verdacht || ',eigenname' END "
        "WHERE alt=? AND dep_pos='Substantiv'",
        [(e[0],) for e in eigennamen],
    )
    conn.commit()
    conn.close()
    print(f"\n{len(eigennamen):,} Zeilen mit 'eigenname' markiert.")


if __name__ == "__main__":
    sys.exit(main())
