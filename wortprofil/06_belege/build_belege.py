"""
Phase 6 – Belegsatz-Index aufbauen (FTS5 SQLite)

Aufruf: python build_belege.py [--korpora NAME,...] [--reset]

Liest JSONL aus 02_parsed/, splittet in Sätze,
schreibt FTS5-Index nach 06_belege/belege.db.

Unabhängig vom Wortprofil-Parser – kann jederzeit (neu) ausgeführt werden.
"""

import json
import re
import sqlite3
import sys
from pathlib import Path

PARSED_DIR = Path(__file__).parent.parent / "02_parsed"
OUT_DB     = Path(__file__).parent / "belege.db"
OUT_DB.parent.mkdir(exist_ok=True)

# ── Vollständige Quellen-Metadaten ────────────────────────────────────────────
# Key = quelle-Wert aus den JSONL-Dateien
# Wert = vollständige Zitation mit Lizenzangabe für die App
QUELLEN_META = {
    "pol_reden": (
        "Barbaresi, A. (2019). German Political Speeches Corpus (v4.2019). "
        "Zenodo. doi:10.5281/zenodo.3611246",
        "CC BY-SA"
    ),
    "gesetze": (
        "Gesetze im Internet (gesetze-im-internet.de), "
        "Bundesministerium der Justiz / juris GmbH",
        "Gemeinfrei (§ 5 UrhG)"
    ),
    "bundestag": (
        "Deutscher Bundestag – Dokumentations- und Informationssystem (DIP), "
        "dip.bundestag.de",
        "Datenlizenz Deutschland BY 2.0"
    ),
    "bundestagskorpus_pdf": (
        "Deutscher Bundestag – Dokumentations- und Informationssystem (DIP), "
        "dip.bundestag.de",
        "Datenlizenz Deutschland BY 2.0"
    ),
    "deu_news": (
        "Wortschatz-Korpus, Universität Leipzig, "
        "wortschatz.uni-leipzig.de",
        "CC BY"
    ),
    "deu_newscrawl": (
        "Wortschatz-Korpus, Universität Leipzig, "
        "wortschatz.uni-leipzig.de",
        "CC BY"
    ),
    "dibilit": (
        "Boenig, M. & Hug, M. (2021). DiBiLit – Digitale Bibliothek Literatur. "
        "Zenodo. doi:10.5281/zenodo.5786725",
        "CC BY-SA 4.0"
    ),
    "wikibooks": (
        "Wikimedia Foundation. Wikibooks auf Deutsch (de.wikibooks.org). "
        "Zenodo. doi:10.5281/zenodo.8081095",
        "CC BY-SA 3.0"
    ),
    "wikivoyage": (
        "Wikimedia Foundation. Wikivoyage auf Deutsch (de.wikivoyage.org). "
        "Zenodo. doi:10.5281/zenodo.7568517",
        "CC BY-SA 3.0"
    ),
    "neuer_pitaval": (
        "Weitin, T. & Herget, K. (2022). Der Neue Pitaval (1842–1890). "
        "Zenodo. doi:10.5281/zenodo.6682897",
        "CC BY-SA 4.0"
    ),
    "dta_kern": (
        "Deutsches Textarchiv, Kernkorpus. deutschestextarchiv.de",
        "CC BY-SA 4.0"
    ),
    "dta_erweiterungen": (
        "Deutsches Textarchiv, Erweiterungen. deutschestextarchiv.de",
        "CC BY-SA 4.0"
    ),
    # dta_github enthält mehrere Repos, häufigster quelle-Wert:
    "humboldt-publizistik": (
        "Deutsches Textarchiv – Alexander von Humboldt Publizistik. "
        "deutschestextarchiv.de",
        "CC BY-SA 4.0"
    ),
    "jean-paul-briefe": (
        "Deutsches Textarchiv – Jean Paul Briefe. deutschestextarchiv.de",
        "CC BY-SA 4.0"
    ),
    "edition-humboldt": (
        "Deutsches Textarchiv – Edition Humboldt digital. "
        "deutschestextarchiv.de",
        "CC BY-SA 4.0"
    ),
    "dta-novellenschatz": (
        "Deutsches Textarchiv – DTA Novellenschatz. deutschestextarchiv.de",
        "CC BY-SA 4.0"
    ),
    "dta-soldatenbriefe": (
        "Deutsches Textarchiv – DTA Soldatenbriefe. deutschestextarchiv.de",
        "CC BY-SA 4.0"
    ),
    "gei_digital": (
        "GEI-Digital, Leibniz-Institut für Bildungsmedien / Georg-Eckert-Institut. "
        "Zenodo. doi:10.5281/zenodo.15729290",
        "Public Domain"
    ),
    "ref_fnh": (
        "Wegera, K.-P. et al. (2021). Referenzkorpus Frühneuhochdeutsch. "
        "ISLRN 918-968-828-554-7",
        "CC BY-SA 4.0"
    ),
    "ref_mhd": (
        "Roussel, A. et al. (2024). Referenzkorpus Mittelhochdeutsch. "
        "ISLRN 937-948-254-174-0",
        "CC BY-SA 4.0"
    ),
}

