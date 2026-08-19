"""
Phase F2 – Flexionsunabhängige Belegsuche: Lemma-FTS additiv auf belege_v2.db

Taggt alle Sätze aus belege_v2.db mit spaCy de_zdl_lg (tok2vec + tagger +
morphologizer + trainable_lemmatizer — OHNE Parser/NER) und schreibt pro Satz
eine lemma-normalisierte Wortfolge in eine neue, rein additive FTS5-Tabelle
`lemmata_fts`. Die bestehenden Tabellen (dokumente, quellen, saetze,
belege_fts) werden nicht angefasst — kein Neubau der DB.

Schema-Entscheidung (User, 2026-08-06, gemessen statt geschätzt — siehe
Session 2026-08-06): von 6 verglichenen Varianten gewählt:

    CREATE VIRTUAL TABLE lemmata_fts USING fts5(
        lemma_folge, tokenize='unicode61', content='', detail=none
    )

  - `content=''` (contentless): kein Klartext-Backing, nur der Index. Die
    Lemma-Folge wird nirgends im Klartext gespeichert — angezeigt wird immer
    der Originalsatz aus der längst vorhandenen `saetze`/`belege_fts`.
  - `detail=none`: keine Positionsdaten → kein snippet()/highlight(), kein
    sinnvolles bm25-Ranking auf DIESER Tabelle, aber MATCH-Existenzsuche
    (auch mehrerer Terme, "lemma1 AND lemma2") funktioniert einwandfrei
    (verifiziert) — genau das braucht server/belege.js für Paar-Suchen.
  - Nur INHALTSWÖRTER (Substantiv/Verb/Adjektiv/Adverb, POS_MAP wie in
    parse_deps_v2.py) werden indiziert — Funktionswörter (der/und/in …)
    kann wortprofil_v2 als head_lemma/dep_lemma ohnehin nie liefern.

  Gemessen an einer 47.243-Satz-Stichprobe: 123,5 Bytes/Zeile → hochgerechnet
  auf 141.731.248 Sätze ≈ 16,3 GiB (statt 34,2 GiB bei der ursprünglich
  geplanten Variante A: Tabelle + external-content-FTS, alle Wortarten,
  volle Detailtiefe — siehe Session-Datei für den vollständigen Vergleich
  aller 6 gemessenen Varianten).

Kopplung (Plan §3.3/§3.5, PFLICHT): Auf jedes Satz-Lemma wird dasselbe
`lemma_corrections`-Mapping aus Phase E2 angewendet (aus wortprofil_v2.db,
nur freigegeben=1, Schlüssel (lemma, dep_pos)) — damit belege-Lemmata und
wortprofil-dep_lemma identisch normalisiert sind (thier→tier auf BEIDEN
Seiten).

Laufzeit-Hochrechnung (gemessen, Session 2026-08-06): 8 Prozesse sind der
Sweet Spot (12.081 Tok/s; 4 Prozesse 8.409, 12 Prozesse 11.717 — schlechter,
Speicherbandbreiten-Limit). ~3,086 Mrd. Tokens gesamt → ~71 h reine
Rechenzeit, realistisch 3–4 Tage inkl. Checkpoint-Overhead. Betriebsregeln
aus Phase C/D gelten unverändert (Energiesparplan/Standby AUS — sonst Faktor
14 langsamer nachts; Fortschritt an den Daten messen, nicht an Prozessen;
bei Teilfehlern nicht weiterschreiben).

`nlp.pipe(n_process=N)` funktioniert hier OHNE Umweg über einen
Subprozess-Pool (anders als parse_deps_v2.py mit dwdsmor) — das
Pickle-Problem betraf nur den SFST-Transducer, der hier nicht geladen wird
(verifiziert, Session 2026-08-06).

Nebenprodukt aus dem Plan (exakte Token-Frequenz je Lemma/Wortart/Korpus,
ersetzt den Kollokations-Teilnahme-Proxy aus Phase A3): wird JETZT im selben
Durchlauf mitgesammelt, aber additiv in `belege_v2.db` als eigene Tabelle
`lemma_corpus_freq_exact(lemma, pos, quelle, freq)` — NICHT direkt in
wortprofil_v2.db geschrieben. Zwei Gründe (User-Rückfrage, 2026-08-06):

  1. RAM-Sicherheit (K2-Muster): ein In-Memory-Counter über alle
     (lemma,pos,quelle)-Kombinationen des GESAMTEN Laufs wäre ein eigener
     Phase-D-artiger Risikopunkt. Stattdessen wird der Counter im selben
     Takt wie die Lemma-FTS geflusht (FLUSH_EVERY) und per UPSERT
     (freq = freq + delta) in die DB geschrieben, danach geleert.
  2. Korpus-Scope-Mismatch (WICHTIG, noch ungelöst): `wortprofil_v2.
     lemma_corpus_freq` kennt 34 `quelle`-Werte (u. a. `german_commons_
     justiz`, `ref_fnh`, `ref_mhd` — nie in belege_v2 enthalten, F3-
     Entscheidung), `belege_v2` nur 23 (u. a. mit Jahres-Cutoff ≥1830 für
     dta_*/gei_digital, den wortprofil_v2 NICHT hat). Die hier gesammelte
     Tabelle ist deshalb KEIN direkter Ersatz/Superset für die bestehende
     `lemma_corpus_freq` — sie deckt nur den belege_v2-Korpusausschnitt ab.
     Ein Merge nach wortprofil_v2.db ist ein SEPARATER, späterer Schritt
     nach Abwägung, wie mit den nicht überlappenden Korpora umzugehen ist
     (bestehende Proxy-Zeilen behalten? nur überlappende quelle ersetzen?)
     — hier bewusst NICHT automatisch entschieden.

Aufruf:
  python annotate_lemmata.py --reset --limit 20000        # Testlauf, kein Checkpoint-Fortschritt für den vollen Lauf
  python annotate_lemmata.py                                # voller Lauf (Tage!), resume-fähig
  python annotate_lemmata.py --progress                     # nur Fortschritt anzeigen, kein Tagging
  python annotate_lemmata.py --workers 8                    # Standard: 8 (gemessener Sweet Spot)
"""

