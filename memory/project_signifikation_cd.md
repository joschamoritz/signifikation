# Signifikation – Corporate Design

## Farb-Palette (CSS Custom Properties)
```css
--primary:    #6b21a8   /* Lila/Violett – Haupt-Akzent */
--text:       #1c1917   /* Fast-Schwarz */
--text-secondary: #57534e
--muted:      #a8a29e
--surface:    #ffffff
--background: #faf9f7   /* Warmes Off-White */
--border:     #e7e5e4
--radius:     12px
```

## Typografie
- **Headlines**: Playfair Display, 700–800 (serif, klassisch-literarisch)
- **Body / UI**: DM Sans, 400–600 (humanistisch, gut lesbar)
- **Lemma-Wort auf Titelseite**: Playfair Display 800, sehr groß

## Logo
- `public/logo.png` – Hauptlogo (210px breit auf Startseite)
- `public/favicon.png` – `LogoNetz.png` (Netz-Fragment des Logos, für Browser-Tab)
- `public/favicon.svg` – SVG-Fallback

## Spielkarten-Design
- Weiße Cards auf warmem Off-White-Hintergrund
- Subtile Schatten (`box-shadow: 0 1px 3px rgba(0,0,0,.08)`)
- Border-Radius 12px durchgehend
- Hover-States: leichte Aufhellung/Border-Brightening

## Runden-Farben (Quiz-Fortschrittsbalken)
- Nomen: `#6b21a8` (Primärlila)
- Verben: `#0891b2` (Cyan)
- Adjektive: `#b45309` (Amber)
- Bonus: `#d97706` (Orange, pill-förmig, leicht breiter)

## Medaillen-Farben
- Gold:   `#f59e0b` / Border `#d97706`
- Silber: `#9ca3af` / Border `#6b7280`
- Bronze: `#cd7f32`-ähnlich

## Zeitreise-Design
- Badge "Zeitreise": `background: #ede9fe; color: #6b21a8` (Lila-Tint)
- Drag-Zones: gestrichelte Border bei droppable-State
- Richtig: Grüner Rand + ✓
- Falsch: Roter Rand + ✗

## Streak-Anzeige
- Hintergrund: `linear-gradient(135deg, #fff7ed, #fef3c7)` (Warm Orange→Gelb)
- Border: `#fcd34d` (Gelb)
- Zahl: Playfair Display 800, `#c2410c` (Dunkelorange)
- Label: DM Sans uppercase, `#92400e` (Braun)
- Flammen: 🔥 (1–6 Tage), 🔥🔥 (7–29), 🔥🔥🔥 (≥30)

## Bubble-Chart (ZrBubbleChart)
- Hintergrundpunkte: `#d6d3cf` (Grau), auf Hover `#a8a29e`
- Spielpunkte: Korpusfarbe (saturiert), Opacity `dd` wenn richtig / `44` wenn falsch
- Glow-Ring beim Hover: Korpusfarbe, opacity 0.35
- Popover: `var(--surface)` Card mit 1px Border, 8px Radius, fadeIn-Animation

## Animationen
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px) }
  to   { opacity: 1; transform: translateY(0)   }
}
```
Wird verwendet für: Belege-Panel, Popover, Resultate-Einblendung
