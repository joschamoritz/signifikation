"""
Unit-Tests für extract_text.py (v2) – DB-Neuaufbau Phase A, Teil 1.

Ausführen (aus wortprofil/02_parse/ mit aktivem wortprofil-env):
    python -m pytest test_extract_text.py -q

Deckt ab:
  - K3 Dehyphenierung (Silbentrennung, Komposita-Ausnahme, OCR-¬, CRLF, Soft-Hyphen)
  - K4 Glyphen-Normalisierung (langes s, kombinierendes e, r rotunda, NFC,
        Griechisch/Ligaturen unangetastet, unsichtbare Zeichen)
  - K5 Jahr-Extraktion (Dateiname) + ref-Bildung
  - ref-Formate JEDES Korpus gegen echte Beispieldateien aus
        01_download/korpora/ (Integrationstests, mit SAMPLE_LIMIT klein gehalten;
        fehlende Quellen werden übersprungen).
"""

import re
import pytest

import extract_text as E

KORPORA = E.KORPORA


# ── K3: Dehyphenierung ──────────────────────────────────────────────────────

@pytest.mark.parametrize("inp,expected", [
    ("Stu-\ndenten", "Studenten"),            # Plan-Beispiel
    ("ver-\ntreiben", "vertreiben"),
    ("herrlich-\nſten", "herrlichsten"),      # zusammen mit K4 (ſ)
    ("Ge-\nſundheit", "Gesundheit"),
    ("Nord-\nSüd", "Nord-Süd"),               # Kompositum: Bindestrich bleibt
    ("E-\nMail", "E-Mail"),
    ("Wort-\r\nrest", "Wortrest"),            # CRLF-Silbentrennung
    ("Mobilisierungs¬\nanleihe", "Mobilisierungsanleihe"),
    ("Gesetz¬ entwurfs", "Gesetzentwurfs"),   # Reichstag-OCR-Trennstrich
    ("Sil­benfall", "Silbenfall"),        # weicher Trennstrich
])
def test_dehyphenierung(inp, expected):
    assert E.normalisiere_text(inp) == expected


@pytest.mark.parametrize("inp", [
    "Nord-Süd-Konflikt",   # echtes Kompositum mitten in der Zeile
    "S-Bahn",
    "E-Mail",
])
def test_dehyphenierung_erhaelt_echte_bindestriche(inp):
    assert E.normalisiere_text(inp) == inp


def test_dehyphenierung_grossbuchstabe_bleibt_getrennt():
    # Fortsetzung großgeschrieben → echtes Kompositum, Bindestrich bleibt
    assert E.dehyphenate("Kaiser-\nWilhelm") == "Kaiser-Wilhelm"
    # Fortsetzung klein → Silbentrennung, Bindestrich weg
    assert E.dehyphenate("Kaiser-\nreich") == "Kaiserreich"


# ── K4: Glyphen-Normalisierung ──────────────────────────────────────────────

@pytest.mark.parametrize("inp,expected", [
    ("Erſten", "Ersten"),                     # langes s U+017F
    ("ſchlecht", "schlecht"),
    ("kuͤnnen", "künnen"),                     # kombinierendes e U+0364 → ü
    ("oͤffter", "öffter"),
    ("Gruͤnde", "Gründe"),
    ("Aͤrzte", "Ärzte"),
    ("Woꝛt", "Wort"),                          # r rotunda U+A75B → r
])
def test_glyphen_historisch(inp, expected):
    assert E.normalisiere_glyphen(inp) == expected


def test_nfc_normalisierung():
    # u + kombinierendes Trema (U+0308) → präkomponiertes ü
    assert E.normalisiere_glyphen("über") == "über"


@pytest.mark.parametrize("inp", [
    "λόγος",        # Griechisch – echte Zitate, nicht antasten
    "Œuvre",        # œ-Ligatur bleibt
    "à la carte",   # akzentuiertes Latein bleibt
])
def test_glyphen_lassen_echte_zeichen_unberuehrt(inp):
    assert E.normalisiere_glyphen(inp) == inp


