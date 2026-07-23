"""
Golden-Query-Validierung für die v2-Kette (planning/DB-Neuaufbau.md, Abschnitt 6)

Prüft eine gebaute wortprofil_v2.db (+ optional belege_v2.db) gegen die 11
Golden Queries aus dem Plan. Läuft gegen JEDE v2-DB – Gate-A-Mini-Korpus,
Phase-C-Subset oder die finale Voll-DB – und markiert Tests, für die die
gegebene DB zu wenig Daten enthält, als SKIP statt FAIL (z. B. Tageslemmata-
Abdeckung auf einem winzigen Mini-Korpus, oder Test 11 vor Phase E2).

Aufruf:
    python validate_v2.py --wortprofil-db PFAD --belege-db PFAD
    python validate_v2.py --wortprofil-db PFAD --belege-db PFAD \\
        --kalender-db PFAD/signifikation.db \\
        --old-wortprofil-db ../05_db/wortprofil.db --old-belege-db ../06_belege/belege.db \\
        --report gate_a_report.md --label "Gate A Mini-Korpus"

Exit-Code: 0 wenn keine FAILs, sonst 1 (SKIP zählt nicht als Fehlschlag).
"""

import argparse
import json
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"

# Canary-Wörter aus dem Gate-A-Testkorpus (siehe run_gate_a.py) – jedes kommt
# dort wörtlich in ≥2 Sätzen vor. Auf einer echten Produktions-DB ohne dieses
# Testkorpus liefert Test 6 dafür einfach SKIP (kein Fehler).
CANARY_FTS_WOERTER = ["lüge", "elend", "grün", "tisch", "e-mail"]


@dataclass
class Result:
    nr: int
    name: str
    status: str
    detail: str


@dataclass
class Report:
    ergebnisse: list = field(default_factory=list)
    kennzahlen: dict = field(default_factory=dict)


def _open_ro(pfad: "Path | None") -> "sqlite3.Connection | None":
    if pfad is None:
        return None
    pfad = Path(pfad)
    if not pfad.exists():
        return None
    return sqlite3.connect(f"file:{pfad}?mode=ro", uri=True)


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


# ── Golden Query 1: Lüge + OBJA-Kollokatoren ────────────────────────────────
def test1(wp: sqlite3.Connection) -> Result:
    rows = wp.execute(
        "SELECT DISTINCT dep_lemma FROM collocations "
        "WHERE lemma='lüge' AND pos='Substantiv' AND relation='~OBJA'"
    ).fetchall()
    kollokatoren = {r[0] for r in rows}
    if not kollokatoren:
        return Result(1, "Lüge + OBJA-Kollokatoren", SKIP,
                       "keine ~OBJA-Kollokatoren für 'Lüge' in dieser DB")
    if "tischen" in kollokatoren:
        return Result(1, "Lüge + OBJA-Kollokatoren", FAIL,
                       f"'tischen' als Kollokator vorhanden (K1/dwdsmor-Regression?): "
                       f"{sorted(kollokatoren)}")
    if "auftischen" not in kollokatoren:
        return Result(1, "Lüge + OBJA-Kollokatoren", FAIL,
                       f"'auftischen' fehlt: {sorted(kollokatoren)}")
    return Result(1, "Lüge + OBJA-Kollokatoren", PASS,
                  f"auftischen vorhanden, tischen fehlt ({len(kollokatoren)} Kollokatoren)")


# ── Golden Query 2: Elend als Substantiv (POS-Mehrheit) ─────────────────────
def test2(wp: sqlite3.Connection) -> Result:
    if not _table_exists(wp, "lemma_corpus_freq"):
        return Result(2, "Elend → Substantiv (POS-Mehrheit)", SKIP,
                       "Tabelle lemma_corpus_freq fehlt")
    rows = wp.execute(
        "SELECT pos, SUM(freq) FROM lemma_corpus_freq WHERE lemma='elend' GROUP BY pos"
    ).fetchall()
    if not rows:
        return Result(2, "Elend → Substantiv (POS-Mehrheit)", SKIP,
                       "kein Lemma 'elend' in lemma_corpus_freq")
    by_pos = dict(rows)
    subst = by_pos.get("Substantiv", 0)
    andere = sum(v for k, v in by_pos.items() if k != "Substantiv")
    if subst == 0:
        return Result(2, "Elend → Substantiv (POS-Mehrheit)", FAIL,
                       f"'elend' nie als Substantiv erfasst: {by_pos}")
    if subst <= andere:
        return Result(2, "Elend → Substantiv (POS-Mehrheit)", FAIL,
                       f"Substantiv nicht Mehrheits-POS: {by_pos}")
    return Result(2, "Elend → Substantiv (POS-Mehrheit)", PASS,
                  f"Substantiv dominiert: {by_pos}")


