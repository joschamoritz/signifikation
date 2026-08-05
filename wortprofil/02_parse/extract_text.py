"""
Phase 2 – Textextraktion (v2)
Alle Korpora → JSONL (ein Dokument pro Zeile)

v2-Schema (DB-Neuaufbau.md, Abschnitt 3.1):
  {
    "id": "...", "text": "...normalisiert (K3+K4)...",
    "quelle": "...", "genre": "...", "epoche": "...", "jahr": 1699,
    "titel": "...",   # NEU – aus TEI-Header/Metadaten
    "autor": "...",   # NEU – wo verfügbar
    "ref":   "..."    # NEU – fertige Dokument-Referenz für die App
  }

Neuerungen gegenüber v1 (siehe planning/DB-Neuaufbau.md, Abschnitt 2.1):
  K3  Dehyphenierung:  "Stu-\\ndenten" → "Studenten"  (Ausnahme: echte
      Bindestrich-Komposita am Zeilenende bleiben, Heuristik über Groß-/
      Kleinschreibung der Fortsetzung). Auch OCR-Trennstrich "¬" (Reichstag).
  K4  Unicode-Normalisierung (NFC) + Glyphen-Tabelle für historische
      Typografie (ſ→s, aͤ→ä, oͤ→ö, uͤ→ü, ꝛ→r …), abgeleitet aus den echten
      DTA-/GEI-Beispieldateien.
  K5  Jahr-Extraktion pro Korpus (TEI-Header, Dateiname, GEI-/Pitaval-
      Metadaten) – Ziel Gate B: ≥95 % der Dokumente mit Jahr, wo ableitbar.
  Neue Felder titel/autor/ref pro Korpus (Tabelle „ref pro Korpus", 3.1).

Ausgabe nach 02_parsed_v2/ – die alten JSONL in 02_parsed/ bleiben
unangetastet.

Aufruf:
  python extract_text.py                   # alle Korpora
  python extract_text.py --only gesetze    # nur ein Korpus
  python extract_text.py --dry-run         # nur Statistik, nichts schreiben

Verfügbare --only-Werte:
  gesetze, bundestag, leipzig, pol_reden, german_commons,
  german_commons_justiz, wikipedia,
  gei_digital, dta_kern, dta_erweiterungen, dibilit,
  dta_github, ref_mhd, ref_fnh,
  pitaval, wikibooks, wikivoyage, bundestag_pdf
"""

import argparse
import io
import json
import os
import re
import sys
import tarfile
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

KORPORA = Path(__file__).parent.parent / "01_download" / "korpora"
# Ausgabeverzeichnis per Env überschreibbar (Gate A / Phase-C-Subset bauen ihre
# Mini-/Subset-JSONL in ein separates Verzeichnis, damit 02_parsed_v2/ – die
# Vollausgabe – unangetastet bleibt; Grundregel „nichts in-place").
ZIEL = Path(os.environ.get("EXTRACT_OUT_DIR") or (Path(__file__).parent.parent / "02_parsed_v2"))
ZIEL.mkdir(parents=True, exist_ok=True)

# Optionales Sampling-Limit (Env EXTRACT_SAMPLE_LIMIT): jeder Extraktor stoppt,
# sobald so viele Dokumente gesammelt sind. Für schnelle Mini-Runs / Stichproben
# (Gate A, Phase-C-Subset) – produktiv (None) unbegrenzt.
SAMPLE_LIMIT = int(os.environ.get("EXTRACT_SAMPLE_LIMIT", "0")) or None


def _limit_erreicht(eintraege: list) -> bool:
    return SAMPLE_LIMIT is not None and len(eintraege) >= SAMPLE_LIMIT


# ── K4: Unicode-Normalisierung + historische Glyphen ────────────────────────
#
# Aus den echten DTA-/GEI-Beispieldateien abgeleitet (dta-kern/abel_leibmedicus_1699:
# ſ 10.662×, kombinierendes e über Vokal U+0364 2.996×, ꝛ 45×). Griechische
# Buchstaben und akzentuierte Latein-Zeichen (æ, œ, è, à …) sind ECHT (Zitate)
# und werden bewusst NICHT angetastet. NFKC wäre zu aggressiv (bricht Griechisch,
# Ligaturen, Hochstellungen) → gezielte NFC + Translation-Tabelle.

# Einzel-Glyphen → Zielbuchstabe (str.translate-Tabelle)
_GLYPHEN = {
    0x017F: "s",   # ſ  LATIN SMALL LETTER LONG S
    0x1E9B: "s",   # ẛ  LATIN SMALL LETTER LONG S WITH DOT ABOVE
    0xA75B: "r",   # ꝛ  LATIN SMALL LETTER R ROTUNDA
    0xA75A: "R",   # Ꝛ  LATIN CAPITAL LETTER R ROTUNDA
}
GLYPH_TABLE = {k: v for k, v in _GLYPHEN.items()}

# Kombinierendes e über Vokal (U+0364) → Umlaut. NFC bildet keine
# Präkompositform, deshalb explizit ersetzen (vor der Einzel-Glyphen-Tabelle).
_KOMBI_E = {
    "aͤ": "ä", "oͤ": "ö", "uͤ": "ü",
    "Aͤ": "Ä", "Oͤ": "Ö", "Uͤ": "Ü",
    "eͤ": "e",  # selten; kombinierendes e über e → e
}

# Unsichtbare / weiche Steuerzeichen, die restlos entfernt werden
_UNSICHTBAR = {
    0xFEFF: None,  # ZERO WIDTH NO-BREAK SPACE (BOM-Reste, GEI 296×)
    0x200B: None,  # ZERO WIDTH SPACE
    0x200C: None,  # ZERO WIDTH NON-JOINER
    0x200D: None,  # ZERO WIDTH JOINER
    0x00AD: None,  # SOFT HYPHEN (verbleibende, nach Dehyphenierung)
}


def normalisiere_glyphen(text: str) -> str:
    """NFC + kombinierendes-e-Auflösung + historische Einzel-Glyphen."""
    text = unicodedata.normalize("NFC", text)
    for kombi, ziel in _KOMBI_E.items():
        if kombi in text:
            text = text.replace(kombi, ziel)
    return text.translate(GLYPH_TABLE)


# ── K3: Dehyphenierung ──────────────────────────────────────────────────────

# Fortsetzung mit Kleinbuchstabe → Silbentrennung (Bindestrich weg);
# Großbuchstabe → echtes Bindestrich-Kompositum (Bindestrich bleibt).
_RE_TRENN_ZEILE = re.compile(r"(\w)[-‐‑][ \t]*\n[ \t]*(\w)")
# OCR-Trennstrich ¬ (Reichstagsprotokolle): immer zusammenfügen.
_RE_TRENN_NOTSIGN = re.compile(r"(\w)¬[ \t]*\n?[ \t]*(\w)")
# Weicher Trennstrich am Zeilenumbruch: entfernen (fügt zusammen).
_RE_SOFT_HYPHEN = re.compile(r"­(?:[ \t]*\n[ \t]*)?")


def _trenn_join(m: "re.Match") -> str:
    a, b = m.group(1), m.group(2)
    return a + b if b.islower() else a + "-" + b


def dehyphenate(text: str) -> str:
    """Silbentrennung am Zeilenende auflösen (K3).

    „Stu-\\ndenten" → „Studenten"; „Nord-\\nSüd" → „Nord-Süd" (Kompositum
    bleibt, da Fortsetzung großgeschrieben); „Gesetz¬ entwurfs" → „Gesetzentwurfs".
    """
    text = _RE_SOFT_HYPHEN.sub("", text)
    text = _RE_TRENN_NOTSIGN.sub(r"\1\2", text)
    text = _RE_TRENN_ZEILE.sub(_trenn_join, text)
    return text


# ── Whitespace-Normalisierung + Gesamt-Pipeline ─────────────────────────────

def bereinige_text(text: str) -> str:
    """Leerzeichen normalisieren, überzählige Leerzeilen zusammenfassen."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalisiere_text(text: str) -> str:
    """Vollständige Text-Aufbereitung: Zeilenenden → K4 (Glyphen) →
    K3 (Dehyphenierung) → unsichtbare Zeichen entfernen → Whitespace.

    Zeilenenden werden zuerst auf \\n normalisiert, damit die
    Trennstrich-Regex auch CRLF-Dateien (z. B. Pitaval) erfasst."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = normalisiere_glyphen(text)
    text = dehyphenate(text)
    text = text.translate(_UNSICHTBAR)
    return bereinige_text(text)