import argparse
import gc
import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path

DB_DEFAULT = Path(__file__).parent.parent.parent.parent / "wortprofil_v2" / "belege_v2.db"
# Fallback, falls das obige (Repo-relative) Layout nicht existiert: der auf
# diesem Rechner tatsächlich verwendete Pfad aus CLAUDE.md.
if not DB_DEFAULT.exists():
    DB_DEFAULT = Path(r"C:\wortprofil_v2\belege_v2.db")

WORTPROFIL_DB_DEFAULT = Path(r"C:\wortprofil_v2\wortprofil_v2.db")

TMP_DIR_DEFAULT = Path(__file__).parent.parent / "_tmp"
MIN_FREE_GB = 10.0

# Sweet Spot aus dem Benchmark (Session 2026-08-06): 8 Prozesse, 12.081 Tok/s.
# 12 Prozesse waren SCHLECHTER (Speicherbandbreiten-Limit) — nicht einfach hochdrehen.
WORKERS_DEFAULT = 8
BATCH_SIZE = 500

# Checkpoint-Intervall: ~448 Saetze/s (gemessen) * 300s ≈ 134.000 → alle ~5-6 min,
# analog Betriebsregel 5 (2-13 min Zielkorridor, nicht zu grob wie die
# ursprünglichen 67 min in Phase D vor der Korrektur).
FLUSH_EVERY = 150_000

POS_MAP = {
    "NOUN": "Substantiv", "PROPN": "Substantiv",
    "VERB": "Verb", "AUX": "Verb",
    "ADJ": "Adjektiv", "ADV": "Adverb",
}
CONTENT_POS = set(POS_MAP.keys())   # NOUN/PROPN/VERB/AUX/ADJ/ADV — keine Pronomen/Funktionswoerter