def zitation_fuer(quelle: str) -> str:
    """Gibt die vollständige Zitationszeichenkette für einen quelle-Schlüssel zurück."""
    if quelle in QUELLEN_META:
        qtext, lizenz = QUELLEN_META[quelle]
        return f"{qtext} · {lizenz}"
    # Fallback für unbekannte quelle-Werte
    return f"{quelle} · Lizenz unbekannt"


# ── Korpus-Liste ──────────────────────────────────────────────────────────────
# Nur moderne, hochwertige Korpora; historische (ref_mhd, ref_fnh, gei_digital,
# dta_*) weggelassen – Sätze wären für Spieler meist unverständlich.
DEFAULT_KORPORA = [
    "gesetze.jsonl",
    "pol_reden.jsonl",
    "bundestag_xml.jsonl",
    "bundestag_pdf.jsonl",
    "leipzig.jsonl",
    "wikibooks.jsonl",
    "wikivoyage.jsonl",
    "dibilit.jsonl",
    "pitaval.jsonl",
]

MIN_SATZ_LEN = 30
MAX_SATZ_LEN = 400
SENT_RE = re.compile(r'(?<=[.!?])\s+(?=[A-ZÄÖÜ\"\'])')
BATCH   = 100_000


def satz_split(text: str) -> list[str]:
    raw = SENT_RE.split(text.replace('\n', ' ').replace('\r', ''))
    return [s.strip() for s in raw if MIN_SATZ_LEN <= len(s.strip()) <= MAX_SATZ_LEN]


def init_db(conn: sqlite3.Connection):
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-131072")
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS belege USING fts5(
            satz,
            quelle    UNINDEXED,
            zitation  UNINDEXED,
            jahr      UNINDEXED,
            tokenize  = 'unicode61 remove_diacritics 0'
        )
    """)
    conn.commit()


def verarbeite_jsonl(jsonl_path: Path, conn: sqlite3.Connection) -> int:
    print(f"\n── {jsonl_path.name}")
    batch   = []
    n_saetze = 0

    with jsonl_path.open(encoding="utf-8") as f:
        for zeile in f:
            zeile = zeile.strip()
            if not zeile:
                continue
            try:
                obj    = json.loads(zeile)
                text   = obj.get("text", "").strip()
                quelle = obj.get("quelle", "unbekannt")
                jahr   = obj.get("jahr") or 0
                if not text:
                    continue
                zit = zitation_fuer(quelle)
                for satz in satz_split(text):
                    batch.append((satz, quelle, zit, int(jahr)))
                    n_saetze += 1
                    if len(batch) >= BATCH:
                        conn.executemany(
                            "INSERT INTO belege(satz, quelle, zitation, jahr) "
                            "VALUES (?,?,?,?)",
                            batch
                        )
                        conn.commit()
                        batch.clear()
                        print(f"  {n_saetze:,} Sätze ...", flush=True)
            except (json.JSONDecodeError, ValueError):
                pass

    if batch:
        conn.executemany(
            "INSERT INTO belege(satz, quelle, zitation, jahr) VALUES (?,?,?,?)",
            batch
        )
        conn.commit()

    print(f"  [OK] {n_saetze:,} Sätze")
    return n_saetze


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--korpora", help="Kommagetrennte Dateinamen (ohne Pfad)")
    parser.add_argument("--reset",   action="store_true", help="DB neu anlegen")
    args = parser.parse_args()

    if args.reset and OUT_DB.exists():
        OUT_DB.unlink()
        print("[RESET] belege.db gelöscht.")

    korpora = (
        [k.strip() for k in args.korpora.split(",")]
        if args.korpora else DEFAULT_KORPORA
    )

    print(f"Ausgabe: {OUT_DB}")
    print(f"Korpora: {', '.join(korpora)}")

    conn = sqlite3.connect(OUT_DB)
    init_db(conn)

    gesamt = 0
    for datei in korpora:
        pfad = PARSED_DIR / datei
        if not pfad.exists():
            print(f"  [SKIP] {pfad} nicht gefunden")
            continue
        gesamt += verarbeite_jsonl(pfad, conn)

    conn.close()
    print(f"\n=== Fertig: {gesamt:,} Sätze indexiert ===")
    print(f"DB: {OUT_DB}")


if __name__ == "__main__":
    main()
