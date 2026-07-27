"""
Phase 3 (v2) – Dependency Parsing & Kollokations-Extraktion

Baut die alte parse_deps.py gemäß planning/DB-Neuaufbau.md (Abschnitt 2, 3.2)
zur v2 aus. Die alte parse_deps.py + triples.db bleiben unangetastet.

Eingabe : 02_parsed_v2/*.jsonl  (v2-Schema aus 02_parse/extract_text.py)
Ausgabe : 03_deps/triples_v2.db (neue Datei, Schema §3.2)

Aufruf:
  python parse_deps_v2.py                     # alle Dateien
  python parse_deps_v2.py --only dta_kern     # nur eine Datei (ohne .jsonl)
  python parse_deps_v2.py --reset             # DB + Fortschritt neu
  python parse_deps_v2.py --benchmark --limit 3000   # Tokens/s messen
  python parse_deps_v2.py --no-dwdsmor        # ohne dwdsmor (Vergleichsmessung)

Behobene Fehler (DB-Neuaufbau.md, Abschnitt 2.1):
  K1  Keine text[:5000]-Kappung mehr. Dokumente werden in Absatz-Chunks
      (~3.000–4.000 Zeichen, an Absatzgrenzen, kein Satz zerschnitten) zerlegt;
      ALLE Chunks werden geparst  → chunk_text().
  K2  Streaming statt Alles-in-RAM: JSONL wird zeilenweise als Generator an
      nlp.pipe() gegeben; Triples werden gebündelt in die DB geflusht, das
      Aggregations-Dict wird dabei geleert (bounded RAM) → iter_chunks()/flush().
  K6  Bindestrich-Lemmata zulassen: Token-Guard + _valid_lem() erlauben
      Buchstaben mit Binnen-Bindestrich (E-Mail, Nord-Süd-Konflikt).
  K8  Checkpoints mit Chunk-Offset pro Datei, IN der DB (Tabelle parse_progress),
      im selben Commit wie die Triples → atomare Wiederaufnahme mitten in der
      Datei, keine Doppelzählung.

dwdsmor-spaCy-Komponente (Datenbanken.md, dwdsmor-Abschnitt):
  `dwdsmor.spacy.Component` wird aktiviert; als Lemma dient `token._.dwdsmor.
  analysis` (Fallback `token.lemma_`, weil dwdsmor für viele finite Verben /
  Fremdwörter None liefert). Trennbare Verben werden über die `compound:prt`-
  Dependenz rekonstruiert („auf" + „tischen" → „auftischen"); die dwdsmor-
  Komponente allein leistet das NICHT (empirisch verifiziert: sie gibt für das
  finite „tischte" None zurück).

Schema-Anmerkung (dep_case/dep_number, §3.2):
  Die neuen Spalten kommen aus spaCys `token.morph` (KONTEXTUELLER Kasus/Numerus
  aus dem Morphologizer), NICHT aus dwdsmor. dwdsmors Kasus ist kontextfrei
  (häufigster lexikalischer Wert) und damit für das Plan-Ziel „PP-Kasus
  in+Dat vs. in+Akk" ungeeignet (Beispiel: „Kellner" als Nom-Subjekt liefert
  dwdsmor case=Acc). Nur der Morphologizer kann den syntaktischen Kasus liefern.
  Aggregation über gleiche Triples: häufigster (case, number)-Wert je Flush-
  Bündel; beim DB-Merge behält die zuerst geschriebene Zeile ihren Wert
  (dokumentierte Näherung – die Spalten sind vorerst App-seitig ungenutzt).
"""

import argparse
import json
import re
import sqlite3
import sys
import time
from collections import Counter
from pathlib import Path

PARSED_DIR_DEFAULT = Path(__file__).parent.parent / "02_parsed_v2"
DEPS_DIR = Path(__file__).parent.parent / "03_deps"
DEPS_DIR.mkdir(exist_ok=True)
DB_PATH = DEPS_DIR / "triples_v2.db"

# Chunking (K1)
CHUNK_TARGET = 3500      # Ziel-Zeichen pro Chunk
CHUNK_HARD_MAX = 4000    # harte Obergrenze (nur überschritten bei satzloser Übergröße)
MIN_LEN_TEXT = 20        # Dokument/Chunk unter dieser Länge überspringen

