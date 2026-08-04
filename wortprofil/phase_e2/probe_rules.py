"""Phase E2 - Sondierung: Wie gross sind die Fehlerklassen ueberhaupt?

Reine Messung, schreibt NICHTS in die Datenbank. Zweck: belastbare Zahlen fuer
die Entscheidung ueber das Mapping-Verfahren (der im Plan vorgesehene Weg ueber
dwdsmor traegt nicht, siehe Klasse 3).

Klasse 1  historische Orthografie   (thier -> tier)
Klasse 2  Plural-/Flexionsreste     (katzen -> katze), nur dwdsmor-bestaetigt
Klasse 3  dwdsmor-Abdeckung         (kann der Transducer ueberhaupt helfen?)

Richtungsdisziplin: Jede Regel bildet AUSSCHLIESSLICH historisch -> modern ab.
Der erste Entwurf enthielt versehentlich Rueckwaerts-Regeln (Dehnungs-h,
ss-Ersetzung) und erzeugte dadurch Unsinn wie jahr->jar. Regeln, die in beide
Richtungen laufen koennten, sind hier eng gefasst.
"""
import re
import sqlite3
import sys
from pathlib import Path

HIER = Path(__file__).parent
INV = HIER / "inventar.db"

# ── Regeln der historischen deutschen Orthografie (historisch -> modern) ────
# Belegt durch: II. Orthographische Konferenz 1901 (Streichung des
# etymologischen <th> in Erbwoertern, <c> -> <k>/<z> in Fremdwoertern,
# -iren -> -ieren), Rechtschreibreform 1996 (<ss> nach Kurzvokal, -nis),
# sowie die im 18./19. Jh. verbreiteten Varianten <ey> und <ie> im Praeteritum.
REGELN = [
    # <th> in Erbwoertern: thier, theil, muth, werth, rath, noth, alterthum
    ("th->t",      re.compile(r"th"),                 "t"),
    # <ey>: seyn, bey, frey, dabey
    ("ey->ei",     re.compile(r"ey"),                 "ei"),
    # Praeteritum mit <ie>: gieng, hieng, fieng
    ("ieng->ing",  re.compile(r"ieng"),               "ing"),
    # Fremdwort-Verben: regiren, spaziren, formiren
    ("iren->ieren", re.compile(r"iren\b"),            "ieren"),
    # <c> vor a/o/u/l/r in Fremdwoertern: cultur, classe, concert, product
    ("c->k",       re.compile(r"c(?=[aoulr])"),       "k"),
    # <c> vor e/i: centrum, cigarre
    ("c->z",       re.compile(r"\bc(?=[ei])"),        "z"),
    # <ck> nach Konsonant: kranckheit, volck, marck
    ("Ck->k",      re.compile(r"(?<=[bdfgklmnprstvwz])ck"), "k"),
    # <ß> nach Kurzvokal (Reform 1996): daß, muß, fluß, schluß, gewiß
    ("ss->ss",     re.compile(r"ß"),                  "ss"),
    # -niß -> -nis (Reform 1996): verhaeltniß, ergebniß
    ("nis->nis",   re.compile(r"niß"),                "nis"),
    # <dt> im Auslaut: todt, beredt(? -> Frequenzwaechter entscheidet)
    ("dt->t",      re.compile(r"dt\b"),               "t"),
    # <ph> -> <f>: telephon, photographie
    ("ph->f",      re.compile(r"ph"),                 "f"),
    # <y> fuer /i/: sylbe, cyclus, syrup
    ("y->i",       re.compile(r"y"),                  "i"),
]


def varianten(w: str) -> set[str]:
    """Formen, die aus w durch Regelanwendung entstehen (max. 2 Regeln)."""
    stufe1 = set()
    for _name, pat, repl in REGELN:
        for n in (0, 1):  # alle Vorkommen / nur das erste
            v = pat.sub(repl, w, count=n)
            if v != w:
                stufe1.add(v)
    out = set(stufe1)
    for v in stufe1:
        for _name, pat, repl in REGELN:
            v2 = pat.sub(repl, v)
            if v2 != v:
                out.add(v2)
    out.discard(w)
    return out