# ── Referenz-/Metadaten-Helfer ──────────────────────────────────────────────

# Vierstellige Jahreszahl MIT Ziffern-Grenzen. Ohne die Grenzen las die alte
# Fassung Ziffernfolgen aus Dokument-IDs als Jahreszahl — in Phase E an 3.251
# Dokumenten nachgewiesen:
#   „H0021024"     → 1024   (humboldt-digital, 2.780 von 11.388 Dok. = 24,4 %)
#   „tab010539"    → 1053   (dta-dingler, 399 von 4.186 = 9,5 %)
#   „510287"       → 1028   (dta_erweiterungen, 40 von 5.479 = 0,7 %)
# Die Folge wäre in Phase F material gewesen: der „>= 1830"-Filter (F3) hätte
# diese Dokumente ausgeschlossen, und das falsche Jahr wäre über `ref` in die
# Beleg-Zitation der App gewandert („Milichius: Dominus abstulit. 1028").
#
# Untergrenze 1400: davor existieren in diesen Korpora keine Quellen mit einem
# Jahr IM DATEINAMEN. Datierte Handschriften-Korpora (ref_fnh, ab ~1350) holen
# ihr Jahr aus dem eigenen Header (_fnh_header_jahr), nicht hier.
_RE_JAHR_IM_NAMEN = re.compile(r"(?<!\d)(1[4-9]\d{2}|20[0-2]\d)(?!\d)")

# Erlaubter Jahresbereich je quelle: (min, max). Ein Jahr außerhalb wird
# verworfen (None) statt geraten — ein fehlendes Jahr ist ehrlich und wird von
# Gate B als Lücke gezählt; ein erfundenes wandert unentdeckt ins
# Dekaden-Histogramm, in `ref` und in den Jahr-Filter der Belege.
#
# Die Grenzen sind an der tatsächlichen Verteilung der v2-Extraktion GEMESSEN
# (min/p1/p50/p99/max je quelle über alle 3,72 Mio. Dokumente, 2026-08-03) und
# dann auf den historisch belegbaren Zeitraum der Quelle gerundet — nicht
# geraten. Wo Messung und Quellenlage auseinanderfielen, hat die Quellenlage
# Vorrang (Beispiel: dta-dingler zeigt einen Median von 1714, obwohl Dinglers
# Polytechnisches Journal erst 1820 erschien — der Median ist der Bug, nicht die
# Wahrheit).
JAHR_BEREICH: "dict[str, tuple[int, int]]" = {
    # ── Gegenwartssprache ──
    # gesetze: gemessenes Minimum 1869 ist echt (StGB 1871, BGB 1896 gelten fort)
    "gesetze":                (1850, 2027),
    "bundestag":              (1949, 2027),   # gemessen 2013–2026
    "bundestagskorpus_pdf":   (1949, 2027),   # gemessen 1949–2026
    "pol_reden":              (1945, 2027),   # gemessen 1982–2017
    "deu_news":               (1990, 2027),   # gemessen 1995–2025
    "deu_newscrawl":          (1990, 2027),   # gemessen 2011–2020
    # Justiz-Splits: gemessen 1951–2024
    "bag": (1945, 2027), "bfh": (1945, 2027), "bgh": (1945, 2027),
    "bpatg": (1945, 2027), "bverfg": (1945, 2027), "bverfg_amtlich": (1945, 2027),
    "bverwg": (1945, 2027),
    "bgh_strafsachen_hist":   (1945, 2027),   # gemessen 1950–1999
    # Wikimedia-Korpora tragen bewusst kein Jahr (Entscheidung A4)
    "wikipedia": (1990, 2027), "wikibooks": (1990, 2027), "wikivoyage": (1990, 2027),
    # ── Historische Korpora ──
    "reichtagsprotokolle":    (1850, 1950),   # gemessen 1860–1948
    "dta_kern":               (1450, 1950),   # gemessen 1598–1913
    "dta_erweiterungen":      (1450, 1950),   # gemessen p1 1500 – p99 1920
    "dta-dingler":            (1820, 1932),   # Polytechnisches Journal 1820–1931
    "dta-novellenschatz":     (1800, 1920),   # gemessen 1884–1887
    "dta-patiententexte":     (1700, 1975),   # gemessen 1762–1959
    "dta-soldatenbriefe":     (1700, 1950),   # gemessen 1745–1872
    "dta-stimm-los":          (1800, 1950),   # gemessen 1830–1874
    "humboldt-digital":       (1780, 1870),   # Alexander v. Humboldt 1769–1859
    "humboldt-publizistik":   (1780, 1870),   # gemessen 1789–1859
    "jean-paul-briefe":       (1760, 1830),   # Jean Paul 1763–1825
    "dibilit":                (1550, 2010),   # gemessen 1602–1998
    "dibiphil":               (1550, 2010),   # trägt real kein Jahr
    "gei_digital":            (1600, 1950),   # gemessen 1650–1921
    "neuer_pitaval":          (1800, 1900),   # gemessen 1842–1890
    "ref_fnh":                (1250, 1700),   # gemessen 1296–1655 (Frühneuhochdeutsch)
    "ref_mhd":                (1050, 1400),   # Mittelhochdeutsch (trägt real kein Jahr)
}

# Fallback für Quellen ohne eigenen Eintrag: großzügig, fängt aber die
# ID-Ziffern-Artefakte (< 1400) und Jahre in der Zukunft ab.
JAHR_BEREICH_DEFAULT = (1400, 2027)


def jahr_plausibel(jahr: "int | None", quelle: str) -> "int | None":
    """Verwirft ein Jahr, das für die Quelle nicht sein kann.

    Bewusst konservativ: bei Verletzung wird None zurückgegeben, nicht korrigiert.
    Ein fehlendes Jahr ist ehrlich und wird von Gate B als Lücke gezählt; ein
    erfundenes wandert unentdeckt in Dekaden-Histogramm, `ref` und Jahr-Filter.
    """
    if not jahr:
        return None
    lo, hi = JAHR_BEREICH.get(quelle, JAHR_BEREICH_DEFAULT)
    return jahr if lo <= jahr <= hi else None


def jahr_aus_dateiname(name: str) -> "int | None":
    """Letztes plausibles vierstelliges Jahr aus dem Dateinamen (DTA-Konvention
    ‚autor_titel_JAHR' → Jahr steht am Ende).

    Zählt nur freistehende Jahreszahlen: eine Ziffernfolge innerhalb einer
    längeren Zahl (Dokument-IDs wie „H0021024") ist kein Jahr.
    """
    jahre = _RE_JAHR_IM_NAMEN.findall(name)
    return int(jahre[-1]) if jahre else None


def _bau_ref(nachname: str, titel: str, jahr: "int | None",
             fallback_label: str, stem: str) -> str:
    """Baut „Nachname: Titel. Jahr"; fällt auf „Label: stem" zurück, damit
    ref nie leer ist (Gate B: 100 % ref oder bewusster Fallback)."""
    if titel and nachname:
        base = f"{nachname}: {titel}"
    elif titel:
        base = titel
    else:
        return f"{fallback_label}: {stem}"
    if jahr:
        # doppelte Interpunktion vermeiden, wenn der Titel schon auf .!? endet
        sep = " " if base.endswith((".", "!", "?")) else ". "
        base += f"{sep}{jahr}"
    return base


def _clean_stem(name: str) -> str:
    """Dateiname-Stamm ohne .txt/.TEI-P5-Reste (dibilit: ‚…_1888.txt.xml')."""
    stem = Path(name).stem
    for suffix in (".txt", ".TEI-P5"):
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)]
    return stem