# Batch/Flush
BATCH_SIZE = 500         # nlp.pipe-Batch
# Chunks: Aggregat in die DB flushen + Checkpoint setzen.
# 2.000 statt 10.000 (Phase D, 2026-07-28): Bei ~465 split-Tokens/Chunk und
# ~1.150 Tok/s je Worker bedeutete 10.000 einen Checkpoint nur alle ~67 min —
# für einen Tage-Lauf zu grob (Absturz = bis zu 67 min Rework je Worker) und das
# pending-Dict wuchs bis ~14 GB RAM je Worker. 2.000 → Checkpoint alle ~13 min
# und deutlich niedrigere RAM-Peaks; die zusätzlichen Commits sind gegenüber der
# Parse-Zeit vernachlässigbar.
FLUSH_EVERY = 2_000

# Min. Wortlänge (Zeichen) für ein Lemma
MIN_LEN = 2

# ── POS-Mapping spaCy → DB-Bezeichnung ──────────────────────────────────────
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
SUBJ_DEP_POS = NOUN_POS | {"PRON"}   # SUBJA/OBJA: Pronomen zusätzlich erlaubt

# K6: Lemma = Buchstaben, optional mit Binnen-Bindestrich (E-Mail, Nord-Süd).
# [^\W\d_] = Unicode-Buchstabe (kein Digit, kein Unterstrich).
_RE_VALID_LEM = re.compile(r"^[^\W\d_]+(?:-[^\W\d_]+)*$", re.UNICODE)


def _valid_lem(lem: str) -> bool:
    return len(lem) >= MIN_LEN and _RE_VALID_LEM.match(lem) is not None


# ── K1: Chunking ────────────────────────────────────────────────────────────
_PARA_SEP = re.compile(r"\n\s*\n")
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def _split_long_paragraph(unit: str, hard_max: int) -> list[str]:
    """Zu langen Absatz an Satzgrenzen teilen (kein Satz wird zerschnitten).
    Nur ein einzelner Satz, der selbst hard_max überschreitet, wird hart
    gesliced (z. B. Tabellen/Listen ohne Satzzeichen)."""
    out: list[str] = []
    buf = ""
    for sent in _SENT_SPLIT.split(unit):
        sent = sent.strip()
        if not sent:
            continue
        if len(sent) > hard_max:
            if buf:
                out.append(buf)
                buf = ""
            for i in range(0, len(sent), hard_max):
                out.append(sent[i:i + hard_max])
            continue
        if buf and len(buf) + len(sent) + 1 > hard_max:
            out.append(buf)
            buf = sent
        else:
            buf = f"{buf} {sent}".strip()
    if buf:
        out.append(buf)
    return out


def chunk_text(text: str, target: int = CHUNK_TARGET,
               hard_max: int = CHUNK_HARD_MAX) -> list[str]:
    """Dokument in Absatz-Chunks von ~target Zeichen zerlegen (K1).

    Es wird an Absatzgrenzen (Leerzeile) getrennt und akkumuliert, bis target
    erreicht ist. Absätze über hard_max werden an Satzgrenzen aufgeteilt.
    Kein Satz wird zerschnitten (außer ein einzelner Satz > hard_max)."""
    text = text.strip()
    if len(text) <= hard_max:
        return [text] if len(text) >= MIN_LEN_TEXT else []
    chunks: list[str] = []
    cur = ""
    for para in _PARA_SEP.split(text):
        para = para.strip()
        if not para:
            continue
        units = _split_long_paragraph(para, hard_max) if len(para) > hard_max else [para]
        for u in units:
            if not cur:
                cur = u
            elif len(cur) + len(u) + 2 <= target:
                cur = f"{cur}\n\n{u}"
            else:
                chunks.append(cur)
                cur = u
    if cur:
        chunks.append(cur)
    return [c for c in chunks if len(c) >= MIN_LEN_TEXT]


# ── Lemma-/Morph-Auflösung (dwdsmor + spaCy) ────────────────────────────────

def _base_lemma(token) -> str:
    """Lemma aus dwdsmor (falls verfügbar) sonst spaCy, kleingeschrieben."""
    if token.has_extension("dwdsmor"):
        dm = token._.dwdsmor
        if dm is not None and dm.analysis:
            return dm.analysis.lower()
    return token.lemma_.lower()


