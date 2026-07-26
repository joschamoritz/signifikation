"""
Phase C – Analyse einer gebauten wortprofil_v2.db (F6-Datenbasis + F12-Histogramm)

Läuft gegen EINE wortprofil_subset_*.db und liefert:
  * Kennzahlen (Zeilen, distinct Lemmata, Relationen-Verteilung)
  * F12: Histogramm der häufigsten VERB-Kollokatoren (dep_pos=Verb) — flutet
    sein/haben/werden die Kollokator-Listen? Anteil an Nomen-"Verben"-Runde (~OBJA).
  * Rausch-Stichprobe: N zufällige Kollokationen (deterministischer Seed) zur
    manuellen Bewertung des Rauschanteils durch den User.
  * Abdeckung der Tageslemmata (kalender-Tabelle in signifikation.db, falls gegeben).

Aufruf:
    python analyse_wortprofil.py --db phase_c/db/wortprofil_subset_mc3.db \\
        --label mc3 --kalender-db ../server/data/signifikation.db \\
        --sample 30 --seed 42 --out-json phase_c/analyse_mc3.json
"""

import argparse
import json
import random
import sqlite3
import sys
from pathlib import Path

AUX_LEMMATA = {"sein", "haben", "werden"}

# Relationen der drei Nomen-Runden + Verb-Runden (server/wortprofil.js POS_ROUNDS)
# Nomen: KON (Nomen), ~OBJA (Verben), ATTR (Adjektive)
# Verb:  OBJA (Objekte), KON (Verben), ...
NOMEN_VERBEN_REL = "~OBJA"


def _tab(conn, name):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                        (name,)).fetchone() is not None


def kennzahlen(conn):
    k = {}
    k["collocations"] = conn.execute("SELECT COUNT(*) FROM collocations").fetchone()[0]
    k["distinct_lemma_pos"] = conn.execute(
        "SELECT COUNT(DISTINCT lemma||'|'||pos) FROM collocations").fetchone()[0]
    k["relationen"] = dict(conn.execute(
        "SELECT relation, COUNT(*) FROM collocations GROUP BY relation ORDER BY COUNT(*) DESC"))
    if _tab(conn, "build_info"):
        k["build_info"] = dict(conn.execute("SELECT key, value FROM build_info"))
    if _tab(conn, "lemma_corpus_freq"):
        k["lemma_corpus_freq"] = conn.execute(
            "SELECT COUNT(*) FROM lemma_corpus_freq").fetchone()[0]
    return k


