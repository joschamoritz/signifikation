"""Gate-E-Kennzahlen: alte wortprofil.db gegen neue wortprofil_v2.db.

Erhebt genau die Größen, die Gate E laut planning/DB-Neuaufbau.md verlangt:
Zeilenzahlen, DB-Größen, POS-Verteilung, Relationen-Verteilung, Zeitreise-
Abdeckung und das Dekaden-Histogramm (Ziel: keine Löcher ab 1870, Lücke
1880–1940 geschlossen).

Die Zeitreise-„Abdeckung" wird in zwei Stufen gemessen, weil nur die zweite für
das Spiel zählt:
  vorhanden – (lemma, pos) hat überhaupt zeitreise-Zeilen
  brauchbar – erfüllt die Filter aus fetchZeitenwende (Dekade >= 1950, Schnitt
              2000, je Seite mindestens ZW_MIN_PRO_BUCKET Wörter der Länge 5–14)

Aufruf:
  python kennzahlen_e.py --neu C:\\wortprofil_v2\\wortprofil_v2.db \\
      --alt ../05_db/wortprofil.db --out GATE_E_KENNZAHLEN.md
"""

import argparse
import os
import sqlite3
import sys
from pathlib import Path

ZW_MIN_JAHRZEHNT = 1950
ZW_CUTOFF = 2000
ZW_MIN_LEN, ZW_MAX_LEN = 5, 14
ZW_MIN_PRO_BUCKET = 3


def _open(pfad: Path):
    return sqlite3.connect(f"file:{pfad}?mode=ro", uri=True) if pfad.exists() else None


def _hat(conn, tabelle) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                        (tabelle,)).fetchone() is not None


def erhebe(conn: sqlite3.Connection, pfad: Path) -> dict:
    k = {"datei": pfad.name, "groesse_gb": round(os.path.getsize(pfad) / 2**30, 3)}
    k["collocations"] = conn.execute("SELECT COUNT(*) FROM collocations").fetchone()[0]
    k["distinct_lemma_pos"] = conn.execute(
        "SELECT COUNT(*) FROM (SELECT DISTINCT lemma, pos FROM collocations)").fetchone()[0]
    k["distinct_lemma"] = conn.execute(
        "SELECT COUNT(DISTINCT lemma) FROM collocations").fetchone()[0]
    k["pos"] = dict(conn.execute(
        "SELECT pos, COUNT(*) FROM collocations GROUP BY pos ORDER BY 2 DESC"))
    k["relationen"] = dict(conn.execute(
        "SELECT relation, COUNT(*) FROM collocations GROUP BY relation ORDER BY 2 DESC"))
    k["frequenz_summe"] = conn.execute(
        "SELECT SUM(frequency) FROM collocations").fetchone()[0]

    if _hat(conn, "lemma_corpus_freq"):
        k["lemma_corpus_freq"] = conn.execute(
            "SELECT COUNT(*) FROM lemma_corpus_freq").fetchone()[0]
        k["korpora"] = conn.execute(
            "SELECT COUNT(DISTINCT quelle) FROM lemma_corpus_freq").fetchone()[0]

    if _hat(conn, "build_info"):
        k["build_info"] = dict(conn.execute("SELECT key, value FROM build_info"))

    if _hat(conn, "zeitreise"):
        k["zeitreise"] = conn.execute("SELECT COUNT(*) FROM zeitreise").fetchone()[0]
        k["zeitreise_lemmata"] = conn.execute(
            "SELECT COUNT(DISTINCT lemma) FROM zeitreise").fetchone()[0]
        k["dekaden"] = dict(conn.execute(
            "SELECT jahrzehnt, COUNT(*) FROM zeitreise GROUP BY jahrzehnt ORDER BY 1"))
        # brauchbar im Sinne von fetchZeitenwende
        brauchbar = conn.execute(f"""
            SELECT COUNT(*) FROM (
              SELECT lemma
              FROM zeitreise
              WHERE jahrzehnt >= {ZW_MIN_JAHRZEHNT}
                AND LENGTH(dep_lemma) BETWEEN {ZW_MIN_LEN} AND {ZW_MAX_LEN}
              GROUP BY lemma
              HAVING COUNT(DISTINCT CASE WHEN jahrzehnt <  {ZW_CUTOFF}
                                         THEN dep_lemma END) >= {ZW_MIN_PRO_BUCKET}
                 AND COUNT(DISTINCT CASE WHEN jahrzehnt >= {ZW_CUTOFF}
                                         THEN dep_lemma END) >= {ZW_MIN_PRO_BUCKET})
        """).fetchone()[0]
        k["zeitreise_brauchbar"] = brauchbar
        # ACHTUNG bei der Interpretation: zeitreise wird nur mit MIN_FREQ 2 je
        # Dekade gefiltert, collocations zusätzlich mit min_count und
        # logDice >= 0. Deshalb enthält zeitreise MEHR distinkte Lemmata als
        # collocations, und ein Verhältnis „zeitreise-Lemmata / collocations-
        # Lemmata" kann über 100 % liegen — es ist keine Abdeckungsquote.
        # Aussagekräftig ist nur die BRAUCHBAR-Quote (Filter aus
        # fetchZeitenwende) bezogen auf die Lemmata, die das Spiel überhaupt
        # anbietet, plus die absolute Zahl.
        k["zeitreise_lemmata_vs_collocations"] = round(
            k["zeitreise_lemmata"] / max(k["distinct_lemma"], 1), 2)
        k["zeitreise_abdeckung_brauchbar_pct"] = round(
            brauchbar / max(k["distinct_lemma"], 1) * 100, 2)
    return k