def tei_header_metadata(root) -> "tuple[str, str, str, int | None]":
    """Extrahiert (titel, nachname, autor, tei_jahr) aus einem
    namespace-bereinigten TEI-Root im DTA-Basisformat.

    titel  = <title type="main"> (voller TEI-Titel, User-Entscheidung 2026-07-22)
    autor  = "Nachname, Vorname"; nachname separat für die ref-Bildung.
    tei_jahr aus den Datumsangaben in <sourceDesc> (Quell-Jahr, nicht das
    Digitalisierungsdatum in fileDesc/publicationStmt).
    """
    hdr = root.find(".//teiHeader")
    if hdr is None:
        return "", "", "", None

    titel = ""
    for t in hdr.iter("title"):
        if t.get("type") == "main":
            titel = " ".join("".join(t.itertext()).split())
            if titel:
                break
    if not titel:
        t = hdr.find(".//title")
        if t is not None:
            titel = " ".join("".join(t.itertext()).split())

    nachname = vorname = ""
    for a in hdr.iter("author"):
        pers = a.find(".//persName")
        if pers is not None:
            nachname = (pers.findtext("surname") or "").strip()
            vorname = (pers.findtext("forename") or "").strip()
        else:
            nachname = " ".join("".join(a.itertext()).split())
        if nachname or vorname:
            break
    autor = ", ".join(x for x in (nachname, vorname) if x)

    tei_jahr = None
    sd = hdr.find(".//sourceDesc")
    if sd is not None:
        for d in sd.iter("date"):
            m = _RE_JAHR_IM_NAMEN.search(d.text or "")
            if m:
                tei_jahr = int(m.group(1))
                break
    if tei_jahr is None:
        # Fallback für Briefkorpora (jean-paul-briefe, humboldt-digital): das
        # Datum steht dort in <correspDesc><correspAction><date when="…">,
        # nicht in <sourceDesc> (Gate B: 58,8 % Jahr-Abdeckung in dta_github,
        # weil dieser Fall bislang übersprungen wurde).
        # Ziffern-Grenzen auch hier: ein @when kann eine Signatur o. Ä. enthalten.
        for d in hdr.iter("date"):
            when = d.get("when") or d.get("when-iso") or d.get("notBefore") or ""
            m = _RE_JAHR_IM_NAMEN.search(when)
            if m:
                tei_jahr = int(m.group(1))
                break
    return titel, nachname, autor, tei_jahr


# ── Hilfs-Funktionen ───────────────────────────────────────────────────────

def pruefe_jahre(eintraege: list) -> "tuple[int, dict]":
    """Verwirft unplausible Jahre und korrigiert `ref` entsprechend.

    Zentraler Wächter für ALLE Korpora: die Extraktoren holen ihr Jahr aus sehr
    unterschiedlichen Quellen (Dateiname, TEI-Header, CoRA-Header, ISO-Datum im
    id-String, Band-Metadaten), und jede dieser Heuristiken kann eine Zahl
    erwischen, die kein Jahr ist. In Phase E an 7.330 Dokumenten nachgewiesen —
    überwiegend `humboldt-digital` (55 %) und `dta-dingler` (24 %), deren
    Dateinamen reine Dokument-IDs sind.

    Deshalb hier statt in den zwölf Extraktoren: eine Stelle, die auch künftige
    Extraktoren mit abdeckt.
    """
    verworfen = 0
    je_quelle: dict = {}
    for e in eintraege:
        jahr = e.get("jahr")
        if not jahr:
            continue
        quelle = e.get("quelle", "")
        if jahr_plausibel(jahr, quelle) is not None:
            continue
        # Jahr verwerfen — und aus `ref` entfernen, sonst stünde das falsche
        # Jahr weiter in der Beleg-Zitation der App („… . 1028").
        ref = e.get("ref") or ""
        for muster in (f". {jahr}", f" ({jahr})", f", {jahr}", f" {jahr}"):
            if ref.endswith(muster):
                e["ref"] = ref[: -len(muster)]
                break
        e["jahr"] = None
        verworfen += 1
        je_quelle[quelle] = je_quelle.get(quelle, 0) + 1
    return verworfen, je_quelle


def schreibe_jsonl(datei: Path, eintraege: list):
    verworfen, je_quelle = pruefe_jahre(eintraege)
    # Erst vollständig in eine .part-Datei schreiben, dann umbenennen: ein
    # Abbruch mitten im Schreiben (--force auf eine vorhandene Datei) darf die
    # bestehende Extraktion nicht als Trümmer hinterlassen.
    tmp = datei.with_suffix(datei.suffix + ".part")
    with tmp.open("w", encoding="utf-8") as f:
        for e in eintraege:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    tmp.replace(datei)
    print(f"  [OK] {datei.name}: {len(eintraege):,} Dokumente")
    if verworfen:
        detail = ", ".join(f"{q}: {n:,}" for q, n in sorted(je_quelle.items()))
        print(f"       [JAHR] {verworfen:,} unplausible Jahre verworfen ({detail})")


def tei_text_aus_element(elem) -> str:
    """Rekursiv Plaintext aus TEI-Element extrahieren.
    Überspringt für den TEXTKÖRPER: teiHeader (→ Metadaten separat!), note,
    fw (Kolumnentitel), pb (Seitenumbrüche), figure."""
    SKIP_TAGS = {"teiHeader", "note", "fw", "pb", "figure", "figDesc",
                 "front", "back", "trailer", "byline", "closer", "opener"}

    def _text(e, buf: list):
        tag = e.tag.split("}")[-1] if "}" in e.tag else e.tag
        if tag in SKIP_TAGS:
            return
        if e.text:
            buf.append(e.text)
        for child in e:
            _text(child, buf)
            if child.tail:
                buf.append(child.tail)
        # Absatz-Trenner nach Block-Elementen
        if tag in {"p", "l", "ab", "lg", "div", "head", "sp", "stage"}:
            buf.append("\n")

    buf: list = []
    _text(elem, buf)
    return normalisiere_text("".join(buf))


# ── Extraktoren ────────────────────────────────────────────────────────────

def extrahiere_gesetze() -> list:
    """GII-XML: <norm> → <textdaten><text><Content><P>.
    ref = Einzelnorm-Bezeichnung + Gesetzeskürzel („§ 242 BGB");
    jahr aus <ausfertigung-datum> (Gesetzes-Ebene)."""
    print("\n── Gesetze")
    basis = KORPORA / "gesetze"
    eintraege = []
    for gesetz_dir in sorted(basis.iterdir()):
        if _limit_erreicht(eintraege):
            break
        if not gesetz_dir.is_dir():
            continue
        for xml_datei in gesetz_dir.glob("*.xml"):
            if _limit_erreicht(eintraege):
                break
            try:
                root = ET.parse(xml_datei).getroot()
            except ET.ParseError:
                continue
            jurabk = (root.findtext(".//jurabk") or gesetz_dir.name).strip()
            m = re.search(r"\b(1[0-9]{3}|20[0-2][0-9])\b",
                          root.findtext(".//ausfertigung-datum") or "")
            law_jahr = int(m.group(1)) if m else None
            for i, norm in enumerate(root.findall(".//norm")):
                if _limit_erreicht(eintraege):
                    break
                textdaten = norm.find("textdaten")
                if textdaten is None:
                    continue
                teile = []
                for p in textdaten.iter("P"):
                    txt = "".join(p.itertext()).strip()
                    if txt:
                        teile.append(txt)
                for tag in ("Title", "Subtitle"):
                    for el in textdaten.iter(tag):
                        txt = "".join(el.itertext()).strip()
                        if txt:
                            teile.insert(0, txt)
                if not teile:
                    continue
                enbez = (norm.findtext(".//enbez") or "").strip()
                ref = f"{enbez} {jurabk}".strip() if enbez else jurabk
                eintraege.append({
                    "id":     f"gesetze/{gesetz_dir.name}/{i:04d}",
                    "text":   normalisiere_text("\n".join(teile)),
                    "quelle": "gesetze",
                    "genre":  "recht",
                    "epoche": "modern",
                    "jahr":   law_jahr,
                    "titel":  jurabk,
                    "autor":  "",
                    "ref":    ref,
                })
    return eintraege


def _bundestag_ref(stem: str) -> "tuple[str, int | None]":
    """‚WP01_0001_1949-09-07' → („BT-PlPr. 01/1, 07.09.1949", 1949)."""
    m = re.match(r"WP(\d+)_(\d+)_(\d{4})-(\d{2})-(\d{2})", stem)
    if not m:
        j = jahr_aus_dateiname(stem)
        return f"BT-PlPr. {stem}", j
    wp, num, y, mo, d = m.groups()
    ref = f"BT-PlPr. {int(wp):02d}/{int(num)}, {d}.{mo}.{y}"
    return ref, int(y)