# ── Golden Query 3: grün (Adj.) → ~PRED-Einträge ────────────────────────────
def test3(wp: sqlite3.Connection) -> Result:
    rows = wp.execute(
        "SELECT DISTINCT dep_lemma FROM collocations "
        "WHERE lemma='grün' AND pos='Adjektiv' AND relation='~PRED'"
    ).fetchall()
    verben = {r[0] for r in rows}
    if not verben:
        return Result(3, "grün (Adj.) → ~PRED-Einträge", SKIP,
                       "keine ~PRED-Kollokatoren für 'grün' in dieser DB")
    return Result(3, "grün (Adj.) → ~PRED-Einträge", PASS, f"~PRED vorhanden: {sorted(verben)}")


# ── Golden Query 4: Tisch + ATTR ─────────────────────────────────────────────
def test4(wp: sqlite3.Connection) -> Result:
    rows = wp.execute(
        "SELECT dep_lemma, logDice, frequency FROM collocations "
        "WHERE lemma='tisch' AND pos='Substantiv' AND relation='ATTR' ORDER BY logDice DESC"
    ).fetchall()
    if not rows:
        return Result(4, "Tisch + ATTR", SKIP, "keine ATTR-Kollokatoren für 'Tisch'")
    kollokatoren = {r[0] for r in rows}
    fehlend = {"rund", "gedeckt"} - kollokatoren
    if fehlend:
        return Result(4, "Tisch + ATTR", FAIL,
                       f"erwartete Kollokatoren fehlen: {fehlend}; vorhanden: {sorted(kollokatoren)}")
    unplausibel = [(dl, dc) for dl, dc, _ in rows if not (-100.0 <= dc <= 14.01)]
    if unplausibel:
        return Result(4, "Tisch + ATTR", FAIL, f"unplausible logDice-Werte: {unplausibel}")
    return Result(4, "Tisch + ATTR", PASS,
                  f"rund+gedeckt vorhanden, {len(rows)} ATTR-Kollokatoren, logDice plausibel")


# ── Golden Query 5: Zeitreise-Dekaden ────────────────────────────────────────
def test5(wp: sqlite3.Connection) -> Result:
    if not _table_exists(wp, "zeitreise"):
        return Result(5, "Zeitreise: Dekaden-Abdeckung", SKIP, "Tabelle zeitreise fehlt")
    n_dekaden = wp.execute("SELECT COUNT(DISTINCT jahrzehnt) FROM zeitreise").fetchone()[0]
    if n_dekaden == 0:
        return Result(5, "Zeitreise: Dekaden-Abdeckung", SKIP,
                       "zeitreise-Tabelle leer (Mini-Korpus ohne verwertbare Jahresangaben)")
    if n_dekaden < 5:
        return Result(5, "Zeitreise: Dekaden-Abdeckung", SKIP,
                       f"nur {n_dekaden} Dekade(n) – Abdeckungstest erst ab Phase-C-Subset sinnvoll")
    n_luecke = wp.execute(
        "SELECT COUNT(*) FROM zeitreise WHERE jahrzehnt BETWEEN 1880 AND 1940"
    ).fetchone()[0]
    if n_luecke == 0:
        return Result(5, "Zeitreise: Dekaden-Abdeckung", FAIL,
                       f"{n_dekaden} Dekaden vorhanden, aber keine zwischen 1880 und 1940")
    return Result(5, "Zeitreise: Dekaden-Abdeckung", PASS,
                  f"{n_dekaden} Dekaden, davon {n_luecke} Einträge zwischen 1880 und 1940")


