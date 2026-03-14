# Signifikation – Projektdokumentation

## Konzept

**Signifikation** ist eine linguistische Lern-App für den Browser (Mobile-first).
Der Name verbindet *Signifikanz* (MI-Score, Saussures Signifikant/Signifikat) mit *Kollokation* – beides zentrale Konzepte der Lexikologie.
Langfristiges Ziel: mehrere linguistische Spielmodi unter einem Dach, nicht nur das Kollokations-Quiz.

---

## Tech-Stack

| Was | Womit |
|-----|-------|
| Framework | React (Vite) |
| Styling | Vanilla CSS (keine CSS-Bibliothek) |
| Daten | Lokale JSON-Datei (`src/data/lemmata.json`) |
| Datenquelle | DWDS (Deutsche Wortschatz-Datenbank) |
| Schriften | Playfair Display (Serif, Titel) + DM Sans (Sans, UI) via Google Fonts |

---

## Corporate Design

**Palette (Light Mode, Lexikon-Stil):**

```
--bg:         #faf9f7   Warmes Pergament-Weiß (Hintergrund)
--surface:    #ffffff   Reines Weiß (Karten, Elemente)
--surface2:   #f5f4f2   Neutrales Grau-Beige (Sekundärflächen)
--border:     #e5e2de   Warm-neutraler Rand
--primary:    #9b1c1c   Bordeaux-Rot (Akzentfarbe – sparsam eingesetzt)
--primary-hi: #b91c1c   Helleres Rot (Hover)
--text:       #1c1917   Warm-Schwarz
--muted:      #78716c   Warm-Grau
```

**Prinzip:** Rot erscheint nur bei interaktiven Elementen, dem App-Titel und Akzenten.
Sonst dominiert Papier + Schwarz – Orientierung am Metzler Lexikon Sprache.

---

## Dateistruktur

```
src/
  data/
    lemmata.json          Alle Lemmata mit Kollokaten + MI-Scores + Rängen
  utils/
    gameLogic.js          Spiellogik: Rundenkeys, Shuffle, Optionen, Score, Medaille
  components/
    LemmaSelection.jsx    Startscreen: Lemma-Auswahl
    Quiz.jsx              Quizscreen: Optionen anklicken + auswerten
    Results.jsx           Ergebnisscreen: Punkte + Balken + Schwellen
  App.jsx                 State-Management, Phasen-Routing
  index.css               Globale Styles
index.html                Fonts, Titel, Theme-Color
```

---

## Spielmechanik (aktueller Stand)

### Ablauf
1. User wählt ein Lemma aus 3 zufälligen Vorschlägen
2. 3 Runden à 10 Optionen (davon 3 Top-Kollokate + 7 Distraktoren)
3. User wählt genau 3 Wörter → Auswerten → Feedback → nächste Runde

### Rundenstruktur

| Runde | Wortart | JSON-Key |
|-------|---------|----------|
| 1 | Nomen (Substantive) | `sonstige` |
| 2 | Verben | `verben` |
| 3 | Adjektive | `nomina` |

> Hinweis: Die JSON-Keys stammen aus einer früheren Benennung und sind historisch gewachsen.
> `nomina` enthält attributive Adjektive (deklinierbar, daher linguistisch "Nomina"),
> `sonstige` enthält eigentliche Substantive.
> Eine Umbenennung der Keys ist noch ausstehend.

### Punktesystem (aktuell, unzufriedenstellend)

```
Rang 1–3  →  3 Punkte
Rang 4–10 →  1 Punkt
Rang >10  →  0 Punkte
Max: 9 Punkte/Runde, 27 Punkte gesamt
```

**Problem:** Das Punktesystem fühlt sich noch nicht stimmig an.
**Geplant:** MI-Score-basiertes System – Punkte proportional zum MI-Score der gewählten Kollokate.

### Feedback nach Auswertung
- Richtige Wahl (Rang 1–3): grün markiert
- Teilweise richtig (Rang 4–10): gelb/amber
- Falsch (Rang >10): rot
- Verpasste Top-3: grün, leicht ausgeblendet
- Zusätzlich: explizite Anzeige der Top-3 als Chips ("Top-3: X · Y · Z")

---

## Aktuelle Lemmata (5 Einträge)

| ID | Lemma | Wortart |
|----|-------|---------|
| demokratie | Demokratie | Nomen |
| sprache | Sprache | Nomen |
| zeit | Zeit | Nomen |
| arbeit | Arbeit | Nomen |
| wasser | Wasser | Nomen |

---

## Offene Punkte / Vorhaben

### Kurzfristig
- [ ] Punktesystem überarbeiten → MI-Score-basiert
- [ ] JSON-Keys umbenennen: `nomina` → `adjektive`, `sonstige` → `nomen`
- [ ] Mehr Lemmata hinzufügen

### Mittelfristig
- [ ] Navigation/Homescreen für mehrere Spielmodi
- [ ] Zweiter Spielmodus (Ideen: Wortfeld-Raten, Valenz-Spiel, Etymologie-Quiz, Minimalpaar-Phonologie)

### Langfristig
- [ ] Anbindung an echte DWDS-API statt statischer JSON
- [ ] Fortschritt/Statistik speichern (localStorage)
- [ ] PWA-Unterstützung (offline spielbar)

---

## Design-Entscheidungen (Begründungen)

- **Kein Emoji** – bewusste Entscheidung für seriös-wissenschaftlichen Stil
- **Playfair Display** – Serif-Schrift vermittelt Lexikon-Ästhetik
- **Bordeaux als Akzentfarbe** – historisch in gedruckten Wörterbüchern verwendet
- **Keine UI-Bibliothek** – volle Kontrolle über das CD, kein Framework-Overhead