def test_unsichtbare_zeichen_entfernt():
    # Zero-Width No-Break Space (GEI) verschwindet spurlos
    assert E.normalisiere_text("Wort﻿ende") == "Wortende"


def test_glyphen_gesamtsatz():
    # realistischer DTA-Satz mit ſ + kombinierendem e + Silbentrennung
    inp = "die zugeſtoſſenen Kranck-\nheiten abwenden koͤnnen"
    assert E.normalisiere_text(inp) == "die zugestossenen Kranckheiten abwenden können"


# ── K5: Jahr-Extraktion + ref-Bausteine ─────────────────────────────────────

@pytest.mark.parametrize("name,jahr", [
    ("abel_leibmedicus_1699", 1699),
    ("alberti_brot_1888.txt", 1888),
    ("alexis_ruhe01_1852", 1852),
    ("WP01_0001_1949-09-07", 1949),
    ("dor_00016_s_po_1895_04_11", 1895),
    ("I_1", None),
    ("letter-001", None),
])
def test_jahr_aus_dateiname(name, jahr):
    assert E.jahr_aus_dateiname(name) == jahr


def test_bundestag_ref():
    assert E._bundestag_ref("WP01_0001_1949-09-07") == ("BT-PlPr. 01/1, 07.09.1949", 1949)
    ref, jahr = E._bundestag_ref("WP18_0002_2013-11-18")
    assert ref == "BT-PlPr. 18/2, 18.11.2013" and jahr == 2013


def test_bau_ref():
    assert E._bau_ref("Abel", "Titel", 1699, "DTA", "stem") == "Abel: Titel. 1699"
    assert E._bau_ref("", "Titel", 1800, "DTA", "stem") == "Titel. 1800"
    assert E._bau_ref("", "", None, "Deutsches Textarchiv", "stem") == "Deutsches Textarchiv: stem"
    assert E._bau_ref("Autor", "Titel", None, "DTA", "stem") == "Autor: Titel"
    # keine doppelte Interpunktion, wenn Titel auf .!? endet
    assert E._bau_ref("Alberti", "Brot!", 1888, "DTA", "stem") == "Alberti: Brot! 1888"


# ── Integrationstests: ref-Formate JEDES Korpus (echte Beispieldateien) ─────

def _run(key, limit=2):
    """Ruft den echten Extraktor mit kleinem Sampling-Limit auf."""
    alt = E.SAMPLE_LIMIT
    E.SAMPLE_LIMIT = limit
    try:
        fn, _ = E.KORPORA_KONFIG[key]
        return fn()
    finally:
        E.SAMPLE_LIMIT = alt


def _first(key, limit=2, quelle_pfad=None):
    if quelle_pfad is not None and not quelle_pfad.exists():
        pytest.skip(f"Quelle fehlt: {quelle_pfad}")
    docs = _run(key, limit)
    if not docs:
        pytest.skip(f"Keine Dokumente aus {key} (Quelle evtl. nicht vorhanden)")
    return docs


def _assert_v2_felder(d):
    for feld in ("id", "text", "quelle", "genre", "epoche", "jahr", "titel", "autor", "ref"):
        assert feld in d, f"Feld {feld} fehlt"
    assert isinstance(d["ref"], str) and d["ref"].strip(), "ref darf nicht leer sein"
    assert d["jahr"] is None or isinstance(d["jahr"], int)


def test_ref_gesetze():
    docs = _first("gesetze", limit=6, quelle_pfad=KORPORA / "gesetze")
    for d in docs:
        _assert_v2_felder(d)
    # irgendein Paragraph liefert „§ N <Kürzel>"
    assert any(re.match(r"§\s*\S+\s+\S+", d["ref"]) for d in docs)


def test_ref_bundestag_xml():
    d = _first("bundestag", limit=1, quelle_pfad=KORPORA / "bundestagskorpus")[0]
    _assert_v2_felder(d)
    assert re.match(r"^BT-PlPr\. \d{2}/\d+, \d{2}\.\d{2}\.\d{4}$", d["ref"]), d["ref"]


