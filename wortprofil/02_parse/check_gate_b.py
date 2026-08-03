"""
Gate B – automatischer Check der Re-Extraktion (planning/DB-Neuaufbau.md,
Abschnitt 5 „Phase B – Re-Extraktion Phase 2", Gate B).

Vergleicht 02_parsed_v2/ (neu, v2-Schema) gegen 02_parsed/ (alt, v1-Schema)
pro Korpus-Datei und prüft:

  (a) Anteil Dokumente mit `jahr` (Ziel ≥95 % – außer bei Korpora, wo laut
      extract_text.py strukturell kein Jahr ableitbar ist: wikipedia,
      wikibooks, wikivoyage)
  (b) 100 % der Dokumente mit `ref` (nicht-leer) oder dokumentiertem Fallback
      (Korpus-Ebene, z. B. „Leipzig (deu_news) 1995" – zählt als vorhanden)
  (c) 0 Treffer für das historische lange ſ (U+017F) und für liegengebliebene
      Trennstrich+Zeilenumbruch-Reste (K3-Regression) im gesamten neuen Korpus
      (kein Sampling – Streaming-Scan, daher auch bei mehreren GB günstig)
  (d) Dokument- und Zeichenzahl alt vs. neu als Tabelle

Streamt jede Datei zeilenweise (keine Vollladung in den RAM) – auch für die
mehrere GB großen Korpora (leipzig, gei_digital, wikipedia, german_commons_justiz)
unproblematisch.

Aufruf:
    python check_gate_b.py
    python check_gate_b.py --alt-dir ../02_parsed --neu-dir ../02_parsed_v2 \\
        --report ../gate_b/gate_b_report.md
"""

import argparse
import io
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
# Einzige Quelle der Wahrheit für die erlaubten Jahresbereiche: der Extraktor
# selbst. Eine Kopie hier würde auseinanderlaufen.
from extract_text import jahr_plausibel  # noqa: E402

ROOT = Path(__file__).parent.parent

# Korpora, für die laut extract_text.py strukturell kein Jahr ableitbar ist
# (Wikipedia-Artikel/Wikibooks/Wikivoyage-Seiten haben kein publikationsjahr-
# artiges Datum) – siehe extract_text.py "jahr": None bei diesen Extraktoren.
KEIN_JAHR_ABLEITBAR = {"wikipedia.jsonl", "wikibooks.jsonl", "wikivoyage.jsonl"}

RE_LANGES_S = re.compile("ſ")  # ſ
# Gleiche Regex-Logik wie extract_text.py._RE_TRENN_ZEILE: Wort-Zeichen,
# Trennstrich-Variante, optionales Leerzeichen, Zeilenumbruch, Wort-Zeichen.
# Wenn das nach normalisiere_text() noch auftritt, hat K3 eine Lücke.
RE_TRENN_REST = re.compile(r"\w[-‐‑][ \t]*\n[ \t]*\w")


def scan_datei(pfad: Path, ist_neu: bool) -> dict:
    """Ein Pass über die Datei, liefert alle Kennzahlen auf einmal."""
    stats = {
        "dokumente": 0,
        "zeichen": 0,
        "mit_jahr": 0,
        "jahr_unplausibel": 0,
        "jahr_unplausibel_beispiele": [],
        "mit_ref": 0,
        "glyph_treffer": 0,
        "glyph_beispiele": [],
        "trennstrich_treffer": 0,
        "trennstrich_beispiele": [],
        "json_fehler": 0,
    }
    with pfad.open(encoding="utf-8") as f:
        for zeile in f:
            zeile = zeile.strip()
            if not zeile:
                continue
            try:
                d = json.loads(zeile)
            except json.JSONDecodeError:
                stats["json_fehler"] += 1
                continue
            stats["dokumente"] += 1
            text = d.get("text", "") or ""
            stats["zeichen"] += len(text)
            jahr = d.get("jahr")
            if jahr is not None:
                stats["mit_jahr"] += 1
                # Ein Jahr zu HABEN genügt nicht — es muss auch stimmen können.
                # Genau diese Prüfung fehlte, weshalb 7.330 Dokumente mit
                # erfundenen Jahren aus Dokument-IDs durch Gate B kamen und erst
                # in Phase E auffielen (extract_text.jahr_plausibel).
                if jahr_plausibel(jahr, d.get("quelle", "")) is None:
                    stats["jahr_unplausibel"] += 1
                    if len(stats["jahr_unplausibel_beispiele"]) < 5:
                        stats["jahr_unplausibel_beispiele"].append(
                            f"{d.get('id', '?')}={jahr}")
            if ist_neu:
                if (d.get("ref") or "").strip():
                    stats["mit_ref"] += 1
                if RE_LANGES_S.search(text):
                    stats["glyph_treffer"] += 1
                    if len(stats["glyph_beispiele"]) < 3:
                        stats["glyph_beispiele"].append(d.get("id", "?"))
                if RE_TRENN_REST.search(text):
                    stats["trennstrich_treffer"] += 1
                    if len(stats["trennstrich_beispiele"]) < 3:
                        stats["trennstrich_beispiele"].append(d.get("id", "?"))
    return stats


