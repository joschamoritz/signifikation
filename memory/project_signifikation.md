# Signifikation – Projektübersicht

## Stack
- **Frontend**: React 18 + Vite, kein CSS-Framework, pure CSS custom properties
- **Backend**: Node.js + Express 5, ES-Module (`"type":"module"`)
- **Deployment**: lokales Dev-Setup; Remote `origin` = `https://github.com/joschamoritz/signifikation.git`
- **Fonts**: Playfair Display (Headings), DM Sans (Body) via Google Fonts

## Datei-Struktur
```
server/
  index.js              – Express-Server, alle /api/* Endpunkte
  diacollo.js           – DiaCollo-Abfrage (DWDS multi-Korpora, Zeitreise)
  dwds.js               – DWDS Wortprofil-API (Kollokationen + Bonus)
  admin.html            – Admin-UI (Lemmata verwalten, Zeitreise-Tags)
  data/
    lemmata.json        – Alle Lemmata mit Kollokationsdaten
    kalender.json       – { "MM-DD": [id, id, id] }
    zeitreise.json      – { "MM-DD": { lemma, paare, perioden } }
    diacollo-config.json – Aktive DiaCollo-Korpora
src/
  App.jsx               – Zustandsmaschine (phase: home/selection/quiz/results/zeitreise)
  components/
    Home.jsx            – Startseite (Streak, Spielkarten, Verlaufsdots)
    Quiz.jsx            – Kollokationsquiz (3 Runden + Bonus)
    Results.jsx         – Ergebnisseite Quiz
    Zeitreise.jsx       – Zeitreise-Spiel (Drag-&-Drop + Bubble-Chart + Belege)
    LemmaSelection.jsx  – Wortauswahl
  utils/gameLogic.js    – Score, Shuffle, Medal-Logik
  index.css             – Alle Styles
public/
  logo.png              – App-Logo
  favicon.png           – LogoNetz.png (Netz-Fragment des Logos)
  favicon.svg           – SVG-Fallback
index.html
```

## Lemma-Datenstruktur (lemmata.json)
```json
{
  "id": "string",
  "lemma": "Wort",
  "rundenInfo": [
    { "key": "nomen",     "label": "Nomen",     "relCode": "KON",   "desc": "ist koordiniert mit" },
    { "key": "verben",    "label": "Verben",    "relCode": "~OBJ",  "desc": "ist Objekt von" },
    { "key": "adjektive", "label": "Adjektive", "relCode": "ATTR",  "desc": "hat Adjektivattribut" }
  ],
  "nomen":     [{ "wort": "X", "rang": 1, "log_dice": 12.3 }, ...],
  "verben":    [...],
  "adjektive": [...],
  "bonus": { "frage": "...", "options": [...], "answer": "..." }
}
```

## Zeitreise-Datenstruktur (zeitreise.json)
```json
{
  "MM-DD": {
    "lemma": "Wort",
    "paare": [
      { "jahrzehnt": "1850", "kollokat": "Maschine", "korpus": "dta", "score": 12.4 }
    ],
    "perioden": [
      { "jahrzehnt": "1650", "kollokat": "Kräfte", "korpus": "dta", "score": 9.1 },
      ...
    ]
  }
}
```
- `paare`: 5 gleichmäßig verteilte Spielperioden
- `perioden`: ALLE passenden Perioden (für Bubble-Chart-Visualisierung, mehr Datenpunkte)
- Alte Einträge ohne `perioden`: Fallback im Chart auf `paare`

## Punktesystem
- **Quiz**: 1 Punkt pro korrekt gewähltem Top-3-Wort (max. 3 pro Runde × 3 Runden = 9 + 1 Bonus = 10)
- **Zeitreise**: 2 Punkte pro korrekt zugeordnetem Paar (5 × 2 = 10 max.)
- **Tagesmedaille**: Gold ≥27 / Silber ≥21 / Bronze ≥15 von 30 möglichen Punkten

## LocalStorage-Keys
- `sig_MM-DD` – Gespielte Kollokations-Spiele des Tages `[{ id, lemma, total, medal }]`
- `sig_zr_MM-DD` – Zeitreise-Ergebnis des Tages `{ lemma, total, medal }`
- `sig_history` – Verlauf (neueste zuerst) `[{ date: "YYYY-MM-DD", medal, total, maxTotal }]`

## Streak-Logik (Home.jsx)
`computeStreak(history)` zählt consecutive days in `sig_history`.
- Streak läuft weiter falls heute ODER gestern gespielt (kein Reset am gleichen Tag)
- Anzeige: 🔥 (1-6 Tage), 🔥🔥 (7-29 Tage), 🔥🔥🔥 (≥30 Tage)

---

