# DESIGN.md – Signifikation

> Tägliches linguistisches Quiz. Wörterbuch-Ästhetik (klassischer Duden-Stil) —
> die App sieht aus wie ein gedrucktes Nachschlagewerk, nicht wie eine typische Quiz-App.

---

## 1. Visual Theme

**Konzept:** Klassisch gedrucktes Wörterbuch. Pergament-Hintergrund, Serif-Typografie,
rote Akzente wie Druckfarbe, Gold für Auszeichnungen. Keine bunten Farbflächen,
keine Verläufe, keine Schatten-Hierarchien.

**Stil-Keywords:** scholarly · typographic · restrained · ink-on-paper · archival

**Was diese App ausdrücklich NICHT ist:**
- Keine typische Quiz-App-Optik (keine Konfetti, keine Neon-Farben)
- Kein Material Design, kein iOS-System-Look
- Kein minimalistisches SaaS-Dashboard

---

## 2. Color Palettes

### Primäre Palette (alle Screens)

| Token | Hex | Verwendung |
|-------|-----|------------|
| `--bg` | `#faf9f7` | Pergament-Hintergrund (Basis) |
| `--surface` | `#ffffff` | Karten, erhöhte Flächen |
| `--surface2` | `#f3f1ed` | Raster-Strip, sekundäre Flächen |
| `--text` | `#1a1a18` | Fast-Schwarz, Fließtext |
| `--muted` | `#8a7f6e` | Gedämpft: IPA, Datum, Labels |
| `--primary` | `#9b1c1c` | Primärakzent: CTAs, Drop Cap, Links |
| `--primary-hi` | `#b91c1c` | Hover auf Rot |
| `--accent` | `#c9a84c` | Gold: Badges, Trennlinien, aktive Nav |
| `--accent-dk` | `#a07830` | Dunkelgold: gespielte Zustände, Links |
| `--border` | `#d4c9b0` | Linien (normal) |
| `--border-lt` | `#e8e2d8` | Linien (hell, dotted) |
| `--disabled` | `#b8b0a0` | Deaktivierte Elemente |
| `--radius` | `4px` | Einheitlich flach |

### Status-Farben

| Zweck | Hex |
|-------|-----|
| Success | `#166534` (Text) / `#f0fdf4` (BG) |
| Warning | `#92400e` (Text) / `#fffbeb` (BG) |
| Error | `#991b1b` (Text) / `#fef2f2` (BG) |

### Badge-Farben (Spielmodi)

| Modus | BG | Border | Text |
|-------|----|--------|------|
| Kollokationen | `#fef2f2` | `#fecaca` | `#9b1c1c` |
| Zeitreise | `#eff6ff` | `#bfdbfe` | `#1d4ed8` |
| Wort-Zwilling | `#fdf8ee` | `#c9a84c` | `#a07830` |

---

## 3. Typographie

### Schriften

| Font | Verwendung |
|------|------------|
| **Gentium Plus** (Serif) | Headwords, Definitionen, Spieltitel, alle h1–h2 |
| **DM Sans** (Sans-Serif) | Labels, Badges, UI-Elemente, Buttons, Fließtext |
| `'Courier New'` (Mono) | Formeln, Code-Snippets |

Beide Schriften laufen lokal aus `public/fonts/` (kein Google Fonts CDN-Request).

### Größen-Hierarchie

| Rolle | Größe | Font |
|-------|-------|------|
| Headword (Startseite) | `clamp(1.8rem, 5vw, 2.8rem)` | Gentium Plus, 700 |
| Headword (Spielscreen) | `2–2.4rem` | Gentium Plus, 700 |
| Section-Label | `9px`, `letter-spacing: 0.25em`, uppercase | DM Sans, 600 |
| Badge | `0.7rem`, `letter-spacing: 0.1em`, uppercase | DM Sans, 700 |
| Fließtext | `0.93rem` | Gentium Plus |
| IPA / Muted | `0.85rem` | Gentium Plus, italic |

### Typografische Details
- Drop Cap: Erster Buchstabe des Kollokationen-Eintrags → `float: left`, `3.2em`, Rot
- Doppellinie: `0.9px` + `0.45px`, `3px` Abstand — als Abschnittstrenner
- Ornament: `· · ·` oder `✦ · ·` (gespielte Modi werden zu `✦`) als Kolophon-Trenner

---

## 4. Components

### Buttons

```css
/* Primär-CTA */
.btn-primary {
  background: #9b1c1c;
  color: #fff;
  border-radius: 4px;
  font-family: DM Sans;
  font-weight: 600;
  padding: 10px 24px;
}
.btn-primary:active { transform: scale(0.94); }

/* Sekundär */
.btn-secondary {
  background: transparent;
  border: 1px solid #d4c9b0;
  color: #1a1a18;
}

/* Zurück-Button */
.back-btn {
  color: #9b1c1c;
  font-size: 0.85rem;
  background: none;
  border: none;
  align-self: flex-start;
  min-height: 44px; /* Touch-Target */
}
```

