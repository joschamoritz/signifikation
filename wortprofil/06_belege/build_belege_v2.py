"""
Phase 6 (v2) – Belegsatz-Index aufbauen (FTS5 external content + normalisierte Metadaten)

Baut build_belege.py gemäß planning/DB-Neuaufbau.md (Abschnitt 3.4) zur v2 aus.
Die alte build_belege.py + belege.db bleiben unangetastet (Grundregel „nichts
in-place"). Ausgabe: 06_belege/belege_v2.db.

Eingabe: 02_parsed_v2/*.jsonl  (v2-Schema: id, text, quelle, genre, epoche, jahr,
                                titel, autor, ref)

Schema (§3.4) — statt einer FTS5-Tabelle mit redundanter Zitation in jeder Zeile
jetzt normalisiert + FTS5 external content:

    dokumente(doc_id, quelle, ref, jahr, genre, epoche)   -- Dokument-Ebene
    quellen(quelle, zitation, lizenz)                     -- Korpus-Ebene (1×)
    saetze(id, satz, doc_id → dokumente)                  -- Rohtext (FTS-Content)
    belege_fts USING fts5(satz, content='saetze', content_rowid='id')

Anzeige in der App: „ref · Korpus-Zitation · Lizenz" (Join dokumente↔quellen),
z. B. „Abel: Wohlerfahrner Leib-Medicus … 1699 · Deutsches Textarchiv, Kernkorpus · CC BY-SA 4.0".

Behobene Fehler / Erweiterungen:
  K7  Satz-Splitter mit Abkürzungs-/Ordinalzahl-Liste („z. B.", „Dr.", „bzw." …)
      statt naivem Regex auf .!? + Großbuchstabe.
  F1/F3  Korpusliste erweitert: bisherige 9 + german_commons komplett
      + dta_*/gei_digital ab Jahr 1830 mit Qualitätsfilter + wikipedia (aus A4).

Aufruf:
  python build_belege_v2.py                        # volle Korpusliste (Plan)
  python build_belege_v2.py --korpora a.jsonl,b.jsonl
  python build_belege_v2.py --reset
  python build_belege_v2.py --parsed-dir X --out-db Y   # Pfade überschreiben (Tests)
"""

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

PARSED_DIR_DEFAULT = Path(__file__).parent.parent / "02_parsed_v2"
OUT_DB_DEFAULT     = Path(__file__).parent / "belege_v2.db"


