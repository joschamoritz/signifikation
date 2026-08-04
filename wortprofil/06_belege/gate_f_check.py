"""
Gate F — automatisierte Pruefungen fuer belege_v2.db (planning/DB-Neuaufbau.md,
Abschnitt 5 "Phase F"). Schreibt einen Markdown-Report.

Prueft:
  1. Satzzahl je Quelle (Tabelle)
  2. 0 Quellen mit "Lizenz unbekannt"
  3. Jahr-Abdeckung >= 95% (Wikipedia ausgenommen)
  4. 50 zufaellige Belege (ref lesbar/formatiert)
  5. FTS-Suche fuer bekannte Paare quer durch die Korpora inkl. historischer
"""
import argparse
import random
import sqlite3
import sys
from pathlib import Path

# 20 bekannte Paare quer durch die Korpora, darunter historische Schreibweisen
# (Phase E2: thier->tier wurde in wortprofil_v2 gemergt, belege_v2 bleibt
# TEXT-authentisch -- die historische Form muss hier weiter auffindbar sein).
BEKANNTE_PAARE = [
    ("Tisch", "rund"),
    ("Lüge", "auftischen"),
    ("Krieg", "führen"),
    ("Recht", "haben"),
    ("Zeit", "haben"),
    ("Angst", "haben"),
    ("Elend", "groß"),
    ("Freund", "treu"),
    ("Buch", "lesen"),
    ("Haus", "bauen"),
    ("Gesetz", "erlassen"),
    ("Regierung", "bilden"),
    ("Wasser", "trinken"),
    ("Brot", "essen"),
    ("Arbeit", "leisten"),
    ("Reich", "deutsches"),
    ("Volk", "deutsches"),
    ("Kind", "klein"),
    ("Frau", "jung"),
    ("Mann", "alt"),
    # historische Schreibweisen (authentischer Text, nicht normalisiert):
    ("thier", None),
    ("kranckheit", None),
    ("gnüge", None),
]


def esc(s):
    return s.replace('"', '""')