def f12_verb_histogramm(conn, top=25):
    """Häufigste Verb-Kollokatoren (dep_pos=Verb) über ALLE Relationen und speziell
    in der Nomen-'Verben'-Runde (~OBJA). Zeigt, ob sein/haben/werden dominieren."""
    # (a) global über alle Relationen: Verb als dep_lemma
    global_rows = conn.execute("""
        SELECT dep_lemma,
               COUNT(*)                          AS n_listen,
               SUM(frequency)                    AS freq_sum,
               COUNT(DISTINCT lemma||'|'||pos)   AS n_heads
        FROM collocations
        WHERE dep_pos='Verb'
        GROUP BY dep_lemma
        ORDER BY n_listen DESC
        LIMIT ?
    """, (top,)).fetchall()

    # (b) speziell Nomen-'Verben'-Runde (~OBJA): welche Verben erscheinen bei den
    #     meisten Nomen? Das ist die Liste, die der Spieler im Spiel sieht.
    obja_rows = conn.execute("""
        SELECT dep_lemma,
               COUNT(*)        AS n_nomen,
               SUM(frequency)  AS freq_sum,
               AVG(logDice)    AS avg_dice
        FROM collocations
        WHERE relation=? AND dep_pos='Verb'
        GROUP BY dep_lemma
        ORDER BY n_nomen DESC
        LIMIT ?
    """, (NOMEN_VERBEN_REL, top)).fetchall()

    # Anteil AUX an allen ~OBJA-Verb-Kollokationen
    total_obja = conn.execute(
        "SELECT COUNT(*) FROM collocations WHERE relation=? AND dep_pos='Verb'",
        (NOMEN_VERBEN_REL,)).fetchone()[0]
    aux_obja = conn.execute(
        f"SELECT COUNT(*) FROM collocations WHERE relation=? AND dep_pos='Verb' "
        f"AND dep_lemma IN ({','.join('?'*len(AUX_LEMMATA))})",
        (NOMEN_VERBEN_REL, *sorted(AUX_LEMMATA))).fetchone()[0]

    # Wie oft steht ein AUX unter den TOP-3 ~OBJA-Verben eines Nomens (nach logDice)?
    # (= würde im Spiel prominent angezeigt)
    aux_in_top3 = conn.execute(f"""
        WITH ranked AS (
            SELECT lemma, pos, dep_lemma,
                   ROW_NUMBER() OVER (PARTITION BY lemma, pos ORDER BY logDice DESC) AS rnk
            FROM collocations
            WHERE relation=? AND dep_pos='Verb'
        )
        SELECT COUNT(DISTINCT lemma||'|'||pos)
        FROM ranked
        WHERE rnk <= 3 AND dep_lemma IN ({','.join('?'*len(AUX_LEMMATA))})
    """, (NOMEN_VERBEN_REL, *sorted(AUX_LEMMATA))).fetchone()[0]

    n_nomen_mit_obja = conn.execute(
        "SELECT COUNT(DISTINCT lemma||'|'||pos) FROM collocations "
        "WHERE relation=? AND dep_pos='Verb'", (NOMEN_VERBEN_REL,)).fetchone()[0]

    return {
        "global_top": [
            {"verb": r[0], "n_listen": r[1], "freq_sum": r[2], "n_heads": r[3],
             "aux": r[0] in AUX_LEMMATA}
            for r in global_rows],
        "obja_top": [
            {"verb": r[0], "n_nomen": r[1], "freq_sum": r[2], "avg_dice": round(r[3], 3),
             "aux": r[0] in AUX_LEMMATA}
            for r in obja_rows],
        "obja_total_kollokationen": total_obja,
        "obja_aux_kollokationen": aux_obja,
        "obja_aux_anteil_pct": round(aux_obja / total_obja * 100, 2) if total_obja else 0.0,
        "nomen_mit_obja_verben": n_nomen_mit_obja,
        "nomen_mit_aux_in_top3": aux_in_top3,
        "nomen_mit_aux_in_top3_pct": round(aux_in_top3 / n_nomen_mit_obja * 100, 2) if n_nomen_mit_obja else 0.0,
    }


def rausch_stichprobe(conn, n=30, seed=42):
    """N zufällige Kollokationen (deterministisch) für die manuelle Rauschbewertung.
    Zieht aus dem Bereich, den der Spieler tatsächlich sieht: direkte + inverse
    Relationen mit Substantiv/Verb/Adjektiv-Heads."""
    rng = random.Random(seed)
    total = conn.execute("SELECT COUNT(*) FROM collocations").fetchone()[0]
    if total == 0:
        return []
    # Deterministische Zeilen-IDs ziehen (rowid-Bereich)
    ids = conn.execute("SELECT id FROM collocations").fetchall()
    ids = [r[0] for r in ids]
    pick = rng.sample(ids, min(n, len(ids)))
    rows = conn.execute(
        f"SELECT lemma, pos, relation, relation_description, dep_lemma, dep_pos, "
        f"prep, frequency, logDice FROM collocations WHERE id IN ({','.join('?'*len(pick))})",
        pick).fetchall()
    out = []
    for lemma, pos, rel, reldesc, dl, dp, prep, freq, dice in rows:
        out.append({
            "lemma": lemma, "pos": pos, "relation": rel, "beschreibung": reldesc,
            "kollokator": dl, "kollokator_pos": dp, "prep": prep,
            "frequency": freq, "logDice": round(dice, 3),
        })
    out.sort(key=lambda x: (-x["logDice"]))
    return out


