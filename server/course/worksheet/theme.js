/**
 * server/course/worksheet/theme.js
 *
 * Druck-CSS für die NEUEN Kurs-Arbeitsblätter (begleitend statt Aufgabenklon).
 * Deckt das komplette Blockvokabular ab: Kopf · Wissens-Infokasten · Merke-Band ·
 * Kontinuum-Skala · Färbungs-Skala · Kontrast-Tabelle · Datenblick-Tabelle ·
 * Aufgaben (Antwortlinien + Chips) · Transfer · Fußnoten.
 *
 * Umsetzung Kurs-Didaktik-Standards §5 (DM Sans ≥12 pt, CD nur dezent: Gentium/
 * Rot #9b1c1c/Gold; kein Deko; Bedeutung nie nur über Farbe → Symbol+Wort).
 * Pagination: jeder Block `break-inside: avoid` → nie mitten in einer Aufgabe.
 *
 * Reine String-Funktion. `fontFaceCss` (Base64-@font-face aus pdf/fonts.js) wird
 * fürs PDF hereingereicht; die Web-Vorschau injiziert stattdessen Google-Fonts.
 * `.sheet`-Rahmen ist nur für die Bildschirm-Vorschau; im Druck greift @page.
 */

const TOKENS = `
  --bg:#fcfbf9; --surface:#ffffff; --text:#1a1a18; --muted:#5f574b;
  --primary:#9b1c1c; --accent:#c9a84c; --border:#c9bda3; --border-lt:#e0d8c8;
  --wissen-bg:#f7f4ee; --ok:#3b6d11;
`