# ── Vollständige Quellen-Metadaten ────────────────────────────────────────────
# Key = quelle-Wert aus den v2-JSONL. Wert = (Korpus-Zitation, Lizenz).
# Anzeige setzt sich zusammen aus dokumente.ref · zitation · lizenz.
QUELLEN_META = {
    "pol_reden": (
        "Barbaresi, A. (2019). German Political Speeches Corpus (v4.2019). "
        "Zenodo. doi:10.5281/zenodo.3611246", "CC BY-SA"),
    "gesetze": (
        "Gesetze im Internet (gesetze-im-internet.de), "
        "Bundesministerium der Justiz / juris GmbH", "Gemeinfrei (§ 5 UrhG)"),
    "bundestag": (
        "Deutscher Bundestag – Dokumentations- und Informationssystem (DIP), "
        "dip.bundestag.de", "Datenlizenz Deutschland BY 2.0"),
    "bundestagskorpus_pdf": (
        "Deutscher Bundestag – Dokumentations- und Informationssystem (DIP), "
        "dip.bundestag.de", "Datenlizenz Deutschland BY 2.0"),
    "deu_news": (
        "Wortschatz-Korpus, Universität Leipzig, wortschatz.uni-leipzig.de", "CC BY"),
    "deu_newscrawl": (
        "Wortschatz-Korpus, Universität Leipzig, wortschatz.uni-leipzig.de", "CC BY"),
    "dibilit": (
        "Boenig, M. & Hug, M. (2021). DiBiLit – Digitale Bibliothek Literatur. "
        "Zenodo. doi:10.5281/zenodo.5786725", "CC BY-SA 4.0"),
    "wikibooks": (
        "Wikimedia Foundation. Wikibooks auf Deutsch (de.wikibooks.org). "
        "Zenodo. doi:10.5281/zenodo.8081095", "CC BY-SA 3.0"),
    "wikivoyage": (
        "Wikimedia Foundation. Wikivoyage auf Deutsch (de.wikivoyage.org). "
        "Zenodo. doi:10.5281/zenodo.7568517", "CC BY-SA 3.0"),
    "wikipedia": (
        "Wikimedia Foundation. Wikipedia – Die freie Enzyklopädie "
        "(de.wikipedia.org)", "CC BY-SA 4.0"),
    "neuer_pitaval": (
        "Weitin, T. & Herget, K. (2022). Der Neue Pitaval (1842–1890). "
        "Zenodo. doi:10.5281/zenodo.6682897", "CC BY-SA 4.0"),
    "dta_kern": (
        "Deutsches Textarchiv, Kernkorpus. deutschestextarchiv.de", "CC BY-SA 4.0"),
    "dta_erweiterungen": (
        "Deutsches Textarchiv, Erweiterungen. deutschestextarchiv.de", "CC BY-SA 4.0"),
    # dta_github enthält mehrere Repos, je eigener quelle-Wert:
    "humboldt-publizistik": (
        "Deutsches Textarchiv – Alexander von Humboldt Publizistik. "
        "deutschestextarchiv.de", "CC BY-SA 4.0"),
    "jean-paul-briefe": (
        "Deutsches Textarchiv – Jean Paul Briefe. deutschestextarchiv.de", "CC BY-SA 4.0"),
    "edition-humboldt": (
        "Deutsches Textarchiv – Edition Humboldt digital. deutschestextarchiv.de",
        "CC BY-SA 4.0"),
    "humboldt-digital": (
        "Deutsches Textarchiv – Edition Humboldt Digital. deutschestextarchiv.de",
        "CC BY-SA 4.0"),
    "dta-novellenschatz": (
        "Deutsches Textarchiv – DTA Novellenschatz. deutschestextarchiv.de", "CC BY-SA 4.0"),
    "dta-soldatenbriefe": (
        "Deutsches Textarchiv – DTA Soldatenbriefe. deutschestextarchiv.de", "CC BY-SA 4.0"),
    "dta-stimm-los": (
        "Deutsches Textarchiv – DTA Stimm-los. deutschestextarchiv.de", "CC BY-SA 4.0"),
    "dta-dingler": (
        "Deutsches Textarchiv – Dinglers Polytechnisches Journal (1820–1931). "
        "deutschestextarchiv.de", "CC BY-SA 4.0"),
    "dta-patiententexte": (
        "Deutsches Textarchiv – Patiententexte. deutschestextarchiv.de", "CC BY-SA 4.0"),
    "reichtagsprotokolle": (
        "Verhandlungen des Deutschen Reichstags (1867–1942). "
        "German Commons Corpus, coral-nlp/german-commons. Zenodo", "CC BY-SA 4.0"),
    "dibiphil": (
        "DiBiPhil – Digitale Bibliothek Philosophie. "
        "German Commons Corpus, coral-nlp/german-commons. Zenodo", "CC BY-SA 4.0"),
    "german_commons": (
        "German Commons Corpus, coral-nlp/german-commons. Zenodo", "CC BY-SA 4.0"),
    "gei_digital": (
        "GEI-Digital, Leibniz-Institut für Bildungsmedien / Georg-Eckert-Institut. "
        "Zenodo. doi:10.5281/zenodo.15729290", "Public Domain"),
    "ref_fnh": (
        "Wegera, K.-P. et al. (2021). Referenzkorpus Frühneuhochdeutsch. "
        "ISLRN 918-968-828-554-7", "CC BY-SA 4.0"),
    "ref_mhd": (
        "Roussel, A. et al. (2024). Referenzkorpus Mittelhochdeutsch. "
        "ISLRN 937-948-254-174-0", "CC BY-SA 4.0"),
}


def quelle_meta(quelle: str) -> tuple[str, str]:
    """(Zitation, Lizenz) für einen quelle-Schlüssel. Fallback bewusst
    kennzeichnend, damit Gate F unbekannte Quellen findet."""
    return QUELLEN_META.get(quelle, (quelle, "Lizenz unbekannt"))


