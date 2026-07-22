"""
Unit- und End-to-End-Tests für parse_deps_v2.py (DB-Neuaufbau Phase A, Teil 2).

Ausführen (aus wortprofil/03_parse/ mit aktivem wortprofil-env):
    python -m pytest test_parse_deps_v2.py -q

Deckt ab:
  - K1 Chunking (Absatzgrenzen, kein Satz zerschnitten, Vollständigkeit, Größe)
  - K6 Bindestrich-Lemmata (_valid_lem)
  - dwdsmor + compound:prt: „auftischen" korrekt statt „tischen"   [Modell]
  - K1 End-to-End: Triple aus dem Dokument-ENDE eines >5000-Zeichen-Docs   [Modell]
  - quelle-Spalte gefüllt                                                  [Modell]
  - K6 End-to-End: Bindestrich-Lemma landet in der DB                      [Modell]
  - K8 Wiederaufnahme ohne Doppelzählung (partiell → resume == voll)       [Modell]

Die modellbasierten Tests laden de_zdl_lg einmal (session-scoped) – langsam,
aber notwendig. Ohne installiertes Modell werden sie übersprungen.
"""

import json
import sqlite3
from pathlib import Path

import pytest

import parse_deps_v2 as P


# ── K1: Chunking (ohne Modell) ──────────────────────────────────────────────

def test_chunk_kurzer_text_ein_chunk():
    txt = "Erster Satz. Zweiter Satz.\n\nDritter Absatz hier."
    assert P.chunk_text(txt) == [txt.strip()]


def test_chunk_leerer_text():
    assert P.chunk_text("") == []
    assert P.chunk_text("   \n  ") == []


def test_chunk_vollstaendigkeit_und_groesse():
    # Vieles Absätze, sodass mehrere Chunks entstehen.
    absatz = ("Dies ist ein vollständiger Satz über Katzen und Matten. "
              "Hier folgt ein zweiter, ebenso vollständiger Satz.")
    text = "\n\n".join(absatz for _ in range(80))   # ~ > 8000 Zeichen
    chunks = P.chunk_text(text)
    assert len(chunks) >= 2, "langer Text muss in mehrere Chunks zerfallen"
    # Größe: kein Chunk über der harten Obergrenze
    assert all(len(c) <= P.CHUNK_HARD_MAX for c in chunks)
    # Vollständigkeit: keine nicht-leeren Zeichen gehen verloren
    norm = lambda s: "".join(s.split())
    assert norm("".join(chunks)) == norm(text)


def test_chunk_kein_satz_zerschnitten():
    # Jeder Chunk (bei wohlgeformter Eingabe) endet auf ein Satzzeichen.
    absatz = "Ein Satz endet hier. Noch ein Satz endet dort. Und ein dritter Satz."
    text = "\n\n".join(absatz for _ in range(60))
    for c in P.chunk_text(text):
        assert c.rstrip()[-1] in ".!?", f"Chunk endet mitten im Satz: ...{c[-40:]!r}"


def test_chunk_langer_absatz_an_satzgrenzen():
    # Ein einzelner Absatz über hard_max wird an Satzgrenzen geteilt.
    satz = "Der lange Absatz besteht aus vielen kurzen Saetzen ohne Leerzeile. "
    absatz = satz * 120                          # ein Absatz, ~ > 7000 Zeichen
    chunks = P.chunk_text(absatz)
    assert len(chunks) >= 2
    assert all(len(c) <= P.CHUNK_HARD_MAX for c in chunks)
    for c in chunks:
        assert c.rstrip()[-1] in ".!?"


# ── K6: Bindestrich-Lemmata (ohne Modell) ───────────────────────────────────

@pytest.mark.parametrize("lem,ok", [
    ("tisch", True),
    ("e-mail", True),
    ("nord-süd-konflikt", True),
    ("über", True),
    ("ß", False),            # zu kurz (<2)
    ("a", False),            # zu kurz
    ("co2", False),          # Ziffer
    ("123", False),
    ("-abc", False),         # führender Bindestrich
    ("abc-", False),         # abschließender Bindestrich
    ("a--b", False),         # doppelter Bindestrich
    ("wort ende", False),    # Leerzeichen
])
def test_valid_lem(lem, ok):
    assert P._valid_lem(lem) is ok