def test_ref_bundestag_pdf():
    d = _first("bundestag_pdf", limit=1, quelle_pfad=KORPORA / "bundestagskorpus")[0]
    _assert_v2_felder(d)
    assert re.match(r"^BT-PlPr\. \d{2}/\d+, \d{2}\.\d{2}\.\d{4}$", d["ref"]), d["ref"]


def test_ref_leipzig():
    d = _first("leipzig", limit=1, quelle_pfad=KORPORA / "deu_news")[0]
    _assert_v2_felder(d)
    assert re.match(r"^Leipzig \(deu_news\)( \d{4})?$", d["ref"]), d["ref"]


def test_ref_pol_reden():
    d = _first("pol_reden", limit=1, quelle_pfad=KORPORA / "politische-reden")[0]
    _assert_v2_felder(d)
    assert re.search(r", \d{4}-\d{2}-\d{2}$", d["ref"]), d["ref"]
    assert d["autor"], "pol_reden sollte einen Redner (autor) haben"


def test_ref_german_commons_dibiphil():
    # dibiphil.txt sortiert vor reichtagsprotokolle.txt → Sample kommt von dibiphil
    docs = _first("german_commons", limit=1, quelle_pfad=KORPORA / "german-commons")
    d = docs[0]
    _assert_v2_felder(d)
    assert d["quelle"] == "dibiphil"
    assert d["ref"].startswith("DiBiPhil:")


def test_ref_german_commons_reichstag():
    # direkt gegen den ersten echten Reichstags-Block (nicht vom Sortier-Sample abhängig)
    datei = KORPORA / "german-commons" / "reichtagsprotokolle.txt"
    if not datei.exists():
        pytest.skip(f"Quelle fehlt: {datei}")
    with datei.open(encoding="utf-8", errors="replace") as fh:
        block = E.normalisiere_text(fh.read(4_000_000).split("\n\n")[0])
    titel, jahr, ref = E._gc_block_meta(block, "reichtagsprotokolle")
    assert re.match(r"^Reichstagsprotokoll(, Bd\. \d+)?( \(\d{4}\))?$", ref), ref
    # Kopf „Band 428 … 1930" → Band + Jahr müssen erkannt werden
    assert re.search(r"Bd\. \d+", ref) and re.search(r"\(\d{4}\)", ref), ref
    assert isinstance(jahr, int) and 1867 <= jahr <= 1945


def test_ref_dta_kern():
    docs = _first("dta_kern", limit=1, quelle_pfad=KORPORA / "dta-kern")
    d = docs[0]
    _assert_v2_felder(d)
    assert d["id"] == "dta_kern/abel_leibmedicus_1699"
    assert d["titel"] == "Wohlerfahrner Leib-Medicus Der Studenten"
    assert d["autor"] == "Abel, Heinrich Caspar"
    assert d["jahr"] == 1699
    assert d["ref"] == "Abel: Wohlerfahrner Leib-Medicus Der Studenten. 1699"
    # K4 im Text greift: kein langes s mehr
    assert "ſ" not in d["text"]


def test_ref_dta_erweiterungen():
    d = _first("dta_erweiterungen", limit=1, quelle_pfad=KORPORA / "dta-erweiterungen")[0]
    _assert_v2_felder(d)
    # Format „Nachname: Titel. Jahr" oder bewusster Fallback
    assert re.search(r"\.\s*\d{4}$", d["ref"]) or d["ref"].startswith("Deutsches Textarchiv:")


def test_ref_dibilit():
    docs = _first("dibilit", limit=1,
                  quelle_pfad=KORPORA / "dibilit" / "deutschestextarchiv-DiBiLit-Korpus-38503b7")
    d = docs[0]
    _assert_v2_felder(d)
    assert d["id"] == "dibilit/alberti_brot_1888"
    assert d["titel"] == "Brot!"
    assert d["autor"] == "Alberti, Conrad"
    assert d["jahr"] == 1888
    assert d["ref"] == "Alberti: Brot! 1888"