def extrahiere_bundestag_xml() -> list:
    """DIP-XML: <dbtplenarprotokoll> → <rede>/<p> und <tagesordnungspunkt>/<p>.
    ref = Protokoll-Kennung aus dem Dateinamen (alle Reden einer Sitzung teilen sie)."""
    print("\n── Bundestagskorpus (XML)")
    basis = KORPORA / "bundestagskorpus"
    eintraege = []
    for xml_datei in sorted(basis.glob("*.xml")):
        if _limit_erreicht(eintraege):
            break
        ref, jahr = _bundestag_ref(xml_datei.stem)
        try:
            root = ET.parse(xml_datei).getroot()
        except ET.ParseError:
            continue
        for elem in root.iter():
            if "}" in elem.tag:
                elem.tag = elem.tag.split("}", 1)[1]

        for rede in root.iter("rede"):
            if _limit_erreicht(eintraege):
                break
            teile = []
            for p in rede.iter("p"):
                txt = "".join(p.itertext()).strip()
                if txt and len(txt) > 20:
                    teile.append(txt)
            if teile:
                rede_id = rede.get("id", "")
                eintraege.append({
                    "id":     f"bundestag/{xml_datei.stem}/{rede_id or len(eintraege)}",
                    "text":   normalisiere_text("\n".join(teile)),
                    "quelle": "bundestag",
                    "genre":  "parlament",
                    "epoche": "modern",
                    "jahr":   jahr,
                    "titel":  "",
                    "autor":  "",
                    "ref":    ref,
                })

        for top in root.iter("tagesordnungspunkt"):
            if _limit_erreicht(eintraege):
                break
            teile = []
            for child in top:
                if child.tag == "p":
                    txt = "".join(child.itertext()).strip()
                    if txt and len(txt) > 30:
                        teile.append(txt)
            if teile:
                eintraege.append({
                    "id":     f"bundestag/{xml_datei.stem}/top_{len(eintraege)}",
                    "text":   normalisiere_text("\n".join(teile)),
                    "quelle": "bundestag",
                    "genre":  "parlament",
                    "epoche": "modern",
                    "jahr":   jahr,
                    "titel":  "",
                    "autor":  "",
                    "ref":    ref,
                })
    return eintraege


def extrahiere_leipzig() -> list:
    """Leipzig tar.gz: *-sentences.txt → ID\\tSatz, gebündelt zu ~100 Sätzen.
    ref = Korpus + Jahrgang (keine Dokument-Metadaten verfügbar)."""
    print("\n── Leipzig Corpora")
    eintraege = []
    BUENDELGROESSE = 100

    for korpus in ("deu_news", "deu_newscrawl"):
        basis = KORPORA / korpus
        for tgz in sorted(basis.glob("*.tar.gz")):
            if _limit_erreicht(eintraege):
                break
            m = re.search(r"_(\d{4})_", tgz.name)
            jahr = int(m.group(1)) if m else None
            try:
                tf = tarfile.open(tgz, errorlevel=0)
            except Exception as e:
                print(f"    [SKIP] {tgz.name}: {e}")
                continue
            try:
                satz_member = next(
                    (m for m in tf.getmembers() if m.name.endswith("-sentences.txt")), None
                )
            except Exception as e:
                print(f"    [SKIP] {tgz.name}: {e}")
                continue
            if not satz_member:
                continue
            saetze = []
            try:
                f = tf.extractfile(satz_member)
                for line in io.TextIOWrapper(f, encoding="utf-8", errors="replace"):
                    parts = line.strip().split("\t", 1)
                    if len(parts) == 2:
                        saetze.append(parts[1])
            except Exception as e:
                print(f"    [SKIP] {tgz.name}: {e}")

            ref = f"Leipzig ({korpus})" + (f" {jahr}" if jahr else "")
            for i in range(0, len(saetze), BUENDELGROESSE):
                if _limit_erreicht(eintraege):
                    break
                buendel = saetze[i:i + BUENDELGROESSE]
                eintraege.append({
                    "id":     f"{korpus}/{tgz.stem}/{i // BUENDELGROESSE:05d}",
                    "text":   normalisiere_text(" ".join(buendel)),
                    "quelle": korpus,
                    "genre":  "zeitung",
                    "epoche": "modern",
                    "jahr":   jahr,
                    "titel":  "",
                    "autor":  "",
                    "ref":    ref,
                })
    return eintraege


def extrahiere_pol_reden() -> list:
    """Politische Reden XML: <text person= titel= datum=><rohtext>.
    ref = „Redner, Datum"."""
    print("\n── Politische Reden")
    basis = KORPORA / "politische-reden"
    eintraege = []
    for xml_datei in sorted(basis.glob("*.xml")):
        if _limit_erreicht(eintraege):
            break
        try:
            inhalt = xml_datei.read_bytes()
            for enc in ("utf-8", "utf-8-sig", "iso-8859-1", "windows-1252"):
                try:
                    root = ET.fromstring(inhalt.decode(enc))
                    break
                except (UnicodeDecodeError, ET.ParseError):
                    continue
            else:
                continue
        except Exception:
            continue
        for text_elem in root.iter("text"):
            if _limit_erreicht(eintraege):
                break
            rohtext = text_elem.findtext("rohtext", "").strip()
            if not rohtext:
                rohtext = "".join(text_elem.itertext()).strip()
            if rohtext and len(rohtext) > 50:
                datum = text_elem.get("date") or text_elem.get("datum") or ""
                jahr = int(datum[:4]) if datum[:4].isdigit() else None
                person = (text_elem.get("person") or "").strip()
                titel = (text_elem.get("titel") or "").strip()
                if person and datum:
                    ref = f"{person}, {datum}"
                elif person:
                    ref = person
                else:
                    ref = titel or f"Politische Rede {xml_datei.stem}"
                eintraege.append({
                    "id":     f"pol_reden/{xml_datei.stem}/{len(eintraege)}",
                    "text":   normalisiere_text(rohtext),
                    "quelle": "pol_reden",
                    "genre":  "rede",
                    "epoche": "modern",
                    "jahr":   jahr,
                    "titel":  titel,
                    "autor":  person,
                    "ref":    ref,
                })
    return eintraege


def _gc_block_meta(block: str, quelle: str) -> "tuple[str, int | None, str]":
    """Dokument-Metadaten aus dem Kopf eines German-Commons-Blocks.

    reichtagsprotokolle: Band + Jahr aus dem Sitzungskopf („Band 428.",
      „… 21. Mai 1930 …") → ref „Reichstagsprotokoll, Bd. 428 (1930)".
    dibiphil: erste nicht-leere Zeile = Werktitel → ref „DiBiPhil: <Titel>".
    """
    kopf = block[:600]
    if quelle == "reichtagsprotokolle":
        m_band = re.search(r"Band\s+(\d+)", kopf)
        m_jahr = re.search(r"\b(18[6-9]\d|19[0-4]\d)\b", kopf)
        band = m_band.group(1) if m_band else ""
        jahr = int(m_jahr.group(1)) if m_jahr else None
        ref = "Reichstagsprotokoll"
        if band:
            ref += f", Bd. {band}"
        if jahr:
            ref += f" ({jahr})"
        return "", jahr, ref
    # dibiphil (und generisches german_commons)
    titel = ""
    for zeile in kopf.splitlines():
        if zeile.strip():
            titel = zeile.strip()[:120]
            break
    label = "DiBiPhil" if quelle == "dibiphil" else "German Commons"
    ref = f"{label}: {titel}" if titel else f"{label}-Korpus"
    return titel, None, ref


