"""
Phase 2 – Textextraktion
Alle Korpora → JSONL (ein Dokument pro Zeile)

Schema:
  {"id": "...", "text": "...", "quelle": "...", "genre": "...", "epoche": "...", "jahr": null}

Aufruf:
  python extract_text.py                   # alle Korpora
  python extract_text.py --only gesetze    # nur ein Korpus
  python extract_text.py --dry-run         # nur Statistik, nichts schreiben

Verfügbare --only-Werte:
  gesetze, bundestag, leipzig, pol_reden, german_commons,
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
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

KORPORA = Path(__file__).parent.parent / "01_download" / "korpora"
ZIEL    = Path(__file__).parent.parent / "02_parsed"
ZIEL.mkdir(exist_ok=True)


# ── Hilfs-Funktionen ───────────────────────────────────────────────────────

def schreibe_jsonl(datei: Path, eintraege: list[dict]):
    with datei.open("w", encoding="utf-8") as f:
        for e in eintraege:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    print(f"  [OK] {datei.name}: {len(eintraege):,} Dokumente")


def bereinige_text(text: str) -> str:
    """Leerzeichen normalisieren, Zeilenumbrüche innerhalb von Sätzen entfernen."""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def tei_text_aus_element(elem) -> str:
    """Rekursiv Plaintext aus TEI-Element extrahieren.
    Überspringt: teiHeader, note, fw (Kolumnentitel), pb (Seitenumbrüche), figure."""
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

    buf: list[str] = []
    _text(elem, buf)
    return bereinige_text("".join(buf))


def jahr_aus_dateiname(name: str) -> int | None:
    """Versucht ein vierstelliges Jahr aus dem Dateinamen zu extrahieren."""
    m = re.search(r"(\b1[0-9]{3}\b|\b20[0-2][0-9]\b)", name)
    return int(m.group(1)) if m else None


# ── Extraktoren ────────────────────────────────────────────────────────────

def extrahiere_gesetze() -> list[dict]:
    """GII-XML-Format: <norm> → <textdaten><text><Content><P>"""
    print("\n── Gesetze")
    basis = KORPORA / "gesetze"
    eintraege = []
    for gesetz_dir in sorted(basis.iterdir()):
        if not gesetz_dir.is_dir():
            continue
        for xml_datei in gesetz_dir.glob("*.xml"):
            try:
                root = ET.parse(xml_datei).getroot()
            except ET.ParseError:
                continue
            jurabk = root.findtext(".//jurabk") or gesetz_dir.name
            for i, norm in enumerate(root.findall(".//norm")):
                textdaten = norm.find("textdaten")
                if textdaten is None:
                    continue
                # Text aus allen P-Elementen sammeln
                teile = []
                for p in textdaten.iter("P"):
                    txt = "".join(p.itertext()).strip()
                    if txt:
                        teile.append(txt)
                # Auch Content/Title etc.
                for tag in ("Title", "Subtitle"):
                    for el in textdaten.iter(tag):
                        txt = "".join(el.itertext()).strip()
                        if txt:
                            teile.insert(0, txt)
                if not teile:
                    continue
                eintraege.append({
                    "id":     f"gesetze/{gesetz_dir.name}/{i:04d}",
                    "text":   bereinige_text("\n".join(teile)),
                    "quelle": "gesetze",
                    "genre":  "recht",
                    "epoche": "modern",
                    "jahr":   None,
                })
    return eintraege


def extrahiere_bundestag_xml() -> list[dict]:
    """DIP-XML: <dbtplenarprotokoll> → <rede>/<p> und <tagesordnungspunkt>/<p>"""
    print("\n── Bundestagskorpus (XML)")
    basis = KORPORA / "bundestagskorpus"
    eintraege = []
    for xml_datei in sorted(basis.glob("*.xml")):
        # Jahr aus Dateiname (z.B. WP19_0001_2017-10-24)
        m = re.search(r"(\d{4})-\d{2}-\d{2}", xml_datei.stem)
        jahr = int(m.group(1)) if m else None
        try:
            root = ET.parse(xml_datei).getroot()
        except ET.ParseError:
            continue
        # Namespace entfernen für einfacheres Parsen
        for elem in root.iter():
            if "}" in elem.tag:
                elem.tag = elem.tag.split("}", 1)[1]

        # Reden extrahieren
        for rede in root.iter("rede"):
            teile = []
            for p in rede.iter("p"):
                txt = "".join(p.itertext()).strip()
                if txt and len(txt) > 20:
                    teile.append(txt)
            if teile:
                rede_id = rede.get("id", "")
                eintraege.append({
                    "id":     f"bundestag/{xml_datei.stem}/{rede_id or len(eintraege)}",
                    "text":   bereinige_text("\n".join(teile)),
                    "quelle": "bundestag",
                    "genre":  "parlament",
                    "epoche": "modern",
                    "jahr":   jahr,
                })

        # Prozedurale <p>-Absätze außerhalb von <rede>
        for top in root.iter("tagesordnungspunkt"):
            teile = []
            for child in top:
                if child.tag == "p":
                    txt = "".join(child.itertext()).strip()
                    if txt and len(txt) > 30:
                        teile.append(txt)
            if teile:
                eintraege.append({
                    "id":     f"bundestag/{xml_datei.stem}/top_{len(eintraege)}",
                    "text":   bereinige_text("\n".join(teile)),
                    "quelle": "bundestag",
                    "genre":  "parlament",
                    "epoche": "modern",
                    "jahr":   jahr,
                })
    return eintraege


def extrahiere_leipzig() -> list[dict]:
    """Leipzig tar.gz: *-sentences.txt → ID\\tSatz, gebündelt zu ~100 Sätzen pro Eintrag."""
    print("\n── Leipzig Corpora")
    eintraege = []
    BUENDELGROESSE = 100

    for korpus in ("deu_news", "deu_newscrawl"):
        basis = KORPORA / korpus
        for tgz in sorted(basis.glob("*.tar.gz")):
            # Jahr aus Dateiname
            m = re.search(r"_(\d{4})_", tgz.name)
            jahr = int(m.group(1)) if m else None
            try:
                tf = tarfile.open(tgz, errorlevel=0)
            except Exception as e:
                print(f"    [SKIP] {tgz.name}: {e}")
                continue
            # sentences.txt finden
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

            # In Bündel aufteilen
            for i in range(0, len(saetze), BUENDELGROESSE):
                buendel = saetze[i:i + BUENDELGROESSE]
                eintraege.append({
                    "id":     f"{korpus}/{tgz.stem}/{i // BUENDELGROESSE:05d}",
                    "text":   " ".join(buendel),
                    "quelle": korpus,
                    "genre":  "zeitung",
                    "epoche": "modern",
                    "jahr":   jahr,
                })
    return eintraege


def extrahiere_pol_reden() -> list[dict]:
    """Politische Reden XML: <collection><text><rohtext>"""
    print("\n── Politische Reden")
    basis = KORPORA / "politische-reden"
    eintraege = []
    for xml_datei in sorted(basis.glob("*.xml")):
        try:
            # Encoding-Probleme abfangen
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
            rohtext = text_elem.findtext("rohtext", "").strip()
            if not rohtext:
                # Direkt Textinhalt
                rohtext = "".join(text_elem.itertext()).strip()
            if rohtext and len(rohtext) > 50:
                # Metadaten
                datum = text_elem.get("date") or text_elem.get("datum") or ""
                jahr = int(datum[:4]) if datum and datum[:4].isdigit() else None
                eintraege.append({
                    "id":     f"pol_reden/{xml_datei.stem}/{len(eintraege)}",
                    "text":   bereinige_text(rohtext),
                    "quelle": "pol_reden",
                    "genre":  "rede",
                    "epoche": "modern",
                    "jahr":   jahr,
                })
    return eintraege


def extrahiere_german_commons() -> list[dict]:
    """German Commons .txt: Dokumente durch Doppel-Newline getrennt."""
    print("\n── German Commons")
    basis = KORPORA / "german-commons"
    META = {
        "reichtagsprotokolle.txt": ("pol_reden", "parlament",   "historisch"),
        "dibiphil.txt":            ("dibilit",   "literatur",    "historisch"),
    }
    eintraege = []
    for txt_datei in sorted(basis.glob("*.txt")):
        quelle, genre, epoche = META.get(txt_datei.name, ("german_commons", "diverses", "historisch"))
        inhalt = txt_datei.read_text(encoding="utf-8", errors="replace")
        for i, abschnitt in enumerate(inhalt.split("\n\n")):
            text = bereinige_text(abschnitt)
            if len(text) > 100:
                eintraege.append({
                    "id":     f"german_commons/{txt_datei.stem}/{i:06d}",
                    "text":   text,
                    "quelle": quelle,
                    "genre":  genre,
                    "epoche": epoche,
                    "jahr":   None,
                })
    return eintraege


def extrahiere_tei_verzeichnis(
    basis: Path,
    quelle: str,
    genre: str,
    epoche: str,
    glob: str = "**/*.xml",
) -> list[dict]:
    """Generischer TEI-Extraktor für Verzeichnisse mit TEI-P5-Dateien."""
    eintraege = []
    for xml_datei in sorted(basis.glob(glob)):
        try:
            root = ET.parse(xml_datei).getroot()
        except ET.ParseError:
            continue
        # Namespace entfernen
        for elem in root.iter():
            if "}" in elem.tag:
                elem.tag = elem.tag.split("}", 1)[1]
        # Text-Element finden
        text_elem = root.find(".//text")
        if text_elem is None:
            text_elem = root  # Fallback
        text = tei_text_aus_element(text_elem)
        if len(text) < 50:
            continue
        eintraege.append({
            "id":     f"{quelle}/{xml_datei.stem}",
            "text":   text,
            "quelle": quelle,
            "genre":  genre,
            "epoche": epoche,
            "jahr":   jahr_aus_dateiname(xml_datei.stem),
        })
    return eintraege


def extrahiere_tei_zip(
    zip_pfad: Path,
    quelle: str,
    genre: str,
    epoche: str,
) -> list[dict]:
    """TEI-Extraktor für ZIP-Archive (z.B. GEI-Digital)."""
    eintraege = []
    with zipfile.ZipFile(zip_pfad) as z:
        xml_names = [n for n in z.namelist() if n.endswith(".xml")]
        for name in sorted(xml_names):
            try:
                data = z.read(name)
                root = ET.fromstring(data)
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
            eintraege.append({
                "id":     f"{quelle}/{stem}",
                "text":   text,
                "quelle": quelle,
                "genre":  genre,
                "epoche": epoche,
                "jahr":   jahr_aus_dateiname(stem),
            })
    return eintraege


def extrahiere_ref_fnh() -> list[dict]:
    """Frühneuhochdeutsch: CorA-XML in tar.gz → <token>/<tok_anno utf=...>"""
    print("\n── Ref.-Korpus Frühneuhochdeutsch")
    tgz = KORPORA / "ref-fruehneuhochdeutsch" / "ReF-v1.0.2.tar.gz"
    if not tgz.exists():
        print("  [SKIP] Datei nicht gefunden")
        return []
    eintraege = []
    with tarfile.open(tgz) as tf:
        xml_members = [m for m in tf.getmembers() if m.name.endswith(".xml")]
        for member in sorted(xml_members, key=lambda m: m.name):
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
            text = bereinige_text(" ".join(woerter).replace(" \n", "\n"))
            if len(text) < 50:
                continue
            stem = Path(member.name).stem
            eintraege.append({
                "id":     f"ref_fnh/{stem}",
                "text":   text,
                "quelle": "ref_fnh",
                "genre":  "historisch",
                "epoche": "fruehneuhochdeutsch",
                "jahr":   None,
            })
    return eintraege


# ── Neuer Pitaval ─────────────────────────────────────────────────────────

def extrahiere_pitaval() -> list[dict]:
    """Neuer Pitaval: ZIP mit TXT-Dateien (ISO-8859-1)"""
    print("\n── Neuer Pitaval (1842–1890)")
    zip_pfad = KORPORA / "neuer-pitaval" / "Pitaval.zip"
    if not zip_pfad.exists():
        print("  [SKIP] Pitaval.zip nicht gefunden")
        return []
    eintraege = []
    with zipfile.ZipFile(zip_pfad) as z:
        txt_namen = [n for n in z.namelist() if n.endswith(".txt")]
        for name in sorted(txt_namen):
            try:
                raw = z.read(name)
                text = raw.decode("iso-8859-1", errors="replace")
            except Exception:
                continue
            text = bereinige_text(text)
            if len(text) < 100:
                continue
            stem = Path(name).stem
            # Jahreszahl aus Dateiname: Bd10_1846_...
            m = re.search(r"_(\d{4})_", stem)
            jahr = int(m.group(1)) if m else None
            eintraege.append({
                "id":     f"pitaval/{stem}",
                "text":   text,
                "quelle": "neuer_pitaval",
                "genre":  "kriminalliteratur",
                "epoche": "19. Jahrhundert",
                "jahr":   jahr,
            })
    return eintraege


# ── MediaWiki-Dumps (Wikibooks / Wikivoyage) ───────────────────────────────

def _strip_wikitext(wikitext: str) -> str:
    """Entfernt WikiText-Markup und gibt lesbaren Fließtext zurück."""
    t = wikitext
    # Kommentare, ref-Tags, nowiki entfernen
    t = re.sub(r"<!--.*?-->", " ", t, flags=re.DOTALL)
    t = re.sub(r"<ref[^>]*>.*?</ref>", " ", t, flags=re.DOTALL)
    t = re.sub(r"<ref[^/]*/?>", " ", t)
    t = re.sub(r"<[^>]+>", " ", t)   # restliche HTML-Tags
    # Tabellen komplett entfernen
    t = re.sub(r"\{\|.*?\|\}", " ", t, flags=re.DOTALL)
    # Templates: einfache {{...}} entfernen (max. 3 Ebenen)
    for _ in range(4):
        t = re.sub(r"\{\{[^{}]*\}\}", " ", t)
    # Bilder/Dateien: [[Datei:...]] [[File:...]] entfernen
    t = re.sub(r"\[\[(Datei|File|Bild|Image|Kategorie|Category):[^\]]*\]\]",
               " ", t, flags=re.IGNORECASE)
    # Wikilinks: [[Ziel|Text]] → Text, [[Text]] → Text
    t = re.sub(r"\[\[(?:[^|\]]+\|)?([^\]]+)\]\]", r"\1", t)
    # Externe Links: [URL Text] → Text
    t = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", t)
    t = re.sub(r"\[https?://\S+\]", " ", t)
    # Formatierung: '''fett''' / ''kursiv''
    t = re.sub(r"'{2,3}", "", t)
    # Überschriften: ==Text== → Text
    t = re.sub(r"=+\s*(.+?)\s*=+", r"\1\n", t)
    # Aufzählungszeichen
    t = re.sub(r"^[*#:;]+\s*", "", t, flags=re.MULTILINE)
    # Mehrfache Leerzeilen
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def extrahiere_tei_bz2(bz2_pfad: Path, quelle: str, genre: str,
                        epoche: str) -> list[dict]:
    """
    TEI-Korpus als bz2-komprimierte XML-Datei (teiCorpus mit mehreren TEI-Elementen).
    Format: Wikibooks, Wikivoyage (von Zenodo via DWDS/BBAW konvertiert).
    """
    import bz2
    print(f"\n── {quelle} ({bz2_pfad.name})")
    if not bz2_pfad.exists():
        print(f"  [SKIP] {bz2_pfad.name} nicht gefunden")
        return []

    NS = "http://www.tei-c.org/ns/1.0"
    SKIP_TAGS = {f"{{{NS}}}{t}" for t in ("teiHeader", "note", "fw", "pb", "lb")}
    BODY_TAGS  = {f"{{{NS}}}{t}" for t in ("p", "l", "ab", "div", "seg")}

    def tei_text(element) -> str:
        """Rekursiv Text aus TEI-Element sammeln."""
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
            # Jedes <TEI>-Element = ein Dokument (Buch/Artikel)
            if elem.tag != f"{{{NS}}}TEI":
                continue
            # Titel aus teiHeader
            titel_el = elem.find(f".//{{{NS}}}title[@type='main']")
            if titel_el is None:
                titel_el = elem.find(f".//{{{NS}}}title")
            titel = titel_el.text.strip() if titel_el is not None and titel_el.text else "unbekannt"

            # Body-Text extrahieren
            body = elem.find(f".//{{{NS}}}body")
            if body is None:
                elem.clear()
                continue
            text = bereinige_text(tei_text(body))
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
            })
            elem.clear()
            if len(eintraege) % 1000 == 0:
                print(f"  {len(eintraege):,} Dokumente ...", flush=True)
    return eintraege


# ── Bundestag PDFs (WP01–WP18) ────────────────────────────────────────────

def extrahiere_bundestag_pdf() -> list[dict]:
    """Bundestag Plenarprotokolle WP01–WP18 als PDF → Text via PyMuPDF."""
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
        try:
            doc = fitz.open(str(pdf_pfad))
            seiten_text = []
            for seite in doc:
                t = seite.get_text()
                if t.strip():
                    seiten_text.append(t.strip())
            doc.close()
            text = bereinige_text("\n\n".join(seiten_text))
        except Exception:
            fehler += 1
            continue
        if len(text) < 200:
            continue
        stem = pdf_pfad.stem
        # Jahreszahl aus Dateiname: WP01_0001_1949-09-07
        m = re.search(r"(\d{4})-\d{2}-\d{2}", stem)
        jahr = int(m.group(1)) if m else None
        eintraege.append({
            "id":     f"bundestag_pdf/{stem}",
            "text":   text,
            "quelle": "bundestagskorpus_pdf",
            "genre":  "parlamentssprache",
            "epoche": "Gegenwart",
            "jahr":   jahr,
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
    "gei_digital": (
        lambda: extrahiere_tei_zip(
            KORPORA / "gei-digital" / "schulbuchevolution_gei-digital.zip",
            "gei_digital", "schulbuch", "historisch"
        ), "gei_digital.jsonl"
    ),
    "dta_kern": (
        lambda: extrahiere_tei_verzeichnis(
            KORPORA / "dta-kern", "dta_kern", "literatur", "historisch"
        ), "dta_kern.jsonl"
    ),
    "dta_erweiterungen": (
        lambda: extrahiere_tei_verzeichnis(
            KORPORA / "dta-erweiterungen", "dta_erweiterungen", "literatur", "historisch"
        ), "dta_erweiterungen.jsonl"
    ),
    "dibilit": (
        lambda: extrahiere_tei_verzeichnis(
            KORPORA / "dibilit" / "deutschestextarchiv-DiBiLit-Korpus-38503b7" / "data",
            "dibilit", "literatur", "historisch", glob="**/*.txt.xml"
        ), "dibilit.jsonl"
    ),
    "dta_github": (
        lambda: sum([
            extrahiere_tei_verzeichnis(KORPORA / repo, repo, genre, "historisch")
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
            "ref_mhd", "historisch", "mittelhochdeutsch"
        ), "ref_mhd.jsonl"
    ),
    "ref_fnh":      (extrahiere_ref_fnh, "ref_fnh.jsonl"),
    "pitaval":      (extrahiere_pitaval, "pitaval.jsonl"),
    "wikibooks": (
        lambda: extrahiere_tei_bz2(
            KORPORA / "wikibooks" / "wikibooks-20260101.xml.bz2",
            "wikibooks", "lehrtext", "Gegenwart"
        ), "wikibooks.jsonl"
    ),
    "wikivoyage": (
        lambda: extrahiere_tei_bz2(
            KORPORA / "wikivoyage" / "wikivoyage-20260101.xml.bz2",
            "wikivoyage", "reisefuehrer", "Gegenwart"
        ), "wikivoyage.jsonl"
    ),
    "bundestag_pdf": (extrahiere_bundestag_pdf, "bundestag_pdf.jsonl"),
}


def main():
    parser = argparse.ArgumentParser(description="Phase 2: Textextraktion → JSONL")
    parser.add_argument("--only", choices=list(KORPORA_KONFIG.keys()),
                        help="Nur ein Korpus verarbeiten")
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur Statistik, nichts schreiben")
    args = parser.parse_args()

    auswahl = [args.only] if args.only else list(KORPORA_KONFIG.keys())

    gesamt_dok = 0
    for schluessel in auswahl:
        fn, dateiname = KORPORA_KONFIG[schluessel]
        ziel_datei = ZIEL / dateiname

        if ziel_datei.exists() and ziel_datei.stat().st_size > 0:
            zeilen = sum(1 for _ in ziel_datei.open(encoding="utf-8"))
            print(f"\n── {schluessel}: [SKIP] bereits vorhanden ({zeilen:,} Dok.)")
            gesamt_dok += zeilen
            continue

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
