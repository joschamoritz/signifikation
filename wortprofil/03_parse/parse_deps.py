"""
Phase 3 – Dependency Parsing & Kollokations-Extraktion
Aufruf: python parse_deps.py [--only <key>] [--dry-run] [--workers N]

Liest JSONL aus 02_parsed/, parst mit spaCy de_zdl_lg (ZDL/BBAW),
schreibt Rohtriples in SQLite 03_deps/triples.db.

Modell: de_zdl_lg v4 (Universal Dependencies / HDT-Tagset)
  - 98.62 % Lemmatisierungsgenauigkeit (DWDSmor-trainiert)
  - UD-Dependency-Labels statt TIGER-Labels
  - Korrekte Adjektiv-Lemmatisierung: hohen→hoch, warmherzigen→warmherzig

UD-Label-Mapping:
  nsubj / nsubj:pass → SUBJA
  obj                → OBJA
  iobj               → OBJD
  nmod (NOUN→NOUN)   → GMOD
  amod (ADJ→NOUN)    → ATTR
  advmod (ADV→VERB)  → ADV
  obl / obl:arg      → PP  (mit case-Kind als Präposition)
  conj               → KON (direkte Koordination, bidirektional)
  xcomp / cop-Pred   → PRED
"""

import argparse
import json
import sqlite3
import sys
from pathlib import Path

PARSED_DIR = Path(__file__).parent.parent / "02_parsed"
DEPS_DIR   = Path(__file__).parent.parent / "03_deps"
DEPS_DIR.mkdir(exist_ok=True)
DB_PATH    = DEPS_DIR / "triples.db"
PROGRESS   = DEPS_DIR / "progress.json"

# Batch-Größe für nlp.pipe()
BATCH_SIZE  = 500
# Commit-Intervall (Anzahl Docs)
COMMIT_EVERY = 100_000

# ── Relation-Mapping UD-Labels → eigene Bezeichnungen ────────────────────
# de_zdl_lg nutzt Universal Dependencies / HDT-Labels (nsubj, obj, amod, conj …)

# POS-Tags → DWDS-Bezeichnung
POS_MAP = {
    "NOUN":  "Substantiv",
    "PROPN": "Substantiv",
    "VERB":  "Verb",
    "AUX":   "Verb",
    "ADJ":   "Adjektiv",
    "ADV":   "Adverb",
    "PRON":  "Pronomen",
}

NOUN_POS    = {"NOUN", "PROPN"}
VERB_POS    = {"VERB", "AUX"}
CONTENT_POS = NOUN_POS | VERB_POS | {"ADJ", "ADV"}

# Für SUBJA/OBJA: Pronomen zusätzlich erlaubt (man, er, sie, es, …)
SUBJ_DEP_POS = NOUN_POS | {"PRON"}

# Min. Wortlänge (Zeichen) für Lemma
MIN_LEN = 2