def abdeckung_tageslemmata(conn, kalender_db):
    if not kalender_db:
        return None
    kpath = Path(kalender_db)
    if not kpath.exists():
        return {"fehler": f"kalender-DB nicht gefunden: {kpath}"}
    kdb = sqlite3.connect(f"file:{kpath}?mode=ro", uri=True)
    try:
        ids = set()
        for (ids_json,) in kdb.execute("SELECT ids FROM kalender").fetchall():
            try:
                ids.update(json.loads(ids_json))
            except (TypeError, json.JSONDecodeError):
                continue
        if not ids:
            return {"tageslemmata": 0}
        ph = ",".join("?" * len(ids))
        lemmata = kdb.execute(
            f"SELECT id, lemma, pos FROM lemmata WHERE id IN ({ph})", tuple(ids)).fetchall()
    finally:
        kdb.close()
    ergebnis = []
    for _id, lemma, pos in lemmata:
        n = conn.execute("SELECT COUNT(*) FROM collocations WHERE lemma=?",
                         (lemma.lower(),)).fetchone()[0]
        ergebnis.append({"lemma": lemma, "pos": pos, "n_kollokationen": n})
    abgedeckt = sum(1 for e in ergebnis if e["n_kollokationen"] > 0)
    return {
        "tageslemmata": len(lemmata),
        "abgedeckt": abgedeckt,
        "details": sorted(ergebnis, key=lambda e: e["n_kollokationen"]),
    }


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--kalender-db", default=None)
    ap.add_argument("--sample", type=int, default=30)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--top", type=int, default=25)
    ap.add_argument("--out-json", default=None)
    args = ap.parse_args()

    dbpath = Path(args.db)
    if not dbpath.exists():
        print(f"FEHLER: DB nicht gefunden: {dbpath}")
        sys.exit(1)
    conn = sqlite3.connect(f"file:{dbpath}?mode=ro", uri=True)

    result = {
        "label": args.label,
        "db": str(dbpath),
        "kennzahlen": kennzahlen(conn),
        "f12": f12_verb_histogramm(conn, top=args.top),
        "rausch_stichprobe": rausch_stichprobe(conn, n=args.sample, seed=args.seed),
        "abdeckung": abdeckung_tageslemmata(conn, args.kalender_db),
    }
    conn.close()

    # Konsolen-Ausgabe
    k = result["kennzahlen"]
    print(f"\n=== Analyse {args.label}: {dbpath.name} ===")
    print(f"Kollokationen: {k['collocations']:,} | distinkte Lemma/POS: {k['distinct_lemma_pos']:,}")
    if "build_info" in k:
        print(f"min_count={k['build_info'].get('min_count')} | "
              f"n_direct={k['build_info'].get('n_direct')} | n_inverse={k['build_info'].get('n_inverse')}")
    f12 = result["f12"]
    print(f"\n--- F12: ~OBJA (Nomen-'Verben'-Runde) ---")
    print(f"AUX-Anteil an ~OBJA-Verb-Kollokationen: {f12['obja_aux_anteil_pct']}% "
          f"({f12['obja_aux_kollokationen']:,}/{f12['obja_total_kollokationen']:,})")
    print(f"Nomen mit AUX in Top-3 (nach logDice): {f12['nomen_mit_aux_in_top3_pct']}% "
          f"({f12['nomen_mit_aux_in_top3']:,}/{f12['nomen_mit_obja_verben']:,})")
    print(f"Top ~OBJA-Verben (n_nomen | freq | avg_dice):")
    for r in f12["obja_top"][:15]:
        mark = " <-- AUX" if r["aux"] else ""
        print(f"  {r['verb']:<16} {r['n_nomen']:>6,} {r['freq_sum']:>10,} {r['avg_dice']:>7}{mark}")
    ab = result["abdeckung"]
    if ab and "abgedeckt" in ab:
        print(f"\n--- Abdeckung Tageslemmata: {ab['abgedeckt']}/{ab['tageslemmata']} ---")
        for e in ab["details"]:
            print(f"  {e['lemma']:<16} {e['pos']:<12} {e['n_kollokationen']:>6,} Kollokationen")

    if args.out_json:
        Path(args.out_json).write_text(json.dumps(result, ensure_ascii=False, indent=2),
                                       encoding="utf-8")
        print(f"\nJSON: {args.out_json}")


if __name__ == "__main__":
    main()