def extrahiere_german_commons() -> list:
    """German Commons .txt: HuggingFace-Dokumente durch Doppel-Newline getrennt.
    Lange Dokumente (ganze Reichstags-Bände, mehrere MB) werden in ~3000-Zeichen-
    Abschnitte geteilt; Dokument-Metadaten aus dem Blockkopf werden auf alle
    Abschnitte propagiert (→ Jahr-Abdeckung trotz Chunking)."""
    print("\n── German Commons")
    basis = KORPORA / "german-commons"
    META = {
        "reichtagsprotokolle.txt": ("reichtagsprotokolle", "parlament",  "historisch"),
        "dibiphil.txt":            ("dibiphil",             "literatur",  "historisch"),
    }
    CHUNK_MAX = 3000
    eintraege = []
    for txt_datei in sorted(basis.glob("*.txt")):
        if _limit_erreicht(eintraege):
            break
        quelle, genre, epoche = META.get(txt_datei.name, ("german_commons", "diverses", "historisch"))
        if SAMPLE_LIMIT:  # Sampling: nur den Dateianfang lesen statt der ganzen GB-Datei
            with txt_datei.open(encoding="utf-8", errors="replace") as fh:
                inhalt = fh.read(4_000_000)
        else:
            inhalt = txt_datei.read_text(encoding="utf-8", errors="replace")
        n = 0
        for block in inhalt.split("\n\n"):
            if _limit_erreicht(eintraege):
                break
            block = normalisiere_text(block)
            if len(block) < 100:
                continue
            titel, jahr, ref = _gc_block_meta(block, quelle)
            teile = [block] if len(block) <= CHUNK_MAX else [
                block[j:j + CHUNK_MAX] for j in range(0, len(block), CHUNK_MAX)
            ]
            for teil in teile:
                teil = teil.strip()
                if len(teil) >= 100:
                    eintraege.append({
                        "id":     f"german_commons/{txt_datei.stem}/{n:07d}",
                        "text":   teil,
                        "quelle": quelle,
                        "genre":  genre,
                        "epoche": epoche,
                        "jahr":   jahr,
                        "titel":  titel,
                        "autor":  "",
                        "ref":    ref,
                    })
                    n += 1
        print(f"  {txt_datei.name}: {n:,} Abschnitte")
    return eintraege


# ── German Commons: Justiz-Splits (BGH/BVerfG/BPatG/BVerwG/BAG/BFH) ─────────
#
# Diese Splits kommen (anders als reichtagsprotokolle/dibiphil) als .jsonl mit
# id/source/license/text je Zeile aus download_german_commons.py, weil ihre
# id-Werte Gericht+Datum+Aktenzeichen kodieren – zu schade, das wie beim
# TXT-Format wegzuwerfen (Plan-Ziel „dokumentgenaue Quellennachweise").
#
# id-Format variiert je Gericht (Stichproben 2026-07-22, n=1 je Gericht):
#   BAG_2010-07-13_9_AZR_287_09_NA.txt
#   BFH_NV_2014-07-01_I_B_193_13_STRE201450436.txt
#   BGH_Zivilsenat-11_NA_2021-01-12_XI_ZR_589_19_NA_NA_0.txt
#   BPatG_TechnBeschw_NA_2015-10-15_17_W-pat_8_13_NA_0.txt
#   BVerfG_2010-04-14_S_1_BvL_0008_08_NA_Privatisierung-Kliniken-Hamburg_126_29.txt
# Gemeinsam ist nur: ein ISO-Datum (YYYY-MM-DD) steht irgendwo im id-String.
# ref wird deshalb bewusst NICHT als vollständig formatierte Rechtszitation
# rekonstruiert (Court-spezifische Az.-Syntax ist zu uneinheitlich für n=1-
# Stichproben) – stattdessen generisch: Gerichtsname, Datum, plus die übrigen
# id-Tokens (NA-Platzhalter/Padding entfernt) als "Az."-Näherung. Ehrliche
# Einschränkung, dokumentiert wie F5/lemma_corpus_freq (DB-Neuaufbau.md 3.3).

_RE_ISO_DATUM = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")

# split-Dateiname (ohne .jsonl) -> (Gerichtsname, quelle, genre, epoche)
JUSTIZ_META = {
    "bverfg":               ("Bundesverfassungsgericht", "bverfg",               "rechtsprechung", "modern"),
    "bverfg_amtlich":       ("Bundesverfassungsgericht (Amtliche Sammlung)", "bverfg_amtlich", "rechtsprechung", "modern"),
    "bgh":                  ("Bundesgerichtshof",         "bgh",                  "rechtsprechung", "modern"),
    "bgh_strafsachen_hist": ("Bundesgerichtshof (Strafsachen, 20. Jh.)", "bgh_strafsachen_hist", "rechtsprechung", "historisch"),
    "bverwg":               ("Bundesverwaltungsgericht",  "bverwg",               "rechtsprechung", "modern"),
    "bpatg":                ("Bundespatentgericht",       "bpatg",                "rechtsprechung", "modern"),
    "bag":                  ("Bundesarbeitsgericht",      "bag",                  "rechtsprechung", "modern"),
    "bfh":                  ("Bundesfinanzhof",           "bfh",                  "rechtsprechung", "modern"),
}


def _justiz_ref(gericht: str, stem: str) -> "tuple[str, int | None]":
    """Baut (ref, jahr) aus einem German-Commons-Justiz-id (siehe Kommentar
    oben). Fällt auf „Gericht: stem" zurück, wenn kein Datum gefunden wird.

    Wichtig: „Az." ist bewusst KEINE formatierte Rechtszitation (die Az.-
    Syntax – „/" vs. „." vs. Klammern – unterscheidet sich je Gericht, siehe
    z. B. BVerwG „8 B 149.03" vs. BGH „XI ZR 589/19"; aus n=1-Stichproben pro
    Gericht wäre eine automatische Interpunktion-Rekonstruktion Rätselraten).
    Stattdessen werden die id-Tokens roh (leerzeichengetrennt, NA-Platzhalter
    und ein einzelner Padding-Index „0" am Ende entfernt) angehängt – weniger
    hübsch, aber nicht falsch."""
    tokens = stem.split("_")
    datum_idx = next(
        (i for i, t in enumerate(tokens) if _RE_ISO_DATUM.match(t)), None
    )
    if datum_idx is None:
        return f"{gericht}: {stem}", None

    jahr, monat, tag = (int(x) for x in tokens[datum_idx].split("-"))
    datum_str = f"{tag:02d}.{monat:02d}.{jahr:04d}"

    # tokens[0] ist das Gericht selbst (BGH/BAG/…) – nicht Teil von "vor".
    vor = [t for t in tokens[1:datum_idx] if t and t != "NA"]
    nach = [t for t in tokens[datum_idx + 1:] if t and t != "NA"]
    if nach and nach[-1] == "0":
        nach = nach[:-1]  # Padding-Index am Ende (z. B. "..._NA_0")

    ref = f"{gericht}, {datum_str}"
    if vor:
        ref += f" – {' '.join(vor)}"
    if nach:
        ref += f", Az. {' '.join(nach)}"
    return ref, jahr


def extrahiere_german_commons_justiz() -> list:
    """German Commons Justiz-Splits (.jsonl aus download_german_commons.py):
    id/source/license/text je Zeile. Ein Eintrag pro Entscheidung (kein
    Chunking nötig – Entscheidungen sind typischerweise deutlich kürzer als
    die Reichstags-Bände)."""
    basis = KORPORA / "german-commons"
    eintraege = []
    for dateiname, (gericht, quelle, genre, epoche) in JUSTIZ_META.items():
        jsonl_datei = basis / f"{dateiname}.jsonl"
        if not jsonl_datei.exists():
            continue
        n = 0
        with jsonl_datei.open(encoding="utf-8") as f:
            for zeile in f:
                if _limit_erreicht(eintraege):
                    break
                zeile = zeile.strip()
                if not zeile:
                    continue
                try:
                    obj = json.loads(zeile)
                except json.JSONDecodeError:
                    continue
                text = normalisiere_text(obj.get("text") or "")
                if len(text) < 100:
                    continue
                stem = _clean_stem(obj.get("id") or f"{quelle}/{n:07d}")
                ref, jahr = _justiz_ref(gericht, stem)
                eintraege.append({
                    "id":     f"{quelle}/{stem}",
                    "text":   text,
                    "quelle": quelle,
                    "genre":  genre,
                    "epoche": epoche,
                    "jahr":   jahr,
                    "titel":  "",
                    "autor":  "",
                    "ref":    ref,
                })
                n += 1
        print(f"  {dateiname}.jsonl: {n:,} Entscheidungen ({gericht})")
    return eintraege