# ── K7: Abkürzungs-/Ordinalzahl-bewusster Satz-Splitter ──────────────────────
# Einzel-Token-Abkürzungen (ohne Punkt, kleingeschrieben). Einzelne Buchstaben
# (Initialen, „z. B.", „u. a.") und reine Ziffern („3. Oktober") werden separat
# behandelt.
_ABKUERZUNGEN = {
    "bzw", "usw", "etc", "ca", "vgl", "sog", "ggf", "ggfs", "evtl", "inkl",
    "exkl", "max", "min", "dr", "prof", "nr", "abs", "art", "bd", "aufl",
    "hrsg", "geb", "gest", "verh", "jh", "jhd", "jhdt", "mio", "mrd", "tsd",
    "str", "dgl", "ebd", "insb", "od", "zit", "kap", "ff", "vs", "engl",
    "frz", "lat", "griech", "dt", "span", "ital", "sen", "jun", "hl", "tel",
    "pp", "sp", "bspw", "ea", "va", "uvm", "uva", "resp", "röm", "gr", "lt",
    "abb", "tab", "az", "urt", "beschl", "rn", "rz", "ziff", "buchst",
}

# Kandidaten-Satzgrenze: .!? (+ evtl. schließende Anführung/Klammer) + Whitespace
# + Beginn eines neuen Satzes (Großbuchstabe / öffnende Anführung / Ziffer).
_BOUNDARY = re.compile(r'[.!?]+["\'»«”’)\]]?(?=\s)')
_LAST_TOKEN = re.compile(r'([^\s]+)$')


def _ist_abkuerzung(vortext: str) -> bool:
    """True, wenn der Text vor der Satzzeichen-Grenze auf eine Abkürzung,
    eine Initiale (Einzelbuchstabe) oder eine Ordinalzahl endet → nicht trennen."""
    m = _LAST_TOKEN.search(vortext)
    if not m:
        return False
    token = m.group(1).strip(".")
    if not token:
        return False
    if token.isdigit():
        return True                       # Ordinalzahl „3." → „3. Oktober"
    if len(token) == 1 and token.isalpha():
        return True                       # Initiale / „z. B." / „u. a."
    return token.lower() in _ABKUERZUNGEN


def satz_split(text: str, min_len: int, max_len: int) -> list[str]:
    """Text in Sätze zerlegen (K7). Abkürzungen und Ordinalzahlen erzeugen keine
    Satzgrenze; nur .!? + Whitespace + Satzanfang (Großbuchstabe/Anführung/Ziffer)."""
    text = " ".join(text.replace("\r", " ").replace("\n", " ").split())
    saetze: list[str] = []
    start = 0
    for m in _BOUNDARY.finditer(text):
        end = m.end()
        nach = text[end:].lstrip()
        if not nach or not (nach[0].isupper() or nach[0] in '"\'»«“„(' or nach[0].isdigit()):
            continue
        if _ist_abkuerzung(text[start:m.start() + 1]):
            continue
        saetze.append(text[start:end].strip())
        start = end
    if start < len(text):
        saetze.append(text[start:].strip())
    return [s for s in saetze if min_len <= len(s) <= max_len]


# ── Qualitätsfilter für historische Korpora (F3) ─────────────────────────────

def qualitaet_ok(satz: str) -> bool:
    """Grober Verständlichkeits-/OCR-Filter für historische Sätze (dta_*/gei).
    Verwirft Sätze mit zu wenig Buchstaben, zu wenigen Wörtern oder zu vielen
    1-Zeichen-Fragmenten (typisch für OCR-Rauschen)."""
    if not satz:
        return False
    letters = sum(c.isalpha() for c in satz)
    if letters / len(satz) < 0.6:
        return False
    tokens = satz.split()
    if len(tokens) < 4:
        return False
    kurz = sum(1 for t in tokens if len(t.strip(".,;:!?»«\"'()-")) <= 1)
    if kurz / len(tokens) > 0.30:
        return False
    return True