## API-Endpunkte (server/index.js)

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/heute` | Lemmata des Tages aus kalender.json |
| `GET /api/zeitreise` | Zeitreise-Eintrag des Tages |
| `GET /api/belege` | Korpusbelege für Kollokationspaar |
| `GET /api/bonus` | Bonus-Frage für ein Lemma |
| Admin-Endpoints (X-Admin-Key) | Lemmata anlegen, Kalender befüllen, Zeitreise-Tags |

## Belege-API: Bekannte Probleme & Lösungen

### Problem 1: Falsche Epochen-Belege (Zeitreise)
**Symptom**: Zeitreise-Beleg für "um 1550" zeigt Wikipedia-Text von 2025.
**Ursache**: Letzter Fallback in der Belege-Kette war ein völlig ungefilterter DWDS-Request ohne Korpus/Datum.
**Lösung**: Wenn `corpus`-Parameter gesetzt ist (Zeitreise-Modus), kein abschließender Fallback ohne Filter. "Keine Belege gefunden" ist besser als falscher Beleg.

### Problem 2: Kollokationen sind nicht adjacent
**Symptom**: Phrasensuche `"Wort1 Wort2"` findet kaum Treffer, obwohl Kollokation stark ist.
**Ursache**: DiaCollo misst Co-Vorkommen im Kontextfenster (~5 Sätze), nicht direkte Nachbarschaft.
**Lösung**: DDC-Proximity-Operatoren `#10` und `#20`:
```
"Kollokat Lemma"          → direkt adjacent
Kollokat #10 Lemma        → innerhalb 10 Wörter
Kollokat #20 Lemma        → innerhalb 20 Wörter
```

### Problem 3: Zeitreise-Jahrzehnte – Auswahllogik
**Wie werden die 5 Spielperioden gewählt?**
`extractPaare()` in `diacollo.js`:
1. Alle Perioden mit `f1 >= 5` und `ldCount >= 3` filtern
2. 5 gleichmäßig verteilte Indices: `step = (n-1)/4`, dann `[0,1,2,3,4].map(i => profiles[round(i*step)])`
3. Keine Deduplizierung der Kollokatoren! Ein gleiches Wort in mehreren Perioden ist ein valides linguistisches Ergebnis.

**Corpus-Inferenz für alte Daten** (ohne `korpus`-Feld):
```js
y <= 1900 ? 'dta' : y <= 1990 ? 'kern' : null
```

### Problem 4: DiaCollo-Jahrzehnt-Labels
- DiaCollo gibt `profile.label` zurück, z.B. `"1850"` (Dekaden-Beginn)
- Darstellung im Frontend: `um 1850` via `formatPeriod()`
- **Nicht** `"1450–1499"` – das war ein alter `formatPeriod()`-Bug (Stale Cache)

---

## DiaCollo (server/diacollo.js)

### API-Endpunkt
`https://ddc.dwds.de/dstar/<korpus>/diacollo/profile.perl?q=<lemma>&slice=<n>&kbest=20&fmt=json`
⚠️ Die URL `/diacollo/` ohne `profile.perl` gibt nur HTML zurück!

### Aktive Korpora (diacollo-config.json)
`dta` (1450–1950), `dtae` (1450–1950), `dtak` (1550–1900),
`reichstag` (1860–1940), `kern` (1900–1990), `bundestag` (1900–2000),
`ddr` (1940–1990), `politische_reden` (1980–2020)

### Merge-Strategie
Bei gleichem Jahres-Label über mehrere Korpora: das Profil mit **höherem `f1`** gewinnt (mehr Daten).

### Profil-Datenstruktur
```js
profile.ld  // Object: { "Wort\tPOS": logDiceScore, ... }
profile.f1  // Frequenz des Lemmas in der Periode
profile.label // Jahrzehnt-String, z.B. "1850"
```

### POS-Ranking für Kollokat-Auswahl
```js
const POS_RANK = { NN: 0, ADJA: 0, ADJD: 0, NE: 1 }  // Verben/Sonstiges = 2
```
Nomen und Adjektive werden bevorzugt (semantisch informativer für das Spiel).

---

## Frontend-Komponenten: Wichtige Details

### ZrBubbleChart (Zeitreise.jsx)
- **Props**: `paare`, `perioden`, `placements`, `lemma`
- **Hintergrundpunkte**: alle `perioden` die nicht in `paare` sind → grau, klein
- **Spielpunkte**: `paare` → groß, farbig nach Korpus, ✓/✗ Feedback
- **Hover-Popover**: lazy-fetched Beleg aus `/api/belege`, gecacht per `jahrzehnt_kollokat`-Key
- **Hover-Strategie**: `onMouseLeave` nur auf dem äußeren div (Chart+Popover), nicht auf einzelnen Elementen → Popover bleibt lesbar

### Korpusfarben
```js
const KORPUS_COLOR = {
  dta: '#9b1c1c', dtae: '#b45309', dtak: '#c2410c',
  kern: '#1d4ed8', ddr: '#0891b2', bundestag: '#4f46e5',
  reichstag: '#a21caf', politische_reden: '#d97706',
}
```