# ── Wikipedia (belege_v2 UND wortprofil_v2 – F1 revidiert 2026-07-24) ───────
#
# Eingabe: wikiextractor-Ausgabe (download_wikipedia.py) – Verzeichnisbaum mit
# Dateien wie AA/wiki_00, jeweils mehrere <doc id=".." url=".." title="..">
# Text </doc>-Blöcke. wikiextractor entfernt Infoboxen/Referenzen bereits
# strukturell (Templates werden nicht expandiert); Tabellen/Listen-Reste und
# Navigations-Fragmente filtern wir zusätzlich heuristisch pro Absatz.

_RE_WIKI_DOC = re.compile(
    r'<doc id="(?P<id>[^"]*)" url="(?P<url>[^"]*)" title="(?P<title>[^"]*)">'
    r'(?P<body>.*?)</doc>', re.DOTALL,
)
WIKI_STUB_MIN = 500       # Artikel unter dieser Gesamtlänge (nach Filterung) verwerfen
WIKI_PARA_MIN = 150       # Absätze unter dieser Länge sind meist Listen-/Tabellenreste


def _wiki_absatz_ok(absatz: str) -> bool:
    """Heuristischer Fließtext-Filter (Task-Vorgabe: Infoboxen/Tabellen/Listen/
    Navigation raus). wikiextractor liefert i. d. R. schon reinen Fließtext;
    das hier fängt Reste ab: sehr kurze Fragmente (Listenpunkte, Navigation),
    Absätze ohne Satzzeichen (keine echten Sätze) und OCR-/Symbol-Rauschen."""
    if len(absatz) < WIKI_PARA_MIN:
        return False
    if not re.search(r"[.!?]", absatz):
        return False
    letters = sum(c.isalpha() for c in absatz)
    if letters / len(absatz) < 0.6:
        return False
    return True


def _wiki_url(titel: str) -> str:
    import urllib.parse
    return "https://de.wikipedia.org/wiki/" + urllib.parse.quote(titel.replace(" ", "_"))


def extrahiere_wikipedia() -> list:
    """Liest die wikiextractor-Ausgabe (01_download/korpora/wikipedia/extracted/)
    und baut daraus das v2-Schema. jahr bleibt leer (kein sinnvolles
    Artikel-Jahr); ref = Titel + de.wikipedia.org/wiki/-URL (Task-Vorgabe)."""
    print("\n── Wikipedia (dewiki)")
    basis = KORPORA / "wikipedia" / "extracted"
    if not basis.exists():
        print("  [SKIP] Verzeichnis nicht gefunden – erst download_wikipedia.py ausführen")
        return []
    eintraege = []
    n_dateien = n_artikel = n_stubs = 0
    for datei in sorted(basis.rglob("wiki_*")):
        if _limit_erreicht(eintraege):
            break
        n_dateien += 1
        inhalt = datei.read_text(encoding="utf-8", errors="replace")
        for m in _RE_WIKI_DOC.finditer(inhalt):
            if _limit_erreicht(eintraege):
                break
            titel = m.group("title").strip()
            wiki_id = m.group("id").strip()
            body = m.group("body")
            # Erste Zeile im Body ist meist der wiederholte Titel (wikiextractor-
            # Konvention) – als eigener Absatz ohnehin zu kurz/uninformativ, raus.
            absaetze = [a.strip() for a in body.split("\n") if a.strip()]
            if absaetze and absaetze[0] == titel:
                absaetze = absaetze[1:]
            gefiltert = [normalisiere_text(a) for a in absaetze if _wiki_absatz_ok(a)]
            text = "\n\n".join(a for a in gefiltert if a)
            if len(text) < WIKI_STUB_MIN:
                n_stubs += 1
                continue
            eintraege.append({
                "id":     f"wikipedia/{wiki_id or titel}",
                "text":   text,
                "quelle": "wikipedia",
                "genre":  "enzyklopaedie",
                "epoche": "Gegenwart",
                "jahr":   None,
                "titel":  titel,
                "autor":  "",
                "ref":    f"{titel}. Wikipedia. {_wiki_url(titel)}",
            })
            n_artikel += 1
        if n_dateien % 200 == 0:
            print(f"  {n_dateien:,} wiki_*-Dateien · {n_artikel:,} Artikel "
                  f"({n_stubs:,} Stubs verworfen) ...", flush=True)
    print(f"  {n_dateien:,} Dateien gelesen · {n_artikel:,} Artikel · "
          f"{n_stubs:,} Stubs verworfen")
    return eintraege


def extrahiere_tei_verzeichnis(
    basis: Path,
    quelle: str,
    genre: str,
    epoche: str,
    glob: str = "**/*.xml",
    ref_label: "str | None" = None,
) -> list:
    """Generischer TEI-Extraktor für DTA-Basisformat-Verzeichnisse.
    Metadaten (titel/autor/jahr/ref) aus dem TEI-Header; Jahr bevorzugt aus
    dem Dateinamen (DTA-Konvention), sonst aus <sourceDesc>."""
    label = ref_label or quelle
    eintraege = []
    for xml_datei in sorted(basis.glob(glob)):
        if _limit_erreicht(eintraege):
            break
        try:
            root = ET.parse(xml_datei).getroot()
        except ET.ParseError:
            continue
        for elem in root.iter():
            if "}" in elem.tag:
                elem.tag = elem.tag.split("}", 1)[1]
        text_elem = root.find(".//text")
        if text_elem is None:
            text_elem = root
        text = tei_text_aus_element(text_elem)
        if len(text) < 50:
            continue
        stem = _clean_stem(xml_datei.name)
        titel, nachname, autor, tei_jahr = tei_header_metadata(root)
        # Dateiname zuerst (DTA-Konvention „autor_titel_1888" ist verlässlicher
        # als ein Reprint-Datum im sourceDesc), dann TEI-Header. Bei ID-Dateinamen
        # wie „H0021024" liefert jahr_aus_dateiname jetzt None, sodass korrekt der
        # Header greift — vor dem Grenzen-Fix gewann dort die erfundene 1024.
        jahr = jahr_plausibel(jahr_aus_dateiname(stem), quelle) \
            or jahr_plausibel(tei_jahr, quelle)
        ref = _bau_ref(nachname, titel, jahr, label, stem)
        eintraege.append({
            "id":     f"{quelle}/{stem}",
            "text":   text,
            "quelle": quelle,
            "genre":  genre,
            "epoche": epoche,
            "jahr":   jahr,
            "titel":  titel,
            "autor":  autor,
            "ref":    ref,
        })
    return eintraege


def extrahiere_gei_digital() -> list:
    """GEI-Digital (Schulbücher) als ZIP mit TEI/MODS-Metadaten.
    ref = „Titel (PPN…)"; Jahr aus <publicationStmt><date> bzw. mods:dateIssued."""
    print("\n── GEI-Digital (Schulbücher)")
    zip_pfad = KORPORA / "gei-digital" / "schulbuchevolution_gei-digital.zip"
    if not zip_pfad.exists():
        print("  [SKIP] ZIP nicht gefunden")
        return []
    eintraege = []
    with zipfile.ZipFile(zip_pfad) as z:
        xml_names = [n for n in z.namelist() if n.endswith(".xml")]
        for name in sorted(xml_names):
            if _limit_erreicht(eintraege):
                break
            try:
                root = ET.fromstring(z.read(name))
            except ET.ParseError:
                continue
            for elem in root.iter():
                if "}" in elem.tag:
                    elem.tag = elem.tag.split("}", 1)[1]
            text_elem = root.find(".//text")
            if text_elem is None:
                text_elem = root
            text = tei_text_aus_element(text_elem)
            if len(text) < 50:
                continue
            stem = Path(name).stem
            hdr = root.find(".//teiHeader")

            titel = part = autor = ""
            jahr = None
            ppn = ""
            if hdr is not None:
                ewt = (hdr.findtext(".//entireWorkTitle") or "").strip()
                tm = ""
                for t in hdr.iter("title"):
                    if t.get("type") == "main":
                        tm = " ".join("".join(t.itertext()).split())
                        break
                titel = (ewt or tm).strip().strip("[]").strip()
                part = (hdr.findtext(".//part") or "").strip()
                for tag in ("date", "dateIssued"):
                    el = hdr.find(f".//{tag}")
                    if el is not None:
                        m = re.search(r"\b(1[0-9]{3}|20[0-2][0-9])\b", el.text or "")
                        if m:
                            jahr = int(m.group(1))
                            break
                editors = [" ".join("".join(e.itertext()).split()) for e in hdr.iter("editor")]
                autor = "; ".join(x for x in editors if x)
            m = re.search(r"(PPN\w+)", stem)
            ppn = m.group(1) if m else stem

            ref = titel or stem
            if ppn:
                ref = f"{ref} ({ppn})"
            titel_feld = titel
            if part and part not in titel:
                titel_feld = f"{titel} – {part}" if titel else part
            eintraege.append({
                "id":     f"gei_digital/{stem}",
                "text":   text,
                "quelle": "gei_digital",
                "genre":  "schulbuch",
                "epoche": "historisch",
                "jahr":   jahr,
                "titel":  titel_feld,
                "autor":  autor,
                "ref":    ref,
            })
    return eintraege