export function worksheetCss(fontFaceCss = '') {
  return `${fontFaceCss}
:root {${TOKENS}}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4;margin:16mm 16mm 18mm}
body{font-family:'DM Sans',system-ui,sans-serif;font-size:12pt;line-height:1.5;color:var(--text);background:var(--bg)}

/* Bildschirm-Vorschau: A4-Blatt sichtbar. Im Druck neutralisiert (s. @media print). */
.sheet{width:210mm;min-height:297mm;margin:0 auto;background:var(--bg);padding:16mm 16mm 18mm}

/* Umbruch-Steuerung */
.wissen,.merke,.skala-wrap,.kontrast-wrap,.datablick,.felder-wrap,.task,.transfer,.footnotes{break-inside:avoid;page-break-inside:avoid}

/* Kopf */
.doc-kicker{font-size:8.5pt;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);font-weight:600}
.doc-title{font-family:'Gentium Plus',Georgia,serif;font-weight:700;font-size:24pt;line-height:1.1;color:var(--primary);margin:3pt 0 1pt}
.doc-ipa{font-family:'Gentium Plus',serif;font-style:italic;font-weight:400;font-size:15pt;color:var(--muted)}
.doc-sub{font-size:10.5pt;color:var(--muted)}
.gold-rule{height:0;border:0;border-top:1.4pt solid var(--accent);margin:9pt 0 0}
.meta{display:flex;flex-wrap:wrap;gap:6pt 22pt;font-size:9.5pt;color:var(--muted);margin-top:9pt}
.meta .line{display:inline-block;min-width:120pt;border-bottom:.7pt solid var(--border-lt);padding-bottom:2pt}
.meta .line.sm{min-width:60pt}

/* gemeinsame Inline-/Label-Stile */
.block-label{font-size:8.5pt;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:var(--muted);display:flex;align-items:center;gap:6pt;margin-bottom:6pt}
.block-label .ico{color:var(--primary);font-size:11pt;line-height:1}
.term{font-weight:700;color:var(--text)}
.em{font-style:italic}
.sup{font-size:.66em;vertical-align:super;color:var(--primary);font-weight:700;padding-left:1px}

/* Wissens-Infokasten */
.wissen{background:var(--wissen-bg);border:.8pt solid var(--border-lt);border-left:3pt solid var(--primary);padding:11pt 14pt;margin:16pt 0 0}
.wissen p{margin:0 0 5pt}
.wissen p:last-child{margin-bottom:0}
.fwd{font-size:10pt;color:var(--muted);font-style:italic;margin-top:6pt}
.fwd strong,.fwd .term{color:var(--primary);font-style:normal;font-weight:600}

/* Merke-Band */
.merke{display:flex;gap:10pt;align-items:flex-start;margin:12pt 0 0;padding:9pt 13pt;border:.8pt solid var(--accent);background:#fbf8ef}
.merke .tag{font-family:'Gentium Plus',serif;font-weight:700;color:var(--primary);font-size:12pt;white-space:nowrap}
.merke .txt{font-size:12pt}

/* Skala (Kontinuum + Färbung) */
.skala-wrap{margin:16pt 0 0}
.skala{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-top:8pt;border:.8pt solid var(--border-lt)}
.skala .cell{padding:9pt 11pt;border-right:.8pt solid var(--border-lt)}
.skala .cell:last-child{border-right:0}
.skala .stufe{font-size:8.5pt;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700}
.skala .bsp{font-family:'Gentium Plus',serif;font-size:13pt;margin:3pt 0 2pt;color:var(--text)}
.skala .erkl{font-size:9.5pt;color:var(--muted);line-height:1.4}
.skala-axis{display:flex;align-items:center;gap:8pt;margin-top:6pt;font-size:8.5pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.skala-axis .bar{flex:1;height:2pt;background:linear-gradient(90deg,var(--border-lt),var(--primary))}
.skala-wrap.faerbung .skala-axis .bar{background:linear-gradient(90deg,var(--primary),var(--border-lt),var(--ok))}

/* Kontrast-Tabelle (richtig/falsch) — Bedeutung über Symbol UND Wort */
.kontrast-wrap{margin:16pt 0 0}
table.kontrast{border-collapse:collapse;width:100%;margin-top:8pt;font-size:13pt}
table.kontrast th,table.kontrast td{border:.8pt solid var(--border-lt);padding:7pt 12pt;text-align:left;width:50%}
table.kontrast thead th{font-size:9.5pt;letter-spacing:.06em;text-transform:uppercase;font-weight:700;background:var(--wissen-bg)}
table.kontrast .no{color:var(--muted)}
table.kontrast .mark{font-weight:700;margin-right:5pt}
table.kontrast .mark.ok{color:var(--ok)}
table.kontrast .mark.no{color:var(--primary)}
table.kontrast .verb{font-family:'Gentium Plus',serif}
table.kontrast .note{font-size:10pt}

/* Datenblick-Tabelle (Frequenz/logDice) */
.datablick{margin:16pt 0 0}
table.data{border-collapse:collapse;width:100%;margin-top:8pt;font-size:11.5pt}
table.data caption{text-align:left;font-size:9.5pt;color:var(--muted);margin-bottom:5pt;caption-side:top}
table.data th,table.data td{border:.7pt solid var(--border-lt);padding:5pt 9pt;text-align:left}
table.data thead th{font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;background:var(--wissen-bg)}
table.data td.num,table.data th.num{text-align:right;font-variant-numeric:tabular-nums}
table.data .verb{font-family:'Gentium Plus',serif;font-size:12.5pt}
table.data tr.mark td{background:#fbf8ef}
.data-note{font-size:9.5pt;color:var(--muted);margin-top:5pt}

/* Feldermodell-Tabelle (topologische Felder: Vorfeld/Satzklammer/Mittelfeld/Nachfeld) */
.felder-wrap{margin:16pt 0 0}
table.felder{border-collapse:collapse;width:100%;margin-top:8pt;table-layout:fixed}
table.felder th,table.felder td{border:.7pt solid var(--border-lt);padding:6pt 8pt;text-align:left;vertical-align:top;overflow-wrap:break-word}
table.felder thead th{font-size:8pt;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:700;background:var(--wissen-bg)}
table.felder tbody td{font-family:'Gentium Plus',serif;font-size:12pt}
.felder-note{font-size:9.5pt;color:var(--muted);margin-top:5pt}

/* Aufgaben */
.tasks{margin-top:18pt}
.tasks-head{font-family:'Gentium Plus',serif;font-size:13pt;color:var(--primary);border-bottom:1pt solid var(--accent);padding-bottom:3pt;margin-bottom:9pt}
.task{display:grid;grid-template-columns:auto 1fr;gap:9pt;margin:0 0 13pt}
.task-no{font-family:'Gentium Plus',serif;font-weight:700;color:var(--primary);font-size:14pt;line-height:1.2;width:1.5em;text-align:center}
.task-body .op{font-weight:700}
.task-body .prompt{margin-bottom:5pt}
.answer{border-bottom:.7pt solid var(--border-lt);height:15pt;margin-top:9pt}
.answer+.answer{margin-top:11pt}
.field{margin-top:8pt}
.field .fill{display:inline-block;min-width:120pt;border-bottom:.7pt solid var(--border-lt)}
.chips{display:flex;flex-wrap:wrap;gap:5pt 8pt;margin-top:5pt}
.chip{border:.9pt solid var(--border);border-radius:3px;padding:2pt 9pt;font-size:11pt;background:var(--surface)}
.chip.serif{font-family:'Gentium Plus',serif}

/* Transfer */
.transfer{margin-top:6pt;padding:9pt 13pt;border:.8pt dashed var(--border);background:transparent}
.transfer .block-label .ico{color:var(--accent)}

/* Lösung / Erwartungshorizont */
.sol{margin:0 0 12pt;break-inside:avoid;page-break-inside:avoid}
.sol-head{display:grid;grid-template-columns:auto 1fr;gap:9pt;align-items:baseline}
.sol .prompt{font-weight:600}
.sol-erw{margin:4pt 0 0 calc(1.5em + 9pt);font-size:11.5pt}
.sol-erw .lbl{font-size:8.5pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-right:7pt}

/* Fußnoten / Kolophon */
.footnotes{margin-top:18pt;padding-top:7pt;border-top:1pt solid var(--accent);font-size:9pt;color:var(--muted);line-height:1.45}
.fn{margin:2pt 0}
.fn .n{color:var(--primary);font-weight:700;margin-right:4pt}
.colophon{margin-top:9pt;font-size:8.5pt;color:var(--muted)}

@media print{ .sheet{margin:0;padding:0;min-height:0;width:auto} }
`
}

export default { worksheetCss }
