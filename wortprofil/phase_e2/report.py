"""Phase E2, Schritt 4 - Validierungs-Report fuer die Freigabe.

Misst zusaetzlich den vollen Umfang des geplanten Merges (welche Tabellen und
wie viele Zeilen wirklich betroffen sind) - das ist die Grundlage fuer die
Platz- und Risikoabschaetzung und deckt zwei Luecken der Plan-Vorgabe auf
(head-Spalte `lemma`, Tabelle `zeitreise`).

Schreibt NICHTS in die Datenbank ausser dem Lesen.
"""

import argparse
import json
import os
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

HIER = Path(__file__).parent
WP_DB_DEFAULT = Path(r"C:\wortprofil_v2\wortprofil_v2.db")
TMP_DIR_DEFAULT = HIER.parent / "_tmp"
SIG_DB = HIER.parent.parent / "server" / "data" / "signifikation.db"
OUT_MD = HIER / "E2_VALIDIERUNG.md"

# Beim Durchsehen der Blocklisten von Hand gefundene Fehlabbildungen.
MANUELL_FALSCH = [
    ("graph", "graf", "mathematischer Graph ist kein Adelstitel"),
    ("sky", "ski", "englisches Wort, kein Schreibvariante von Ski"),
    ("may", "mai", "Eigenname (Karl May) faellt mit dem Monatsnamen zusammen"),
    ("club", "klub", "beide Schreibungen sind heute gueltig (Duden fuehrt beide)"),
    ("corps", "korps", "beide Schreibungen gueltig, unterschiedliche Verwendung"),
    ("graphisch", "grafisch", "beide Schreibungen heute gueltig"),
    ("photographie", "fotografie", "beide Schreibungen heute gueltig"),
]

BLOCK_TITEL = {
    "A": "th -> t (Orthographische Konferenz 1901, Erbwoerter)",
    "B": "ss / -nis (Rechtschreibreform 1996)",
    "C": "ey / ieng / -iren (Schreibgebrauch 18./19. Jahrhundert)",
    "D": "c -> k / z, ck -> k (Fremdwortschreibung 1901)",
    "E": "ph -> f, y -> i, dt -> t (gemischt, hoeheres Risiko)",
}


def redirect_tmp(tmp_dir: Path):
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for var in ("SQLITE_TMPDIR", "TMPDIR", "TMP", "TEMP"):
        os.environ[var] = str(tmp_dir)