def _fnh_header_jahr(root) -> "int | None":
    """Jahr aus dem CorA-Klartext-Header (<header>corpus: …\\ndate: 1644\\n…</header>)
    – Gate B fand 0 % Jahr-Abdeckung, obwohl 88 % der Header ein ‚date:'-Feld
    tragen (nur nie geparst)."""
    hdr = root.find("header")
    if hdr is None or not hdr.text:
        return None
    m = re.search(r"^date:\s*(.*)$", hdr.text, re.MULTILINE)
    if not m:
        return None
    jahre = re.findall(r"(1[0-9]{3}|20[0-2][0-9])", m.group(1))
    return int(jahre[-1]) if jahre else None


def extrahiere_ref_fnh() -> list:
    """Frühneuhochdeutsch: CorA-XML in tar.gz → <token>/<tok_anno utf=…>."""
    print("\n── Ref.-Korpus Frühneuhochdeutsch")
    tgz = KORPORA / "ref-fruehneuhochdeutsch" / "ReF-v1.0.2.tar.gz"
    if not tgz.exists():
        print("  [SKIP] Datei nicht gefunden")
        return []
    eintraege = []
    with tarfile.open(tgz) as tf:
        xml_members = [m for m in tf.getmembers() if m.name.endswith(".xml")]
        for member in sorted(xml_members, key=lambda m: m.name):
            if _limit_erreicht(eintraege):
                break
            try:
                f = tf.extractfile(member)
                root = ET.fromstring(f.read())
            except (ET.ParseError, Exception):
                continue
            woerter = []
            for tok in root.iter("token"):
                anno = tok.find("tok_anno")
                if anno is not None:
                    utf = anno.get("utf", anno.get("trans", ""))
                else:
                    utf = tok.get("trans", "")
                if utf and utf not in {"$", ".", ",", ";", ":", "!", "?"}:
                    woerter.append(utf)
                elif utf in {".", "!", "?"}:
                    woerter.append(utf + "\n")
            text = normalisiere_text(" ".join(woerter).replace(" \n", "\n"))
            if len(text) < 50:
                continue
            stem = Path(member.name).stem
            jahr = _fnh_header_jahr(root) or jahr_aus_dateiname(stem)
            ref = f"Ref.-Korpus Frühneuhochdeutsch: {stem}" + (f" ({jahr})" if jahr else "")
            eintraege.append({
                "id":     f"ref_fnh/{stem}",
                "text":   text,
                "quelle": "ref_fnh",
                "genre":  "historisch",
                "epoche": "fruehneuhochdeutsch",
                "jahr":   jahr,
                "titel":  "",
                "autor":  "",
                "ref":    ref,
            })
    return eintraege


# ── Neuer Pitaval ─────────────────────────────────────────────────────────

def extrahiere_pitaval() -> list:
    """Neuer Pitaval: ZIP mit TXT-Dateien (ISO-8859-1).
    Dateiname ‚Bd10_1846_1_<Titel>_<hist. Jahre>.txt' → Band + Jahr + Falltitel."""
    print("\n── Neuer Pitaval (1842–1890)")
    zip_pfad = KORPORA / "neuer-pitaval" / "Pitaval.zip"
    if not zip_pfad.exists():
        print("  [SKIP] Pitaval.zip nicht gefunden")
        return []
    eintraege = []
    with zipfile.ZipFile(zip_pfad) as z:
        txt_namen = [n for n in z.namelist() if n.endswith(".txt")]
        for name in sorted(txt_namen):
            if _limit_erreicht(eintraege):
                break
            try:
                raw = z.read(name)
                # Pitaval-TXT sind UTF-8 (Em-Dash \xe2\x80\x94) – iso-8859-1
                # erzeugte früher Mojibake („1578â1612"). UTF-8 zuerst versuchen.
                for enc in ("utf-8", "windows-1252", "iso-8859-1"):
                    try:
                        text = raw.decode(enc)
                        break
                    except UnicodeDecodeError:
                        continue
                else:
                    text = raw.decode("iso-8859-1", errors="replace")
            except Exception:
                continue
            text = normalisiere_text(text)
            if len(text) < 100:
                continue
            stem = Path(name).stem
            m = re.match(r"Bd(\d+)_(\d{4})_\d+_([^_]+)", stem)
            if m:
                band, jahr, falltitel = m.group(1), int(m.group(2)), m.group(3)
                ref = f"Der Neue Pitaval, Bd. {int(band)} ({jahr})"
            else:
                mj = re.search(r"_(\d{4})_", stem)
                jahr = int(mj.group(1)) if mj else None
                falltitel = ""
                ref = f"Der Neue Pitaval ({stem})"
            eintraege.append({
                "id":     f"pitaval/{stem}",
                "text":   text,
                "quelle": "neuer_pitaval",
                "genre":  "kriminalliteratur",
                "epoche": "19. Jahrhundert",
                "jahr":   jahr,
                "titel":  falltitel,
                "autor":  "",
                "ref":    ref,
            })
    return eintraege


# ── MediaWiki-Dumps (Wikibooks / Wikivoyage) ───────────────────────────────

def extrahiere_tei_bz2(bz2_pfad: Path, quelle: str, genre: str,
                       epoche: str, ref_label: str) -> list:
    """TEI-Korpus als bz2-komprimierte XML-Datei (teiCorpus mit mehreren TEI).
    Format: Wikibooks, Wikivoyage. ref = „<Label>: <Artikeltitel>"."""
    import bz2
    print(f"\n── {quelle} ({bz2_pfad.name})")
    if not bz2_pfad.exists():
        print(f"  [SKIP] {bz2_pfad.name} nicht gefunden")
        return []

    NS = "http://www.tei-c.org/ns/1.0"
    SKIP_TAGS = {f"{{{NS}}}{t}" for t in ("teiHeader", "note", "fw", "pb", "lb")}

    def tei_text(element) -> str:
        teile = []
        if element.tag in SKIP_TAGS:
            return ""
        if element.text and element.text.strip():
            teile.append(element.text.strip())
        for child in element:
            teile.append(tei_text(child))
            if child.tail and child.tail.strip():
                teile.append(child.tail.strip())
        return " ".join(t for t in teile if t)

    eintraege = []
    with bz2.open(bz2_pfad, "rb") as fh:
        context = ET.iterparse(fh, events=("end",))
        for event, elem in context:
            if elem.tag != f"{{{NS}}}TEI":
                continue
            if _limit_erreicht(eintraege):
                break
            titel_el = elem.find(f".//{{{NS}}}title[@type='main']")
            if titel_el is None:
                titel_el = elem.find(f".//{{{NS}}}title")
            titel = titel_el.text.strip() if titel_el is not None and titel_el.text else "unbekannt"

            body = elem.find(f".//{{{NS}}}body")
            if body is None:
                elem.clear()
                continue
            text = normalisiere_text(tei_text(body))
            if len(text) < 150:
                elem.clear()
                continue
            eintraege.append({
                "id":     f"{quelle}/{titel}",
                "text":   text,
                "quelle": quelle,
                "genre":  genre,
                "epoche": epoche,
                "jahr":   None,
                "titel":  titel,
                "autor":  "",
                "ref":    f"{ref_label}: {titel}",
            })
            elem.clear()
            if len(eintraege) % 1000 == 0:
                print(f"  {len(eintraege):,} Dokumente ...", flush=True)
    return eintraege