def test_ref_dta_github():
    d = _first("dta_github", limit=2, quelle_pfad=KORPORA / "humboldt-publizistik")[0]
    _assert_v2_felder(d)
    # heterogene Repos → ref mind. gefüllt (Titel-basiert oder Fallback)
    assert isinstance(d["ref"], str) and d["ref"].strip()


def test_ref_gei_digital():
    docs = _first("gei_digital", limit=1,
                  quelle_pfad=KORPORA / "gei-digital" / "schulbuchevolution_gei-digital.zip")
    d = docs[0]
    _assert_v2_felder(d)
    assert re.search(r"\(PPN\w+\)$", d["ref"]), d["ref"]
    assert d["jahr"] == 1914


def test_ref_pitaval():
    docs = _first("pitaval", limit=1,
                  quelle_pfad=KORPORA / "neuer-pitaval" / "Pitaval.zip")
    d = docs[0]
    _assert_v2_felder(d)
    assert re.match(r"^Der Neue Pitaval, Bd\. \d+ \(\d{4}\)$", d["ref"]), d["ref"]
    assert d["jahr"] == 1846
    # UTF-8-Fix: kein Mojibake mehr
    assert "â" not in d["text"][:2000]


def test_ref_wikibooks():
    d = _first("wikibooks", limit=1,
               quelle_pfad=KORPORA / "wikibooks" / "wikibooks-20260101.xml.bz2")[0]
    _assert_v2_felder(d)
    assert d["ref"].startswith("Wikibooks: ")


def test_ref_wikivoyage():
    d = _first("wikivoyage", limit=1,
               quelle_pfad=KORPORA / "wikivoyage" / "wikivoyage-20260101.xml.bz2")[0]
    _assert_v2_felder(d)
    assert d["ref"].startswith("Wikivoyage: ")


def test_ref_ref_fnh():
    d = _first("ref_fnh", limit=1,
               quelle_pfad=KORPORA / "ref-fruehneuhochdeutsch" / "ReF-v1.0.2.tar.gz")[0]
    _assert_v2_felder(d)
    assert d["ref"].startswith("Ref.-Korpus Frühneuhochdeutsch: ")


def test_ref_ref_mhd():
    d = _first("ref_mhd", limit=1,
               quelle_pfad=KORPORA / "ref-mittelhochdeutsch" / "tei")[0]
    _assert_v2_felder(d)
    assert isinstance(d["ref"], str) and d["ref"].strip()


# ── German Commons Justiz (BGH/BVerfG/BPatG/BVerwG/BAG/BFH) ─────────────────
# _justiz_ref ist eine reine Funktion → Tests laufen ohne Download, direkt
# gegen echte id-Stichproben aus dem HuggingFace-Datensatz (2026-07-22 geprüft).

