"""Phase E2, Schritt 3 - lemma_corrections aufbauen (NOCH KEIN Merge).

Erzeugt das Mapping alt -> korrekt je POS und schreibt es in die Tabelle
`lemma_corrections` in wortprofil_v2.db. Die collocations-Tabelle wird NICHT
angefasst; alle Zeilen stehen auf freigegeben=0.

── Warum nicht wie im Plan ueber dwdsmor/orthinfo ──────────────────────────
Gemessen an der installierten Edition "open" (siehe phase_e2/BEFUND_DWDSMOR.md):
  * `analyse('thier')` und `analyse('Thier')` liefern 0 Analysen - der
    Transducer kennt historische Orthografie ueberhaupt nicht.
  * `orthinfo` hat genau zwei Werte, OLDORTH (Reform 1996: dass/dass) und CH
    (Schweizer ss). 19. Jahrhundert kommt darin nicht vor.
  * Die Edition "open" ist ein reduziertes Lexikon: `Tier`, `Auto`, `Wasser`,
    `Wort`, `Regierung`, `moeglich`, `stattfinden` fehlen. Auch die Zielseite
    einer Abbildung laesst sich damit oft nicht pruefen.
Ersatz: eine geschlossene, dokumentierte Regelmenge der deutschen
Orthografiegeschichte (Richtung fest: historisch -> modern) plus zwei harte
Filter gegen Uebernormalisierung:
  (1) das Ziel muss im Bestand mit derselben POS existieren,
  (2) das Ziel muss haeufiger sein als die Ausgangsform.
Beides ist deterministisch; die Frequenz waehlt kein Ziel aus, sie verwirft nur
regelerzeugte Kandidaten, bei denen die Ausgangsform die dominante ist
(gross -x gross, thema -x tema, theater -x teater).

Aufruf:
  wortprofil-env/Scripts/python.exe phase_e2/build_corrections.py [--dry-run]
"""

import argparse
import os
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

HIER = Path(__file__).parent
INV = HIER / "inventar.db"
WP_DB_DEFAULT = Path(r"C:\wortprofil_v2\wortprofil_v2.db")
TMP_DIR_DEFAULT = HIER.parent / "_tmp"

# ── Regelbloecke ────────────────────────────────────────────────────────────
# (block, name, pattern, replacement, riskant)
REGELN = [
    ("A", "th->t",       re.compile(r"th"),                            "t",     False),
    ("B", "sz->ss",      re.compile(r"ß"),                             "ss",    False),
    ("B", "nisz->nis",   re.compile(r"niß"),                           "nis",   False),
    ("C", "ey->ei",      re.compile(r"ey"),                            "ei",    False),
    ("C", "ieng->ing",   re.compile(r"ieng"),                          "ing",   False),
    ("C", "iren->ieren", re.compile(r"iren$"),                         "ieren", False),
    ("D", "c->k",        re.compile(r"c(?=[aoulr])"),                  "k",     False),
    ("D", "c->z",        re.compile(r"^c(?=[ei])"),                    "z",     True),
    ("D", "Ck->k",       re.compile(r"(?<=[bdfgklmnprstvwz])ck"),      "k",     False),
    ("E", "ph->f",       re.compile(r"ph"),                            "f",     True),
    ("E", "y->i",        re.compile(r"y"),                             "i",     True),
    ("E", "dt->t",       re.compile(r"dt$"),                           "t",     True),
]

BLOCK_TITEL = {
    "A": "th -> t (Orthographische Konferenz 1901, Erbwoerter)",
    "B": "sz/nisz (Rechtschreibreform 1996)",
    "C": "ey / ieng / -iren (Schreibgebrauch 18./19. Jahrhundert)",
    "D": "c -> k / z, ck -> k (Fremdwortschreibung 1901)",
    "E": "ph -> f, y -> i, dt -> t (gemischt, hoeheres Risiko)",
}


def redirect_tmp(tmp_dir: Path):
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for var in ("SQLITE_TMPDIR", "TMPDIR", "TMP", "TEMP"):
        os.environ[var] = str(tmp_dir)


def kandidaten(w: str):
    """(variante, regelkette) fuer eine und zwei angewandte Regeln."""
    out: dict[str, str] = {}
    stufe1 = []
    for _b, name, pat, repl, _r in REGELN:
        for n in (0, 1):                     # alle Vorkommen / nur das erste
            v = pat.sub(repl, w, count=n)
            if v != w and v not in out:
                out[v] = name
                stufe1.append((v, name))
    for v, kette in stufe1:
        for _b, name, pat, repl, _r in REGELN:
            v2 = pat.sub(repl, v)
            if v2 != v and v2 != w and v2 not in out:
                out[v2] = f"{kette}+{name}"
    return out


