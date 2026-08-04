"""Phase E2 - Sondierung Klasse 2: Flexionsreste (katzen -> katze).

Getrennt von probe_rules.py, weil der erste Versuch dort methodisch falsch war:
Er zerlegte die rohe SFST-Spec am ersten '<' und griff damit bei Komposita die
Wortbildungs-Analyse ab (jahrhundert -> jahr). Richtig ist Traversal.analysis,
das dwdsmor selbst als Lemma rekonstruiert.

Zusaetzlich strenger gefasst:
  * nur Analysen, deren POS zur DB-POS passt,
  * nur wenn das Ziel im Bestand existiert,
  * Frequenzwaechter (Ziel muss haeufiger sein als die vermeintliche Flexion),
  * Ausschluss von Analysen mit Wortbildungs-Tags (COMP/DER/CONV), weil dort
    nicht flektiert, sondern zerlegt wird.
"""
import sqlite3
import sys
from collections import Counter
from pathlib import Path

import dwdsmor

HIER = Path(__file__).parent
INV = HIER / "inventar.db"

POS_DWDS = {"Substantiv": {"NN", "NPROP"}, "Adjektiv": {"ADJ"},
            "Verb": {"V"}, "Adverb": {"ADV"}, "Pronomen": {"PPRO"}}


def main():
    c = sqlite3.connect(f"file:{INV}?mode=ro", uri=True)
    inv = {(l, p): f for l, p, f in
           c.execute("SELECT lemma, pos, freq FROM dep_inventar")}
    print(f"Inventar: {len(inv):,}\n")

    a = dwdsmor.analyzer()
    treffer, verworfen = [], []
    stat = Counter()

    for (lemma, pos), freq in inv.items():
        erlaubt = POS_DWDS.get(pos)
        if not erlaubt:
            continue
        probe = lemma[:1].upper() + lemma[1:] if pos == "Substantiv" else lemma
        kandidaten = set()
        for tr in a.analyze(probe):
            if tr.pos not in erlaubt:
                continue
            if tr.processes:            # COMP/DER/CONV -> Wortbildung, nicht Flexion
                continue
            grund = tr.analysis.lower()
            if grund and grund != lemma:
                kandidaten.add((grund, tr.number))
        if not kandidaten:
            continue
        stat["hat_abweichende_analyse"] += 1
        # nur Ziele, die es im Bestand mit gleicher POS gibt
        gueltig = [(g, n) for g, n in kandidaten if (g, pos) in inv]
        if not gueltig:
            stat["ziel_nicht_im_bestand"] += 1
            continue
        g, num = max(gueltig, key=lambda x: inv[(x[0], pos)])
        zf = inv[(g, pos)]
        if zf > freq:
            treffer.append((lemma, g, pos, freq, zf, num))
        else:
            verworfen.append((lemma, g, pos, freq, zf, num))

    treffer.sort(key=lambda x: -x[3])
    print(f"KLASSE 2  dwdsmor sieht eine abweichende Grundform : "
          f"{stat['hat_abweichende_analyse']:,}")
    print(f"          davon Ziel im Bestand + f_ziel > f_alt   : {len(treffer):,}, "
          f"Frequenz {sum(x[3] for x in treffer):,}")
    print(f"          verworfen durch Frequenzwaechter          : {len(verworfen):,}\n")
    print("  Top 40 akzeptiert:")
    for alt, neu, pos, f, zf, num in treffer[:40]:
        print(f"    {alt:24s} -> {neu:24s} [{pos:10s}] num={str(num):4s} "
              f"f_alt={f:>8,} f_ziel={zf:>10,}")
    print("\n  Top 20 verworfen (Frequenzwaechter):")
    verworfen.sort(key=lambda x: -x[3])
    for alt, neu, pos, f, zf, num in verworfen[:20]:
        print(f"    {alt:24s} -x {neu:24s} [{pos:10s}] num={str(num):4s} "
              f"f_alt={f:>8,} f_ziel={zf:>10,}")


if __name__ == "__main__":
    sys.exit(main())
