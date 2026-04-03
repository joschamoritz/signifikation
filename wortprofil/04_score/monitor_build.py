#!/usr/bin/env python3
"""
Live-Monitor für build_wortprofil.py
Zeigt den Fortschritt in Echtzeit mit Prozentbalken
"""

import sqlite3
import time
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "05_db" / "wortprofil.db"
EXPECTED_TOTAL = 1_215_463  # 656.629 direkt + 558.834 invers

def get_row_count():
    """Liest aktuelle Zeilen in collocations"""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.execute("SELECT COUNT(*) FROM collocations")
        count = c.fetchone()[0]
        conn.close()
        return count
    except:
        return 0

def format_bar(current, total, width=50):
    """Zeichnet einen Prozentbalken"""
    pct = (current / total * 100) if total > 0 else 0
    filled = int(width * current / total) if total > 0 else 0
    bar = "█" * filled + "░" * (width - filled)
    return f"[{bar}] {pct:.1f}% ({current:,}/{total:,})"

def main():
    print("🔄 Überwache build_wortprofil.py...")
    print(f"   DB: {DB_PATH}")
    print(f"   Erwartet: {EXPECTED_TOTAL:,} Zeilen")
    print()

    last_count = 0
    same_count_iterations = 0
    start_time = time.time()

    try:
        while True:
            current = get_row_count()
            elapsed = time.time() - start_time

            # Formatierung
            bar = format_bar(current, EXPECTED_TOTAL)

            # Geschwindigkeit berechnen
            if elapsed > 0:
                rate = current / elapsed  # rows/sec
                remaining = EXPECTED_TOTAL - current
                eta_sec = remaining / rate if rate > 0 else 0
                eta_min = eta_sec / 60
                eta_str = f"ETA: {eta_min:.1f} min" if eta_sec > 0 else "...berechne..."
            else:
                eta_str = "...start..."

            # Status
            if current == last_count:
                same_count_iterations += 1
                if same_count_iterations > 30:  # Nach 30 sec ohne Änderung
                    status = "⚠️  HÄNGT? (keine Änderung seit 30s)"
                    same_count_iterations = 0  # Reset für nächsten Check
                else:
                    status = "🕐 Lädt Marginals (kann dauern)..."
            else:
                status = "✅ Schreibt..."
                same_count_iterations = 0

            last_count = current

            # Ausgabe
            print(f"\r{bar} | {eta_str} | {status}", end="", flush=True)

            # Fertig?
            if current >= EXPECTED_TOTAL:
                print(f"\n✨ FERTIG! {current:,} Kollokationen geschrieben.")
                break

            time.sleep(1)

    except KeyboardInterrupt:
        print(f"\n⏹️  Abgebrochen. {current:,} Kollokationen geschrieben.")
        sys.exit(1)

if __name__ == "__main__":
    main()