# ── Korpus-Konfiguration (F1/F3) ─────────────────────────────────────────────
# (dateiname, min_jahr, qualitaetsfilter)
#   min_jahr None  → keine Jahres-Schwelle
#   min_jahr N     → nur Dokumente mit bekanntem jahr >= N (Plan: „ab Jahr 1830")
#   qualitaetsfilter True → zusätzlicher Satz-Qualitätsfilter (historische OCR)
DEFAULT_KORPORA = [
    # bisherige 9 (modern/verständlich, ohne Schwelle)
    ("gesetze.jsonl",           None, False),
    ("pol_reden.jsonl",         None, False),
    ("bundestag_xml.jsonl",     None, False),
    ("bundestag_pdf.jsonl",     None, False),
    ("leipzig.jsonl",           None, False),
    ("wikibooks.jsonl",         None, False),
    ("wikivoyage.jsonl",        None, False),
    ("dibilit.jsonl",           None, False),
    ("pitaval.jsonl",           None, False),
    # NEU: german_commons komplett (Reichstag noch verständlich, kein Cutoff)
    ("german_commons.jsonl",    None, False),
    # NEU: dta_*/gei_digital ab 1830 + Qualitätsfilter
    ("dta_kern.jsonl",          1830, True),
    ("dta_erweiterungen.jsonl", 1830, True),
    ("dta_github.jsonl",        1830, True),
    ("gei_digital.jsonl",       1830, True),
    # NEU: Wikipedia (nur belege, nachrangig; Datei aus Schritt A4)
    ("wikipedia.jsonl",         None, False),
]

MIN_SATZ_LEN = 30
MAX_SATZ_LEN = 400
BATCH = 100_000


