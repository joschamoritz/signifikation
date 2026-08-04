"""Phase E2, Schritt 5+6 - DESTRUKTIVER Merge der freigegebenen Lemma-Korrekturen.

Voraussetzung: `lemma_corrections.freigegeben=1` ist gesetzt, Sicherungskopie
liegt, `PRAGMA integrity_check` war ok.

Ablauf (alle Datenaenderungen in EINER Transaktion):
  1. Arbeitstabelle `e2_map` aus den freigegebenen Zeilen.
  2. Die vier `collocations`-Indizes droppen (Betriebsregel 3c: wahlfreies
     Index-Schreiben ist der teuerste Teil).
  3. UNIQUE-Index auf dem Kollokations-Schluessel anlegen. Das ist zugleich der
     Beweis, dass die Tabelle VOR dem Merge duplikatfrei ist - schlaegt der
     Aufbau fehl, bricht der Merge ab, statt stillschweigend falsch zu mergen.
  4. Betroffene Zeilen mit bereits gemappten Werten in `e2_stage` sichern,
     aus `collocations` loeschen, per `ON CONFLICT DO UPDATE` zurueckschreiben:
     `SUM(frequency)`, `MAX(logDice)`. `ORDER BY id` beim Einfuegen macht den
     Survivor deterministisch zum Eintrag mit der kleinsten id.
     Mitgezogen: `lemma`, `dep_lemma`, `form` (= Kopie von dep_lemma) und
     `relation_full` (Bauart `lemma-pos-relation` bzw. `lemma-pos-PP~prep`).
  5. `zeitreise` analog ueber den vorhandenen Primaerschluessel.
  6. `lemma_corpus_freq` analog. Das Zusammenfuehren der gemappten Lemmata
     liefert exakt dasselbe wie ein Neubau aus triples_v2 mit angewandtem
     Mapping (die Tabelle ist eine reine Summe je (lemma, pos, quelle)) - spart
     einen weiteren Voll-Scan ueber 526 Mio. Zeilen.
  7. Original-Indizes neu, `build_info` fortschreiben, Hilfstabellen weg.
Danach ausserhalb der Transaktion: `wal_checkpoint(TRUNCATE)`, `VACUUM INTO`
auf eine NEUE Datei (die alte bleibt als Sofort-Rollback liegen), `ANALYZE`.

Aufruf:
  wortprofil-env/Scripts/python.exe phase_e2/merge.py            # Merge
  wortprofil-env/Scripts/python.exe phase_e2/merge.py --vacuum-only
"""

import argparse
import os
import shutil
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HIER = Path(__file__).parent
WP_DB_DEFAULT = Path(r"C:\wortprofil_v2\wortprofil_v2.db")
TMP_DIR_DEFAULT = HIER.parent / "_tmp"
MIN_FREE_GB = 25.0

REL_FULL = ("CASE WHEN prep='' THEN lemma||'-'||pos||'-'||relation "
            "ELSE lemma||'-'||pos||'-PP~'||prep END")

INDIZES = [
    ("idx_collocations_lookup",
     "CREATE INDEX idx_collocations_lookup ON collocations "
     "(lemma, pos, relation, logDice DESC)"),
    ("idx_lemma_pos",
     "CREATE INDEX idx_lemma_pos ON collocations (lemma, pos)"),
    ("idx_relation_full",
     "CREATE INDEX idx_relation_full ON collocations (relation_full)"),
    ("idx_collocations_top",
     "CREATE INDEX idx_collocations_top ON collocations "
     "(lemma, pos, logDice DESC, frequency, dep_pos)"),
]


def redirect_tmp(tmp_dir: Path):
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for var in ("SQLITE_TMPDIR", "TMPDIR", "TMP", "TEMP"):
        os.environ[var] = str(tmp_dir)


def frei_gb(p: Path) -> float:
    return shutil.disk_usage(p if p.exists() else p.parent).free / 2**30


def schritt(nr, text):
    print(f"\n[{nr}] {text}", flush=True)
    return time.time()


def fertig(t0, extra=""):
    print(f"    ok in {time.time()-t0:,.0f}s {extra}", flush=True)