def regel_block(kette: str) -> str:
    """Block der ERSTEN Regel einer Kette; riskante Regeln dominieren."""
    namen = kette.split("+")
    bloecke = []
    for n in namen:
        for b, name, _p, _r, _risk in REGELN:
            if name == n:
                bloecke.append(b)
                break
    for b in ("E", "D", "C", "B", "A"):
        if b in bloecke:
            return b
    return "A"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wp-db", type=Path, default=WP_DB_DEFAULT)
    ap.add_argument("--tmp-dir", type=Path, default=TMP_DIR_DEFAULT)
    ap.add_argument("--dry-run", action="store_true",
                    help="nichts in die wortprofil-DB schreiben")
    args = ap.parse_args()
    redirect_tmp(args.tmp_dir)

    inv_db = sqlite3.connect(f"file:{INV}?mode=ro", uri=True)
    dep = {(l, p): f for l, p, f in
           inv_db.execute("SELECT lemma, pos, freq FROM dep_inventar")}
    head = {(l, p): f for l, p, f in
            inv_db.execute("SELECT lemma, pos, freq FROM head_inventar")}
    # Gesamtbestand: ein Lemma zaehlt, egal auf welcher Seite es steht.
    ges: dict[tuple[str, str], int] = defaultdict(int)
    for k, f in dep.items():
        ges[k] += f
    for k, f in head.items():
        ges[k] += f
    print(f"Bestand: {len(ges):,} (lemma, pos) - dep {len(dep):,}, head {len(head):,}")

    # ── Waechter 3: dwdsmor als NEGATIV-Pruefung ───────────────────────────
    # Kennt der Transducer die AUSGANGSform, ist sie eine gueltige moderne
    # Schreibung und darf nicht ersetzt werden (fuß, außen, zustoßen, thema,
    # theater). Die Lexikonluecken der Edition "open" sind hier ungefaehrlich:
    # Unbekanntheit gewaehrt nur keinen Schutz, dann greifen Bestands- und
    # Frequenzwaechter wie bisher. Das Verfahren wird dadurch strenger, nie
    # lockerer. Erst dieser Waechter faengt die Faelle ab, in denen die
    # Dominanz in einer Rand-Wortart kippt (fuß hat 584.316 Vorkommen als
    # Substantiv, aber nur 14 als Adjektiv - dort war fuss mit 24 "haeufiger").
    import dwdsmor
    transducer = dwdsmor.analyzer().transducer
    bekannt: dict[str, bool] = {}

    def modern_gueltig(w: str) -> bool:
        r = bekannt.get(w)
        if r is None:
            r = bool(transducer.analyse(w) or transducer.analyse(w[:1].upper() + w[1:]))
            bekannt[w] = r
        return r

    # ── Kandidaten bilden ───────────────────────────────────────────────────
    roh: dict[tuple[str, str], tuple[str, str, int, int]] = {}
    verworfen = []
    geschuetzt = 0
    for (lemma, pos), f_alt in ges.items():
        if modern_gueltig(lemma):
            geschuetzt += 1
            continue
        best = None
        for v, kette in kandidaten(lemma).items():
            f_ziel = ges.get((v, pos))
            if f_ziel is None:
                continue
            if best is None or f_ziel > best[2]:
                best = (v, kette, f_ziel)
        if best is None:
            continue
        v, kette, f_ziel = best
        if f_ziel > f_alt:
            roh[(lemma, pos)] = (v, kette, f_alt, f_ziel)
        else:
            verworfen.append((lemma, v, pos, kette, f_alt, f_ziel))

    print(f"von dwdsmor als gueltig geschuetzt:  {geschuetzt:,} (lemma, pos)")
    print(f"Regelkandidaten mit Ziel im Bestand: {len(roh) + len(verworfen):,}")
    print(f"  akzeptiert (f_ziel > f_alt):       {len(roh):,}")
    print(f"  verworfen  (Frequenzwaechter):     {len(verworfen):,}")

    # ── Ketten aufloesen (a->b->c wird zu a->c), Zyklen abfangen ───────────
    aufgeloest = {}
    zyklen = []
    for (alt, pos), (ziel, kette, f_alt, f_ziel) in roh.items():
        gesehen = {alt}
        z, k = ziel, kette
        while (z, pos) in roh:
            if z in gesehen:
                zyklen.append((alt, pos, z))
                z = None
                break
            gesehen.add(z)
            nz, nk, _fa, _fz = roh[(z, pos)]
            z, k = nz, f"{k}|{nk}"
        if z is None or z == alt:
            continue
        aufgeloest[(alt, pos)] = (z, k, f_alt, ges.get((z, pos), 0))
    if zyklen:
        print(f"  ! {len(zyklen)} Zyklen verworfen: {zyklen[:5]}")
    ketten = sum(1 for k, v in aufgeloest.items() if "|" in v[1])
    print(f"  nach Kettenaufloesung:             {len(aufgeloest):,} "
          f"(davon {ketten} mehrstufig)")

    # ── Waechter 5: POS-Konsistenz ─────────────────────────────────────────
    # Eine Schreibvariante ist eine Eigenschaft des WORTES, nicht der Wortart.
    # Ohne diesen Schritt bliebe `thier` als Verb und Adjektiv stehen, weil
    # `tier` dort nicht im Bestand steht - Golden Query #11 prueft aber
    # `lemma='thier' OR dep_lemma='thier'` ohne Wortart-Einschraenkung.
    # Sicher ist die Ausweitung erst durch Waechter 3: gueltige moderne Woerter
    # sind da bereits ausgeschlossen, es kann also keine Rand-Wortart eines
    # etablierten Wortes mitgezogen werden.
    pos_je_wort: dict[str, list[str]] = defaultdict(list)
    for (l, p) in ges:
        pos_je_wort[l].append(p)
    ziel_je_wort: dict[str, tuple[str, str]] = {}
    for (alt, pos), (korrekt, kette, _fa, _fz) in aufgeloest.items():
        # bei mehreren Wortarten gewinnt die mit der hoechsten Zielfrequenz
        vor = ziel_je_wort.get(alt)
        if vor is None or ges.get((korrekt, pos), 0) > ges.get((vor[0], pos), 0):
            ziel_je_wort[alt] = (korrekt, kette)
    ergaenzt = 0
    for alt, (korrekt, kette) in ziel_je_wort.items():
        for p in pos_je_wort[alt]:
            if (alt, p) not in aufgeloest:
                aufgeloest[(alt, p)] = (korrekt, kette + "+pos_konsistenz",
                                        ges[(alt, p)], ges.get((korrekt, p), 0))
                ergaenzt += 1
            elif aufgeloest[(alt, p)][0] != korrekt:
                a = aufgeloest[(alt, p)]
                aufgeloest[(alt, p)] = (korrekt, kette + "+pos_konsistenz", a[2], a[3])
    print(f"  nach POS-Konsistenz:               {len(aufgeloest):,} "
          f"({ergaenzt:,} Wortarten ergaenzt)")

    # ── Schreiben ───────────────────────────────────────────────────────────
    zeilen = []
    for (alt, pos), (korrekt, kette, f_alt, f_ziel) in aufgeloest.items():
        block = regel_block(kette.replace("|", "+"))
        verdacht = []
        if len(korrekt) > len(alt):
            verdacht.append("laenger")
        if f_ziel < 2 * f_alt:
            verdacht.append("schwache_dominanz")
        if block in ("D", "E"):
            verdacht.append("riskante_regel")
        if (korrekt, pos) not in dep or (korrekt, pos) not in head:
            verdacht.append("ziel_nur_einseitig")
        zeilen.append((alt, korrekt, pos, f"regel:{kette}", 0,
                       f_alt, f_ziel, block, ",".join(verdacht)))

    if args.dry_run:
        print("\n--dry-run: nichts geschrieben.")
        return

    conn = sqlite3.connect(args.wp_db)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("DROP TABLE IF EXISTS lemma_corrections")
    conn.execute("""
        CREATE TABLE lemma_corrections (
            alt              TEXT    NOT NULL,
            korrekt          TEXT    NOT NULL,
            dep_pos          TEXT    NOT NULL,
            quelle_der_regel TEXT    NOT NULL,
            freigegeben      INTEGER NOT NULL DEFAULT 0,
            -- Zusatzspalten fuer die Freigabe-Sichtung (nicht im Plan-Schema,
            -- rein additiv; SELECT alt, korrekt, dep_pos bleibt unveraendert):
            f_alt            INTEGER NOT NULL DEFAULT 0,
            f_korrekt        INTEGER NOT NULL DEFAULT 0,
            block            TEXT    NOT NULL DEFAULT '',
            verdacht         TEXT    NOT NULL DEFAULT '',
            PRIMARY KEY (alt, dep_pos)
        )
    """)
    conn.executemany(
        "INSERT INTO lemma_corrections "
        "(alt, korrekt, dep_pos, quelle_der_regel, freigegeben, f_alt, f_korrekt, "
        " block, verdacht) VALUES (?,?,?,?,?,?,?,?,?)", zeilen)
    conn.execute("CREATE INDEX idx_lc_block ON lemma_corrections (block, f_alt DESC)")
    conn.commit()
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()
    print(f"\nlemma_corrections geschrieben: {len(zeilen):,} Zeilen, alle freigegeben=0")

    # verworfene Kandidaten fuer den Report ablegen
    vdb = sqlite3.connect(HIER / "verworfen.db")
    vdb.execute("DROP TABLE IF EXISTS verworfen")
    vdb.execute("CREATE TABLE verworfen (alt TEXT, ziel TEXT, pos TEXT, "
                "kette TEXT, f_alt INT, f_ziel INT)")
    vdb.executemany("INSERT INTO verworfen VALUES (?,?,?,?,?,?)", verworfen)
    vdb.commit()
    vdb.close()
    print(f"verworfen.db: {len(verworfen):,} Zeilen (fuer den Report)")


if __name__ == "__main__":
    sys.exit(main())