# ── Modellbasierte End-to-End-Tests ─────────────────────────────────────────

@pytest.fixture(scope="session")
def nlp():
    try:
        return P.lade_modell(use_dwdsmor=True)
    except Exception as e:                       # Modell nicht installiert
        pytest.skip(f"de_zdl_lg/dwdsmor nicht ladbar: {e}")


def _schreibe_jsonl(pfad: Path, docs: list[dict]):
    with pfad.open("w", encoding="utf-8") as f:
        for d in docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")


# Eindeutige Wörter fürs Dokument-Ende (kommen im Fülltext nicht vor).
ENDE_SATZ = "Schließlich begrüßte der greise Zaunkönig den staunenden Wanderer."
FUELL_SATZ = "Die Katze sitzt ruhig auf der warmen Matte im hinteren Zimmer. "


@pytest.fixture(scope="session")
def test_jsonl(tmp_path_factory):
    d = tmp_path_factory.mktemp("v2in")
    pfad = d / "testkorpus.jsonl"
    # Sehr langes Dokument: ~10.000 Zeichen Füller + eindeutiger Schluss-Satz.
    langer_text = (FUELL_SATZ * 150).strip() + "\n\n" + ENDE_SATZ
    docs = [
        {"id": "t/1", "text": "Der Kellner tischte den Gästen eine große Lüge auf.",
         "quelle": "testkorpus", "jahr": 1999},
        {"id": "t/2", "text": "Sie schreiben eine wichtige E-Mail an den Ausschuss.",
         "quelle": "testkorpus", "jahr": 2001},
        {"id": "t/3", "text": langer_text, "quelle": "testkorpus", "jahr": 1888},
    ]
    _schreibe_jsonl(pfad, docs)
    assert len(langer_text) > 8000    # klar über der alten 5000-Kappung
    return pfad


def _parse_in_db(jsonl_path: Path, db_path: Path, nlp, limit=None):
    conn = sqlite3.connect(db_path)
    P.init_db(conn)
    P.verarbeite_datei(jsonl_path, nlp, conn, workers=1, limit=limit)
    conn.close()


def test_e2e_auftischen(nlp, test_jsonl, tmp_path):
    """Trennbares Verb wird korrekt als 'auftischen' (nicht 'tischen') lemmatisiert."""
    db = tmp_path / "t.db"
    _parse_in_db(test_jsonl, db, nlp)
    conn = sqlite3.connect(db)
    heads = {r[0] for r in conn.execute(
        "SELECT DISTINCT head_lemma FROM triples WHERE head_pos='Verb'")}
    conn.close()
    assert "auftischen" in heads, f"'auftischen' fehlt; Verb-Heads: {sorted(heads)}"
    assert "tischen" not in heads, "'tischen' darf nicht als Verb-Lemma auftauchen"


def test_e2e_chunking_dokument_ende(nlp, test_jsonl, tmp_path):
    """K1: Das Ende eines >8000-Zeichen-Docs wird geparst (keine 5000-Kappung)."""
    db = tmp_path / "t.db"
    _parse_in_db(test_jsonl, db, nlp)
    conn = sqlite3.connect(db)
    # ATTR-Triple aus dem allerletzten Satz: zaunkönig ← greis
    row = conn.execute(
        "SELECT count FROM triples WHERE head_lemma='zaunkönig' AND relation='ATTR' "
        "AND dep_lemma='greis'").fetchone()
    conn.close()
    assert row is not None, "Kollokation aus dem Dokument-Ende fehlt → Chunking unvollständig"


def test_e2e_quelle_gefuellt(nlp, test_jsonl, tmp_path):
    db = tmp_path / "t.db"
    _parse_in_db(test_jsonl, db, nlp)
    conn = sqlite3.connect(db)
    leer = conn.execute("SELECT COUNT(*) FROM triples WHERE quelle=''").fetchone()[0]
    quellen = {r[0] for r in conn.execute("SELECT DISTINCT quelle FROM triples")}
    conn.close()
    assert leer == 0, "es gibt Triples ohne quelle"
    assert quellen == {"testkorpus"}, f"unerwartete quelle-Werte: {quellen}"