# ── Golden Query 6: Belege-Paare (≥2 Belege, ref vorhanden) ────────────────
def test6(belege: "sqlite3.Connection | None") -> Result:
    if belege is None:
        return Result(6, "Belege: Paare mit ≥2 Belegen + ref", SKIP, "keine belege-DB übergeben")
    if not _table_exists(belege, "belege_fts"):
        return Result(6, "Belege: Paare mit ≥2 Belegen + ref", SKIP, "Tabelle belege_fts fehlt")
    ergebnisse = {}
    fehlend = []
    for wort in CANARY_FTS_WOERTER:
        rows = belege.execute(
            "SELECT d.ref FROM belege_fts f "
            "JOIN saetze s ON s.id = f.rowid "
            "JOIN dokumente d ON d.doc_id = s.doc_id "
            'WHERE belege_fts MATCH ?', (f'"{wort}"',)
        ).fetchall()
        ergebnisse[wort] = len(rows)
        if len(rows) < 2 or any(not r[0] for r in rows):
            fehlend.append(wort)
    n_treffer = sum(1 for v in ergebnisse.values() if v > 0)
    if n_treffer == 0:
        return Result(6, "Belege: Paare mit ≥2 Belegen + ref", SKIP,
                       "keine Canary-Testwörter in belege_v2.db gefunden "
                       "(Testkorpus nicht mitgebaut – auf einer echten Produktions-DB erwartet)")
    if fehlend:
        return Result(6, "Belege: Paare mit ≥2 Belegen + ref", FAIL,
                       f"< 2 Belege oder fehlende ref für: {fehlend} (Details: {ergebnisse})")
    return Result(6, "Belege: Paare mit ≥2 Belegen + ref", PASS,
                  f"alle Testwörter mit ≥2 Belegen inkl. ref: {ergebnisse}")


# ── Golden Query 7: keine „Lizenz unbekannt" ────────────────────────────────
# 'testkorpus' ist das synthetische Gate-A-Canary-Korpus (run_gate_a.py) –
# kein realer Korpus aus dem Plan, braucht daher kein Lizenz-Mapping.
QUELLEN_OHNE_LIZENZPFLICHT = {"testkorpus"}


def test7(belege: "sqlite3.Connection | None") -> Result:
    if belege is None:
        return Result(7, "Belege: keine 'Lizenz unbekannt'", SKIP, "keine belege-DB übergeben")
    if not _table_exists(belege, "quellen"):
        return Result(7, "Belege: keine 'Lizenz unbekannt'", SKIP, "Tabelle quellen fehlt")
    offenders = [r[0] for r in belege.execute(
        "SELECT quelle FROM quellen WHERE lizenz='Lizenz unbekannt'")
        if r[0] not in QUELLEN_OHNE_LIZENZPFLICHT]
    if offenders:
        return Result(7, "Belege: keine 'Lizenz unbekannt'", FAIL,
                       f"{len(offenders)} Quelle(n) ohne Lizenz-Mapping: {offenders}")
    return Result(7, "Belege: keine 'Lizenz unbekannt'", PASS, "keine Quelle mit 'Lizenz unbekannt'")


# ── Golden Query 8: Bindestrich-Lemma ────────────────────────────────────────
def test8(wp: sqlite3.Connection) -> Result:
    row = wp.execute(
        "SELECT 1 FROM collocations WHERE lemma='e-mail' OR dep_lemma='e-mail' LIMIT 1"
    ).fetchone()
    if row is None:
        return Result(8, "Bindestrich-Lemma (E-Mail)", SKIP,
                       "kein Bindestrich-Lemma 'e-mail' in dieser DB")
    return Result(8, "Bindestrich-Lemma (E-Mail)", PASS, "'e-mail' als Lemma vorhanden")


