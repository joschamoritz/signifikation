/**
 * scripts/preview-worksheet.mjs
 *
 * Rendert die neuen Arbeitsblätter (Content-Modell → HTML) für die Web-Vorschau.
 * Schreibt gen-station-<n>-<level>.html in design/worksheet-prototype/, wo sie der
 * lokale Static-Server (design/worksheet-prototype/_serve.cjs) ausliefert.
 * Nur Dev-Vorschau; die echte PDF-Pipeline nutzt render.js mit @font-face aus fonts.js.
 *
 *   node scripts/preview-worksheet.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import worksheet1 from '../server/course/worksheet/station-1.js'
import worksheet2 from '../server/course/worksheet/station-2.js'
import worksheet3 from '../server/course/worksheet/station-3.js'
import worksheet4 from '../server/course/worksheet/station-4.js'
import worksheet5 from '../server/course/worksheet/station-5.js'
import { renderWorksheetHtml, renderErwartungshorizontHtml } from '../server/course/worksheet/render.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'design', 'worksheet-prototype')
mkdirSync(OUT, { recursive: true })

const stations = [worksheet1, worksheet2, worksheet3, worksheet4, worksheet5]
let count = 0
for (const st of stations) {
  for (const level of Object.keys(st.levels)) {
    const lv = level.toLowerCase()
    const ab = renderWorksheetHtml(st, level, { web: true })
    writeFileSync(join(OUT, `gen-station-${st.stationNo}-${lv}.html`), ab)
    const lo = renderErwartungshorizontHtml(st, level, { web: true })
    writeFileSync(join(OUT, `gen-station-${st.stationNo}-${lv}-loesung.html`), lo)
    console.log(`geschrieben: gen-station-${st.stationNo}-${lv}.html + -loesung.html`)
    count += 2
  }
}
console.log(`fertig: ${count} Blätter.`)