def fmt_pct(n: int, gesamt: int) -> str:
    if gesamt == 0:
        return "–"
    return f"{100 * n / gesamt:.1f}%"


def main():
    # UTF-8-Konsolenausgabe erzwingen (Windows-cp1252 bricht sonst bei ─/ſ/Umlauten).
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    parser = argparse.ArgumentParser(description="Gate B: Re-Extraktion prüfen (alt vs. neu)")
    parser.add_argument("--alt-dir", default=str(ROOT / "02_parsed"))
    parser.add_argument("--neu-dir", default=str(ROOT / "02_parsed_v2"))
    parser.add_argument("--report", default=str(ROOT / "gate_b" / "gate_b_report.md"))
    args = parser.parse_args()

    alt_dir = Path(args.alt_dir)
    neu_dir = Path(args.neu_dir)
    report_pfad = Path(args.report)
    report_pfad.parent.mkdir(parents=True, exist_ok=True)

    neu_dateien = sorted(neu_dir.glob("*.jsonl"))
    if not neu_dateien:
        print(f"[FEHLER] Keine JSONL-Dateien in {neu_dir}")
        sys.exit(1)

    zeilen_tabelle = []
    probleme = []
    gesamt_neu_dok = gesamt_neu_zeichen = 0
    gesamt_alt_dok = gesamt_alt_zeichen = 0

    for neu_pfad in neu_dateien:
        name = neu_pfad.name
        print(f"── {name} (neu) ...", flush=True)
        neu = scan_datei(neu_pfad, ist_neu=True)
        gesamt_neu_dok += neu["dokumente"]
        gesamt_neu_zeichen += neu["zeichen"]

        alt_pfad = alt_dir / name
        if alt_pfad.exists():
            print(f"── {name} (alt) ...", flush=True)
            alt = scan_datei(alt_pfad, ist_neu=False)
            gesamt_alt_dok += alt["dokumente"]
            gesamt_alt_zeichen += alt["zeichen"]
        else:
            alt = None

        jahr_pct = fmt_pct(neu["mit_jahr"], neu["dokumente"])
        ref_pct = fmt_pct(neu["mit_ref"], neu["dokumente"])

        jahr_exempt = name in KEIN_JAHR_ABLEITBAR
        jahr_ok = jahr_exempt or (neu["dokumente"] > 0 and neu["mit_jahr"] / neu["dokumente"] >= 0.95)
        # Plausibilität ist NICHT verhandelbar und nicht von KEIN_JAHR_ABLEITBAR
        # ausgenommen: ein erfundenes Jahr ist schlimmer als ein fehlendes, weil
        # es unentdeckt in Dekaden-Histogramm, ref und Jahr-Filter wandert.
        jahr_plausibel_ok = neu["jahr_unplausibel"] == 0
        ref_ok = neu["dokumente"] > 0 and neu["mit_ref"] == neu["dokumente"]
        glyph_ok = neu["glyph_treffer"] == 0
        trenn_ok = neu["trennstrich_treffer"] == 0

        status = "OK" if (jahr_ok and jahr_plausibel_ok and ref_ok
                          and glyph_ok and trenn_ok) else "PRÜFEN"
        if not jahr_ok:
            probleme.append(f"**{name}**: Jahr-Abdeckung nur {jahr_pct} (Ziel ≥95%, "
                             f"{neu['mit_jahr']}/{neu['dokumente']} Dokumente)")
        if not jahr_plausibel_ok:
            probleme.append(
                f"**{name}**: {neu['jahr_unplausibel']:,} Dokumente mit UNPLAUSIBLEM Jahr "
                f"(außerhalb des Bereichs der Quelle, siehe extract_text.JAHR_BEREICH) "
                f"– Beispiele: {neu['jahr_unplausibel_beispiele']}")
        if not ref_ok:
            probleme.append(f"**{name}**: ref fehlt bei {neu['dokumente'] - neu['mit_ref']} "
                             f"von {neu['dokumente']} Dokumenten")
        if not glyph_ok:
            probleme.append(f"**{name}**: {neu['glyph_treffer']} Dokumente mit ſ (U+017F) "
                             f"– Beispiele: {neu['glyph_beispiele']}")
        if not trenn_ok:
            probleme.append(f"**{name}**: {neu['trennstrich_treffer']} Dokumente mit "
                             f"liegengebliebenem Trennstrich+Zeilenumbruch "
                             f"– Beispiele: {neu['trennstrich_beispiele']}")
        if neu["json_fehler"]:
            probleme.append(f"**{name}**: {neu['json_fehler']} nicht parsbare JSON-Zeilen (neu)")

        zeilen_tabelle.append({
            "name": name,
            "neu_dok": neu["dokumente"],
            "neu_zeichen": neu["zeichen"],
            "alt_dok": alt["dokumente"] if alt else None,
            "alt_zeichen": alt["zeichen"] if alt else None,
            "jahr_pct": jahr_pct + (" (n/a)" if jahr_exempt else ""),
            "jahr_unplausibel": neu["jahr_unplausibel"],
            "ref_pct": ref_pct,
            "glyph": neu["glyph_treffer"],
            "trenn": neu["trennstrich_treffer"],
            "status": status,
        })

    # ── Report schreiben ─────────────────────────────────────────────────────
    lines = []
    lines.append("# Gate B – Report: Re-Extraktion 02_parsed_v2/ (alt vs. neu)\n")
    from datetime import datetime
    lines.append(f"Erstellt: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
    n_probleme = len(probleme)
    lines.append(f"**{len(zeilen_tabelle)} Korpora geprüft · {n_probleme} Auffälligkeiten**\n")

    lines.append("\n## Pro-Korpus-Tabelle\n")
    lines.append("| Korpus | Dok. neu | Dok. alt | Zeichen neu | Zeichen alt | Jahr-Abdeckung | Jahr unplausibel | ref-Abdeckung | ſ-Treffer | Trennstrich-Reste | Status |")
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in zeilen_tabelle:
        alt_dok = f"{r['alt_dok']:,}" if r["alt_dok"] is not None else "–"
        alt_zeichen = f"{r['alt_zeichen']:,}" if r["alt_zeichen"] is not None else "–"
        lines.append(
            f"| {r['name']} | {r['neu_dok']:,} | {alt_dok} | {r['neu_zeichen']:,} | {alt_zeichen} | "
            f"{r['jahr_pct']} | {r['jahr_unplausibel']:,} | {r['ref_pct']} | {r['glyph']} | "
            f"{r['trenn']} | {r['status']} |"
        )

    lines.append("\n## Summen\n")
    lines.append(f"- Dokumente neu: {gesamt_neu_dok:,} · alt: {gesamt_alt_dok:,}")
    lines.append(f"- Zeichen neu: {gesamt_neu_zeichen:,} · alt: {gesamt_alt_zeichen:,}")

    lines.append("\n## Auffälligkeiten\n")
    if probleme:
        for p in probleme:
            lines.append(f"- {p}")
    else:
        lines.append("Keine.")

    lines.append(f"\n## Gate-B-Verdikt: {'GRÜN' if n_probleme == 0 else 'ROT – siehe Auffälligkeiten'}\n")

    report_pfad.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n=== Gate B fertig. Report: {report_pfad} ===")
    print(f"{n_probleme} Auffälligkeiten")
    sys.exit(0 if n_probleme == 0 else 1)


if __name__ == "__main__":
    main()