def main():
    c = sqlite3.connect(f"file:{INV}?mode=ro", uri=True)
    inv: dict[tuple[str, str], int] = {}
    for lemma, pos, freq in c.execute("SELECT lemma, pos, freq FROM dep_inventar"):
        inv[(lemma, pos)] = freq
    print(f"Inventar: {len(inv):,} (dep_lemma, dep_pos)\n")

    # ── Klasse 1 ───────────────────────────────────────────────────────────
    roh, akzept = [], []
    for (lemma, pos), freq in inv.items():
        best = None
        for v in varianten(lemma):
            zf = inv.get((v, pos))
            if zf is None:
                continue
            if best is None or zf > best[1]:
                best = (v, zf)
        if best is None:
            continue
        roh.append((lemma, best[0], pos, freq, best[1]))
        if best[1] > freq:          # Frequenzwaechter: Ziel muss dominieren
            akzept.append((lemma, best[0], pos, freq, best[1]))

    akzept.sort(key=lambda t: -t[3])
    print(f"KLASSE 1  Regel-Kandidaten mit Ziel im Bestand : {len(roh):,}")
    print(f"          davon mit f_ziel > f_alt (akzeptiert): {len(akzept):,}, "
          f"betroffene Frequenz {sum(t[3] for t in akzept):,}")
    print("  Top 50 nach Frequenz des ALTEN Lemmas:")
    for alt, neu, pos, f, zf in akzept[:50]:
        print(f"    {alt:24s} -> {neu:24s} [{pos:10s}] f_alt={f:>8,} f_ziel={zf:>10,}")
    print("\n  Verworfen (f_ziel <= f_alt), Top 20 - zeigt, was der Waechter faengt:")
    verworfen = sorted((t for t in roh if t[4] <= t[3]), key=lambda t: -t[3])
    for alt, neu, pos, f, zf in verworfen[:20]:
        print(f"    {alt:24s} -x {neu:24s} [{pos:10s}] f_alt={f:>8,} f_ziel={zf:>10,}")

    # ── Klasse 2: nur dwdsmor-bestaetigte Flexionsreste ────────────────────
    import dwdsmor
    t = dwdsmor.analyzer().transducer
    flex = []
    for (lemma, pos), freq in inv.items():
        if pos != "Substantiv" or len(lemma) < 4:
            continue
        probe = lemma[:1].upper() + lemma[1:]
        for spec in t.analyse(probe):
            grund = spec.split("<", 1)[0].lower()
            if grund and grund != lemma and (grund, pos) in inv:
                flex.append((lemma, grund, freq, inv[(grund, pos)]))
                break
    flex.sort(key=lambda x: -x[2])
    print(f"\nKLASSE 2  dwdsmor-bestaetigte Flexionsreste (Substantiv): {len(flex):,}, "
          f"Frequenz {sum(x[2] for x in flex):,}")
    for alt, neu, f, zf in flex[:25]:
        print(f"    {alt:24s} -> {neu:24s} f_alt={f:>8,} f_ziel={zf:>10,}")

    # ── Klasse 3: dwdsmor-Abdeckung, frequenzgewichtet ─────────────────────
    print("\nKLASSE 3  dwdsmor-Abdeckung (frequenzgewichtet, alle Lemmata):")
    for pos in ("Substantiv", "Adjektiv", "Verb", "Adverb"):
        rows = [(l, f) for (l, p), f in inv.items() if p == pos]
        rows.sort(key=lambda x: -x[1])
        ges_f = sum(f for _, f in rows)
        kennt_n = kennt_f = 0
        for l, f in rows:
            probe = l[:1].upper() + l[1:] if pos == "Substantiv" else l
            if t.analyse(probe) or t.analyse(l):
                kennt_n += 1
                kennt_f += f
        print(f"  {pos:11s} Typen {kennt_n:>7,}/{len(rows):<9,} ({100*kennt_n/len(rows):5.1f} %)"
              f"   Frequenz {100*kennt_f/ges_f:5.1f} %")


if __name__ == "__main__":
    sys.exit(main())