def test_e2e_bindestrich_lemma(nlp, test_jsonl, tmp_path):
    """K6: 'E-Mail' überlebt Token-Guard + _valid_lem und landet als 'e-mail' in der DB."""
    db = tmp_path / "t.db"
    _parse_in_db(test_jsonl, db, nlp)
    conn = sqlite3.connect(db)
    row = conn.execute(
        "SELECT 1 FROM triples WHERE dep_lemma='e-mail' OR head_lemma='e-mail' LIMIT 1"
    ).fetchone()
    conn.close()
    assert row is not None, "Bindestrich-Lemma 'e-mail' fehlt in der DB"


def test_e2e_dep_number_gefuellt(nlp, test_jsonl, tmp_path):
    """Neue Spalte dep_number ist für Nomen-Deps zuverlässig gefüllt (Sing/Plur)."""
    db = tmp_path / "t.db"
    _parse_in_db(test_jsonl, db, nlp)
    conn = sqlite3.connect(db)
    n_num = conn.execute(
        "SELECT COUNT(*) FROM triples WHERE dep_pos='Substantiv' AND dep_number<>''"
    ).fetchone()[0]
    conn.close()
    assert n_num > 0, "keine dep_number-Werte bei Nomen-Deps gesetzt"


@pytest.mark.parametrize("satz,dep,erwartet", [
    ("Er steht auf dem Berg.", "berg", "Dat"),
    ("Sie geht in das Haus.", "haus", "Acc"),
])
def test_dep_case_aus_artikel(nlp, satz, dep, erwartet):
    """dep_case gewinnt den syntaktischen Kasus über den Artikel (den/dem/das)
    zurück, wo de_zdl_lg ihn am Nomen selbst nicht markiert (PP-Disambiguierung)."""
    doc = nlp(satz)
    pp = [t for t in P.extrahiere_triples(doc) if t[2] == "PP" and t[3] == dep]
    assert pp, f"kein PP-Triple für {dep!r} in {satz!r}"
    assert pp[0][6] == erwartet, f"dep_case={pp[0][6]!r}, erwartet {erwartet!r}"


def test_e2e_resume_keine_doppelzaehlung(nlp, test_jsonl, tmp_path):
    """K8: partieller Lauf + Wiederaufnahme ergibt exakt dieselben counts wie ein Voll-Lauf."""
    # Referenz: Voll-Lauf
    db_full = tmp_path / "full.db"
    _parse_in_db(test_jsonl, db_full, nlp)
    conn = sqlite3.connect(db_full)
    voll = dict(conn.execute(
        "SELECT head_lemma||'|'||relation||'|'||dep_lemma||'|'||prep||'|'||jahr, count FROM triples"))
    done_full = conn.execute("SELECT done FROM parse_progress").fetchone()[0]
    conn.close()
    assert done_full == 1

    # Partiell (limit=2 Chunks) + Wiederaufnahme (kein limit)
    db_res = tmp_path / "res.db"
    _parse_in_db(test_jsonl, db_res, nlp, limit=2)
    conn = sqlite3.connect(db_res)
    off1, done1 = conn.execute("SELECT offset, done FROM parse_progress").fetchone()
    conn.close()
    assert off1 == 2 and done1 == 0, f"Offset nach Teillauf falsch: {off1}, done={done1}"

    _parse_in_db(test_jsonl, db_res, nlp)   # Wiederaufnahme
    conn = sqlite3.connect(db_res)
    resume = dict(conn.execute(
        "SELECT head_lemma||'|'||relation||'|'||dep_lemma||'|'||prep||'|'||jahr, count FROM triples"))
    done2 = conn.execute("SELECT done FROM parse_progress").fetchone()[0]
    conn.close()
    assert done2 == 1, "Datei nach Wiederaufnahme nicht als fertig markiert"
    assert resume == voll, "Wiederaufnahme erzeugt abweichende counts → Doppelzählung/Verlust"