def lemma_of(token) -> str:
    """Vollständiges Lemma inkl. Rekonstruktion trennbarer Verbpräfixe.

    Für ein Verb mit abgetrenntem Präfix (Dependenz `compound:prt`) wird das
    Präfix vorangestellt: „tischen" + Partikel „auf" → „auftischen". Die
    dwdsmor-Basis enthält das Präfix nie doppelt (bei abgetrenntem Partikel
    liefert dwdsmor die präfixlose Basis bzw. None)."""
    lem = _base_lemma(token)
    if token.pos_ in VERB_POS:
        prts = [c for c in token.children if c.dep_ == "compound:prt"]
        if prts:
            prt = min(prts, key=lambda c: c.i)   # deterministisch: linkester Partikel
            p = _base_lemma(prt) or prt.text.lower()
            lem = p + lem
    return lem


def _case_of(token) -> str:
    """Kontextueller Kasus des DEP-Tokens. de_zdl_lg markiert den Kasus oft nur
    am Funktionswort (Artikel: den=Acc, dem=Dat, des=Gen), nicht am Nomen selbst
    (Nom/Akk sind an den meisten Nomen mehrdeutig). Deshalb Fallback auf den
    Kasus des Determiner-/Case-Kindes → macht dep_case für die PP-Disambiguierung
    (in+Dat vs. in+Akk) brauchbar."""
    case = token.morph.get("Case")
    if case:
        return case[0]
    for child in token.children:
        if child.dep_ in ("det", "det:poss", "case"):
            cc = child.morph.get("Case")
            if cc:
                return cc[0]
    return ""


def _morph(token) -> tuple[str, str]:
    """Kontextueller (Kasus, Numerus) des DEP-Tokens aus spaCys Morphologizer.
    Werte wie 'Nom'/'Gen'/'Dat'/'Acc' und 'Sing'/'Plur'; leer, wenn nicht gesetzt."""
    num = token.morph.get("Number")
    return _case_of(token), (num[0] if num else "")


# ── Triple-Extraktion ───────────────────────────────────────────────────────

def extrahiere_triples(doc) -> list[tuple]:
    """Rohtriples aus einem geparsten spaCy-Doc (Universal Dependencies).

    Rückgabe je Triple:
      (head_lemma, head_pos_de, relation, dep_lemma, dep_pos_de, prep,
       dep_case, dep_number)
    POS bereits auf DB-Bezeichnungen gemappt; dep_case/dep_number aus dem
    DEP-Token (Morphologizer)."""
    triples: list[tuple] = []

    def emit(head_tok, rel, dep_tok, prep=""):
        hl = lemma_of(head_tok)
        dl = lemma_of(dep_tok)
        if not (_valid_lem(hl) and _valid_lem(dl)):
            return
        if rel == "KON" and hl == dl:
            return
        hp = POS_MAP.get(head_tok.pos_, head_tok.pos_)
        dp = POS_MAP.get(dep_tok.pos_, dep_tok.pos_)
        dcase, dnum = _morph(dep_tok)
        triples.append((hl, hp, rel, dl, dp, prep, dcase, dnum))

    for token in doc:
        if token.is_space or token.is_punct or token.like_num:
            continue
        dep   = token.dep_
        head  = token.head
        t_pos = token.pos_
        h_pos = head.pos_

        # ── SUBJA: Subjekt (nsubj, nsubj:pass) ──────────────────────────────
        if dep in ("nsubj", "nsubj:pass") and h_pos in VERB_POS and t_pos in SUBJ_DEP_POS:
            emit(head, "SUBJA", token)

        # ── OBJA: Akkusativobjekt (obj) ─────────────────────────────────────
        elif dep == "obj" and h_pos in VERB_POS and t_pos in SUBJ_DEP_POS:
            emit(head, "OBJA", token)

        # ── OBJD: Dativobjekt (iobj) ────────────────────────────────────────
        elif dep == "iobj" and h_pos in VERB_POS and t_pos in NOUN_POS:
            emit(head, "OBJD", token)

        # ── GMOD: Genitivattribut (nmod NOUN→NOUN ohne Präposition) ─────────
        elif dep == "nmod" and h_pos in NOUN_POS and t_pos in NOUN_POS:
            has_prep = any(c.dep_ == "case" and c.pos_ == "ADP" for c in token.children)
            if not has_prep:
                emit(head, "GMOD", token)

        # ── ATTR: Adjektivattribut (amod ADJ→NOUN) ─────────────────────────
        elif dep == "amod" and h_pos in NOUN_POS and t_pos == "ADJ":
            emit(head, "ATTR", token)

        # ── ADV: Adverbialbestimmung (advmod ADV→VERB) ─────────────────────
        elif dep == "advmod" and h_pos in VERB_POS and t_pos == "ADV":
            emit(head, "ADV", token)

        # ── PP: Präpositionalphrase (obl NOUN→VERB mit case-Kind) ──────────
        elif dep in ("obl", "obl:arg") and h_pos in VERB_POS and t_pos in NOUN_POS:
            prep_tok = next(
                (c for c in token.children if c.dep_ == "case" and c.pos_ == "ADP"),
                None,
            )
            if prep_tok is not None:
                prep_lem = _base_lemma(prep_tok)
                if prep_lem:
                    emit(head, "PP", token, prep=prep_lem)

        # ── KON: Koordination (conj, bidirektional) ────────────────────────
        elif dep == "conj" and t_pos in CONTENT_POS and h_pos in CONTENT_POS:
            if t_pos == h_pos or (t_pos in NOUN_POS and h_pos in NOUN_POS):
                emit(head, "KON", token)
                emit(token, "KON", head)

        # ── PRED: Prädikativ (xcomp ADJ/NOUN → VERB) ───────────────────────
        elif dep == "xcomp" and h_pos in VERB_POS and t_pos in NOUN_POS | {"ADJ"}:
            emit(head, "PRED", token)

    return triples