def fts_query(a, b=None):
    if b:
        return f'"{esc(a)}" "{esc(b)}"'
    return f'"{esc(a)}"'


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=r"C:\wortprofil_v2\belege_v2.db")
    ap.add_argument("--out", default="GATE_F_REPORT.md")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA cache_size=-131072")
    lines = []
    def w(s=""):
        lines.append(s)
        print(s)

    w(f"# Gate-F-Report — {args.db}")
    w()

    # ── 1. Satzzahl je Quelle ────────────────────────────────────────────
    w("## 1. Satzzahl je Quelle")
    w()
    w("| Quelle | Dokumente | Sätze | Lizenz |")
    w("|---|---:|---:|---|")
    rows = conn.execute("""
        SELECT d.quelle, COUNT(DISTINCT d.doc_id) AS n_docs, COUNT(s.id) AS n_saetze,
               q.lizenz
        FROM dokumente d
        LEFT JOIN saetze s ON s.doc_id = d.doc_id
        LEFT JOIN quellen q ON q.quelle = d.quelle
        GROUP BY d.quelle
        ORDER BY n_saetze DESC
    """).fetchall()
    gesamt_docs = gesamt_saetze = 0
    for quelle, n_docs, n_saetze, lizenz in rows:
        w(f"| {quelle} | {n_docs:,} | {n_saetze:,} | {lizenz} |")
        gesamt_docs += n_docs
        gesamt_saetze += n_saetze
    w(f"| **GESAMT** | **{gesamt_docs:,}** | **{gesamt_saetze:,}** | |")
    w()

    # ── 2. Lizenz-Check ───────────────────────────────────────────────────
    w("## 2. Lizenz-Check")
    w()
    unbekannt = conn.execute(
        "SELECT quelle, zitation FROM quellen WHERE lizenz='Lizenz unbekannt'").fetchall()
    if unbekannt:
        w(f"❌ FAIL — {len(unbekannt)} Quelle(n) ohne Lizenz-Mapping:")
        for quelle, zit in unbekannt:
            w(f"  - `{quelle}` ({zit})")
    else:
        w("✅ PASS — 0 Quellen mit 'Lizenz unbekannt'.")
    w()

    # ── 3. Jahr-Abdeckung (Wikipedia ausgenommen) ────────────────────────
    w("## 3. Jahr-Abdeckung (Wikipedia ausgenommen)")
    w()
    total = conn.execute(
        "SELECT COUNT(*) FROM dokumente WHERE quelle != 'wikipedia'").fetchone()[0]
    mit_jahr = conn.execute(
        "SELECT COUNT(*) FROM dokumente WHERE quelle != 'wikipedia' AND jahr IS NOT NULL"
    ).fetchone()[0]
    pct = 100 * mit_jahr / total if total else 0
    status = "✅ PASS" if pct >= 95 else "❌ FAIL"
    w(f"{status} — {mit_jahr:,} / {total:,} Dokumente mit Jahr = {pct:.1f}% (Ziel ≥ 95%)")
    w()
    w("Je Quelle:")
    w()
    w("| Quelle | mit Jahr | gesamt | % |")
    w("|---|---:|---:|---:|")
    for quelle, n_docs, *_ in rows:
        if quelle == "wikipedia":
            continue
        mj = conn.execute(
            "SELECT COUNT(*) FROM dokumente WHERE quelle=? AND jahr IS NOT NULL",
            (quelle,)).fetchone()[0]
        ges = conn.execute(
            "SELECT COUNT(*) FROM dokumente WHERE quelle=?", (quelle,)).fetchone()[0]
        p = 100 * mj / ges if ges else 0
        w(f"| {quelle} | {mj:,} | {ges:,} | {p:.1f}% |")
    w()

    # ── 4. 50 zufällige Belege ────────────────────────────────────────────
    w("## 4. 50 zufällige Belege (ref-Format)")
    w()
    random.seed(args.seed)
    max_id = conn.execute("SELECT MAX(id) FROM saetze").fetchone()[0]
    n_shown = 0
    tries = 0
    seen_ids = set()
    while n_shown < 50 and tries < 2000:
        tries += 1
        rid = random.randint(1, max_id)
        if rid in seen_ids:
            continue
        row = conn.execute("""
            SELECT s.satz, d.ref, d.jahr, q.zitation, q.lizenz
            FROM saetze s
            JOIN dokumente d ON d.doc_id = s.doc_id
            JOIN quellen q ON q.quelle = d.quelle
            WHERE s.id = ?
        """, (rid,)).fetchone()
        if not row:
            continue
        seen_ids.add(rid)
        satz, ref, jahr, zit, liz = row
        n_shown += 1
        satz_kurz = satz if len(satz) <= 140 else satz[:137] + "…"
        jahr_s = f" ({jahr})" if jahr else ""
        w(f"{n_shown}. „{satz_kurz}“ — **{ref}**{jahr_s} · {zit} · {liz}")
    w()

    # ── 5. FTS-Suche für bekannte Paare ──────────────────────────────────
    w("## 5. FTS-Suche für bekannte Paare (inkl. historischer)")
    w()
    w("| Paar | Treffer | Quellen |")
    w("|---|---:|---|")
    n_fail = 0
    for lemma, coll in BEKANNTE_PAARE:
        q = fts_query(lemma, coll)
        hits = conn.execute("""
            SELECT d.quelle
            FROM belege_fts
            JOIN saetze s ON s.id = belege_fts.rowid
            JOIN dokumente d ON d.doc_id = s.doc_id
            WHERE belege_fts MATCH ?
            LIMIT 200
        """, (q,)).fetchall()
        quellen_set = sorted({h[0] for h in hits})
        label = f"{lemma}+{coll}" if coll else lemma
        status = "✅" if hits else "❌"
        if not hits:
            n_fail += 1
        w(f"| {label} | {status} {len(hits)} | {', '.join(quellen_set[:5])}"
          f"{' …' if len(quellen_set) > 5 else ''} |")
    w()
    w(f"{'✅ PASS' if n_fail == 0 else f'⚠️ {n_fail} Paar(e) ohne Treffer'} "
      f"— {len(BEKANNTE_PAARE) - n_fail}/{len(BEKANNTE_PAARE)} Paare mit Treffern.")
    w()

    Path(args.out).write_text("\n".join(lines), encoding="utf-8")
    print(f"\nReport geschrieben: {args.out}")


if __name__ == "__main__":
    main()