# ── Golden Query 9: kein Glyphen-Rest (ſ) ────────────────────────────────────
def test9(belege: "sqlite3.Connection | None") -> Result:
    if belege is None:
        return Result(9, "Kein Glyphen-Rest (ſ)", SKIP, "keine belege-DB übergeben")
    if not _table_exists(belege, "saetze"):
        return Result(9, "Kein Glyphen-Rest (ſ)", SKIP, "Tabelle saetze fehlt")
    # Bewusst LIKE statt FTS MATCH: ſ ist Bestandteil eines größeren Tokens
    # ("ſchlecht"), FTS5 kennt keine Teilstring-Suche über Tokens hinweg.
    n = belege.execute("SELECT COUNT(*) FROM saetze WHERE satz LIKE ?", ("%ſ%",)).fetchone()[0]
    if n > 0:
        beispiel = belege.execute(
            "SELECT satz FROM saetze WHERE satz LIKE ? LIMIT 1", ("%ſ%",)
        ).fetchone()[0]
        return Result(9, "Kein Glyphen-Rest (ſ)", FAIL,
                       f"{n} Satz/Sätze mit ſ gefunden, z. B.: {beispiel[:120]!r}")
    return Result(9, "Kein Glyphen-Rest (ſ)", PASS, "kein ſ in saetze gefunden")


# ── Golden Query 10: Tageslemmata der letzten ~60 Tage ──────────────────────
def test10(wp: sqlite3.Connection, kalender_db: "Path | None", tage: int = 60) -> Result:
    if kalender_db is None:
        return Result(10, "Tageslemmata (letzte 60 Tage)", SKIP,
                       "kein --kalender-db angegeben (Produktions-signifikation.db nötig)")
    kalender_db = Path(kalender_db)
    if not kalender_db.exists():
        return Result(10, "Tageslemmata (letzte 60 Tage)", SKIP,
                       f"kalender-DB nicht gefunden: {kalender_db}")
    kdb = sqlite3.connect(f"file:{kalender_db}?mode=ro", uri=True)
    try:
        heute = datetime.now(timezone.utc).date()
        ab = (heute - timedelta(days=tage)).isoformat()
        rows = kdb.execute("SELECT ids FROM kalender WHERE datum >= ?", (ab,)).fetchall()
        lemma_ids = set()
        for (ids_json,) in rows:
            try:
                lemma_ids.update(json.loads(ids_json))
            except (TypeError, json.JSONDecodeError):
                continue
        if not lemma_ids:
            return Result(10, "Tageslemmata (letzte 60 Tage)", SKIP,
                           f"keine kalender-Einträge der letzten {tage} Tage gefunden")
        platzhalter = ",".join("?" * len(lemma_ids))
        lemmata = kdb.execute(
            f"SELECT id, lemma FROM lemmata WHERE id IN ({platzhalter})", tuple(lemma_ids)
        ).fetchall()
    finally:
        kdb.close()
    fehlend = []
    for _, lemma in lemmata:
        row = wp.execute("SELECT COUNT(*) FROM collocations WHERE lemma = ?",
                         (lemma.lower(),)).fetchone()
        if row[0] == 0:
            fehlend.append(lemma)
    if fehlend:
        kurz = fehlend[:20]
        mehr = "…" if len(fehlend) > 20 else ""
        return Result(10, "Tageslemmata (letzte 60 Tage)", FAIL,
                       f"{len(fehlend)}/{len(lemmata)} Tageslemmata ohne Kollokatoren: {kurz}{mehr}")
    return Result(10, "Tageslemmata (letzte 60 Tage)", PASS,
                  f"alle {len(lemmata)} Tageslemmata liefern Kollokatoren")


# ── Golden Query 11: Lemma-Normalisierung (Phase E2) ────────────────────────
def test11(wp: sqlite3.Connection) -> Result:
    if not _table_exists(wp, "lemma_corrections"):
        return Result(11, "Lemma-Normalisierung (thier→tier)", SKIP,
                       "Tabelle lemma_corrections fehlt (Phase E2 noch nicht gelaufen)")
    thier = wp.execute(
        "SELECT 1 FROM collocations WHERE lemma='thier' OR dep_lemma='thier' LIMIT 1"
    ).fetchone()
    if thier is not None:
        return Result(11, "Lemma-Normalisierung (thier→tier)", FAIL,
                       "'thier' als eigenständiges Lemma noch vorhanden (E2-Merge fehlgeschlagen)")
    tier = wp.execute(
        "SELECT 1 FROM collocations WHERE lemma='tier' OR dep_lemma='tier' LIMIT 1"
    ).fetchone()
    if tier is None:
        return Result(11, "Lemma-Normalisierung (thier→tier)", SKIP,
                       "'tier' nicht in dieser DB – E2-Merge-Test nicht anwendbar")
    return Result(11, "Lemma-Normalisierung (thier→tier)", PASS,
                  "'thier' gemergt zu 'tier', keine Restvorkommen")