# ── Datenbank ───────────────────────────────────────────────────────────────

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
            quelle      TEXT    NOT NULL DEFAULT '',
            jahr        INTEGER NOT NULL DEFAULT 0,
            count       INTEGER NOT NULL DEFAULT 1,
            dep_case    TEXT    NOT NULL DEFAULT '',
            dep_number  TEXT    NOT NULL DEFAULT '',
            PRIMARY KEY (head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, jahr)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS parse_progress (
            datei  TEXT PRIMARY KEY,
            offset INTEGER NOT NULL DEFAULT 0,   -- Anzahl fertig committeter Chunks
            done   INTEGER NOT NULL DEFAULT 0    -- 1 = Datei vollständig
        )
    """)
    conn.commit()


def read_progress(conn: sqlite3.Connection, datei: str) -> tuple[int, bool]:
    row = conn.execute(
        "SELECT offset, done FROM parse_progress WHERE datei=?", (datei,)
    ).fetchone()
    if row is None:
        return 0, False
    return int(row[0]), bool(row[1])


def _int_jahr(raw) -> int:
    try:
        return int(raw) if raw else 0
    except (TypeError, ValueError):
        return 0


# key: (head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, jahr)
# value: [count, Counter[(dep_case, dep_number)]]
def aggregate(doc, ctx, pending: dict):
    quelle, jahr = ctx
    for (hl, hp, rel, dl, dp, prep, dcase, dnum) in extrahiere_triples(doc):
        key = (hl, hp, rel, dl, dp, prep, quelle, jahr)
        slot = pending.get(key)
        if slot is None:
            pending[key] = [1, Counter({(dcase, dnum): 1})]
        else:
            slot[0] += 1
            slot[1][(dcase, dnum)] += 1


_UPSERT = """
    INSERT INTO triples
        (head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, jahr,
         count, dep_case, dep_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, jahr)
    DO UPDATE SET count = count + excluded.count