# Fuer die Frequenzzaehlung (lemma_corpus_freq_exact): zusaetzlich Pronomen,
# damit dieselbe POS-Domaene wie in wortprofil_v2.lemma_corpus_freq entsteht
# (dort 5 Werte: Substantiv/Verb/Adjektiv/Adverb/Pronomen). NICHT in
# CONTENT_POS/lemma_folge_of, da Kollokationssuche nie auf Pronomen zielt.
POS_MAP_COUNT = dict(POS_MAP, PRON="Pronomen")


def redirect_tmp(tmp_dir: Path):
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for var in ("SQLITE_TMPDIR", "TMPDIR", "TMP", "TEMP"):
        os.environ[var] = str(tmp_dir)


def free_gb(pfad: Path) -> float:
    ziel = pfad if pfad.exists() else pfad.parent
    return shutil.disk_usage(ziel).free / 2**30


def lade_korrekturen(wortprofil_db: Path) -> dict:
    """(lemma, dep_pos) -> korrigiertes Lemma, nur freigegebene Zeilen
    (Phase E2, lemma_corrections in wortprofil_v2.db)."""
    if not wortprofil_db.exists():
        print(f"  [WARNUNG] {wortprofil_db} nicht gefunden — lemma_corrections NICHT angewendet.")
        return {}
    conn = sqlite3.connect(f"file:{wortprofil_db}?mode=ro", uri=True)
    korr = {
        (alt, pos): korrekt
        for alt, korrekt, pos in conn.execute(
            "SELECT alt, korrekt, dep_pos FROM lemma_corrections WHERE freigegeben=1"
        )
    }
    conn.close()
    print(f"  lemma_corrections geladen: {len(korr):,} freigegebene Regeln")
    return korr


