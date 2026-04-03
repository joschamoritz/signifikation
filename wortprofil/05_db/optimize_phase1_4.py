#!/usr/bin/env python3
"""
Phase 1 + 4 Optimierungen fuer wortprofil.db
- Phase 1: Reverse-Lookup Index fuer collocator->lemma Queries
- Phase 4: Materialisierte corpus_statistics Tabelle
"""
import sqlite3
import time
import shutil
from pathlib import Path

DB_PATH = Path(__file__).parent / "wortprofil.db"
BACKUP_PATH = Path(__file__).parent / "wortprofil.db.phase1-4-backup"

def backup_db():
    """Backup vor Optimierungen"""
    print(f"[BACKUP] {DB_PATH} -> {BACKUP_PATH}")
    shutil.copy2(DB_PATH, BACKUP_PATH)
    print(f"[OK] Backup erstellt")

def optimize_phase_1(conn):
    """Phase 1: Reverse-Lookup Index"""
    print("\n[PHASE 1] Reverse-Lookup Index erstellen...")
    cur = conn.cursor()

    # Index für collocator→lemma Lookups
    start = time.time()
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_collocations_reverse
        ON collocations (dep_lemma, relation, lemma)
    """)
    conn.commit()
    elapsed = time.time() - start
    print(f"[OK] idx_collocations_reverse erstellt ({elapsed:.1f}s)")

    # Validierung: Index Stats
    cur.execute("PRAGMA index_info(idx_collocations_reverse);")
    cols = cur.fetchall()
    print(f"  Columns: {[c[2] for c in cols]}")

def optimize_phase_4(conn):
    """Phase 4: Materialisierte corpus_statistics"""
    print("\n[PHASE 4] Materialisierte corpus_statistics erstellen...")
    cur = conn.cursor()

    # Statistiken berechnen
    start = time.time()

    # Tabelle erstellen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS corpus_statistics (
            stat_name   TEXT PRIMARY KEY,
            value       INTEGER NOT NULL,
            computed_at TEXT NOT NULL
        )
    """)

    # Alte Einträge löschen
    cur.execute("DELETE FROM corpus_statistics")

    # Statistiken einfügen
    from datetime import datetime
    now = datetime.utcnow().isoformat()

    cur.execute("SELECT COUNT(*) FROM collocations")
    total_collocations = cur.fetchone()[0]

    cur.execute("SELECT COUNT(DISTINCT lemma) FROM collocations")
    distinct_lemmas = cur.fetchone()[0]

    cur.execute("SELECT COUNT(DISTINCT dep_lemma) FROM collocations")
    distinct_collocators = cur.fetchone()[0]

    cur.execute("SELECT COUNT(DISTINCT relation) FROM collocations")
    distinct_relations = cur.fetchone()[0]

    stats = [
        ('total_collocations', total_collocations),
        ('distinct_lemmas', distinct_lemmas),
        ('distinct_collocators', distinct_collocators),
        ('distinct_relations', distinct_relations),
    ]

    for stat_name, value in stats:
        cur.execute(
            "INSERT INTO corpus_statistics (stat_name, value, computed_at) VALUES (?, ?, ?)",
            (stat_name, value, now)
        )

    conn.commit()
    elapsed = time.time() - start
    print(f"[OK] corpus_statistics erstellt ({elapsed:.1f}s)")
    print(f"  Total collocations: {total_collocations:,}")
    print(f"  Distinct lemmas: {distinct_lemmas:,}")
    print(f"  Distinct collocators: {distinct_collocators:,}")
    print(f"  Distinct relations: {distinct_relations:,}")

def validate(conn):
    """Validierung"""
    print("\n[VALIDIERUNG]")
    cur = conn.cursor()

    # Indexes prüfen
    cur.execute("PRAGMA index_list(collocations);")
    indexes = {row[1]: row[3] for row in cur.fetchall()}
    print(f"[OK] Indexes: {', '.join(indexes.keys())}")

    # Statistics prüfen
    cur.execute("SELECT COUNT(*) FROM corpus_statistics")
    stats_count = cur.fetchone()[0]
    print(f"[OK] Materialisierte Statistiken: {stats_count} Eintraege")

    # Beispiel-Query mit neuem Index
    cur.execute("""
        SELECT COUNT(*)
        FROM collocations
        WHERE dep_lemma = 'Mensch' AND relation = 'nsubj'
    """)
    result = cur.fetchone()[0]
    print(f"[OK] Test-Query (Mensch als collocator): {result} Treffer")

def main():
    print(f"Optimierung: {DB_PATH}")
    print("=" * 60)

    # Backup
    backup_db()

    # Optimierungen
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")

    optimize_phase_1(conn)
    optimize_phase_4(conn)
    validate(conn)

    conn.close()

    print("\n" + "=" * 60)
    print("[DONE] Phase 1 + 4 abgeschlossen!")
    print(f"  Backup: {BACKUP_PATH}")

if __name__ == '__main__':
    main()