TESTS = [test1, test2, test3, test4, test5, test6, test7, test8, test9, test10, test11]


# ── Kennzahlen-Report ────────────────────────────────────────────────────────

def _sammle_kennzahlen(wp: "sqlite3.Connection | None", belege: "sqlite3.Connection | None",
                       wp_pfad: "Path | None", belege_pfad: "Path | None") -> dict:
    k = {}
    if wp is not None:
        k["collocations"] = wp.execute("SELECT COUNT(*) FROM collocations").fetchone()[0]
        k["distinct_lemma"] = wp.execute(
            "SELECT COUNT(DISTINCT lemma||'|'||pos) FROM collocations").fetchone()[0]
        if _table_exists(wp, "lemma_corpus_freq"):
            k["lemma_corpus_freq"] = wp.execute(
                "SELECT COUNT(*) FROM lemma_corpus_freq").fetchone()[0]
        if _table_exists(wp, "zeitreise"):
            k["zeitreise_zeilen"] = wp.execute("SELECT COUNT(*) FROM zeitreise").fetchone()[0]
            k["zeitreise_dekaden"] = wp.execute(
                "SELECT COUNT(DISTINCT jahrzehnt) FROM zeitreise").fetchone()[0]
        if _table_exists(wp, "build_info"):
            k["build_info"] = dict(wp.execute("SELECT key, value FROM build_info"))
        if wp_pfad and Path(wp_pfad).exists():
            k["wortprofil_db_bytes"] = Path(wp_pfad).stat().st_size
    if belege is not None:
        if _table_exists(belege, "dokumente"):
            k["dokumente"] = belege.execute("SELECT COUNT(*) FROM dokumente").fetchone()[0]
        if _table_exists(belege, "saetze"):
            k["saetze"] = belege.execute("SELECT COUNT(*) FROM saetze").fetchone()[0]
        if _table_exists(belege, "quellen"):
            k["quellen"] = belege.execute("SELECT COUNT(*) FROM quellen").fetchone()[0]
        if belege_pfad and Path(belege_pfad).exists():
            k["belege_db_bytes"] = Path(belege_pfad).stat().st_size
    return k


def _fmt_bytes(n: int) -> str:
    for einheit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:,.0f} {einheit}"
        n /= 1024
    return f"{n:,.1f} TB"


