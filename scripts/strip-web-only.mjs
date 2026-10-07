// Entfernt Inhalte, die nur im Web laufen sollen, aus dist/ – vor `cap sync`,
// damit sie nicht ins iOS-/Android-Bundle gelangen.
// dist/unterricht: Unterrichtstools für signifikation.de (Fallakte, Handelsreise …)
import { rmSync } from 'node:fs'

const NUR_WEB = ['dist/unterricht']

for (const pfad of NUR_WEB) {
  rmSync(pfad, { recursive: true, force: true })
  console.log(`strip-web-only: ${pfad} entfernt`)
}