@pytest.mark.parametrize("gericht,stem,erwartet_ref,erwartet_jahr", [
    ("Bundesarbeitsgericht", "BAG_2010-07-13_9_AZR_287_09_NA",
     "Bundesarbeitsgericht, 13.07.2010, Az. 9 AZR 287 09", 2010),
    ("Bundesfinanzhof", "BFH_NV_2014-07-01_I_B_193_13_STRE201450436",
     "Bundesfinanzhof, 01.07.2014 – NV, Az. I B 193 13 STRE201450436", 2014),
    ("Bundesgerichtshof", "BGH_Zivilsenat-11_NA_2021-01-12_XI_ZR_589_19_NA_NA_0",
     "Bundesgerichtshof, 12.01.2021 – Zivilsenat-11, Az. XI ZR 589 19", 2021),
    ("Bundesgerichtshof (Strafsachen, 20. Jh.)",
     "BGH_Strafsenat-5_NA_1987-08-25_5_StR_212_87_NA_NA_NA",
     "Bundesgerichtshof (Strafsachen, 20. Jh.), 25.08.1987 – Strafsenat-5, Az. 5 StR 212 87", 1987),
    ("Bundespatentgericht", "BPatG_TechnBeschw_NA_2015-10-15_17_W-pat_8_13_NA_0",
     "Bundespatentgericht, 15.10.2015 – TechnBeschw, Az. 17 W-pat 8 13", 2015),
    ("Bundesverfassungsgericht", "BVerfG_2001-03-14_K_2_BvR_0567_99_NA_NA_NA_NA",
     "Bundesverfassungsgericht, 14.03.2001, Az. K 2 BvR 0567 99", 2001),
    ("Bundesverfassungsgericht (Amtliche Sammlung)",
     "BVerfG_2010-04-14_S_1_BvL_0008_08_NA_Privatisierung-Kliniken-Hamburg_126_29",
     "Bundesverfassungsgericht (Amtliche Sammlung), 14.04.2010, "
     "Az. S 1 BvL 0008 08 Privatisierung-Kliniken-Hamburg 126 29", 2010),
    ("Bundesverwaltungsgericht", "BVerwG_2003-12-04_B_8_B_149_03_NA_0",
     "Bundesverwaltungsgericht, 04.12.2003, Az. B 8 B 149 03", 2003),
])
def test_justiz_ref(gericht, stem, erwartet_ref, erwartet_jahr):
    ref, jahr = E._justiz_ref(gericht, stem)
    assert ref == erwartet_ref
    assert jahr == erwartet_jahr


def test_justiz_ref_ohne_datum_faellt_zurueck():
    ref, jahr = E._justiz_ref("Bundesgerichtshof", "BGH_kaputte_id_ohne_datum")
    assert ref == "Bundesgerichtshof: BGH_kaputte_id_ohne_datum"
    assert jahr is None


def test_ref_german_commons_justiz():
    docs = _first("german_commons_justiz", limit=3,
                  quelle_pfad=KORPORA / "german-commons" / "bverfg.jsonl")
    for d in docs:
        _assert_v2_felder(d)
        assert d["genre"] == "rechtsprechung"
    assert any(d["quelle"] == "bverfg" for d in docs)


# ── Wikipedia (nur belege.db) ────────────────────────────────────────────────

@pytest.mark.parametrize("absatz,erwartet", [
    ("Berlin ist die Hauptstadt der Bundesrepublik Deutschland und mit rund "
     "3,7 Millionen Einwohnern die bevölkerungsreichste Stadt des Landes. "
     "Die Stadt liegt im Nordosten Deutschlands an der Spree.", True),
    ("• Berlin\n• Hamburg\n• München", False),          # Liste, kein Satzzeichen
    ("Kurzer Satz.", False),                              # unter WIKI_PARA_MIN
    ("1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20.", False),  # Zahlen-/Tabellenrest
    ("Siehe auch: Liste der Hauptstädte, Kategorie:Bundesland, Portal:Deutschland "
     "und weitere verwandte Themen ohne echten Fließtext hier drin stehen", False),
])
def test_wiki_absatz_ok(absatz, erwartet):
    assert E._wiki_absatz_ok(absatz) == erwartet


def test_wiki_url():
    assert E._wiki_url("Berlin") == "https://de.wikipedia.org/wiki/Berlin"
    assert E._wiki_url("Alt Berlin") == "https://de.wikipedia.org/wiki/Alt_Berlin"
    assert E._wiki_url("Nürnberg") == "https://de.wikipedia.org/wiki/N%C3%BCrnberg"


def test_ref_wikipedia():
    d = _first("wikipedia", limit=1,
               quelle_pfad=KORPORA / "wikipedia" / "extracted")[0]
    _assert_v2_felder(d)
    assert d["quelle"] == "wikipedia"
    assert d["jahr"] is None
    assert d["ref"].startswith(f"{d['titel']}. Wikipedia. https://de.wikipedia.org/wiki/")
    assert len(d["text"]) >= E.WIKI_STUB_MIN