### Badges (Spielmodi-Pill)
```css
/* Einheitliches Muster */
font-size: 0.7rem;
font-weight: 700;
letter-spacing: 0.1em;
text-transform: uppercase;
border-radius: 4px;
padding: 2px 10px;
```

### Spielscreen-Header-Muster
Alle drei Spielscreens folgen demselben Aufbau:
1. Back-Button (`.back-btn`) — außerhalb des Headers, oben links
2. Zentrierte Spalte: Badge → Headword (Gentium Plus, 2–2.4rem) → IPA + Wortart
3. Aufgabentext (italic, muted)

### Feedback-Sheet / Overlays
- Slides von unten rein (`translateY 100% → 0`, 300ms ease-out)
- Schließt mit `slideDown 200ms ease-in` vor `onClose()`
- Grip-Handle oben zentriert

---

## 5. Layout

### Max-Widths
| Kontext | Max-Width |
|---------|-----------|
| Startseite / Über-Seite | `680px` |
| Spielscreens | `480px` |
| Beide | `margin-inline: auto` |

### Startseite (Desktop)
Wörterbuch-Spalte: Header → Streak → Raster-Strip → Doppellinie → 4 Wörterbuch-Einträge → Anmerkung → Teilen → Kolophon

### Startseite (Mobil, `≤ 699px`)
TikTok-style Snap-Scrolling:
- `height: 100dvh`, `flex-direction: column`, `overflow: hidden`
- 4 Einträge als Snap-Cards (`scroll-snap-type: y mandatory`)
- Fixierte Badge-Navigation links: ①②③④
- Kompakter Footer unten: Teilen | Links | Version
- snap-extras unterhalb der Cards: Ornament + Kollokation-Anmerkung

### Spielscreens (Mobil, `≤ 499px`)
- App-Padding oben: `max(8px, env(safe-area-inset-top, 0px))`
- Screen `padding-block`: `14px 20px` statt `32px`

---

## 6. Shadows / Elevation

**Keine Schatten.** Die App nutzt ausschließlich Linien (`border`) und Hintergrundfarben
zur Tiefentrennung — passend zur Druckwerk-Ästhetik.

Einzige Ausnahme: Belege-Panel hat einen leichten `box-shadow: 0 1px 4px rgba(0,0,0,0.06)`.

---

## 7. Design Guardrails

**Niemals:**
- Externe Icon-Libraries (kein Heroicons, kein FontAwesome)
- CSS-Frameworks (kein Tailwind, kein Bootstrap)
- Bunte Hintergrundflächen oder Verläufe
- Mehr als 2 Schriftfamilien
- Emojis außer: Streak 🔥
- Schatten-Hierarchien (kein `elevation`-System)
- Abgerundete Ecken > `4px` (außer Badges: `4px` bereits das Maximum)

**Immer:**
- Rot (`#9b1c1c`) für primäre Aktionen und Akzente
- Gold (`#c9a84c`) für Auszeichnungen, aktive Zustände, Badges
- Pergament (`#faf9f7`) als Basis — nie reines Weiß als Seitenbackground
- Touch-Targets `min-height: 44px`
- `border-radius: 4px` einheitlich (Token: `--radius`)

---

## 8. Responsive Behavior

| Breakpoint | Verhalten |
|------------|-----------|
| `> 699px` (Desktop) | Normaler Flow, max-width 680px/480px, snap-nav/snap-footer ausgeblendet |
| `≤ 699px` (Mobil Home) | Snap-Scrolling, kompakter Header (2-zeiliges Grid), snap-nav fix links |
| `≤ 499px` (Mobil Spielscreens) | Reduzierte Paddings und Gaps, kleinere Headword-Fonts |

**Papier-Körnung:** SVG-Filter als `background-image` auf `.test-page` (`opacity: 0.03`) —
subtile Textur, die den Druckwerk-Charakter verstärkt.

---

## 9. Agent Prompts

Wenn du UI für Signifikation generierst oder erweiterst:

- **Stil:** Klassisches gedrucktes Wörterbuch. Denk an Duden, nicht an Duolingo.
- **Farben:** Pergament-Hintergrund (`#faf9f7`), Rot (`#9b1c1c`) für Aktionen, Gold (`#c9a84c`) für Auszeichnungen. Kein Blau, kein Grün als Primärfarbe.
- **Schrift:** Gentium Plus für alle Headwords und Titel. DM Sans für UI-Elemente.
- **Abstände:** Konservativ. Lieber zu wenig als zu viel. Maximale Breite einhalten.
- **Neue Komponenten** folgen dem Spielscreen-Header-Muster: Back-Button → Badge → Headword.
- **Animationen:** Subtil und typografisch (inkFlow, screenIn). Keine Bounce-Effekte, kein Confetti.
- **Mobile:** Immer auch `≤ 499px` mitdenken. App-Padding oben ist `max(8px, safe-area-inset-top)`.