import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Nutzungsbedingungen als Klartext für den Anhang der Bestellbestätigung.
// § 312f Abs. 2 BGB verlangt den Vertragsinhalt auf einem dauerhaften
// Datenträger – ein Link auf die Webseite genügt dafür nicht, sie kann sich
// ändern. Quelle ist dieselbe Datei, die unter /nutzungsbedingungen.html
// ausgeliefert wird; gelesen wird bei jedem Versand, damit der Anhang immer
// die beim Kauf gültige Fassung enthält.
export const NUTZUNGSBEDINGUNGEN_PFAD = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'nutzungsbedingungen.html')

const ENTITAETEN = {
  // geschützt bleibt geschützt: „6,99 €“ und „§ 19“ bricht der Umbruch nicht
  nbsp: ' ', thinsp: ' ', shy: '', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", middot: '·',
}

const ZEILENBREITE = 76

// Bricht eine Zeile an Wortgrenzen um; Folgezeilen eines Listenpunkts rücken
// unter den Text ein.
function umbrechen(zeile) {
  const einzug = zeile.startsWith('– ') ? '  ' : ''
  const zeilen = []
  let aktuell = ''
  for (const wort of zeile.split(' ')) {
    if (aktuell && aktuell.length + 1 + wort.length > ZEILENBREITE) {
      zeilen.push(aktuell)
      aktuell = einzug + wort
    } else {
      aktuell = aktuell ? `${aktuell} ${wort}` : wort
    }
  }
  zeilen.push(aktuell)
  return zeilen.join('\n')
}

export function htmlZuText(html) {
  const wrapper = html.match(/<div class="wrapper">([\s\S]*)<\/div>\s*<\/body>/)?.[1] ?? html
  return wrapper
    .replace(/<a class="back"[\s\S]*?<\/a>/g, '')
    .replace(/<footer>[\s\S]*?<\/footer>/g, '')
    .replace(/<span class="ipa">[\s\S]*?<\/span>/g, '')
    .replace(/<p class="overline">[\s\S]*?<\/p>/g, '')
    // Umbrüche im Quelltext sind Formatierung, keine Absätze
    .replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<li>/g, '– ')
    .replace(/<\/(h1|h2|h3|p|li|ul)>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|[a-z]+);/g, (m, name) =>
      name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : (ENTITAETEN[name] ?? m))
    .split('\n')
    .map((zeile) => umbrechen(zeile.replace(/ +/g, ' ').trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'
}

export function nutzungsbedingungenAlsText(pfad = NUTZUNGSBEDINGUNGEN_PFAD) {
  return `Signifikation – ${htmlZuText(readFileSync(pfad, 'utf8'))}`
}
