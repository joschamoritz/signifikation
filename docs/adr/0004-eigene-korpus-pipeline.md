# ADR-0004: Eigene Korpus-Pipeline statt DWDS-API

**Status:** Accepted
**Datum:** 2025-Q4

## Kontext

Signifikation braucht Kollokations-Profile, Belege und Wortgeschichte aus
deutschsprachigen Korpora. Die naheliegende Quelle wäre die DWDS-API
(Berlin-Brandenburgische Akademie). DWDS bietet Wortprofile, Beleg-Suche
und historische Korpora ready-to-use.

## Entscheidung

Wir bauen eine eigene Daten-Pipeline (`wortprofil/`):

1. Öffentliche Korpora herunterladen (Bundestag, DTA, Leipzig, Reichstag etc.)
2. spaCy + DWDSmor für Lemmatisierung und Tagging
3. logDice-basierte Kollokations-Scores berechnen
4. Belege per FTS5-Index in `belege.db`
5. Ergebnis: `wortprofil.db` + `belege.db`, beide auf dem Hetzner-Volume

## Konsequenzen

**Positiv:**
- **Lizenz-Sicherheit:** DWDS-API hat restriktive Nutzungs-Terms für
  kommerzielle Apps und Re-Distribution. Eigene Pipeline auf öffentlichen
  Korpora ist juristisch sauber.
- Unabhängigkeit von externem Service-Uptime
- Volle Kontrolle über Berechnungsdetails (logDice-Parameter, Filter,
  Beleg-Auswahl)
- Diachronischer Modus (Zeitenwende) braucht historische Korpora — DWDS
  liefert die zwar, aber nicht in der benötigten Granularität pro Lemma

**Negativ:**
- Initialer Aufwand: Pipeline-Code (`wortprofil/`) ist eigenständiges
  Projekt, ca. 5k LOC Python
- Datenmenge: ~2 GB Korpora-Snapshots auf dem Hetzner-Volume
- Wartung: bei neuen Korpus-Releases muss Pipeline laufen (typisch
  Quartal)
- Qualität: keine kuratierte Daten-Qualität wie bei DWDS — manuelle
  Reviews nötig

## Verworfene Alternativen

- **DWDS-API live abfragen:** Lizenz-Risiko, Rate-Limits, Latenz,
  Single-Source-of-Failure
- **DWDS-API für nicht-kommerzielle Variante + eigene Pipeline für
  Premium:** schafft zwei Code-Pfade, mehr Komplexität
- **Reverso / Glosbe / andere kommerzielle Quellen:** Lizenz-Probleme
  + keine Wissenschaftsfähigkeit

## Memory-Hinweis

⚠️ Wichtig: Daten kommen **nicht** von DWDS — siehe
`memory/feedback_dwds_fehler.md`. Bei Korrespondenz mit DWDS-Team
keine Verwechslung suggerieren.