def _tabelle(titel: str, alt: dict, neu: dict, schluessel: str) -> list[str]:
    a = alt.get(schluessel) or {}
    n = neu.get(schluessel) or {}
    namen = sorted(set(a) | set(n), key=lambda x: -(n.get(x) or a.get(x) or 0))
    zeilen = [f"\n### {titel}\n", "| | alt | neu | Faktor |", "|---|---:|---:|---:|"]
    for name in namen:
        av, nv = a.get(name), n.get(name)
        faktor = f"{nv/av:.1f}×" if av and nv else ("NEU" if nv and not av else "—")
        fa = f"{av:,}" if av is not None else "–"
        fn = f"{nv:,}" if nv is not None else "–"
        zeilen.append(f"| `{name}` | {fa} | {fn} | {faktor} |")
    return zeilen


def dekaden_histogramm(alt: dict, neu: dict) -> list[str]:
    a = {int(k): v for k, v in (alt.get("dekaden") or {}).items()}
    n = {int(k): v for k, v in (neu.get("dekaden") or {}).items()}
    if not n:
        return ["\n### Dekaden-Histogramm\n", "(keine zeitreise in der neuen DB)"]
    alle = sorted(set(a) | set(n))
    maxn = max(n.values())
    zeilen = ["\n### Dekaden-Histogramm (Ziel: keine Löcher ab 1870)\n",
              "| Dekade | alt | neu | |", "|---:|---:|---:|:---|"]
    for d in alle:
        av, nv = a.get(d, 0), n.get(d, 0)
        balken = "█" * max(1, round(nv / maxn * 40)) if nv else ""
        warnung = " ⚠ leer" if nv == 0 and d >= 1870 else ""
        zeilen.append(f"| {d} | {av:,} | {nv:,} | {balken}{warnung} |")
    luecken = [d for d in range(1870, 2030, 10) if not n.get(d)]
    zeilen.append(f"\n**Löcher ab 1870:** "
                  f"{'keine' if not luecken else ', '.join(map(str, luecken))}")
    alt_luecken = [d for d in range(1870, 2030, 10) if not a.get(d)]
    zeilen.append(f"**Löcher ab 1870 in der alten DB:** "
                  f"{'keine' if not alt_luecken else ', '.join(map(str, alt_luecken))}")
    return zeilen


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    p = argparse.ArgumentParser(description="Gate-E-Kennzahlen alt vs. neu")
    p.add_argument("--neu", required=True)
    p.add_argument("--alt", default="")
    p.add_argument("--out", default="")
    args = p.parse_args()

    neu_pfad = Path(args.neu)
    neu_conn = _open(neu_pfad)
    if neu_conn is None:
        print(f"FEHLER: {neu_pfad} nicht gefunden")
        sys.exit(1)
    print("Erhebe Kennzahlen der neuen DB ...", flush=True)
    neu = erhebe(neu_conn, neu_pfad)

    alt = {}
    if args.alt:
        alt_pfad = Path(args.alt)
        alt_conn = _open(alt_pfad)
        if alt_conn is not None:
            print("Erhebe Kennzahlen der alten DB ...", flush=True)
            alt = erhebe(alt_conn, alt_pfad)
            alt_conn.close()

    md = ["# Gate-E-Kennzahlen: wortprofil.db (alt) vs. wortprofil_v2.db (neu)\n"]
    md += ["## Übersicht\n", "| Größe | alt | neu | Faktor |", "|---|---:|---:|---:|"]
    for label, key in [("Datei", "datei"), ("DB-Größe (GB)", "groesse_gb"),
                       ("collocations", "collocations"),
                       ("distinkte (lemma, pos)", "distinct_lemma_pos"),
                       ("distinkte Lemmata", "distinct_lemma"),
                       ("Summe frequency", "frequenz_summe"),
                       ("lemma_corpus_freq", "lemma_corpus_freq"),
                       ("Korpora", "korpora"),
                       ("zeitreise-Zeilen", "zeitreise"),
                       ("zeitreise-Lemmata", "zeitreise_lemmata"),
                       ("zeitreise brauchbar (Spiel)", "zeitreise_brauchbar"),
                       ("zeitreise-Lemmata je collocations-Lemma",
                        "zeitreise_lemmata_vs_collocations"),
                       ("brauchbar in % der collocations-Lemmata",
                        "zeitreise_abdeckung_brauchbar_pct")]:
        av, nv = alt.get(key), neu.get(key)
        if isinstance(av, (int, float)) and isinstance(nv, (int, float)) and av:
            faktor = f"{nv/av:.2f}×"
        else:
            faktor = "NEU" if nv is not None and av is None else "—"
        fa = f"{av:,}" if isinstance(av, int) else (str(av) if av is not None else "–")
        fn = f"{nv:,}" if isinstance(nv, int) else (str(nv) if nv is not None else "–")
        md.append(f"| {label} | {fa} | {fn} | {faktor} |")

    md += _tabelle("POS-Verteilung", alt, neu, "pos")
    md += _tabelle("Relationen-Verteilung", alt, neu, "relationen")
    md += dekaden_histogramm(alt, neu)

    if neu.get("build_info"):
        md += ["\n### build_info (neu)\n", "| key | value |", "|---|---|"]
        for key, val in neu["build_info"].items():
            md.append(f"| `{key}` | {val} |")

    text = "\n".join(md)
    print(text)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
        print(f"\nGeschrieben: {args.out}")
    neu_conn.close()


if __name__ == "__main__":
    main()