def init_db(conn: sqlite3.Connection):
    conn.execute("PRAGMA page_size=16384")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-131072")   # 128 MB
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dokumente (
            doc_id INTEGER PRIMARY KEY,
            quelle TEXT    NOT NULL,
            ref    TEXT    NOT NULL,
            jahr   INTEGER,
            genre  TEXT,
            epoche TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS quellen (
            quelle   TEXT PRIMARY KEY,
            zitation TEXT NOT NULL,
            lizenz   TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS saetze (
            id     INTEGER PRIMARY KEY,
            satz   TEXT    NOT NULL,
            doc_id INTEGER NOT NULL REFERENCES dokumente(doc_id)
        )
    """)
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS belege_fts USING fts5(
            satz,
            content='saetze',
            content_rowid='id',
            tokenize='unicode61 remove_diacritics 0'
        )
    """)
    conn.commit()


def verarbeite_jsonl(jsonl_path: Path, conn: sqlite3.Connection,
                     next_doc_id: int, next_satz_id: int,
                     min_jahr, qualitaetsfilter: bool,
                     quellen_gesehen: set) -> tuple[int, int, int]:
    """Eine v2-JSONL verarbeiten. Gibt (nächste doc_id, nächste satz_id, Satzzahl)
    zurück. doc_id/satz_id werden explizit vergeben → batched executemany möglich."""
    print(f"\n── {jsonl_path.name}"
          + (f"  (ab {min_jahr}{', Qualitätsfilter' if qualitaetsfilter else ''})"
             if min_jahr or qualitaetsfilter else ""))
    doc_id = next_doc_id
    satz_id = next_satz_id
    n_saetze = 0
    n_docs = 0
    n_skip_jahr = 0
    doc_batch: list = []
    satz_batch: list = []

    def flush():
        if doc_batch:
            conn.executemany(
                "INSERT INTO dokumente(doc_id, quelle, ref, jahr, genre, epoche) "
                "VALUES (?,?,?,?,?,?)", doc_batch)
            doc_batch.clear()
        if satz_batch:
            conn.executemany(
                "INSERT INTO saetze(id, satz, doc_id) VALUES (?,?,?)", satz_batch)
            satz_batch.clear()
        conn.commit()

    with jsonl_path.open(encoding="utf-8") as f:
        for zeile in f:
            zeile = zeile.strip()
            if not zeile:
                continue
            try:
                obj = json.loads(zeile)
            except json.JSONDecodeError:
                continue
            text = (obj.get("text") or "").strip()
            if not text:
                continue
            quelle = obj.get("quelle") or "unbekannt"
            try:
                jahr = int(obj.get("jahr") or 0)
            except (TypeError, ValueError):
                jahr = 0

            # F3: „ab Jahr 1830" — nur datierbare Dokumente ≥ Schwelle
            if min_jahr is not None and not (jahr >= min_jahr):
                n_skip_jahr += 1
                continue

            saetze = satz_split(text, MIN_SATZ_LEN, MAX_SATZ_LEN)
            if qualitaetsfilter:
                saetze = [s for s in saetze if qualitaet_ok(s)]
            if not saetze:
                continue   # kein Dokument-Eintrag ohne Sätze (dokumente bleibt sauber)

            doc_id += 1
            n_docs += 1
            quellen_gesehen.add(quelle)
            doc_batch.append((doc_id, quelle, obj.get("ref") or "",
                              jahr or None, obj.get("genre") or "", obj.get("epoche") or ""))
            for satz in saetze:
                satz_id += 1
                satz_batch.append((satz_id, satz, doc_id))
                n_saetze += 1

            if len(satz_batch) >= BATCH:
                flush()
                print(f"  {n_saetze:,} Sätze / {n_docs:,} Dok. ...", flush=True)

    flush()
    extra = f" ({n_skip_jahr:,} Dok. < {min_jahr} übersprungen)" if n_skip_jahr else ""
    print(f"  [OK] {n_saetze:,} Sätze aus {n_docs:,} Dokumenten{extra}")
    return doc_id, satz_id, n_saetze


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Phase 6 (v2): 02_parsed_v2 → belege_v2.db")
    parser.add_argument("--korpora",
                        help="Kommagetrennte Dateinamen (ohne Pfad); überschreibt die Plan-Liste")
    parser.add_argument("--parsed-dir", default=str(PARSED_DIR_DEFAULT),
                        help="Eingabeverzeichnis (Standard: 02_parsed_v2)")
    parser.add_argument("--out-db", default=str(OUT_DB_DEFAULT),
                        help="Ausgabe belege_v2.db (Standard: 06_belege/belege_v2.db)")
    parser.add_argument("--reset", action="store_true", help="DB neu anlegen")
    args = parser.parse_args()

    parsed_dir = Path(args.parsed_dir)
    out_db = Path(args.out_db)
    out_db.parent.mkdir(parents=True, exist_ok=True)

    if args.reset:
        for suffix in ("", "-shm", "-wal"):
            Path(str(out_db) + suffix).unlink(missing_ok=True)
        print("[RESET] belege_v2.db gelöscht.")

    if args.korpora:
        # Bei --korpora ohne Jahres-/Qualitäts-Metadaten: keine Schwelle/Filter.
        korpora = [(k.strip(), None, False) for k in args.korpora.split(",")]
    else:
        korpora = DEFAULT_KORPORA

    print(f"Eingabe: {parsed_dir}")
    print(f"Ausgabe: {out_db}")
    print(f"Korpora: {', '.join(k[0] for k in korpora)}")

    conn = sqlite3.connect(out_db)
    init_db(conn)

    doc_id = conn.execute("SELECT COALESCE(MAX(doc_id), 0) FROM dokumente").fetchone()[0]
    satz_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM saetze").fetchone()[0]
    quellen_gesehen: set = set()

    gesamt = 0
    for datei, min_jahr, qfilter in korpora:
        pfad = parsed_dir / datei
        if not pfad.exists():
            print(f"  [SKIP] {pfad} nicht gefunden")
            continue
        doc_id, satz_id, n = verarbeite_jsonl(
            pfad, conn, doc_id, satz_id, min_jahr, qfilter, quellen_gesehen)
        gesamt += n

    # quellen-Tabelle (eine Zeile je gesehenem Korpus)
    for quelle in sorted(quellen_gesehen):
        zit, liz = quelle_meta(quelle)
        conn.execute(
            "INSERT OR REPLACE INTO quellen(quelle, zitation, lizenz) VALUES (?,?,?)",
            (quelle, zit, liz))
    conn.commit()

    # FTS5 external content aus der saetze-Tabelle aufbauen.
    print("\nBaue FTS5-Index (external content rebuild) ...")
    conn.execute("INSERT INTO belege_fts(belege_fts) VALUES('rebuild')")
    conn.commit()

    n_docs = conn.execute("SELECT COUNT(*) FROM dokumente").fetchone()[0]
    n_quellen = conn.execute("SELECT COUNT(*) FROM quellen").fetchone()[0]
    n_unbekannt = conn.execute(
        "SELECT COUNT(*) FROM quellen WHERE lizenz='Lizenz unbekannt'").fetchone()[0]
    conn.close()

    print(f"\n=== Fertig ===")
    print(f"  Sätze:      {gesamt:,}")
    print(f"  Dokumente:  {n_docs:,}")
    print(f"  Quellen:    {n_quellen}"
          + (f"  ⚠️ davon {n_unbekannt} ohne Lizenz-Mapping" if n_unbekannt else ""))
    print(f"  DB: {out_db}")


if __name__ == "__main__":
    main()
