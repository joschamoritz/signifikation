/**
 * server/course/beamer/strecken.js
 *
 * Querformat-Beamer-Folien (16:9) auf Basis von tools/instagram-kollokation.html.
 * Die vier Strecken der Instagram-Vorlage werden den Kurs-Stationen zugeordnet:
 *
 *   Strecke „Spektrum“   (Was ist eine Kollokation?) → Station ①  Kollokationen
 *   Strecke „Übersetzen“ (Konventionen wechseln)     → Station ①  Kollokationen
 *   Strecke „logDice“    (Wie exklusiv?)             → Station ④  Korpus
 *   Strecke „Daten“      (Woher kommen die Daten?)    → Station ④  Korpus
 *
 * Corporate Design der Vorlage bleibt erhalten (Pergament/Rot/Gold, Gentium +
 * DM Sans, rote Randstreifen, Goldlinien), Type ist beamertauglich groß.
 * Alle logDice-Zahlen und Beispiel-Kollokationen werden ZUR LAUFZEIT aus
 * wortprofil.db gespeist (siehe corpus.mjs) – nichts ist hartcodiert. Die
 * Übersetzungs-Strecke ist redaktionell (englische Äquivalente sind aus einem
 * einsprachigen Korpus nicht ableitbar).
 *
 * Reine String-Builder ohne DB-/FS-Zugriff → unit-testbar. Fonts werden erst
 * vom Renderer (server/course/pdf/render.js) Base64 eingebettet; hier genügt
 * der erste <style>-Block.
 */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/** Zahl → deutsches Dezimalkomma: 10.6 → „10,6“. */
const v = (n) => String(n).replace('.', ',')

// ── CSS (Querformat, CD der Instagram-Vorlage) ───────────────────────────────
const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:297mm 167mm;margin:0}
:root{
  --r:#9b1c1c;--g:#c9a84c;--bg:#faf9f7;--dk:#1a1510;--mu:#8a8070;
  --serif:'Gentium Plus',Georgia,serif;--sans:'DM Sans',system-ui,sans-serif;
}
body{font-family:var(--sans);color:var(--dk);background:var(--bg)}

.slide{
  position:relative;width:297mm;height:167mm;background:var(--bg);overflow:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:26mm 26mm 22mm;page-break-after:always;
}
.slide:last-child{page-break-after:auto}
.stripe-t,.stripe-b{position:absolute;left:0;right:0;height:7mm;background:var(--r)}
.stripe-t{top:0}.stripe-b{bottom:0}
.kicker{
  position:absolute;top:11mm;left:0;right:0;text-align:center;
  font:600 11pt/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--mu)
}
.foot{
  position:absolute;bottom:9mm;left:0;right:0;text-align:center;
  font:italic 12pt/1 var(--serif);color:var(--g);letter-spacing:.04em
}
.pageno{position:absolute;right:13mm;bottom:8mm;font:400 9pt/1 var(--sans);color:var(--mu)}
.duden{width:64mm;display:flex;flex-direction:column;gap:2.5pt;margin:9pt 0}
.duden span{display:block;height:1.4pt;background:var(--g)}
.stage{display:flex;flex-direction:column;align-items:center;text-align:center;gap:0}

/* Cover */
.cover-no{font:400 150pt/1 var(--serif);color:var(--r);margin-bottom:2pt}
.cover-title{font:700 50pt/1.05 var(--serif);color:var(--dk);letter-spacing:-.01em}
.cover-sub{font:300 17pt/1.4 var(--sans);color:var(--mu);margin-top:4pt;letter-spacing:.02em}

/* Hook / Titel */
.h-title{font:700 38pt/1.12 var(--serif);color:var(--dk);text-align:center;letter-spacing:-.01em}
.tag{font:300 18pt/1.4 var(--sans);color:var(--mu);text-align:center;max-width:210mm}