def vacuum_und_swap(db: Path, tmp_dir: Path):
    ziel = db.with_name(db.stem + "_e2vac.db")
    if ziel.exists():
        ziel.unlink()
    frei = frei_gb(db)
    noetig = db.stat().st_size / 2**30
    print(f"\nVACUUM INTO -> {ziel.name}  (frei {frei:.1f} GB, "
          f"Bedarf ~{noetig:.1f} GB)")
    if frei < noetig + 5:
        print("ABBRUCH: zu wenig Platz fuer VACUUM INTO (Betriebsregel 1).")
        sys.exit(1)
    t0 = time.time()
    c = sqlite3.connect(db)
    c.execute("PRAGMA cache_size=-1048576")
    c.execute("VACUUM INTO ?", (str(ziel),))
    c.close()
    print(f"    ok in {time.time()-t0:,.0f}s — "
          f"{db.stat().st_size/2**30:.2f} GB -> {ziel.stat().st_size/2**30:.2f} GB")

    t0 = time.time()
    c = sqlite3.connect(ziel)
    c.execute("PRAGMA cache_size=-1048576")
    c.execute("ANALYZE")
    c.commit()
    n_coll = c.execute("SELECT count(*) FROM collocations").fetchone()[0]
    n_zeit = c.execute("SELECT count(*) FROM zeitreise").fetchone()[0]
    n_lcf = c.execute("SELECT count(*) FROM lemma_corpus_freq").fetchone()[0]
    n_lc = c.execute("SELECT count(*) FROM lemma_corrections").fetchone()[0]
    thier = c.execute("SELECT count(*) FROM collocations "
                      "WHERE lemma='thier' OR dep_lemma='thier'").fetchone()[0]
    integ = c.execute("PRAGMA integrity_check").fetchall()
    c.close()
    print(f"    ANALYZE + Pruefung in {time.time()-t0:,.0f}s")
    print(f"    collocations {n_coll:,} · zeitreise {n_zeit:,} · "
          f"lemma_corpus_freq {n_lcf:,} · lemma_corrections {n_lc:,}")
    print(f"    'thier' als lemma/dep_lemma: {thier}   integrity_check: {integ}")
    if integ != [("ok",)] or thier != 0:
        print("ABBRUCH: Pruefung der vakuumierten Datei fehlgeschlagen — "
              "es wird NICHT getauscht.")
        sys.exit(1)

    # ACHTUNG: Diese Datei ist NICHT der Stand vor dem Merge - sie ist bereits
    # gemergt, nur noch nicht vakuumiert. Der einzige echte Rollback ist die
    # Sicherungskopie D:\wortprofil_v2_backup\wortprofil_v2.db.pre-e2.
    alt = db.with_name(db.stem + "_e2_unvacuumed.db")
    if alt.exists():
        alt.unlink()
    for suffix in ("-wal", "-shm"):
        p = Path(str(db) + suffix)
        if p.exists():
            p.unlink()
    db.rename(alt)
    ziel.rename(db)
    print(f"\nGetauscht. {alt.name} ({alt.stat().st_size/2**30:.2f} GB) ist der "
          f"gemergte, unvakuumierte Zwischenstand — nach der Validierung loeschbar.")
    print("ROLLBACK laeuft ausschliesslich ueber "
          r"D:\wortprofil_v2_backup\wortprofil_v2.db.pre-e2 .")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wp-db", type=Path, default=WP_DB_DEFAULT)
    ap.add_argument("--tmp-dir", type=Path, default=TMP_DIR_DEFAULT)
    ap.add_argument("--vacuum-only", action="store_true")
    args = ap.parse_args()
    redirect_tmp(args.tmp_dir)

    db = args.wp_db
    if args.vacuum_only:
        vacuum_und_swap(db, args.tmp_dir)
        return

    frei = frei_gb(db)
    print(f"Frei auf dem Ziellaufwerk: {frei:.1f} GB (Mindestens {MIN_FREE_GB} GB)")
    if frei < MIN_FREE_GB:
        print("ABBRUCH: Betriebsregel 1.")
        sys.exit(1)

    conn = sqlite3.connect(db, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA cache_size=-1048576")       # 1 GiB
    conn.execute("PRAGMA temp_store=FILE")
    conn.execute("PRAGMA foreign_keys=OFF")

    n_frei = conn.execute(
        "SELECT count(*) FROM lemma_corrections WHERE freigegeben=1").fetchone()[0]
    if n_frei == 0:
        print("ABBRUCH: keine freigegebene Zeile in lemma_corrections.")
        sys.exit(1)
    vorher = {
        "collocations": conn.execute("SELECT count(*) FROM collocations").fetchone()[0],
        "zeitreise": conn.execute("SELECT count(*) FROM zeitreise").fetchone()[0],
        "lcf": conn.execute("SELECT count(*) FROM lemma_corpus_freq").fetchone()[0],
        "freq": conn.execute("SELECT sum(frequency) FROM collocations").fetchone()[0],
    }
    print(f"Freigegebene Korrekturen: {n_frei:,}")
    print(f"Vorher: collocations {vorher['collocations']:,}, "
          f"zeitreise {vorher['zeitreise']:,}, lcf {vorher['lcf']:,}, "
          f"Summe frequency {vorher['freq']:,}")

    conn.execute("BEGIN IMMEDIATE")
    try:
        t = schritt(1, "Arbeitstabelle e2_map")
        conn.execute("DROP TABLE IF EXISTS e2_map")
        conn.execute("CREATE TABLE e2_map (alt TEXT NOT NULL, pos TEXT NOT NULL, "
                     "korrekt TEXT NOT NULL, PRIMARY KEY (alt, pos)) WITHOUT ROWID")
        conn.execute("INSERT INTO e2_map SELECT alt, dep_pos, korrekt "
                     "FROM lemma_corrections WHERE freigegeben=1")
        fertig(t, f"({n_frei:,} Zeilen)")

        t = schritt(2, "collocations-Indizes droppen")
        for name, _ in INDIZES:
            conn.execute(f"DROP INDEX IF EXISTS {name}")
        fertig(t)

        t = schritt(3, "UNIQUE-Index auf dem Kollokations-Schluessel "
                       "(zugleich Duplikat-Beweis fuer den Ausgangszustand)")
        conn.execute("CREATE UNIQUE INDEX idx_e2_key ON collocations "
                     "(lemma, pos, relation, dep_lemma, dep_pos, prep)")
        fertig(t)

        t = schritt(4, "betroffene collocations-Zeilen sichern (bereits gemappt)")
        conn.execute("DROP TABLE IF EXISTS e2_stage")
        conn.execute(f"""
            CREATE TABLE e2_stage AS
            SELECT c.id                                            AS id,
                   coalesce(mh.korrekt, c.lemma)                   AS lemma,
                   c.pos                                           AS pos,
                   c.relation                                      AS relation,
                   c.relation_description                          AS relation_description,
                   coalesce(md.korrekt, c.dep_lemma)               AS dep_lemma,
                   c.dep_pos                                       AS dep_pos,
                   c.prep                                          AS prep,
                   c.frequency                                     AS frequency,
                   c.logDice                                       AS logDice,
                   c.dep_case                                      AS dep_case,
                   c.dep_number                                    AS dep_number
            FROM collocations c
            LEFT JOIN e2_map mh ON mh.alt = c.lemma     AND mh.pos = c.pos
            LEFT JOIN e2_map md ON md.alt = c.dep_lemma AND md.pos = c.dep_pos
            WHERE mh.korrekt IS NOT NULL OR md.korrekt IS NOT NULL
        """)
        n_stage = conn.execute("SELECT count(*) FROM e2_stage").fetchone()[0]
        fertig(t, f"({n_stage:,} Zeilen)")
        if n_stage == 0:
            raise RuntimeError("keine betroffene Zeile gefunden - Abbruch")

        t = schritt(5, "betroffene Zeilen aus collocations loeschen")
        conn.execute("CREATE INDEX idx_e2_stage_id ON e2_stage (id)")
        conn.execute("DELETE FROM collocations WHERE id IN (SELECT id FROM e2_stage)")
        n_nach_del = conn.execute("SELECT count(*) FROM collocations").fetchone()[0]
        if n_nach_del != vorher["collocations"] - n_stage:
            raise RuntimeError(
                f"DELETE inkonsistent: {n_nach_del:,} statt "
                f"{vorher['collocations'] - n_stage:,}")
        fertig(t, f"(verbleiben {n_nach_del:,})")

        t = schritt(6, "gemappte Zeilen zurueckschreiben, Duplikate zusammenfuehren")
        conn.execute(f"""
            INSERT INTO collocations
                (id, lemma, pos, relation, relation_full, relation_description,
                 form, dep_lemma, dep_pos, prep, frequency, logDice,
                 dep_case, dep_number)
            SELECT id, lemma, pos, relation,
                   {REL_FULL},
                   relation_description,
                   dep_lemma, dep_lemma, dep_pos, prep, frequency, logDice,
                   dep_case, dep_number
            FROM e2_stage
            ORDER BY id
            ON CONFLICT (lemma, pos, relation, dep_lemma, dep_pos, prep)
            DO UPDATE SET frequency = frequency + excluded.frequency,
                          logDice   = max(logDice, excluded.logDice)
        """)
        n_coll = conn.execute("SELECT count(*) FROM collocations").fetchone()[0]
        f_coll = conn.execute("SELECT sum(frequency) FROM collocations").fetchone()[0]
        if f_coll != vorher["freq"]:
            raise RuntimeError(
                f"Frequenzsumme veraendert: {f_coll:,} statt {vorher['freq']:,}")
        fertig(t, f"({n_coll:,} Zeilen, "
                  f"{vorher['collocations']-n_coll:,} Duplikate verschmolzen; "
                  f"Frequenzsumme unveraendert)")

        t = schritt(7, "relation_full der unveraenderten Zeilen pruefen")
        n_bad = conn.execute(
            f"SELECT count(*) FROM collocations WHERE relation_full <> {REL_FULL}"
        ).fetchone()[0]
        if n_bad:
            raise RuntimeError(f"{n_bad:,} Zeilen mit falschem relation_full")
        fertig(t, "(0 Abweichungen)")

        t = schritt(8, "zeitreise mergen")
        conn.execute("DROP TABLE IF EXISTS e2_zt")
        conn.execute("""
            CREATE TABLE e2_zt AS
            SELECT coalesce(mh.korrekt, z.lemma)     AS lemma,
                   z.pos                             AS pos,
                   coalesce(md.korrekt, z.dep_lemma) AS dep_lemma,
                   z.dep_pos                         AS dep_pos,
                   z.jahrzehnt                       AS jahrzehnt,
                   z.freq                            AS freq,
                   z.score                           AS score,
                   z.lemma                           AS alt_lemma,
                   z.dep_lemma                       AS alt_dep
            FROM zeitreise z
            LEFT JOIN e2_map mh ON mh.alt = z.lemma     AND mh.pos = z.pos
            LEFT JOIN e2_map md ON md.alt = z.dep_lemma AND md.pos = z.dep_pos
            WHERE mh.korrekt IS NOT NULL OR md.korrekt IS NOT NULL
        """)
        n_zt = conn.execute("SELECT count(*) FROM e2_zt").fetchone()[0]
        f_zt_vorher = conn.execute("SELECT sum(freq) FROM zeitreise").fetchone()[0]
        # Row-Value-IN trifft den vorhandenen Primaerschluessel-Index; ein JOIN
        # ueber rowid wuerde stattdessen 61 Mio. Zeilen scannen.
        conn.execute("""
            DELETE FROM zeitreise
            WHERE (lemma, pos, dep_lemma, dep_pos, jahrzehnt) IN
                  (SELECT alt_lemma, pos, alt_dep, dep_pos, jahrzehnt FROM e2_zt)
        """)
        conn.execute("""
            INSERT INTO zeitreise (lemma, pos, dep_lemma, dep_pos, jahrzehnt, freq, score)
            SELECT lemma, pos, dep_lemma, dep_pos, jahrzehnt, freq, score FROM e2_zt
            WHERE true          -- trennt die upsert-Klausel vom JOIN-ON (SQLite-Parser)
            ON CONFLICT (lemma, pos, dep_lemma, dep_pos, jahrzehnt)
            DO UPDATE SET freq = freq + excluded.freq,
                          score = max(score, excluded.score)
        """)
        n_zeit = conn.execute("SELECT count(*) FROM zeitreise").fetchone()[0]
        f_zt = conn.execute("SELECT sum(freq) FROM zeitreise").fetchone()[0]
        if f_zt != f_zt_vorher:
            raise RuntimeError(f"zeitreise-Frequenzsumme veraendert: {f_zt:,} "
                               f"statt {f_zt_vorher:,}")
        fertig(t, f"({n_zt:,} betroffen, {vorher['zeitreise']-n_zeit:,} verschmolzen, "
                  f"{n_zeit:,} Zeilen; Frequenzsumme unveraendert)")

        t = schritt(9, "lemma_corpus_freq mergen")
        conn.execute("DROP TABLE IF EXISTS e2_lcf")
        conn.execute("""
            CREATE TABLE e2_lcf AS
            SELECT m.korrekt AS lemma, l.pos AS pos, l.quelle AS quelle,
                   l.freq AS freq, l.lemma AS alt_lemma
            FROM lemma_corpus_freq l
            JOIN e2_map m ON m.alt = l.lemma AND m.pos = l.pos
        """)
        n_lcf_t = conn.execute("SELECT count(*) FROM e2_lcf").fetchone()[0]
        f_lcf_vorher = conn.execute("SELECT sum(freq) FROM lemma_corpus_freq").fetchone()[0]
        conn.execute("""
            DELETE FROM lemma_corpus_freq
            WHERE (lemma, pos, quelle) IN
                  (SELECT alt_lemma, pos, quelle FROM e2_lcf)
        """)
        conn.execute("""
            INSERT INTO lemma_corpus_freq (lemma, pos, quelle, freq)
            SELECT lemma, pos, quelle, freq FROM e2_lcf
            WHERE true          -- s. o.
            ON CONFLICT (lemma, pos, quelle)
            DO UPDATE SET freq = freq + excluded.freq
        """)
        n_lcf = conn.execute("SELECT count(*) FROM lemma_corpus_freq").fetchone()[0]
        f_lcf = conn.execute("SELECT sum(freq) FROM lemma_corpus_freq").fetchone()[0]
        if f_lcf != f_lcf_vorher:
            raise RuntimeError(f"lcf-Frequenzsumme veraendert: {f_lcf:,}")
        fertig(t, f"({n_lcf_t:,} betroffen, {vorher['lcf']-n_lcf:,} verschmolzen, "
                  f"{n_lcf:,} Zeilen)")

        t = schritt(10, "Hilfsstrukturen weg, Original-Indizes neu")
        conn.execute("DROP INDEX idx_e2_key")
        conn.execute("DROP TABLE e2_stage")
        conn.execute("DROP TABLE e2_zt")
        conn.execute("DROP TABLE e2_lcf")
        conn.execute("DROP TABLE e2_map")
        for name, ddl in INDIZES:
            t1 = time.time()
            conn.execute(ddl)
            print(f"    {name}: {time.time()-t1:,.0f}s", flush=True)
        fertig(t)

        t = schritt(11, "build_info fortschreiben")
        jetzt = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for k, v in [
            ("e2_merged_at", jetzt),
            ("e2_korrekturen_freigegeben", str(n_frei)),
            ("e2_collocations_verschmolzen", str(vorher["collocations"] - n_coll)),
            ("e2_zeitreise_verschmolzen", str(vorher["zeitreise"] - n_zeit)),
            ("e2_verfahren", "Regelmenge Orthografiegeschichte + Bestands- und "
                             "Frequenzwaechter (dwdsmor untauglich, siehe "
                             "phase_e2/BEFUND_DWDSMOR.md)"),
            ("n_collocations", str(n_coll)),
            ("n_zeitreise", str(n_zeit)),
            ("n_lemma_corpus_freq", str(n_lcf)),
        ]:
            conn.execute("INSERT INTO build_info (key, value) VALUES (?,?) "
                         "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, v))
        fertig(t)

        conn.execute("COMMIT")
        print("\nCOMMIT ok.")
    except Exception as e:
        conn.execute("ROLLBACK")
        print(f"\nFEHLER — Transaktion zurueckgerollt, DB unveraendert:\n  {e}")
        conn.close()
        sys.exit(1)

    print("\nWAL-Checkpoint ...", flush=True)
    print(conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone())
    conn.close()

    vacuum_und_swap(db, args.tmp_dir)


if __name__ == "__main__":
    sys.exit(main())