def tageslemmata() -> set[str]:
    """Lemmata, die die App zuletzt gespielt hat - duerfen nicht wegnormalisiert
    werden, ohne dass es jemand sieht (Regressionsschutz, Golden Query #10)."""
    out: set[str] = set()
    j = HIER.parent / "phase_c" / "tageslemmata_2026-08.json"
    if j.exists():
        for e in json.loads(j.read_text(encoding="utf-8")):
            for k in ("nomen", "verb", "adjektiv", "zeitenwende_lemma"):
                if e.get(k):
                    out.add(e[k].lower())
            for w in e.get("zwilling_paar") or []:
                out.add(w.lower())
    if SIG_DB.exists():
        try:
            s = sqlite3.connect(f"file:{SIG_DB}?mode=ro", uri=True)
            for (lem,) in s.execute("SELECT lemma FROM lemmata"):
                if lem:
                    out.add(lem.lower())
            s.close()
        except Exception as e:            # Tabelle fehlt / DB gesperrt
            print(f"  (signifikation.db nicht lesbar: {e})")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wp-db", type=Path, default=WP_DB_DEFAULT)
    ap.add_argument("--tmp-dir", type=Path, default=TMP_DIR_DEFAULT)
    ap.add_argument("--skip-impact", action="store_true")
    args = ap.parse_args()
    redirect_tmp(args.tmp_dir)

    wp = sqlite3.connect(f"file:{args.wp_db}?mode=ro", uri=True)
    wp.execute("PRAGMA cache_size=-262144")

    mapping: dict[tuple[str, str], tuple[str, str, int, int, str, str]] = {}
    for alt, korrekt, pos, regel, f_alt, f_korr, block, verdacht in wp.execute(
        "SELECT alt, korrekt, dep_pos, quelle_der_regel, f_alt, f_korrekt, "
        "block, verdacht FROM lemma_corrections"
    ):
        mapping[(alt, pos)] = (korrekt, regel, f_alt, f_korr, block, verdacht)
    print(f"Mapping: {len(mapping):,} Zeilen")

    tl = tageslemmata()
    print(f"App-Lemmata zum Abgleich: {len(tl):,}")

    # ── Umfang des Merges messen ───────────────────────────────────────────
    impact_json = HIER / "impact.json"
    impact = {}
    if args.skip_impact:
        if impact_json.exists():
            impact = json.loads(impact_json.read_text(encoding="utf-8"))
            print(f"Umfang aus {impact_json.name} uebernommen")
    else:
        t0 = time.time()
        keys_alt = set()
        keys_neu: Counter = Counter()
        n_dep = n_head = n_beide = 0
        n = 0
        for lemma, pos, rel, dep_l, dep_p, prep in wp.execute(
            "SELECT lemma, pos, relation, dep_lemma, dep_pos, prep FROM collocations"
        ):
            m_h = mapping.get((lemma, pos))
            m_d = mapping.get((dep_l, dep_p))
            if m_h or m_d:
                if m_h and m_d:
                    n_beide += 1
                elif m_h:
                    n_head += 1
                else:
                    n_dep += 1
                nl = m_h[0] if m_h else lemma
                nd = m_d[0] if m_d else dep_l
                keys_alt.add((lemma, pos, rel, dep_l, dep_p, prep))
                keys_neu[(nl, pos, rel, nd, dep_p, prep)] += 1
            n += 1
        # Wie viele der neuen Schluessel treffen auf eine Zeile, die es schon gibt?
        print(f"  collocations gescannt: {n:,} in {time.time()-t0:.0f}s")
        betroffen = n_dep + n_head + n_beide
        impact["coll_zeilen"] = n
        impact["coll_betroffen"] = betroffen
        impact["coll_nur_dep"] = n_dep
        impact["coll_nur_head"] = n_head
        impact["coll_beide"] = n_beide
        impact["coll_keys_vorher"] = len(keys_alt)
        impact["coll_keys_nachher"] = len(keys_neu)

        t0 = time.time()
        n = zbetroffen = 0
        for lemma, pos, dep_l, dep_p in wp.execute(
            "SELECT lemma, pos, dep_lemma, dep_pos FROM zeitreise"
        ):
            if (lemma, pos) in mapping or (dep_l, dep_p) in mapping:
                zbetroffen += 1
            n += 1
        print(f"  zeitreise gescannt: {n:,} in {time.time()-t0:.0f}s")
        impact["zeit_zeilen"] = n
        impact["zeit_betroffen"] = zbetroffen

        n = lbetroffen = 0
        for lemma, pos in wp.execute("SELECT lemma, pos FROM lemma_corpus_freq"):
            if (lemma, pos) in mapping:
                lbetroffen += 1
            n += 1
        impact["lcf_zeilen"] = n
        impact["lcf_betroffen"] = lbetroffen
        print(f"  lemma_corpus_freq: {n:,}, betroffen {lbetroffen:,}")
        impact_json.write_text(json.dumps(impact, indent=2), encoding="utf-8")

    # ── Report ──────────────────────────────────────────────────────────────
    rows = sorted(mapping.items(), key=lambda kv: -kv[1][2])
    blockstat = defaultdict(lambda: [0, 0])
    for (alt, pos), (k, r, fa, fk, b, v) in mapping.items():
        blockstat[b][0] += 1
        blockstat[b][1] += fa

    verdachtsfaelle = defaultdict(list)
    for (alt, pos), (k, r, fa, fk, b, v) in rows:
        for flag in filter(None, v.split(",")):
            verdachtsfaelle[flag].append((alt, k, pos, fa, fk, r))
    kollidiert_app = [(alt, k, pos, fa, fk) for (alt, pos), (k, r, fa, fk, b, v)
                      in rows if alt in tl]

    L = []
    A = L.append
    A("# Phase E2 - Validierungs-Report `lemma_corrections`")
    A("")
    A(f"Erzeugt: {time.strftime('%Y-%m-%d %H:%M')} · DB: `{args.wp_db}` · "
      f"Mapping: **{len(mapping):,} Zeilen**, alle `freigegeben=0`")
    A("")
    A("> **Nichts an den Daten wurde veraendert.** Es existiert nur die neue "
      "Tabelle `lemma_corrections`. Sicherungskopie: "
      "`D:\\wortprofil_v2_backup\\wortprofil_v2.db.pre-e2`.")
    A("")
    A("## 1. Bloecke - hier gibst du frei")
    A("")
    A("| Block | Regel | Paare | betroffene Frequenz | Freigabe |")
    A("|---|---|---:|---:|---|")
    for b in sorted(blockstat):
        n, f = blockstat[b]
        A(f"| **{b}** | {BLOCK_TITEL[b]} | {n:,} | {f:,} | ☐ |")
    A(f"| | **Summe** | **{len(mapping):,}** | "
      f"**{sum(v[1] for v in blockstat.values()):,}** | |")
    A("")

    A("## 2. Top-500 nach Frequenz der alten Form")
    A("")
    A("| # | alt | -> | korrekt | POS | f_alt | f_korrekt | Block | Verdacht |")
    A("|---:|---|---|---|---|---:|---:|---|---|")
    for i, ((alt, pos), (k, r, fa, fk, b, v)) in enumerate(rows[:500], 1):
        A(f"| {i} | `{alt}` | → | `{k}` | {pos} | {fa:,} | {fk:,} | {b} | {v} |")
    A("")

    A("## 3. Verdaechtige Faelle (separat gelistet)")
    A("")
    erklaerung = {
        "laenger": "korrekte Form ist LAENGER als die alte (Plan-Laengencheck). "
                   "Bei Block B ist das der Normalfall (ss -> ss), sonst pruefen.",
        "schwache_dominanz": "das Ziel ist weniger als doppelt so haeufig wie die "
                             "Ausgangsform - der Frequenzwaechter greift hier nur knapp.",
        "riskante_regel": "Regel aus Block D/E (c/y/ph/dt) - hoehere Fehlerneigung.",
        "ziel_nur_einseitig": "Zielform kommt nur als Head ODER nur als Dep vor.",
    }
    for flag, liste in sorted(verdachtsfaelle.items(), key=lambda x: -len(x[1])):
        A(f"### `{flag}` - {len(liste):,} Faelle")
        A("")
        A(erklaerung.get(flag, ""))
        A("")
        A("| alt | -> | korrekt | POS | f_alt | f_korrekt | Regel |")
        A("|---|---|---|---|---:|---:|---|")
        for alt, k, pos, fa, fk, r in liste[:100]:
            A(f"| `{alt}` | → | `{k}` | {pos} | {fa:,} | {fk:,} | {r} |")
        if len(liste) > 100:
            A(f"| … | | | | | | *({len(liste)-100:,} weitere)* |")
        A("")

    A("## 3b. Von mir beim Durchsehen als FALSCH erkannt")
    A("")
    A("Diese Zeilen stehen im Mapping, sind aber nach meiner Einschaetzung keine "
      "Schreibvarianten, sondern verschiedene Woerter bzw. verschiedene Namen. "
      "Ich empfehle, sie vor dem Merge zu entfernen (`DELETE FROM lemma_corrections "
      "WHERE alt IN (...)`) oder Block E ganz zu verwerfen:")
    A("")
    A("| alt | wuerde zu | warum falsch |")
    A("|---|---|---|")
    for alt, k, grund in MANUELL_FALSCH:
        e = mapping.get((alt, "Substantiv")) or mapping.get((alt, "Adjektiv"))
        if e is None:
            continue
        A(f"| `{alt}` | `{e[0]}` | {grund} |")
    A("")
    A("Dazu kommt eine ganze Klasse: **Vornamen und Eigennamen** landen in Block D/E, "
      "weil die Regeln `c→k`, `ph→f`, `y→i` auf sie zutreffen — `carl→karl`, "
      "`jacob→jakob`, `marcus→markus`, `stephan→stefan`, `ralph→ralf`, `willy→willi`, "
      "`raphael→rafael`. Das sind reale, verschiedene Namensschreibungen von realen "
      "Personen, keine Rechtschreibfehler. Die Lemmata tragen keine Wortart-Markierung "
      "`NPROP` (die Pipeline faltet Eigennamen in `Substantiv`), deshalb kann ich sie "
      "nicht automatisch aussortieren.")
    A("")

    A("## 4. Cross-Check gegen die Lemmata der App")
    A("")
    A(f"Lokal verfuegbar sind nur **{len(tl)} Lemmata** "
      "(`phase_c/tageslemmata_2026-08.json` + die 26 Eintraege der lokalen "
      "`server/data/signifikation.db`). Die produktive `kalender`-Historie liegt auf "
      "Hetzner — dieser Check ist also eine Stichprobe, kein vollstaendiger "
      "Regressionsbeweis. Die belastbare Pruefung ist Golden Query #10 nach dem Merge.")
    A("")
    if kollidiert_app:
        A(f"**{len(kollidiert_app)} Lemmata, die die App als Spielwort nutzt, "
          f"stehen als `alt` im Mapping** - sie wuerden verschwinden:")
        A("")
        A("| App-Lemma | -> | wird zu | POS | f_alt | f_korrekt |")
        A("|---|---|---|---|---:|---:|")
        for alt, k, pos, fa, fk in kollidiert_app[:80]:
            A(f"| `{alt}` | → | `{k}` | {pos} | {fa:,} | {fk:,} |")
        A("")
    else:
        A("Kein von der App gespieltes Lemma steht auf der `alt`-Seite. "
          "Keine Regression bei den Tageslemmata zu erwarten.")
        A("")

    # ── verworfene Kandidaten ──────────────────────────────────────────────
    vpath = HIER / "verworfen.db"
    if vpath.exists():
        v = sqlite3.connect(f"file:{vpath}?mode=ro", uri=True)
        n_v = v.execute("SELECT count(*) FROM verworfen").fetchone()[0]
        A("## 5. Was der Frequenzwaechter verworfen hat")
        A("")
        A(f"{n_v:,} regelerzeugte Kandidaten wurden verworfen, weil die "
          "Ausgangsform haeufiger ist als das Ziel. Diese Liste zeigt, dass der "
          "Waechter die Uebernormalisierung wirklich abfaengt:")
        A("")
        A("| bleibt | wuerde sonst | POS | f_bleibt | f_ziel | Regel |")
        A("|---|---|---|---:|---:|---|")
        for alt, ziel, pos, kette, fa, fz in v.execute(
            "SELECT * FROM verworfen ORDER BY f_alt DESC LIMIT 60"
        ):
            A(f"| `{alt}` | ~~`{ziel}`~~ | {pos} | {fa:,} | {fz:,} | {kette} |")
        A("")
        v.close()

    if impact:
        A("## 6. Umfang des Merges (gemessen, nicht geschaetzt)")
        A("")
        A("| Tabelle | Zeilen gesamt | betroffen | Anteil |")
        A("|---|---:|---:|---:|")
        A(f"| `collocations` | {impact['coll_zeilen']:,} | "
          f"{impact['coll_betroffen']:,} | "
          f"{100*impact['coll_betroffen']/impact['coll_zeilen']:.2f} % |")
        A(f"| `zeitreise` | {impact['zeit_zeilen']:,} | "
          f"{impact['zeit_betroffen']:,} | "
          f"{100*impact['zeit_betroffen']/impact['zeit_zeilen']:.2f} % |")
        A(f"| `lemma_corpus_freq` | {impact['lcf_zeilen']:,} | "
          f"{impact['lcf_betroffen']:,} | "
          f"{100*impact['lcf_betroffen']/impact['lcf_zeilen']:.2f} % |")
        A("")
        A(f"Aufteilung in `collocations`: nur `dep_lemma` betroffen "
          f"{impact['coll_nur_dep']:,} · nur `lemma` (Head) "
          f"{impact['coll_nur_head']:,} · beide Spalten {impact['coll_beide']:,}.")
        A("")
        weg = impact['coll_keys_vorher'] - impact['coll_keys_nachher']
        A(f"Von den {impact['coll_keys_vorher']:,} betroffenen Kollokations-"
          f"Schluesseln fallen nach dem Merge **{weg:,} als Duplikate zusammen** "
          f"({impact['coll_keys_nachher']:,} bleiben). Die Zeilenzahl von "
          f"`collocations` sinkt entsprechend von {impact['coll_zeilen']:,} auf "
          f"~{impact['coll_zeilen']-weg:,}.")
        A("")

    A("## 7. Zwei Luecken in der Plan-Vorgabe zum Merge")
    A("")
    A("**(a) Die Head-Spalte `lemma` muss mitgemergt werden.** Der Plan (E2, Schritt 5) "
      "nennt nur `UPDATE dep_lemma`. `collocations` enthaelt aber zu jeder direkten "
      "Relation die inverse mit vertauschten Rollen — jedes Lemma steht dort auch in "
      "`lemma`. Die Messung oben zeigt das symmetrisch: "
      + (f"{impact['coll_nur_dep']:,} Zeilen nur ueber `dep_lemma` betroffen, "
         f"{impact['coll_nur_head']:,} nur ueber `lemma`. " if impact else "")
      + "Wuerde nur `dep_lemma` normalisiert, bliebe rund die Haelfte der Faelle stehen "
        "und die DB waere in sich widerspruechlich (`thier` als Head, `tier` als Dep). "
        "Golden Query #11 prueft ohnehin **beide** Spalten "
        "(`WHERE lemma='thier' OR dep_lemma='thier'`) und wuerde auf FAIL laufen.")
    A("")
    A("Mitzuziehen sind dabei `relation_full` (Bauart `lemma-pos-relation`, enthaelt "
      "das Lemma im Klartext) und `form` (Kopie von `dep_lemma`).")
    A("")
    A("**(b) Die Tabelle `zeitreise` steht nicht im Plan, ist aber betroffen.** "
      + (f"{impact['zeit_betroffen']:,} von {impact['zeit_zeilen']:,} Zeilen "
         f"({100*impact['zeit_betroffen']/impact['zeit_zeilen']:.2f} %) enthalten ein "
         "Lemma aus dem Mapping. " if impact else "")
      + "Ohne Mitbehandlung zeigte die Zeitenwende weiterhin `thier` und `tier` "
        "getrennt, mit aufgeteilten Dekadenfrequenzen. Der Plan nennt als Nacharbeit "
        "nur `lemma_corpus_freq` und `build_info`.")
    A("")
    A("Beides sind Erweiterungen des Merge-Umfangs, keine Aenderung des Verfahrens — "
      "aber sie brauchen deine Zustimmung, bevor ich sie umsetze.")
    A("")

    A("## 8. Kontroll-Paar fuer Gate E2 (Ueber-Normalisierung)")
    A("")
    A("Golden Query #11 verlangt ein bewusst getrennt gehaltenes Paar. Vorschlag — "
      "beide wurden von den Regeln erzeugt und vom Frequenzwaechter verworfen, muessen "
      "also nach dem Merge noch getrennt existieren:")
    A("")
    A("| bleibt getrennt | Regel haette daraus gemacht | Begruendung |")
    A("|---|---|---|")
    A("| `theater` | `teater` | griechisches ⟨th⟩, keine Erbwort-Schreibung |")
    A("| `maß` | `mass` | `Maß` behaelt das ⟨ß⟩ auch nach 1996 |")
    A("")

    A("## 9. Platz und Ablauf des Merges")
    A("")
    A("| Posten | Bedarf |")
    A("|---|---|")
    A("| `wortprofil_v2.db` heute | 17,77 GiB (C:) |")
    A("| Sicherungskopie (liegt bereits) | 17,77 GiB (D:, `wortprofil_v2_backup`) |")
    A("| WAL waehrend Transaktion + Index-Neubau | grob 8–15 GiB (C:) |")
    A("| `VACUUM INTO` als Zieldatei | ~17 GiB (C:) |")
    A("| SQLite-Temp (`TMP`/`TEMP`) | auf `wortprofil/_tmp` (D:) umgelenkt |")
    A("")
    A("Frei aktuell: **C: 74 GB, D: 486 GB** — reicht mit deutlichem Abstand.")
    A("")
    A("Statt `VACUUM` in-place schlage ich `VACUUM INTO` auf eine neue Datei vor: "
      "Die alte Datei bleibt dabei unangetastet und ist der schnellste Rollback "
      "(Umbenennen statt 17 GiB von D: zurueckkopieren). Erst nach gruenem "
      "`validate_v2.py` wird getauscht.")
    A("")

    OUT_MD.write_text("\n".join(L), encoding="utf-8")
    print(f"\nReport: {OUT_MD}  ({len(L)} Zeilen)")
    if impact:
        print(json.dumps(impact, indent=2))


if __name__ == "__main__":
    sys.exit(main())