/* S1 Paare */
.pairs{display:flex;flex-direction:column;gap:11pt;align-items:center}
.pair{display:flex;align-items:baseline;gap:16pt}
.mk{font:600 26pt/1 var(--sans);width:30pt;text-align:center}
.mk.ok{color:var(--r)}.mk.no{color:var(--mu)}
.pw{font:700 40pt/1 var(--serif)}
.pw.ok{color:var(--r)}.pw.no{color:var(--mu);font-weight:400}
.pv{font:400 14pt/1 var(--sans);color:var(--mu);font-variant-numeric:tabular-nums}

/* S2 Spektrum */
.spec{width:100%;display:flex;flex-direction:column;gap:0}
.spec-cols{display:flex;width:100%;align-items:stretch}
.spec-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:8pt;padding:14pt 12pt}
.spec-col.center{border-left:1px solid #e0d9cf;border-right:1px solid #e0d9cf;background:rgba(155,28,28,.05)}
.spec-type{font:600 12pt/1 var(--sans);letter-spacing:.16em;text-transform:uppercase}
.spec-type.dim{color:var(--mu)}.spec-type.hot{color:var(--r)}
.spec-word{font:700 24pt/1.1 var(--serif);text-align:center}
.spec-word.dim{color:var(--mu)}.spec-word.hot{color:var(--r)}
.spec-desc{font:300 13pt/1.4 var(--sans);color:var(--mu);text-align:center}
.spec-bar{display:flex;width:100%;height:6pt;margin-top:4pt}
.spec-bar .l,.spec-bar .rr{flex:1;background:#c8c0b4}
.spec-bar .c{width:33.333%;background:var(--r)}
.spec-arrow{display:flex;width:100%}
.spec-arrow .sp{flex:1}
.spec-arrow .ce{width:33.333%;display:flex;justify-content:center;padding-top:3pt}
.tri{width:0;height:0;border-left:9pt solid transparent;border-right:9pt solid transparent;border-top:10pt solid var(--r)}

/* S3 Statkarten */
.stats{display:flex;gap:22pt;width:100%}
.stat{flex:1;display:flex;flex-direction:column;align-items:center;gap:9pt;
  padding:22pt 18pt;border:1px solid #e0d9cf;border-radius:4px;background:rgba(201,168,76,.06)}
.stat-val{font:700 34pt/1 var(--serif);color:var(--r);text-align:center}
.stat-lbl{font:600 13pt/1 var(--sans);color:var(--dk);text-transform:uppercase;letter-spacing:.1em}
.stat-desc{font:300 14pt/1.45 var(--sans);color:var(--mu);text-align:center}

/* LD1 Vergleich */
.cmp{width:100%;display:flex;flex-direction:column;gap:20pt}
.cmp-row{display:flex;align-items:center;gap:22pt;width:100%}
.cmp-lbl{font:400 22pt/1 var(--serif);width:84mm;text-align:right;flex-shrink:0}
.cmp-lbl.hot{color:var(--r);font-weight:700}.cmp-lbl.dim{color:var(--mu)}
.cmp-track{flex:1}
.cmp-bar{height:11pt;border-radius:6pt}
.cmp-bar.hot{background:var(--r)}.cmp-bar.dim{background:#c8c0b4}
.cmp-val{font:700 30pt/1 var(--serif);width:28mm;flex-shrink:0;font-variant-numeric:tabular-nums}
.cmp-val.hot{color:var(--r)}.cmp-val.dim{color:var(--mu)}

/* LD2 Formel */
.fbox{width:100%;background:rgba(155,28,28,.05);border:1.5px solid rgba(155,28,28,.18);
  border-radius:6px;padding:22pt 30pt;display:flex;flex-direction:column;align-items:center;gap:18pt}
.frow{display:flex;align-items:center;gap:14pt;flex-wrap:wrap;justify-content:center}
.fpre{font:400 italic 24pt/1 var(--serif);color:var(--dk)}
.frac{display:inline-flex;flex-direction:column;align-items:center}
.fnum{font:700 italic 21pt/1.3 var(--serif);color:var(--r);padding:0 10pt}
.fline{width:100%;height:1.5pt;background:var(--r)}
.fden{font:400 italic 21pt/1.3 var(--serif);color:var(--r);padding:0 10pt}
.fparts{width:100%;display:flex;flex-direction:column;gap:8pt}
.fpart{display:flex;align-items:baseline;gap:16pt}
.fkey{font:700 italic 16pt/1 var(--serif);color:var(--r);width:64pt;flex-shrink:0;text-align:right}
.fdesc{font:300 15pt/1.35 var(--sans);color:var(--mu)}
.fnote{font:300 16pt/1.45 var(--sans);color:var(--mu);text-align:center}

/* LD3 Skala */
.scale{width:100%;display:flex;flex-direction:column}
.scale-ends{display:flex;justify-content:space-between;font:300 14pt/1 var(--sans);color:var(--mu);margin-bottom:9pt}
.scale-track{width:100%;height:9pt;background:linear-gradient(to right,#c8c0b4,var(--r));border-radius:5pt;position:relative;margin-bottom:20pt}
.scale-tick{position:absolute;top:-7pt;width:2px;height:23pt;background:rgba(26,21,16,.3);transform:translateX(-50%)}
.scale-items{position:relative;width:100%;height:90pt}
.scale-item{position:absolute;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5pt}
.si-val{font:700 24pt/1 var(--serif);font-variant-numeric:tabular-nums}
.si-word{font:400 13pt/1.15 var(--serif);text-align:center;max-width:40mm}
.si-qual{font:300 11pt/1 var(--sans);color:var(--mu);text-transform:uppercase;letter-spacing:.1em}
.hot .si-val{color:var(--r)}.hot .si-word{color:var(--dk);font-weight:700}
.mid .si-val{color:#7a5a30}.mid .si-word{color:#5a4020}
.dim .si-val{color:var(--mu)}.dim .si-word{color:var(--mu)}

/* DA1 Zahl */
.bignum{font:700 76pt/1 var(--serif);color:var(--r);text-align:center;letter-spacing:-.02em}
.bigunit{font:300 15pt/1 var(--sans);color:var(--mu);text-transform:uppercase;letter-spacing:.13em;margin-top:6pt}
.chips{display:flex;flex-wrap:wrap;gap:8pt;justify-content:center;max-width:220mm}
.chip{font:300 13pt/1 var(--sans);color:var(--mu);padding:6pt 14pt;border:1px solid #ddd8ce;border-radius:14pt}
.live{font:400 14pt/1.4 var(--sans);color:var(--dk);text-align:center}
.live b{color:var(--r);font-weight:600}

/* DA2 Pipeline */
.flow{display:grid;grid-template-columns:1fr 1fr;gap:8pt 30pt;width:100%}
.step{display:flex;align-items:flex-start;gap:14pt;padding:8pt 0;border-bottom:1px solid #e8e2d8}
.step-no{font:400 italic 22pt/1 var(--serif);color:var(--g);width:24pt;flex-shrink:0}
.step-h{font:700 15pt/1.2 var(--sans);color:var(--dk)}
.step-p{font:300 12.5pt/1.35 var(--sans);color:var(--mu)}

/* DA3 / Mapping */
.map{width:100%;display:flex;flex-direction:column}
.map-row{display:flex;align-items:center;gap:16pt;padding:9pt 0;border-bottom:1px solid #e8e2d8}
.map-row:first-child{border-top:1px solid #e8e2d8}
.map-tag{font:400 italic 22pt/1 var(--serif);color:var(--g);width:30pt;flex-shrink:0;text-align:center}
.map-desc{font:300 16pt/1.35 var(--sans);color:var(--dk)}
.map-desc b{color:var(--dk);font-weight:700}

/* TR Übersetzen */
.tr-cols{width:100%;display:flex;align-items:stretch}
.tr-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:12pt;padding:14pt 18pt}
.tr-col.right{border-left:1px solid #e0d9cf}
.tr-lang{font:600 12pt/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--mu)}
.tr-phrase{font:700 32pt/1.1 var(--serif);color:var(--dk);text-align:center}
.hi{color:var(--r)}
.tr-opts{display:flex;flex-direction:column;gap:10pt}
.tr-opt{display:flex;align-items:center;gap:12pt}
.tr-mk{font:600 22pt/1 var(--sans);width:26pt;text-align:center}
.tr-mk.ok{color:var(--r)}.tr-mk.no{color:var(--mu)}
.tr-en{font:400 24pt/1.15 var(--serif);color:var(--dk)}
.tr-en.no{font-size:20pt;color:var(--mu);text-decoration:line-through;text-decoration-color:var(--mu)}
.tr-note{font:300 italic 17pt/1.45 var(--serif);color:var(--mu);text-align:center}
.tr-table{width:100%;display:flex;flex-direction:column}
.tr-trow{display:flex;align-items:center;padding:13pt 0;border-bottom:1px solid #e8e2d8}
.tr-trow:first-child{border-top:1px solid #e8e2d8}
.tr-de{flex:1;font:700 22pt/1.15 var(--serif);color:var(--dk);text-align:right;padding-right:20pt}
.tr-arr{font:300 18pt/1 var(--sans);color:var(--mu)}
.tr-rt{flex:1;padding-left:20pt;display:flex;flex-direction:column;gap:2pt}
.tr-rt .w{font:400 16pt/1 var(--serif);color:var(--mu);text-decoration:line-through}
.tr-rt .r{font:700 22pt/1.15 var(--serif);color:var(--r)}
.blocks{width:100%;display:flex;flex-direction:column;gap:16pt}
.block{padding:18pt 24pt;display:flex;flex-direction:column;gap:7pt;border:1px solid #e0d9cf;border-radius:4px}
.block-n{font:400 italic 22pt/1 var(--serif);color:var(--g)}
.block-h{font:700 20pt/1.2 var(--sans);color:var(--dk)}
.block-p{font:300 15pt/1.45 var(--sans);color:var(--mu)}
`

// ── Slide-Hülle ──────────────────────────────────────────────────────────────
function slide(kicker, inner) {
  return `<section class="slide">
  <div class="stripe-t"></div><div class="stripe-b"></div>
  <div class="kicker">${esc(kicker)}</div>
  <div class="stage">${inner}</div>
  <div class="foot">signifikation.de</div>
</section>`
}
const dudenRule = '<div class="duden"><span></span><span></span></div>'

// ── Cover-Folien ─────────────────────────────────────────────────────────────
function cover(no, title, sub) {
  return `<section class="slide">
  <div class="stripe-t"></div><div class="stripe-b"></div>
  <div class="kicker">Signifikation · Linguistik im Korpus</div>
  <div class="stage">
    <div class="cover-no">${esc(no)}</div>
    ${dudenRule}
    <h1 class="cover-title">${esc(title)}</h1>
    <p class="cover-sub">${esc(sub)}</p>
  </div>
  <div class="foot">signifikation.de · Täglich spielen</div>
</section>`
}

// ── Strecke „Spektrum“ (Station ①) ───────────────────────────────────────────
function spektrumHook(k, d) {
  return slide(k, `
    <h1 class="h-title">Was ist eine Kollokation?</h1>
    ${dudenRule}
    <div class="pairs">
      <div class="pair"><span class="mk ok">✓</span><span class="pw ok">${esc(d.strong.word)}</span><span class="pv">logDice ${v(d.strong.val)}</span></div>
      <div class="pair"><span class="mk no">·</span><span class="pw no">${esc(d.weak.word)}</span><span class="pv">logDice ${v(d.weak.val)}</span></div>
    </div>
    ${dudenRule}
    <p class="tag">Beide grammatisch korrekt — aber „${esc(d.strong.adj)}“ ist die typische Verbindung zu „${esc(d.lemma)}“.</p>`)
}
function spektrumSpektrum(k, d) {
  return slide(k, `
    <h1 class="h-title">Kollokationen liegen dazwischen</h1>
    <div class="spec">
      <div class="spec-cols">
        <div class="spec-col"><div class="spec-type dim">Frei</div><div class="spec-word dim">rotes Auto</div><div class="spec-desc">beliebig kombinierbar</div></div>
        <div class="spec-col center"><div class="spec-type hot">Kollokation</div><div class="spec-word hot">${esc(d.strong.word)}</div><div class="spec-desc">konventionalisiert,<br>semantisch motiviert</div></div>
        <div class="spec-col"><div class="spec-type dim">Idiom</div><div class="spec-word dim">ins Gras beißen</div><div class="spec-desc">nicht kompositionell</div></div>
      </div>
      <div class="spec-bar"><div class="l"></div><div class="c"></div><div class="rr"></div></div>
      <div class="spec-arrow"><div class="sp"></div><div class="ce"><div class="tri"></div></div><div class="sp"></div></div>
    </div>`)
}
function spektrumDaten(k, d) {
  return slide(k, `
    <h1 class="h-title">Gemessen im Korpus</h1>
    <div class="stats">
      <div class="stat"><div class="stat-val">logDice</div><div class="stat-lbl">Assoziationswert</div><div class="stat-desc">Je höher, desto charakteristischer die Verbindung im Korpus.</div></div>
      <div class="stat"><div class="stat-val">≈ 2 Mrd.</div><div class="stat-lbl">Textwörter</div><div class="stat-desc">Datenbasis aus freien deutschsprachigen Korpora (CC&nbsp;BY-SA).</div></div>
    </div>
    <p class="tag">Beispiel: „${esc(d.strong.word)}“ erreicht logDice ${v(d.strong.val)} (Frequenz ${d.strong.freq.toLocaleString('de-DE')}).</p>`)
}

// ── Strecke „logDice“ (Station ④) ────────────────────────────────────────────
function logdiceHook(k, d) {
  return slide(k, `
    <h1 class="h-title">Nicht wie oft —<br>sondern wie exklusiv.</h1>
    ${dudenRule}
    <div class="cmp">
      <div class="cmp-row"><div class="cmp-lbl hot">${esc(d.strong.word)}</div><div class="cmp-track"><div class="cmp-bar hot" style="width:${d.strong.pct}%"></div></div><div class="cmp-val hot">${v(d.strong.val)}</div></div>
      <div class="cmp-row"><div class="cmp-lbl dim">${esc(d.weak.word)}</div><div class="cmp-track"><div class="cmp-bar dim" style="width:${d.weak.pct}%"></div></div><div class="cmp-val dim">${v(d.weak.val)}</div></div>
    </div>
    ${dudenRule}
    <p class="tag">Häufigkeit lügt. logDice misst Typizität.</p>`)
}
function logdiceFormel(k, d) {
  return slide(k, `
    <h1 class="h-title">Was logDice misst</h1>
    <div class="fbox">
      <div class="frow">
        <span class="fpre">logDice = 14 + log₂</span>
        <div class="frac"><div class="fnum">2 · f(A, B)</div><div class="fline"></div><div class="fden">f(A) + f(B)</div></div>
      </div>
      <div class="fparts">
        <div class="fpart"><span class="fkey">f(A, B)</span><span class="fdesc">A und B gemeinsam im Korpus</span></div>
        <div class="fpart"><span class="fkey">f(A)</span><span class="fdesc">A allein im Korpus</span></div>
        <div class="fpart"><span class="fkey">f(B)</span><span class="fdesc">B allein im Korpus</span></div>
      </div>
    </div>
    <p class="fnote">Je exklusiver die Verbindung, desto näher an 14 — „${esc(d.strong.word)}“ liegt bei ${v(d.strong.val)}.</p>`)
}
function logdiceSkala(k, d) {
  const [dim, mid, hot] = d.scale
  const item = (cls, s) => `<div class="scale-item ${cls}" style="left:${s.pct}%">
    <div class="si-val">${v(s.val)}</div><div class="si-word">${esc(s.adj)}</div><div class="si-qual">${esc(s.qual)}</div></div>`
  return slide(k, `
    <h1 class="h-title">Die Skala</h1>
    <div class="scale">
      <div class="scale-ends"><span>0</span><span>14</span></div>
      <div class="scale-track">
        <div class="scale-tick" style="left:${dim.pct}%"></div>
        <div class="scale-tick" style="left:${mid.pct}%"></div>
        <div class="scale-tick" style="left:${hot.pct}%"></div>
      </div>
      <div class="scale-items">
        ${item('dim', dim)}${item('mid', mid)}${item('hot', hot)}
      </div>
    </div>
    <p class="tag">Alle Werte für „${esc(d.lemma)}“ — live aus dem Signifikation-Korpus.</p>`)
}

// ── Strecke „Daten“ (Station ④) ──────────────────────────────────────────────
const KORPORA = ['Bundestag-Protokolle', 'Gesetze im Internet', 'German Pol. Speeches',
  'Reichstagsprotokolle', 'Deutsches Textarchiv', 'DiBiLit', 'GEI-Digital', 'Wikibooks']
function datenZahl(k, d, dbSize) {
  return slide(k, `
    <h1 class="h-title">Woher weiß Signifikation, was typisch ist?</h1>
    <div><div class="bignum">2.190.000.000</div><div class="bigunit">Textwörter · 15 freie Korpora</div></div>
    <div class="chips">${KORPORA.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>
    <p class="live">Wortprofil-DB <b>${esc(dbSize)}</b> · stärkste Verbindung zu „${esc(d.lemma)}“: <b>${esc(d.strong.word)}</b> (logDice ${v(d.strong.val)})</p>`)
}
const PIPELINE = [
  ['①', 'Korpusauswahl', '15 freie Korpora · CC BY-SA · ~2,19 Mrd. Wörter'],
  ['②', 'Normalisierung', 'Tokenisierung · Satzgrenzen · Bereinigung'],
  ['③', 'Relationen-Mapping', 'SUBJA, OBJA, ATTR, KON … definieren'],
  ['④', 'Dependenzanalyse', 'de_zdl_lg (BBAW/ZDL) · Tripel aus Satzstrukturen'],
  ['⑤', 'Frequenz-Aggregation', 'f(A), f(B), f(A,B) über das Korpus zählen'],
  ['⑥', 'logDice & Ranking', 'Assoziationsstärke pro Wortpaar → Wortprofil-DB'],
]
function datenPipeline(k) {
  const steps = PIPELINE.map(([n, h, p]) =>
    `<div class="step"><div class="step-no">${n}</div><div><div class="step-h">${esc(h)}</div><div class="step-p">${esc(p)}</div></div></div>`).join('')
  return slide(k, `
    <h1 class="h-title">Von Text zu Wortprofil</h1>
    <div class="flow">${steps}</div>`)
}
const SPIELE = [
  ['①', '<b>Kollokationen</b> – die 3 stärksten Verbindungen in Reihenfolge'],
  ['②', '<b>Wort-Zwilling</b> – zwei ähnliche Wörter an ihren Kollokationen erkennen'],
  ['③', '<b>Zeitenwende</b> – Kollokation vor oder nach 2000?'],
  ['④', '<b>Lückenfüller</b> – Kollokation im echten Korpussatz ergänzen'],
]
function datenSpiele(k) {
  const rows = SPIELE.map(([t, desc]) =>
    `<div class="map-row"><div class="map-tag">${t}</div><div class="map-desc">${desc}</div></div>`).join('')
  return slide(k, `
    <h1 class="h-title">Das Ergebnis: 4 tägliche Spiele</h1>
    <div class="map">${rows}</div>
    <p class="tag">Alle Daten aus echten deutschen Texten — gerankt nach logDice.</p>`)
}

// ── Strecke „Übersetzen“ (Station ①, redaktionell) ───────────────────────────
function uebHook(k) {
  return slide(k, `
    <h1 class="h-title">Übersetzen heißt:<br>Konventionen wechseln.</h1>
    ${dudenRule}
    <div class="tr-cols">
      <div class="tr-col"><div class="tr-lang">Deutsch</div><div class="tr-phrase"><span class="hi">starker</span> Regen</div></div>
      <div class="tr-col right"><div class="tr-lang">Englisch</div>
        <div class="tr-opts">
          <div class="tr-opt"><span class="tr-mk no">✗</span><span class="tr-en no">strong rain</span></div>
          <div class="tr-opt"><span class="tr-mk ok">✓</span><span class="tr-en"><span class="hi">heavy</span> rain</span></div>
        </div>
      </div>
    </div>
    ${dudenRule}
    <p class="tr-note">„stark“ heißt strong — aber Regen verlangt heavy.</p>`)
}
const TR_ROWS = [
  ['starker Regen', 'strong rain', 'heavy rain'],
  ['schwerer Fehler', 'heavy mistake', 'serious mistake'],
  ['Zähne putzen', 'wash teeth', 'brush teeth'],
]
function uebTabelle(k) {
  const rows = TR_ROWS.map(([de, w, r]) =>
    `<div class="tr-trow"><div class="tr-de">${esc(de)}</div><div class="tr-arr">→</div><div class="tr-rt"><div class="w">${esc(w)}</div><div class="r">${esc(r)}</div></div></div>`).join('')
  return slide(k, `
    <h1 class="h-title">Wörtlich übersetzt — aber falsch.</h1>
    <div class="tr-table">${rows}</div>
    <p class="tag">Wörterbücher übersetzen Wörter — Korpora übersetzen Konventionen.</p>`)
}
function uebImplikation(k) {
  return slide(k, `
    <h1 class="h-title">Was folgt daraus?</h1>
    <div class="blocks">
      <div class="block"><div class="block-n">①</div><div class="block-h">Wörterbücher reichen nicht.</div><div class="block-p">Sie übersetzen Wörter — nicht die Konvention dahinter. Kollokationen folgen keiner ableitbaren Regel.</div></div>
      <div class="block"><div class="block-n">②</div><div class="block-h">Lernen heißt: Exposition.</div><div class="block-p">Kollokationen verinnerlicht man durch Lesen — oder durch gezieltes tägliches Üben.</div></div>
    </div>`)
}

// ── Deck-Komposition ─────────────────────────────────────────────────────────
function htmlDoc(title, body) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>${CSS}</style></head><body>${body}</body></html>`
}

/**
 * Baut den vollständigen Foliensatz (HTML) für eine Station.
 * @param {'1'|'4'} station
 * @param {object} data  Ergebnis aus getCorpusData(lemma)
 * @param {string} dbSize  formatierte DB-Größe (fmtBytes)
 * @returns {{ title, filename, html }}
 */
export function buildDeckHtml(station, data, dbSize) {
  let slides, title, filename
  if (String(station) === '1') {
    const ks = 'Station ① · Kollokationen · Spektrum'
    const ku = 'Station ① · Kollokationen · Übersetzen'
    slides = [
      cover('①', 'Kollokationen', 'Strecken: Spektrum · Übersetzen'),
      spektrumHook(ks, data), spektrumSpektrum(ks, data), spektrumDaten(ks, data),
      uebHook(ku), uebTabelle(ku), uebImplikation(ku),
    ]
    title = 'Beamer · Station ① Kollokationen'
    filename = 'beamer-station-1-kollokationen.pdf'
  } else {
    const kl = 'Station ④ · Korpus · logDice'
    const kd = 'Station ④ · Korpus · Daten'
    slides = [
      cover('④', 'Korpus', 'Strecken: logDice · Daten'),
      logdiceHook(kl, data), logdiceFormel(kl, data), logdiceSkala(kl, data),
      datenZahl(kd, data, dbSize), datenPipeline(kd), datenSpiele(kd),
    ]
    title = 'Beamer · Station ④ Korpus'
    filename = 'beamer-station-4-korpus.pdf'
  }
  // Seitenzahlen pro Folie (nach der Stage, vor </section>)
  const total = slides.length
  const withNo = slides.map((s, i) =>
    s.replace('</section>', `<div class="pageno">${i + 1} / ${total}</div></section>`))
  return { title, filename, html: htmlDoc(title, withNo.join('\n')) }
}

export default buildDeckHtml
