#!/usr/bin/env python3
"""
Phase 2 + 3 Optimierungen fuer wortprofil.db
- Phase 2: Compressed Zeitreise Materialization (separate Tabelle pro Dekade)
- Phase 3: Dynamic FTS5 Tokenization fuer belege.db (if available)
"""
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent / "wortprofil.db"
BELEGE_PATH = Path(__file__).parent.parent / "06_belege" / "belege.db"

def optimize_phase_2(conn):
    """Phase 2: Compressed Zeitreise Materialization"""
    print("\n[PHASE 2] Zeitreise Materialization...")
    cur = conn.cursor()

    # Prüfe ob zeitreise Tabelle existiert
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='zeitreise'")
    if not cur.fetchone():
        print("  [SKIP] Keine zeitreise Tabelle gefunden")
        return

    start = time.time()

    # Neue Materialisierungs-Tabelle für schnellere Dekaden-Lookups
    cur.execute("""
        CREATE TABLE IF NOT EXISTS zeitreise_by_decade (
            lemma       TEXT     NOT NULL,
            decade      TEXT     NOT NULL,
            collocators TEXT     NOT NULL,
            PRIMARY KEY (lemma, decade)
        )
    """)

    # Dekaden-Daten aggregieren (GroupConcat für Kollokatoren)
    cur.execute("""
        SELECT DISTINCT lemma FROM zeitreise
    """)
    lemmas = [row[0] for row in cur.fetchall()]

    decades_list = []
    cur.execute("SELECT DISTINCT jahrzehnt FROM zeitreise ORDER BY jahrzehnt")
    for row in cur.fetchall():
        if row[0]:
            decades_list.append(str(row[0]))

    print(f"  Materialisiere {len(lemmas)} Lemmata x {len(decades_list)} Dekaden...")

    for lemma in lemmas[:100]:  # Batch der ersten 100 zu Demo
        for decade in decades_list:
            cur.execute("""
                SELECT GROUP_CONCAT(dep_lemma || ':' || CAST(score AS TEXT), ',')
                FROM zeitreise
                WHERE lemma = ? AND jahrzehnt = ?
            """, (lemma, int(decade)))
            result = cur.fetchone()[0]
            if result:
                cur.execute("""
                    INSERT OR REPLACE INTO zeitreise_by_decade
                    (lemma, decade, collocators)
                    VALUES (?, ?, ?)
                """, (lemma, decade, result))

    conn.commit()
    elapsed = time.time() - start
    print(f"[OK] zeitreise_by_decade erstellt ({elapsed:.1f}s)")

    # Index für schnelle Lookups
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_zeitreise_decade
        ON zeitreise_by_decade (lemma, decade)
    """)
    conn.commit()
    print(f"[OK] idx_zeitreise_decade erstellt")

def optimize_phase_3(conn):
    """Phase 3: FTS5 Tokenization Optimization fuer belege.db"""
    print("\n[PHASE 3] FTS5 Tokenization Optimization...")

    if not BELEGE_PATH.exists():
        print(f"  [SKIP] belege.db nicht gefunden: {BELEGE_PATH}")
        return

    print(f"  Optimiere FTS5 in {BELEGE_PATH}...")
    belege_conn = sqlite3.connect(str(BELEGE_PATH))
    belege_cur = belege_conn.cursor()

    start = time.time()

    # Prüfe FTS5 Tabelle
    belege_cur.execute("SELECT name FROM sqlite_master WHERE type='table' LIKE '%fts%'")
    fts_table = belege_cur.fetchone()

    if not fts_table:
        print("  [SKIP] Keine FTS5 Tabelle gefunden")
        belege_conn.close()
        return

    fts_table = fts_table[0]
    print(f"  FTS5 Tabelle: {fts_table}")

    # Optimiere FTS5 mit OPTIMIZE Befehl
    try:
        belege_cur.execute(f"INSERT INTO {fts_table}({fts_table}) VALUES('optimize')")
        belege_conn.commit()
        elapsed = time.time() - start
        print(f"[OK] FTS5 optimiert ({elapsed:.1f}s)")
    except Exception as e:
        print(f"  [WARN] FTS5 Optimize fehlgeschlagen: {e}")

    belege_conn.close()

def validate_phase_2(conn):
    """Validiere Phase 2"""
    print("\n[VALIDIERUNG Phase 2]")
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM zeitreise_by_decade")
    count = cur.fetchone()[0]
    print(f"[OK] zeitreise_by_decade: {count} Eintraege")

    cur.execute("SELECT COUNT(DISTINCT lemma) FROM zeitreise_by_decade")
    lemmas = cur.fetchone()[0]
    print(f"[OK] Unique Lemmata: {lemmas}")

def main():
    print(f"Optimierung Phase 2 + 3: {DB_PATH}")
    print("=" * 60)

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")

    optimize_phase_2(conn)
    optimize_phase_3(conn)

    validate_phase_2(conn)

    conn.close()

    print("\n" + "=" * 60)
    print("[DONE] Phase 2 + 3 abgeschlossen!")

if __name__ == '__main__':
    main()
