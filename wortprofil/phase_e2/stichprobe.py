"""Phase E2, Gate-Pruefung - Stichprobe gemergter Paare gegen die Sicherungskopie.

Vergleicht fuer 30 zufaellig gezogene (aber nach Frequenz geschichtete) Paare:
  * Ist die alte Form vollstaendig verschwunden?
  * Entspricht die Frequenz der Zielform exakt der Summe beider Vorher-Werte?
  * Bleibt das Kontroll-Paar getrennt?

Die Vorher-Werte kommen aus D:\\wortprofil_v2_backup\\wortprofil_v2.db.pre-e2 -
dem einzigen echten Stand vor dem Merge.
"""
import argparse
import random
import sqlite3
import sys
from pathlib import Path

HIER = Path(__file__).parent
NEU = Path(r"C:\wortprofil_v2\wortprofil_v2.db")
ALT = Path(r"D:\wortprofil_v2_backup\wortprofil_v2.db.pre-e2")
OUT = HIER / "E2_STICHPROBE.md"

KONTROLLE = [("theater", "teater"), ("maß", "mass"), ("thema", "tema"),
             ("thron", "tron"), ("bayerisch", "baierisch")]


def scan(pfad, gruppen):
    """EIN sequenzieller Durchlauf, der fuer jede Lemma-Gruppe die Summe der
    Frequenzen aller Zeilen bildet, die mindestens ein Gruppen-Lemma enthalten.

    Die Vorgaengerfassung fragte je Paar einzeln ab. Auf `dep_lemma` liegt kein
    Index, jede Abfrage war also ein voller Scan - bei ~90 Abfragen gegen die
    Sicherungskopie auf der HDD waeren das Stunden gewesen (Betriebsregel 2:
    sequenziell lesen ist dort unkritisch, wahlfrei nicht).
    """
    idx: dict[str, list[int]] = {}
    for i, g in enumerate(gruppen):
        for w in g:
            idx.setdefault(w, []).append(i)
    summen = [0] * len(gruppen)
    zeilen = [0] * len(gruppen)
    c = sqlite3.connect(f"file:{pfad}?mode=ro", uri=True)
    c.execute("PRAGMA cache_size=-262144")
    for lemma, dep, freq in c.execute(
            "SELECT lemma, dep_lemma, frequency FROM collocations"):
        a = idx.get(lemma)
        b = idx.get(dep)
        if a is None and b is None:
            continue
        for i in set(a or ()) | set(b or ()):
            summen[i] += freq
            zeilen[i] += 1
    c.close()
    return summen, zeilen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--seed", type=int, default=20260804)
    args = ap.parse_args()

    neu = sqlite3.connect(f"file:{NEU}?mode=ro", uri=True)

    paare = neu.execute(
        "SELECT alt, korrekt, dep_pos, f_alt, f_korrekt, block FROM lemma_corrections "
        "WHERE freigegeben=1 ORDER BY f_alt DESC").fetchall()
    # geschichtet: die haeufigsten 10, dann zufaellig aus dem Rest
    rng = random.Random(args.seed)
    wahl = paare[:10] + rng.sample(paare[10:], min(args.n - 10, len(paare) - 10))

    L = ["# Phase E2 - Stichprobe gemergter Paare", "",
         f"Vorher: `{ALT}` · Nachher: `{NEU}`", "",
         "Verglichen wird die Summe ueber **beide** Spalten (`lemma` und "
         "`dep_lemma`), weil der Merge beide normalisiert.", "",
         "| alt | korrekt | POS | Block | f(alt) vorher | f(korrekt) vorher | "
         "erwartet | f(korrekt) nachher | Rest alt | |",
         "|---|---|---|---|---:|---:|---:|---:|---:|---|"]
    quellen: dict[str, set[str]] = {}
    for a, k, _p, _fa, _fk, _b in paare:
        quellen.setdefault(k, set()).add(a)

    # Gruppen: je Stichprobenpaar {alle Quellformen des Ziels} + Ziel, dazu die
    # Einzelmengen fuer "Rest alt" und die Kontrollwoerter.
    gruppen, meta = [], []
    for a, k, pos, _fa, _fk, block in wahl:
        gruppen.append(sorted(quellen[k] | {k})); meta.append(("gruppe", a, k, pos, block))
        gruppen.append([a]);                      meta.append(("alt", a, k, pos, block))
        gruppen.append([k]);                      meta.append(("ziel", a, k, pos, block))
    for w, pw in KONTROLLE:
        gruppen.append([w]);  meta.append(("kontrolle", w, pw, "", ""))
        gruppen.append([pw]); meta.append(("kontrolle_partner", w, pw, "", ""))

    print(f"Scan alt ({ALT}) ...", flush=True)
    s_alt, z_alt = scan(ALT, gruppen)
    print(f"Scan neu ({NEU}) ...", flush=True)
    s_neu, z_neu = scan(NEU, gruppen)

    fehler = 0
    i = 0
    for a, k, pos, _fa, _fk, block in wahl:
        erwartet = s_alt[i]              # Gruppe vorher, ohne Doppelzaehlung
        f_alt_v = s_alt[i + 1]
        f_ziel_v = s_alt[i + 2]
        rest = z_neu[i + 1]              # Zeilen mit der alten Form NACHHER
        f_ziel_n = s_neu[i + 2]
        ok = (rest == 0) and (f_ziel_n == erwartet)
        if not ok:
            fehler += 1
        L.append(f"| `{a}` | `{k}` | {pos} | {block} | {f_alt_v:,} | {f_ziel_v:,} | "
                 f"{erwartet:,} | {f_ziel_n:,} | {rest} | {'OK' if ok else '**ABWEICHUNG**'} |")
        i += 3

    L += ["", "## Kontroll-Paare (muessen getrennt bleiben)", "",
          "Zeilenzahlen duerfen sinken: steht ein Kontrollwort als Kollokator "
          "neben `theil` UND `teil`, verschmelzen diese zwei Zeilen zu einer. "
          "Beweis fuer \"bleibt getrennt\" ist die unveraenderte FREQUENZ.", "",
          "| Wort | f vorher | f nachher | Partner | f vorher | f nachher | |",
          "|---|---:|---:|---|---:|---:|---|"]
    for w, pw in KONTROLLE:
        fw_a, fw_n = s_alt[i], s_neu[i]
        fp_a, fp_n = s_alt[i + 1], s_neu[i + 1]
        # Das Kontrollwort selbst muss unveraendert bleiben. Der Partner DARF
        # wachsen: auf `teater` wurde die dritte Variante `teather` abgebildet,
        # wodurch (theater, KON, teather) und (theater, KON, teater) zu einer
        # Zeile verschmolzen. Entscheidend ist, dass `theater` nicht zu `teater`
        # geworden ist - und das zeigt seine unveraenderte Frequenz.
        ok = (fw_a == fw_n) and fw_n > 0 and (fp_n >= fp_a)
        if not ok:
            fehler += 1
        L.append(f"| `{w}` | {fw_a:,} | {fw_n:,} | `{pw}` | {fp_a:,} | {fp_n:,} | "
                 f"{'getrennt' if ok else '**ABWEICHUNG**'} |")
        i += 2

    L += ["", f"**{len(wahl)} Paare geprueft, {len(KONTROLLE)} Kontroll-Paare — "
              f"{fehler} Abweichungen.**"]
    OUT.write_text("\n".join(L), encoding="utf-8")
    print("\n".join(L))
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
