/**
 * server/course/pdf/theme.js
 *
 * Druck-CSS für die Kurs-PDFs. Setzt Kurs-Didaktik-Standards §5 um:
 *   - Fließtext & Aufgaben in DM Sans, ≥ 12 pt, hohe Kontraste.
 *   - CD nur DEZENT: Gentium/Rot (#9b1c1c)/Gold (#c9a84c) ausschließlich in
 *     Kopfzeile/Titel, einer Goldlinie und Nummern. Kein roter Fließtext;
 *     Rot/Gold nie alleiniger Bedeutungsträger (Labels tragen Text).
 *   - Pergament-Hintergrund nur sehr hell; druckt sauber in S/W.
 *   - viel Weißraum, zusammengehörige Elemente gruppiert (Beleg+Aufgabe+Hilfe).
 *
 * Reine String-Funktion: die `@font-face`-Deklarationen (Base64) werden als
 * Parameter hereingereicht (pdf/fonts.js), damit die HTML-Builder font-/FS-frei
 * und unit-testbar bleiben.
 */

const TOKENS = `
  --bg:        #fcfbf9;   /* sehr helles Pergament, S/W-druckfreundlich */
  --surface:   #ffffff;
  --text:      #1a1a18;   /* Fließtext, hoher Kontrast */
  --muted:     #5f574b;   /* Labels/Quellen – dunkler als App für Druckkontrast */
  --primary:   #9b1c1c;   /* nur Titel/Nummern/Kopf */
  --accent:    #c9a84c;   /* nur Goldlinie/Ornament */
  --border:    #c9bda3;
  --border-lt: #e0d8c8;
`

/** Gemeinsame Basis für Arbeitsblatt / Lösung / Unterrichtsentwurf (A4 hoch). */
export function documentCss(fontFaceCss = '') {
  return `${fontFaceCss}
:root {${TOKENS}}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4; margin: 16mm 16mm 18mm; }

body {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 12pt;            /* §5: ≥ 12 pt */
  line-height: 1.5;
  color: var(--text);
  background: var(--bg);
}

/* ── Kopfzeile (einzige CD-Stelle: Gentium + Rot + Goldlinie) ── */
.doc-head { margin-bottom: 14pt; }
.doc-kicker {
  font-size: 8.5pt; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--muted); font-weight: 600;
}
.doc-title {
  font-family: 'Gentium Plus', Georgia, serif;
  font-weight: 700; font-size: 21pt; line-height: 1.15;
  color: var(--primary); margin: 2pt 0 1pt;
}
.doc-sub { font-size: 11pt; color: var(--muted); }
.doc-ipa { font-family: 'Gentium Plus', serif; font-style: italic; color: var(--muted); }
.gold-rule { height: 0; border: 0; border-top: 1.4pt solid var(--accent); margin: 8pt 0 0; }

.doc-meta {
  display: flex; flex-wrap: wrap; gap: 4pt 18pt;
  font-size: 9.5pt; color: var(--muted); margin-top: 7pt;
}
.doc-meta b { color: var(--text); font-weight: 600; }

/* ── Worked Example (zuerst, §5) ── */
.worked {
  border: 1pt solid var(--border); border-radius: 4px;
  background: var(--surface); padding: 11pt 13pt; margin: 14pt 0 16pt;
}
.worked .worked-label {
  font-size: 8.5pt; letter-spacing: 0.18em; text-transform: uppercase;
  font-weight: 700; color: var(--muted); margin-bottom: 5pt;
}
.worked .worked-label::before { content: '▸ '; color: var(--primary); }
.worked-solution { color: var(--text); font-weight: 600; }
.worked-note { margin-top: 6pt; font-size: 11pt; color: var(--muted); }

/* ── Aufgaben ── */
.task { margin: 0 0 16pt; page-break-inside: avoid; }
.task-head { display: flex; gap: 8pt; align-items: baseline; margin-bottom: 6pt; }
.task-no {
  font-family: 'Gentium Plus', serif; font-weight: 700;
  color: var(--primary); font-size: 14pt; min-width: 1.4em;
}
.task-prompt { font-weight: 600; }
.task-format {
  font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--muted); border: 0.8pt solid var(--border-lt);
  border-radius: 3px; padding: 1pt 5pt; white-space: nowrap;
}
.task-body { margin-left: calc(1.4em + 8pt); }

/* Zuordnen (F1) */
.match { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt 22pt; margin-top: 4pt; }
.match-col-label {
  font-size: 8.5pt; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--muted); font-weight: 700; margin-bottom: 3pt;
}
.match-row { padding: 4pt 0; border-bottom: 0.6pt dotted var(--border-lt); min-height: 22pt; }
.candidates { display: flex; flex-wrap: wrap; gap: 5pt 8pt; margin-top: 3pt; }
.chip {
  border: 0.9pt solid var(--border); border-radius: 4px;
  padding: 2pt 9pt; font-size: 11pt;
}

/* Markieren (F2) */
.beleg-satz {
  font-size: 13pt; line-height: 1.7; padding: 6pt 0;
  border-top: 0.8pt solid var(--border-lt); border-bottom: 0.8pt solid var(--border-lt);
}
.beleg-quelle { font-size: 9pt; color: var(--muted); margin-top: 4pt; }

/* Variantenvergleich (F3) / Lücke (F4) */
.frame { font-size: 13pt; margin: 2pt 0 7pt; }
.variants { display: flex; gap: 10pt; flex-wrap: wrap; }
.variant {
  border: 0.9pt solid var(--border); border-radius: 4px;
  padding: 5pt 12pt; min-width: 120pt;
}
.variant .v-word { font-weight: 600; font-size: 12.5pt; }
.metric { font-size: 9.5pt; color: var(--muted); margin-top: 2pt; }
.justify-line {
  margin-top: 8pt; border-bottom: 0.7pt solid var(--border-lt);
  height: 16pt;
}
.justify-line + .justify-line { margin-top: 10pt; }
.justify-hint { font-size: 9.5pt; color: var(--muted); margin-top: 5pt; }

/* Datenblick (F5) */
table.data { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt; font-size: 11.5pt; }
table.data caption { text-align: left; font-size: 9.5pt; color: var(--muted); margin-bottom: 4pt; }
table.data th, table.data td {
  border: 0.7pt solid var(--border-lt); padding: 4pt 8pt; text-align: left;
}
table.data th {
  font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--muted); font-weight: 700; background: #f7f4ee;
}
table.data td.num { text-align: right; font-variant-numeric: tabular-nums; }
.questions { margin-top: 6pt; }
.question { margin: 5pt 0; }
.question .q-no { font-weight: 600; color: var(--muted); }

/* ── Lösungsblatt ── */
.sol { margin: 0 0 13pt; page-break-inside: avoid; }
.sol-head { display: flex; gap: 8pt; align-items: baseline; }
.sol-answer { margin: 3pt 0 0 calc(1.4em + 8pt); }
.sol-answer .label {
  font-size: 8.5pt; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--muted); font-weight: 700;
}
.sol-answer .value { font-weight: 600; }
.rubric { margin-top: 4pt; }
.rubric ul { margin: 2pt 0 0 16pt; }
.rubric li { margin: 1pt 0; }
.rubric .minhits { font-size: 9.5pt; color: var(--muted); }

/* ── Unterrichtsentwurf ── */
.section { margin: 16pt 0 0; page-break-inside: avoid; }
.section h2 {
  font-family: 'Gentium Plus', serif; font-size: 14pt; color: var(--primary);
  border-bottom: 1pt solid var(--accent); padding-bottom: 3pt; margin-bottom: 8pt;
}
.section h3 { font-size: 11.5pt; margin: 9pt 0 3pt; }
.dreiklang { width: 100%; border-collapse: collapse; }
.dreiklang th, .dreiklang td {
  border: 0.7pt solid var(--border-lt); padding: 6pt 9pt; vertical-align: top; text-align: left;
}
.dreiklang th { width: 26%; font-weight: 700; background: #f7f4ee; }
.verlauf { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
.verlauf th, .verlauf td {
  border: 0.7pt solid var(--border-lt); padding: 5pt 7pt; vertical-align: top; text-align: left;
}
.verlauf th { font-size: 8.5pt; letter-spacing: 0.06em; text-transform: uppercase; background: #f7f4ee; }
.verlauf .phase td {
  background: #faf7f0; font-weight: 700; font-size: 9pt;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
}
ul.klp { margin: 2pt 0 0 16pt; }
ul.klp li { margin: 2pt 0; }
ul.klp li.bold { font-weight: 700; }

/* ── Fußnoten / Belege ── */
.sup { font-size: 0.7em; vertical-align: super; color: var(--primary); font-weight: 700; }
.footnotes {
  margin-top: 18pt; padding-top: 7pt; border-top: 1pt solid var(--accent);
  font-size: 9pt; color: var(--muted); line-height: 1.45;
}
.footnotes .fn { margin: 2pt 0; }
.footnotes .fn-n { color: var(--primary); font-weight: 700; }
.colophon { margin-top: 10pt; font-size: 8.5pt; color: var(--muted); }
.meta-list { font-size: 9pt; color: var(--muted); }
`
}