"""


def flush(conn: sqlite3.Connection, pending: dict, datei: str,
          offset: int, done: bool = False) -> int:
    """Aggregat in die DB schreiben und den Chunk-Offset im selben Commit
    setzen (atomar → keine Doppelzählung bei Wiederaufnahme). Leert pending."""
    n = 0
    rows = []
    for (hl, hp, rel, dl, dp, prep, quelle, jahr), (cnt, ctr) in pending.items():
        (dcase, dnum), _ = ctr.most_common(1)[0]
        rows.append((hl, hp, rel, dl, dp, prep, quelle, jahr, cnt, dcase, dnum))
        n += 1
    if rows:
        conn.executemany(_UPSERT, rows)
    conn.execute("""
        INSERT INTO parse_progress (datei, offset, done)
        VALUES (?, ?, ?)
        ON CONFLICT (datei) DO UPDATE SET
            offset = excluded.offset,
            done   = MAX(parse_progress.done, excluded.done)
    """, (datei, offset, 1 if done else 0))
    conn.commit()
    pending.clear()
    return n


# ── Streaming-Generator ─────────────────────────────────────────────────────

def iter_chunks(jsonl_path: Path, resume_offset: int = 0, limit: int | None = None):
    """Streamt (chunk_text, (quelle, jahr)) aus einer v2-JSONL (K2).

    Zählt jeden ausgegebenen Chunk global durch; überspringt die ersten
    `resume_offset` Chunks (K8-Wiederaufnahme). Bricht nach `limit` Chunks ab.
    Die Filterung ist deterministisch → Chunk-Index ist über Läufe stabil."""
    idx = 0
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
            if len(text) < MIN_LEN_TEXT:
                continue
            ctx = (obj.get("quelle") or "", _int_jahr(obj.get("jahr")))
            for chunk in chunk_text(text):
                if idx < resume_offset:
                    idx += 1
                    continue
                if limit is not None and (idx - resume_offset) >= limit:
                    return
                idx += 1
                yield chunk, ctx


# ── Datei-Verarbeitung ──────────────────────────────────────────────────────

def verarbeite_datei(jsonl_path: Path, nlp, conn: sqlite3.Connection,
                     workers: int = 1, limit: int | None = None) -> int:
    """Parst eine v2-JSONL vollständig (mit Wiederaufnahme) in die DB."""
    datei = jsonl_path.name
    resume_offset, done = read_progress(conn, datei)
    if done:
        print(f"  [SKIP] {datei} (bereits vollständig)")
        return 0
    if resume_offset:
        print(f"  [RESUME] {datei} ab Chunk {resume_offset:,}")

    pending: dict = {}
    processed = resume_offset          # globaler Chunk-Index (= Offset)
    n_unique_flushed = 0
    gen = iter_chunks(jsonl_path, resume_offset=resume_offset, limit=limit)

    for doc, ctx in nlp.pipe(gen, as_tuples=True, batch_size=BATCH_SIZE, n_process=workers):
        aggregate(doc, ctx, pending)
        processed += 1
        if processed % FLUSH_EVERY == 0:
            n_unique_flushed += flush(conn, pending, datei, processed)
            print(f"  {processed:,} Chunks · {n_unique_flushed:,} Triples geschrieben ...",
                  flush=True)

    # Abschluss-Flush; done=1 nur wenn ohne --limit (sonst Datei nicht komplett)
    complete = limit is None
    n_unique_flushed += flush(conn, pending, datei, processed, done=complete)
    tag = "OK" if complete else "TEIL"
    print(f"  [{tag}] {datei}: bis Chunk {processed:,} → {n_unique_flushed:,} Triples-Upserts")
    return n_unique_flushed


# ── Benchmark (F9 / Phase C) ────────────────────────────────────────────────

def benchmark(jsonl_path: Path, nlp, workers: int, limit: int,
              dwdsmor_on: bool, total_tokens: int | None = None):
    """Misst den Durchsatz (Tokens/s) der vollen Parse+Extraktions-Kette,
    ohne in die DB zu schreiben. Für die Laufzeit-Hochrechnung in Phase C."""
    print(f"\n=== BENCHMARK: {jsonl_path.name} ===")
    print(f"  Modell de_zdl_lg · dwdsmor={'AN' if dwdsmor_on else 'AUS'} · "
          f"workers={workers} · batch={BATCH_SIZE} · limit={limit:,} Chunks")
    gen = iter_chunks(jsonl_path, limit=limit)
    n_docs = n_tokens = n_triples = 0
    t0 = time.perf_counter()
    for doc, ctx in nlp.pipe(gen, as_tuples=True, batch_size=BATCH_SIZE, n_process=workers):
        n_docs += 1
        n_tokens += len(doc)
        n_triples += len(extrahiere_triples(doc))
    dt = time.perf_counter() - t0
    if dt <= 0 or n_docs == 0:
        print("  [Abbruch] Keine Daten geparst (Datei leer?).")
        return
    tok_s = n_tokens / dt
    print(f"  {n_docs:,} Chunks · {n_tokens:,} Tokens · {n_triples:,} Triples in {dt:,.1f}s")
    print(f"  → {tok_s:,.0f} Tokens/s · {n_docs / dt:,.1f} Chunks/s")
    if total_tokens:
        eta_h = total_tokens / tok_s / 3600
        print(f"  → Hochrechnung für {total_tokens:,} Tokens: {eta_h:,.1f} h "
              f"({eta_h / 24:,.1f} Tage)")


# ── Modell-Setup ────────────────────────────────────────────────────────────

def lade_modell(use_dwdsmor: bool):
    print("Lade spaCy-Modell de_zdl_lg (ZDL/BBAW, UD-Labels) ...")
    import spacy
    nlp = spacy.load("de_zdl_lg", disable=["ner"])
    if use_dwdsmor:
        import dwdsmor.spacy  # noqa: F401 – registriert @Language.factory("dwdsmor")
        if "dwdsmor" not in nlp.pipe_names:
            nlp.add_pipe("dwdsmor")
    print(f"  Pipes: {nlp.pipe_names}")
    return nlp


# ── Konfig ──────────────────────────────────────────────────────────────────

DATEIEN = [
    "gesetze.jsonl",
    "pol_reden.jsonl",
    "bundestag_xml.jsonl",
    "german_commons.jsonl",
    "german_commons_justiz.jsonl",
    # wikipedia.jsonl: F1 REVIDIERT 2026-07-24 (Phase-C-A/B-Test) — jetzt AUCH ins
    # wortprofil (nicht nur belege). Der Subset-A/B zeigte +39 % Kollokationen /
    # +33 % Lemmata; die enzyklopädische logDice-Verzerrung wird zugunsten der
    # Abdeckung akzeptiert (User-Entscheidung). Kostet +40 % Parse-Zeit.
    "wikipedia.jsonl",
    "leipzig.jsonl",
    "dibilit.jsonl",
    "dta_kern.jsonl",
    "dta_erweiterungen.jsonl",
    "dta_github.jsonl",
    "gei_digital.jsonl",
    "ref_fnh.jsonl",
    "ref_mhd.jsonl",
    "pitaval.jsonl",
    "wikibooks.jsonl",
    "wikivoyage.jsonl",
    "bundestag_pdf.jsonl",
    # Gate-A-Canary-Korpus (run_gate_a.py) – existiert nur unter gate_a/parsed/,
    # in 02_parsed_v2/ (Produktion) nie vorhanden → dort einfach [SKIP].
    "testkorpus_canary.jsonl",
]


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Phase 3 (v2): Dependency-Parsing → triples_v2.db")
    parser.add_argument("--only", help="Nur diese Datei verarbeiten (ohne .jsonl)")
    parser.add_argument("--input-dir", default=str(PARSED_DIR_DEFAULT),
                        help="Eingabeverzeichnis (Standard: 02_parsed_v2)")
    parser.add_argument("--db", default=str(DB_PATH),
                        help="Ziel-DB (Standard: 03_deps/triples_v2.db) – für "
                             "Gate-A-/Subset-Builds auf eine separate Datei umbiegen")
    parser.add_argument("--workers", type=int, default=1,
                        help="Anzahl spaCy-Prozesse (Standard: 1)")
    parser.add_argument("--limit", type=int, default=None,
                        help="Max. Chunks pro Datei (Test/Benchmark)")
    parser.add_argument("--reset", action="store_true",
                        help="triples_v2.db + Fortschritt löschen")
    parser.add_argument("--no-dwdsmor", action="store_true",
                        help="dwdsmor-Komponente deaktivieren (Vergleichsmessung)")
    parser.add_argument("--benchmark", action="store_true",
                        help="Nur Tokens/s messen, nicht in die DB schreiben")
    parser.add_argument("--total-tokens", type=int, default=None,
                        help="Gesamt-Tokenzahl für die Benchmark-Hochrechnung")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.reset and not args.benchmark:
        for suffix in ("", "-shm", "-wal"):
            Path(str(db_path) + suffix).unlink(missing_ok=True)
        print(f"[RESET] {db_path.name} + Fortschritt gelöscht.")

    nlp = lade_modell(use_dwdsmor=not args.no_dwdsmor)

    dateien = [f"{args.only}.jsonl"] if args.only else DATEIEN

    # ── Benchmark-Modus ─────────────────────────────────────────────────────
    if args.benchmark:
        limit = args.limit or 3000
        for dateiname in dateien:
            pfad = input_dir / dateiname
            if not pfad.exists():
                print(f"  [SKIP] {pfad} nicht gefunden")
                continue
            benchmark(pfad, nlp, args.workers, limit,
                      dwdsmor_on=not args.no_dwdsmor, total_tokens=args.total_tokens)
        return

    # ── Normal-Modus ────────────────────────────────────────────────────────
    conn = sqlite3.connect(db_path)
    init_db(conn)

    gesamt = 0
    for dateiname in dateien:
        pfad = input_dir / dateiname
        if not pfad.exists():
            print(f"  [SKIP] {pfad} nicht gefunden")
            continue
        print(f"\n── {dateiname}")
        gesamt += verarbeite_datei(pfad, nlp, conn, workers=args.workers, limit=args.limit)

    conn.close()
    print(f"\n=== Fertig. {gesamt:,} Triples-Upserts. DB: {db_path} ===")


if __name__ == "__main__":
    main()