def schreibe_report(pfad: Path, label: str, ergebnisse: list,
                    kennzahlen: dict, alt_kennzahlen: dict):
    n_pass = sum(1 for r in ergebnisse if r.status == PASS)
    n_fail = sum(1 for r in ergebnisse if r.status == FAIL)
    n_skip = sum(1 for r in ergebnisse if r.status == SKIP)
    zeilen = [
        f"# Golden-Query-Report: {label}",
        "",
        f"Erstellt: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        f"**{n_pass} PASS · {n_fail} FAIL · {n_skip} SKIP** (von {len(ergebnisse)} Tests)",
        "",
        "| # | Test | Status | Detail |",
        "|---|---|---|---|",
    ]
    for r in ergebnisse:
        detail = r.detail.replace("|", "\\|")
        zeilen.append(f"| {r.nr} | {r.name} | {r.status} | {detail} |")

    zeilen += ["", "## Kennzahlen", ""]
    if not kennzahlen:
        zeilen.append("(keine DB übergeben)")
    else:
        zeilen.append("| Kennzahl | Wert | zum Vergleich (alt) |")
        zeilen.append("|---|---|---|")
        alt_map = {
            "collocations": alt_kennzahlen.get("collocations"),
            "wortprofil_db_bytes": alt_kennzahlen.get("wortprofil_db_bytes"),
            "dokumente": alt_kennzahlen.get("dokumente"),
            "saetze": alt_kennzahlen.get("saetze"),
            "belege_db_bytes": alt_kennzahlen.get("belege_db_bytes"),
        }
        for key, val in kennzahlen.items():
            if key == "build_info":
                continue
            alt = alt_map.get(key)
            anzeige = _fmt_bytes(val) if key.endswith("_bytes") else f"{val:,}" if isinstance(val, int) else str(val)
            alt_anzeige = "–"
            if alt is not None:
                alt_anzeige = _fmt_bytes(alt) if key.endswith("_bytes") else f"{alt:,}"
            zeilen.append(f"| {key} | {anzeige} | {alt_anzeige} |")
        if "build_info" in kennzahlen:
            zeilen += ["", "### build_info", ""]
            for k, v in kennzahlen["build_info"].items():
                zeilen.append(f"- **{k}**: {v}")

    pfad.write_text("\n".join(zeilen), encoding="utf-8")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Golden-Query-Validierung (DB-Neuaufbau.md, Abschnitt 6)")
    parser.add_argument("--wortprofil-db", required=True, help="Zu prüfende wortprofil_v2.db")
    parser.add_argument("--belege-db", help="Zu prüfende belege_v2.db (optional)")
    parser.add_argument("--kalender-db", help="signifikation.db für Test 10 (optional)")
    parser.add_argument("--old-wortprofil-db", help="alte wortprofil.db zum Kennzahlen-Vergleich")
    parser.add_argument("--old-belege-db", help="alte belege.db zum Kennzahlen-Vergleich")
    parser.add_argument("--report", help="Markdown-Report schreiben (Pfad)")
    parser.add_argument("--label", default="Validierung", help="Report-Titel")
    args = parser.parse_args()

    wp_pfad = Path(args.wortprofil_db)
    if not wp_pfad.exists():
        print(f"FEHLER: wortprofil-db nicht gefunden: {wp_pfad}")
        sys.exit(2)
    wp = sqlite3.connect(f"file:{wp_pfad}?mode=ro", uri=True)
    belege = _open_ro(args.belege_db)

    ergebnisse = []
    for fn in TESTS:
        try:
            if fn in (test6, test7, test9):
                r = fn(belege)
            elif fn is test10:
                r = fn(wp, args.kalender_db)
            else:
                r = fn(wp)
        except sqlite3.OperationalError as e:
            r = Result(TESTS.index(fn) + 1, fn.__name__, FAIL, f"SQL-Fehler: {e}")
        ergebnisse.append(r)

    print(f"\n=== Golden-Query-Validierung: {args.label} ===\n")
    for r in ergebnisse:
        print(f"  [{r.status:4s}] #{r.nr:2d} {r.name}")
        print(f"           {r.detail}")

    n_pass = sum(1 for r in ergebnisse if r.status == PASS)
    n_fail = sum(1 for r in ergebnisse if r.status == FAIL)
    n_skip = sum(1 for r in ergebnisse if r.status == SKIP)
    print(f"\n{n_pass} PASS · {n_fail} FAIL · {n_skip} SKIP (von {len(ergebnisse)} Tests)")

    kennzahlen = _sammle_kennzahlen(wp, belege, wp_pfad, Path(args.belege_db) if args.belege_db else None)

    alt_wp = _open_ro(args.old_wortprofil_db)
    alt_belege = _open_ro(args.old_belege_db)
    alt_kennzahlen = {}
    if alt_wp is not None or alt_belege is not None:
        alt_kennzahlen = _sammle_kennzahlen(
            alt_wp, alt_belege,
            Path(args.old_wortprofil_db) if args.old_wortprofil_db else None,
            Path(args.old_belege_db) if args.old_belege_db else None,
        )

    if args.report:
        report_pfad = Path(args.report)
        report_pfad.parent.mkdir(parents=True, exist_ok=True)
        schreibe_report(report_pfad, args.label, ergebnisse, kennzahlen, alt_kennzahlen)
        print(f"\nReport geschrieben: {report_pfad}")

    wp.close()
    if belege is not None:
        belege.close()
    if alt_wp is not None:
        alt_wp.close()
    if alt_belege is not None:
        alt_belege.close()

    sys.exit(1 if n_fail else 0)


if __name__ == "__main__":
    main()