/** Beamer-Folien: Querformat (16:9), große Type, ein Gedanke je Folie. */
export function beamerCss(fontFaceCss = '') {
  return `${fontFaceCss}
:root {${TOKENS}}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* 16:9 Folie auf A4 quer; eine Folie = eine Seite */
@page { size: 297mm 167mm; margin: 0; }

body { font-family: 'DM Sans', system-ui, sans-serif; color: var(--text); background: var(--bg); }

.slide {
  width: 297mm; height: 167mm; padding: 20mm 24mm;
  display: flex; flex-direction: column; justify-content: center;
  page-break-after: always; position: relative; background: var(--bg);
}
.slide:last-child { page-break-after: auto; }
.slide .kicker {
  font-size: 13pt; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--muted); font-weight: 600; margin-bottom: 8pt;
}
.slide h1 {
  font-family: 'Gentium Plus', serif; font-weight: 700;
  font-size: 40pt; line-height: 1.08; color: var(--primary); margin-bottom: 10pt;
}
.slide .lead { font-size: 22pt; line-height: 1.35; max-width: 80%; }
.slide ul { margin: 6pt 0 0 26pt; font-size: 20pt; line-height: 1.5; }
.slide li { margin: 6pt 0; }
.slide .accent-rule { border: 0; border-top: 2pt solid var(--accent); width: 60mm; margin: 14pt 0; }
.slide .pageno {
  position: absolute; right: 16mm; bottom: 12mm;
  font-size: 11pt; color: var(--muted);
}
.slide .src { position: absolute; left: 24mm; bottom: 12mm; font-size: 10pt; color: var(--muted); }

table.bdata { border-collapse: collapse; font-size: 19pt; margin-top: 6pt; }
table.bdata th, table.bdata td { border: 1pt solid var(--border); padding: 6pt 16pt; text-align: left; }
table.bdata th { background: #f7f4ee; font-size: 14pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
table.bdata td.num { text-align: right; font-variant-numeric: tabular-nums; }
`
}

export default { documentCss, beamerCss }