# ── Bundestag PDFs (WP01–WP18) ────────────────────────────────────────────

def extrahiere_bundestag_pdf() -> list:
    """Bundestag Plenarprotokolle WP01–WP18 als PDF → Text via PyMuPDF.
    ref = Protokoll-Kennung aus dem Dateinamen (K3 greift auf PDF-Silbentrennung)."""
    print("\n── Bundestag PDFs (WP01–WP18)")
    pdf_verz = KORPORA / "bundestagskorpus"
    if not pdf_verz.exists():
        print("  [SKIP] Verzeichnis nicht gefunden")
        return []
    try:
        import pymupdf as fitz
    except ImportError:
        try:
            import fitz
        except ImportError:
            print("  [SKIP] PyMuPDF nicht installiert (pip install pymupdf)")
            return []

    pdfs = sorted(pdf_verz.glob("*.pdf"))
    print(f"  {len(pdfs):,} PDF-Dateien gefunden")
    eintraege = []
    fehler = 0
    for pdf_pfad in pdfs:
        if _limit_erreicht(eintraege):
            break
        try:
            doc = fitz.open(str(pdf_pfad))
            seiten_text = []
            for seite in doc:
                t = seite.get_text()
                if t.strip():
                    seiten_text.append(t.strip())
            doc.close()
            text = normalisiere_text("\n\n".join(seiten_text))
        except Exception:
            fehler += 1
            continue
        if len(text) < 200:
            continue
        stem = pdf_pfad.stem
        ref, jahr = _bundestag_ref(stem)
        eintraege.append({
            "id":     f"bundestag_pdf/{stem}",
            "text":   text,
            "quelle": "bundestagskorpus_pdf",
            "genre":  "parlamentssprache",
            "epoche": "Gegenwart",
            "jahr":   jahr,
            "titel":  "",
            "autor":  "",
            "ref":    ref,
        })
        if len(eintraege) % 500 == 0:
            print(f"  {len(eintraege):,}/{len(pdfs):,} PDFs ...", flush=True)
    print(f"  {fehler} Fehler übersprungen")
    return eintraege


# ── Dispatcher ─────────────────────────────────────────────────────────────

KORPORA_KONFIG = {
    "gesetze":         (extrahiere_gesetze,          "gesetze.jsonl"),
    "bundestag":       (extrahiere_bundestag_xml,     "bundestag_xml.jsonl"),
    "leipzig":         (extrahiere_leipzig,           "leipzig.jsonl"),
    "pol_reden":       (extrahiere_pol_reden,         "pol_reden.jsonl"),
    "german_commons":  (extrahiere_german_commons,    "german_commons.jsonl"),
    "german_commons_justiz": (extrahiere_german_commons_justiz, "german_commons_justiz.jsonl"),
    "wikipedia":       (extrahiere_wikipedia,          "wikipedia.jsonl"),
    "gei_digital":     (extrahiere_gei_digital,        "gei_digital.jsonl"),
    "dta_kern": (
        lambda: extrahiere_tei_verzeichnis(
            KORPORA / "dta-kern", "dta_kern", "literatur", "historisch",
            ref_label="Deutsches Textarchiv"
        ), "dta_kern.jsonl"
    ),
    "dta_erweiterungen": (
        lambda: extrahiere_tei_verzeichnis(
            KORPORA / "dta-erweiterungen", "dta_erweiterungen", "literatur", "historisch",
            ref_label="Deutsches Textarchiv"
        ), "dta_erweiterungen.jsonl"
    ),
    "dibilit": (
        lambda: extrahiere_tei_verzeichnis(
            KORPORA / "dibilit" / "deutschestextarchiv-DiBiLit-Korpus-38503b7" / "data",
            "dibilit", "literatur", "historisch", glob="**/*.txt.xml",
            ref_label="DiBiLit"
        ), "dibilit.jsonl"
    ),
    "dta_github": (
        lambda: sum([
            extrahiere_tei_verzeichnis(KORPORA / repo, repo, genre, "historisch",
                                       ref_label="Deutsches Textarchiv")
            for repo, genre in [
                ("humboldt-publizistik",  "wissenschaft"),
                ("jean-paul-briefe",      "brief"),
                ("humboldt-digital",      "wissenschaft"),
                ("dta-novellenschatz",    "literatur"),
                ("dta-soldatenbriefe",    "brief"),
                ("dta-stimm-los",         "literatur"),
                ("dta-patiententexte",    "brief"),
                ("dta-dingler",           "wissenschaft"),
            ]
        ], []), "dta_github.jsonl"
    ),
    "ref_mhd": (
        lambda: extrahiere_tei_verzeichnis(
            KORPORA / "ref-mittelhochdeutsch" / "tei",
            "ref_mhd", "historisch", "mittelhochdeutsch",
            ref_label="Ref.-Korpus Mittelhochdeutsch"
        ), "ref_mhd.jsonl"
    ),
    "ref_fnh":      (extrahiere_ref_fnh, "ref_fnh.jsonl"),
    "pitaval":      (extrahiere_pitaval, "pitaval.jsonl"),
    "wikibooks": (
        lambda: extrahiere_tei_bz2(
            KORPORA / "wikibooks" / "wikibooks-20260101.xml.bz2",
            "wikibooks", "lehrtext", "Gegenwart", ref_label="Wikibooks"
        ), "wikibooks.jsonl"
    ),
    "wikivoyage": (
        lambda: extrahiere_tei_bz2(
            KORPORA / "wikivoyage" / "wikivoyage-20260101.xml.bz2",
            "wikivoyage", "reisefuehrer", "Gegenwart", ref_label="Wikivoyage"
        ), "wikivoyage.jsonl"
    ),
    "bundestag_pdf": (extrahiere_bundestag_pdf, "bundestag_pdf.jsonl"),
}


def main():
    # UTF-8-Konsolenausgabe erzwingen (Windows-cp1252); nur beim direkten
    # Skript-Aufruf, nicht beim Import (sonst bricht pytests stdout-Capture).
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    parser = argparse.ArgumentParser(description="Phase 2 (v2): Textextraktion → JSONL")
    parser.add_argument("--only", choices=list(KORPORA_KONFIG.keys()),
                        help="Nur ein Korpus verarbeiten")
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur Statistik, nichts schreiben")
    parser.add_argument("--force", action="store_true",
                        help="Vorhandene JSONL neu erzeugen statt zu überspringen "
                             "(z. B. nach einem Fix in der Metadaten-Extraktion). "
                             "Die alte Datei wird erst überschrieben, wenn die neue "
                             "vollständig aufgebaut ist.")
    args = parser.parse_args()

    auswahl = [args.only] if args.only else list(KORPORA_KONFIG.keys())

    gesamt_dok = 0
    for schluessel in auswahl:
        fn, dateiname = KORPORA_KONFIG[schluessel]
        ziel_datei = ZIEL / dateiname

        if ziel_datei.exists() and ziel_datei.stat().st_size > 0 and not args.force:
            zeilen = sum(1 for _ in ziel_datei.open(encoding="utf-8"))
            print(f"\n── {schluessel}: [SKIP] bereits vorhanden ({zeilen:,} Dok.)")
            gesamt_dok += zeilen
            continue
        if args.force and ziel_datei.exists():
            print(f"\n── {schluessel}: [FORCE] wird neu erzeugt "
                  f"({ziel_datei.stat().st_size / 2**20:,.0f} MB bisher)")

        try:
            eintraege = fn()
        except Exception as e:
            print(f"\n  [FEHLER] {schluessel}: {e}")
            continue

        gesamt_dok += len(eintraege)
        if args.dry_run:
            print(f"  [dry-run] {dateiname}: {len(eintraege):,} Dokumente")
        else:
            schreibe_jsonl(ziel_datei, eintraege)

    print(f"\n{'='*50}")
    print(f"Gesamt: {gesamt_dok:,} Dokumente")
    print(f"Ausgabe: {ZIEL}")


if __name__ == "__main__":
    main()