def init_db(conn: sqlite3.Connection):
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS triples (
            head_lemma  TEXT    NOT NULL,
            head_pos    TEXT    NOT NULL,
            relation    TEXT    NOT NULL,
            dep_lemma   TEXT    NOT NULL,
            dep_pos     TEXT    NOT NULL,
            prep        TEXT    NOT NULL DEFAULT '',
            jahr        INTEGER NOT NULL DEFAULT 0,
            count       INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, jahr)
        )
    """)
    conn.commit()


def load_progress() -> set:
    if PROGRESS.exists():
        return set(json.loads(PROGRESS.read_text(encoding="utf-8")))
    return set()


def save_progress(done: set):
    PROGRESS.write_text(json.dumps(sorted(done)), encoding="utf-8")


def _valid_lem(lem: str) -> bool:
    return len(lem) >= MIN_LEN and lem.isalpha()


def extrahiere_triples(doc) -> list[tuple]:
    """
    Extrahiert Rohtriples aus einem geparsten spaCy-Doc (Universal Dependencies).
    Modell: de_zdl_lg (ZDL/BBAW) – UD-Labels, DWDSmor-Lemmatisierung.

    Rückgabe: Liste von (head_lemma, head_pos_spacy, relation, dep_lemma, dep_pos_spacy, prep)
    """
    triples = []

    for token in doc:
        if token.is_space or not token.is_alpha:
            continue
        dep   = token.dep_
        head  = token.head
        t_pos = token.pos_
        h_pos = head.pos_

        # ── SUBJA: Subjekt (nsubj, nsubj:pass) ────────────────────────────
        if dep in ("nsubj", "nsubj:pass") and h_pos in VERB_POS and t_pos in SUBJ_DEP_POS:
            hl = head.lemma_.lower()
            dl = token.lemma_.lower()
            if _valid_lem(hl) and _valid_lem(dl):
                triples.append((hl, h_pos, "SUBJA", dl, t_pos, ""))

        # ── OBJA: Akkusativobjekt (obj) ───────────────────────────────────
        elif dep == "obj" and h_pos in VERB_POS and t_pos in SUBJ_DEP_POS:
            hl = head.lemma_.lower()
            dl = token.lemma_.lower()
            if _valid_lem(hl) and _valid_lem(dl):
                triples.append((hl, h_pos, "OBJA", dl, t_pos, ""))

        # ── OBJD: Dativobjekt (iobj) ──────────────────────────────────────
        elif dep == "iobj" and h_pos in VERB_POS and t_pos in NOUN_POS:
            hl = head.lemma_.lower()
            dl = token.lemma_.lower()
            if _valid_lem(hl) and _valid_lem(dl):
                triples.append((hl, h_pos, "OBJD", dl, t_pos, ""))

        # ── GMOD: Genitivattribut (nmod: NOUN→NOUN) ───────────────────────
        # In UD-Deutsch: Genitiv-NP als nmod, mit oder ohne Präposition
        elif dep == "nmod" and h_pos in NOUN_POS and t_pos in NOUN_POS:
            # Nur ohne Präposition (echtes Genitivattribut)
            has_prep = any(c.dep_ == "case" and c.pos_ == "ADP" for c in token.children)
            if not has_prep:
                hl = head.lemma_.lower()
                dl = token.lemma_.lower()
                if _valid_lem(hl) and _valid_lem(dl):
                    triples.append((hl, h_pos, "GMOD", dl, t_pos, ""))

        # ── ATTR: Adjektivattribut (amod: ADJ→NOUN) ──────────────────────
        elif dep == "amod" and h_pos in NOUN_POS and t_pos == "ADJ":
            hl = head.lemma_.lower()
            dl = token.lemma_.lower()
            if _valid_lem(hl) and _valid_lem(dl):
                triples.append((hl, h_pos, "ATTR", dl, "ADJ", ""))

        # ── ADV: Adverbialbestimmung (advmod: ADV→VERB) ───────────────────
        elif dep == "advmod" and h_pos in VERB_POS and t_pos == "ADV":
            hl = head.lemma_.lower()
            dl = token.lemma_.lower()
            if _valid_lem(hl) and _valid_lem(dl):
                triples.append((hl, h_pos, "ADV", dl, "ADV", ""))

        # ── PP: Präpositionalphrase (obl: NOUN→VERB mit case-Kind) ────────
        # In UD: VERB → obl → NOUN, NOUN → case → ADP
        elif dep in ("obl", "obl:arg") and h_pos in VERB_POS and t_pos in NOUN_POS:
            prep_tok = next(
                (c for c in token.children if c.dep_ == "case" and c.pos_ == "ADP"),
                None
            )
            if prep_tok:
                prep_lem = prep_tok.lemma_.lower()
                hl = head.lemma_.lower()
                dl = token.lemma_.lower()
                if _valid_lem(hl) and _valid_lem(dl) and prep_lem:
                    triples.append((hl, h_pos, "PP", dl, t_pos, prep_lem))

        # ── KON: Koordination (conj: direkte UD-Struktur) ─────────────────
        # In UD: VERB1/NOUN1 → conj → VERB2/NOUN2 (kein CCONJ-Zwischenknoten)
        # Bidirektional: beide Richtungen als separate Triples
        elif dep == "conj" and t_pos in CONTENT_POS and h_pos in CONTENT_POS:
            # Gleiche Wortart (Verb-Verb, Noun-Noun, Adj-Adj)
            if t_pos == h_pos or (t_pos in NOUN_POS and h_pos in NOUN_POS):
                hl = head.lemma_.lower()
                dl = token.lemma_.lower()
                if _valid_lem(hl) and _valid_lem(dl) and hl != dl:
                    triples.append((hl, h_pos, "KON", dl, t_pos, ""))
                    triples.append((dl, t_pos, "KON", hl, h_pos, ""))

        # ── PRED: Prädikativ (xcomp: ADJ/NOUN → VERB) ─────────────────────
        # z.B. "Er nennt ihn gefährlich" / "Sie ist Lehrerin"
        elif dep == "xcomp" and h_pos in VERB_POS and t_pos in NOUN_POS | {"ADJ"}:
            hl = head.lemma_.lower()
            dl = token.lemma_.lower()
            if _valid_lem(hl) and _valid_lem(dl):
                triples.append((hl, h_pos, "PRED", dl, t_pos, ""))

    return triples


def verarbeite_datei(jsonl_path: Path, nlp, conn: sqlite3.Connection,
                     dry_run: bool, workers: int) -> int:
    """Verarbeitet eine JSONL-Datei und schreibt Triples in die DB."""
    print(f"\n── {jsonl_path.name}")

    # Texte + Metadaten laden
    eintraege = []
    with jsonl_path.open(encoding="utf-8") as f:
        for zeile in f:
            zeile = zeile.strip()
            if not zeile:
                continue
            try:
                obj  = json.loads(zeile)
                text = obj.get("text", "").strip()
                if len(text) < 20:
                    continue
                jahr_raw = obj.get("jahr")
                jahr = int(jahr_raw) if jahr_raw else 0
                eintraege.append((text[:5000], {"jahr": jahr}))
            except (json.JSONDecodeError, ValueError):
                pass

    print(f"  {len(eintraege):,} Dokumente geladen")
    if dry_run:
        print("  [dry-run] überspringe Parsing")
        return 0

    # Parsing & Extraktion
    # key: (head_lem, head_pos, rel, dep_lem, dep_pos, prep, jahr)
    batch_triples: dict[tuple, int] = {}
    n_docs = 0

    for doc, ctx in nlp.pipe(eintraege, as_tuples=True, batch_size=BATCH_SIZE,
                              n_process=workers):
        jahr = ctx["jahr"]
        for triple in extrahiere_triples(doc):
            hl, hp, rel, dl, dp, prep = triple
            key = (hl, hp, rel, dl, dp, prep, jahr)
            batch_triples[key] = batch_triples.get(key, 0) + 1
        n_docs += 1
        if n_docs % 10_000 == 0:
            print(f"  {n_docs:,}/{len(eintraege):,} docs ...", flush=True)

    # In DB schreiben
    n_triples = 0
    for (hl, hp, rel, dl, dp, prep, jahr), cnt in batch_triples.items():
        h_pos_d = POS_MAP.get(hp, hp)
        d_pos_d = POS_MAP.get(dp, dp)
        conn.execute("""
            INSERT INTO triples
                (head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, jahr, count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, jahr)
            DO UPDATE SET count = count + excluded.count
        """, (hl, h_pos_d, rel, dl, d_pos_d, prep, jahr, cnt))
        n_triples += 1

    conn.commit()
    print(f"  [OK] {n_docs:,} Docs → {n_triples:,} unique Triples")
    return n_triples


# ── Konfig ─────────────────────────────────────────────────────────────────

DATEIEN = [
    "gesetze.jsonl",
    "pol_reden.jsonl",
    "bundestag_xml.jsonl",
    "german_commons.jsonl",
    "leipzig.jsonl",
    "dibilit.jsonl",
    "dta_kern.jsonl",
    "dta_erweiterungen.jsonl",
    "dta_github.jsonl",
    "gei_digital.jsonl",
    "ref_fnh.jsonl",
    "ref_mhd.jsonl",
    # Phase 2b – nachträglich extrahiert
    "pitaval.jsonl",
    "wikibooks.jsonl",
    "wikivoyage.jsonl",
    "bundestag_pdf.jsonl",
]


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    parser = argparse.ArgumentParser()
    parser.add_argument("--only",    help="Nur diese Datei verarbeiten (ohne .jsonl)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=1,
                        help="Anzahl spaCy-Prozesse (Standard: 1)")
    parser.add_argument("--reset",   action="store_true",
                        help="Datenbank und Fortschritt zurücksetzen")
    args = parser.parse_args()

    if args.reset:
        DB_PATH.unlink(missing_ok=True)
        PROGRESS.unlink(missing_ok=True)
        print("[RESET] Datenbank und Fortschritt gelöscht.")

    print("Lade spaCy-Modell de_zdl_lg (ZDL/BBAW, UD-Labels, DWDSmor-Lemmatisierung) ...")
    import spacy
    nlp = spacy.load("de_zdl_lg", disable=["ner"])
    if "sentencizer" not in nlp.pipe_names and "senter" not in nlp.pipe_names:
        nlp.add_pipe("sentencizer", first=True)
    print(f"  Pipes: {nlp.pipe_names}")

    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    erledigt = load_progress()
    dateien  = DATEIEN if not args.only else [f"{args.only}.jsonl"]

    gesamt = 0
    for dateiname in dateien:
        if dateiname in erledigt:
            print(f"  [SKIP] {dateiname} (bereits verarbeitet)")
            continue
        pfad = PARSED_DIR / dateiname
        if not pfad.exists():
            print(f"  [SKIP] {pfad} nicht gefunden")
            continue
        n = verarbeite_datei(pfad, nlp, conn, args.dry_run, args.workers)
        gesamt += n
        if not args.dry_run:
            erledigt.add(dateiname)
            save_progress(erledigt)

    conn.close()
    print(f"\n=== Fertig. Gesamt: {gesamt:,} unique Triples ===")
    print(f"Datenbank: {DB_PATH}")


if __name__ == "__main__":
    main()