def init_schema(conn: sqlite3.Connection):
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS lemmata_fts USING fts5(
            lemma_folge, tokenize='unicode61', content='', detail=none
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lemmata_progress (
            id           INTEGER PRIMARY KEY CHECK (id = 1),
            last_satz_id INTEGER NOT NULL DEFAULT 0,
            n_verarbeitet INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute(
        "INSERT OR IGNORE INTO lemmata_progress (id, last_satz_id, n_verarbeitet) VALUES (1, 0, 0)"
    )
    # Nebenprodukt (siehe Moduldoku): exakte Token-Frequenz, Scope = belege_v2-
    # Korpusausschnitt. WITHOUT ROWID wie triples_v2 (breiter PK, Platz/Tempo).
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lemma_corpus_freq_exact (
            lemma  TEXT    NOT NULL,
            pos    TEXT    NOT NULL,
            quelle TEXT    NOT NULL,
            freq   INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (lemma, pos, quelle)
        ) WITHOUT ROWID
    """)
    conn.commit()


def lade_quellen_je_doc(read_conn: sqlite3.Connection) -> dict:
    """doc_id -> quelle, komplett im RAM (dokumente hat nur 3,48 Mio. Zeilen,
    23 distinkte quelle-Werte -> interniert, damit die Strings geteilt werden
    statt 3,48 Mio. mal dupliziert)."""
    d = {}
    for doc_id, quelle in read_conn.execute("SELECT doc_id, quelle FROM dokumente"):
        d[doc_id] = sys.intern(quelle)
    return d


def read_progress(conn: sqlite3.Connection) -> tuple[int, int]:
    row = conn.execute(
        "SELECT last_satz_id, n_verarbeitet FROM lemmata_progress WHERE id=1"
    ).fetchone()
    return (int(row[0]), int(row[1])) if row else (0, 0)


def auswerten(doc, korrekturen: dict) -> tuple[str | None, list[tuple[str, str]]]:
    """Ein Doc-Durchlauf, zwei Ergebnisse:
      - lemma_folge: NUR Inhaltswörter (Substantiv/Verb/Adjektiv/Adverb),
        leerzeichengetrennt, mit lemma_corrections — für lemmata_fts.
      - zaehl_paare: (lemma, pos) je Token inkl. Pronomen (POS_MAP_COUNT),
        ebenfalls korrigiert — für lemma_corpus_freq_exact.
    Ein Doc-Durchlauf für beides, keine doppelte Iteration."""
    fts_lemmas = []
    zaehl_paare: list[tuple[str, str]] = []
    for tok in doc:
        pos_count = POS_MAP_COUNT.get(tok.pos_)
        if pos_count is None:
            continue
        lem = tok.lemma_.lower()
        lem = korrekturen.get((lem, pos_count), lem)
        zaehl_paare.append((lem, pos_count))
        if tok.pos_ in CONTENT_POS:
            fts_lemmas.append(lem)
    lemma_folge = " ".join(fts_lemmas) if fts_lemmas else None
    return lemma_folge, zaehl_paare


def iter_saetze(read_conn: sqlite3.Connection, ab_id: int, limit: int | None,
                chunk_size: int = FLUSH_EVERY):
    """Streamt (satz, (id, doc_id)) ab der Wiederaufnahme-Position, aufsteigend
    nach id (K2/K8-Muster: Generator statt Alles-in-RAM, Checkpoint per id).
    doc_id wird für die quelle-Zuordnung (lemma_corpus_freq_exact) gebraucht.

    WICHTIG (Fund im laufenden Betrieb, Session 2026-08-15 — Betriebsregel 5/3d
    aus wortprofil/CLAUDE.md): Liest in gebundenen Chunks statt EINES einzigen
    Cursors über den gesamten Mehrtage-Lauf. Ein durchgehend offener Cursor auf
    read_conn hält eine Lese-Transaktion offen, die den `wal_checkpoint` der
    Schreib-Verbindung (write_conn) auf DERSELBEN Datei unbegrenzt blockiert —
    die WAL wuchs dadurch im ersten Anlauf binnen ~1,5 h auf ~1 GB, ohne je
    zurückgeschrieben zu werden. Jeder Chunk hier wird per `fetchall()` sofort
    vollständig geleert → die Lese-Transaktion endet, bevor der nächste Chunk
    (Minuten später) eine neue beginnt. Der äußere nlp.pipe()-Aufruf bleibt
    trotzdem EIN einziger für den ganzen Lauf (Worker-Pool bleibt warm, kein
    wiederholter Modell-Ladeoverhead pro Chunk)."""
    aktuelle_id = ab_id
    verarbeitet = 0
    while True:
        n = chunk_size
        if limit is not None:
            n = min(n, limit - verarbeitet)
            if n <= 0:
                return
        rows = read_conn.execute(
            "SELECT id, satz, doc_id FROM saetze WHERE id > ? ORDER BY id LIMIT ?",
            (aktuelle_id, n),
        ).fetchall()
        if not rows:
            return
        for satz_id, satz, doc_id in rows:
            yield satz, (satz_id, doc_id)
            aktuelle_id = satz_id
            verarbeitet += 1


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser(description="Phase F2: Lemma-FTS additiv auf belege_v2.db")
    ap.add_argument("--db", default=str(DB_DEFAULT), help="belege_v2.db (lokale Kopie)")
    ap.add_argument("--wortprofil-db", default=str(WORTPROFIL_DB_DEFAULT),
                    help="wortprofil_v2.db, Quelle von lemma_corrections")
    ap.add_argument("--workers", type=int, default=WORKERS_DEFAULT,
                    help=f"spaCy-Prozesse (Standard {WORKERS_DEFAULT}, gemessener Sweet Spot)")
    ap.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    ap.add_argument("--flush-every", type=int, default=FLUSH_EVERY)
    ap.add_argument("--limit", type=int, default=None,
                    help="Max. Sätze in diesem Aufruf (Test) — Checkpoint wird trotzdem gesetzt, "
                         "ein Folgeaufruf ohne --limit setzt sauber fort")
    ap.add_argument("--reset", action="store_true",
                    help="lemmata_fts + Fortschritt löschen und neu anlegen")
    ap.add_argument("--tmp-dir", default=str(TMP_DIR_DEFAULT))
    ap.add_argument("--progress", action="store_true",
                    help="Nur aktuellen Fortschritt anzeigen, kein Tagging")
    args = ap.parse_args()

    db_path = Path(args.db)
    tmp_dir = Path(args.tmp_dir)
    redirect_tmp(tmp_dir)

    if not db_path.exists():
        print(f"[ABBRUCH] {db_path} nicht gefunden.")
        sys.exit(1)

    write_conn = sqlite3.connect(db_path)
    write_conn.execute("PRAGMA journal_mode=WAL")
    write_conn.execute("PRAGMA synchronous=NORMAL")

    if args.progress:
        init_schema(write_conn)
        last_id, n_verarbeitet = read_progress(write_conn)
        total = write_conn.execute("SELECT COUNT(*) FROM saetze").fetchone()[0]
        n_freq = write_conn.execute("SELECT COUNT(*) FROM lemma_corpus_freq_exact").fetchone()[0]
        pct = 100 * n_verarbeitet / total if total else 0
        print(f"Fortschritt: {n_verarbeitet:,} / {total:,} Sätze verarbeitet ({pct:.2f} %), "
              f"zuletzt satz.id={last_id:,}")
        print(f"lemma_corpus_freq_exact: {n_freq:,} distinkte (lemma,pos,quelle)-Zeilen")
        write_conn.close()
        return

    if args.reset:
        write_conn.execute("DROP TABLE IF EXISTS lemmata_fts")
        write_conn.execute("DROP TABLE IF EXISTS lemmata_progress")
        write_conn.execute("DROP TABLE IF EXISTS lemma_corpus_freq_exact")
        write_conn.commit()
        print("[RESET] lemmata_fts + lemma_corpus_freq_exact + Fortschritt gelöscht.")

    init_schema(write_conn)
    last_id, n_verarbeitet = read_progress(write_conn)
    if last_id:
        print(f"[RESUME] ab satz.id > {last_id:,} ({n_verarbeitet:,} bereits verarbeitet)")

    print(f"Frei auf Ziel-Laufwerk: {free_gb(db_path):.1f} GB "
          f"(Prognose Vollausbau: ~16,3 GiB gesamt, Variante E)")
    if free_gb(db_path) < MIN_FREE_GB:
        print(f"[ABBRUCH] Weniger als {MIN_FREE_GB:.0f} GB frei.")
        sys.exit(1)

    korrekturen = lade_korrekturen(Path(args.wortprofil_db))

    print("Lade spaCy-Modell de_zdl_lg (ohne Parser/NER, MIT Morphologizer — "
          "wird für token.pos_ gebraucht, siehe Moduldoku) ...")
    import spacy
    nlp = spacy.load("de_zdl_lg", disable=["ner", "parser"])
    print(f"  Pipes: {nlp.pipe_names}")

    read_conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    total = read_conn.execute("SELECT COUNT(*) FROM saetze").fetchone()[0]

    print("Lade doc_id -> quelle (für lemma_corpus_freq_exact) ...")
    quelle_je_doc = lade_quellen_je_doc(read_conn)
    print(f"  {len(quelle_je_doc):,} Dokumente")

    gen = iter_saetze(read_conn, last_id, args.limit, chunk_size=args.flush_every)

    pending_rows: list[tuple[int, str]] = []
    freq_counter: dict[tuple[str, str, str], int] = {}
    letzte_id = last_id
    n_in_lauf = 0
    n_leer = 0
    t_start = time.perf_counter()
    t_letzter_flush = t_start

    def flush():
        nonlocal pending_rows, freq_counter, n_verarbeitet, letzte_id
        if pending_rows:
            write_conn.executemany(
                "INSERT INTO lemmata_fts(rowid, lemma_folge) VALUES (?, ?)", pending_rows
            )
            n_verarbeitet += len(pending_rows)
            pending_rows = []
        if freq_counter:
            write_conn.executemany(
                "INSERT INTO lemma_corpus_freq_exact (lemma, pos, quelle, freq) "
                "VALUES (?, ?, ?, ?) "
                "ON CONFLICT (lemma, pos, quelle) DO UPDATE SET freq = freq + excluded.freq",
                [(lem, pos, quelle, cnt) for (lem, pos, quelle), cnt in freq_counter.items()],
            )
            freq_counter = {}
        write_conn.execute(
            "UPDATE lemmata_progress SET last_satz_id=?, n_verarbeitet=? WHERE id=1",
            (letzte_id, n_verarbeitet),
        )
        write_conn.commit()
        # Betriebsregel 5/3d: read_conn haelt jetzt nur noch kurze,
        # chunk-gebundene Lese-Transaktionen (siehe iter_saetze) -> die WAL
        # kann hier tatsaechlich zurueckgeschrieben werden. PASSIVE blockiert
        # nicht, falls gerade doch ein Leser aktiv ist.
        write_conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
        # Fund im laufenden Betrieb (Session 2026-08-17, bei 80%): RSS des
        # Hauptprozesses waechst ueber Tage monoton (6,9 -> 8,8 -> 13,6 GB),
        # zeitlich exakt mit dem Start von wikipedia.jsonl (viel groessere
        # lexikalische Vielfalt pro Fenster). Zwei plausible, sich nicht
        # ausschliessende Ursachen: (a) CPythons pymalloc gibt Arenen von
        # grossen freq_counter-Dicts nach dem Leeren nicht an Windows zurueck,
        # (b) spaCys nlp.vocab waechst über die Prozesslebensdauer unbegrenzt
        # mit jedem neuen Lexem (bekanntes spaCy-Verhalten bei langlaufenden
        # Batch-Jobs). gc.collect() adressiert nur (a); der eigentliche Schutz
        # ist der Wrapper-Neustart (setzt Vocab UND Allocator zurueck, Resume
        # ueber den Checkpoint bereits mehrfach verifiziert).
        gc.collect()

    try:
        for doc, (satz_id, doc_id) in nlp.pipe(gen, as_tuples=True,
                                               batch_size=args.batch_size, n_process=args.workers):
            lemma_folge, zaehl_paare = auswerten(doc, korrekturen)
            if lemma_folge is not None:
                pending_rows.append((satz_id, lemma_folge))
            else:
                n_leer += 1
            if zaehl_paare:
                quelle = quelle_je_doc.get(doc_id, "unbekannt")
                for lem, pos in zaehl_paare:
                    key = (lem, pos, quelle)
                    freq_counter[key] = freq_counter.get(key, 0) + 1
            letzte_id = satz_id
            n_in_lauf += 1

            if n_in_lauf % args.flush_every == 0:
                n_freq_keys = len(freq_counter)
                flush()
                dt = time.perf_counter() - t_letzter_flush
                t_letzter_flush = time.perf_counter()
                rate = args.flush_every / dt if dt > 0 else 0
                pct = 100 * n_verarbeitet / total if total else 0
                rest = total - n_verarbeitet
                eta_h = (rest / rate / 3600) if rate > 0 else float("nan")
                frei = free_gb(db_path)
                print(f"  {n_verarbeitet:,} / {total:,} ({pct:.2f} %) · "
                      f"{rate:,.0f} Sätze/s · ETA {eta_h:,.1f} h · frei {frei:.1f} GB · "
                      f"{n_freq_keys:,} Freq-Keys/Fenster",
                      flush=True)
                if frei < MIN_FREE_GB:
                    print(f"[ABBRUCH] Weniger als {MIN_FREE_GB:.0f} GB frei — "
                          f"Lauf gestoppt, Checkpoint gesetzt, mit erneutem Aufruf fortsetzbar.")
                    read_conn.close()
                    write_conn.close()
                    sys.exit(1)
    finally:
        flush()

    dt_gesamt = time.perf_counter() - t_start
    print(f"\n=== Lauf beendet ===")
    print(f"  In diesem Aufruf: {n_in_lauf:,} Sätze ({n_leer:,} ohne Inhaltswort, übersprungen) "
          f"in {dt_gesamt:,.1f}s ({n_in_lauf / dt_gesamt:,.1f} Sätze/s)")
    print(f"  Gesamt-Fortschritt: {n_verarbeitet:,} / {total:,}")
    if n_verarbeitet >= total:
        print("  [FERTIG] Alle Sätze verarbeitet.")
    else:
        print(f"  Noch offen: {total - n_verarbeitet:,} — erneut ohne --limit aufrufen zum Fortsetzen.")

    read_conn.close()
    write_conn.close()


if __name__ == "__main__":
    main()
