// Gemeinsame CSV-Zelle für die Admin-Exporte (Nutzer, Statistik).
//
// Schutz vor CSV-/Formel-Einschleusung (OWASP „CSV Injection“): Excel und
// LibreOffice führen Zellen, die mit = + - @ Tab oder CR beginnen, als Formel
// aus. Namen und E-Mail-Adressen sind Nutzereingaben, ein Name wie
// `=HYPERLINK(…)` würde sonst beim Öffnen des Exports ausgeführt. Solche Zellen
// bekommen ein vorangestelltes `'` (wird als Text angezeigt, nicht ausgewertet).
//
// Deutsches Excel trennt Spalten am Semikolon, englische Einstellungen und der
// Textimport am Komma (oder Tab). Landet ein Wert in so einer Umgebung, kann eine
// Zelle an `;`, `,` oder Tab zerfallen: In `x;=1+1;y` stünde dann `=1+1` am Anfang
// einer eigenen Zelle. Deshalb wird jedes Segment hinter einem Trennzeichen
// ebenso entschärft, auch wenn davor Leerzeichen oder Anführungszeichen stehen
// (`x;"=1+1`, ` =1+1`), und Zellen mit `;` kommen in Anführungszeichen.
// Kein `sep=`-Kopf: Er bricht andere CSV-Parser.
// Echte Zahlen (typeof number) bleiben unverändert, sonst würde aus -1 ein Text.

// Zellanfang: Formelzeichen, auch nach Leerzeichen, Tabs oder Anführungszeichen
const FORMEL_ANFANG = /^[ \t"]*[=+\-@\t\r\n]/
// Position hinter einem Trennzeichen (samt Leerzeichen, Tabs, Anführungszeichen), an der eine Formel beginnen würde
const SEGMENT_FORMEL = /([;,\t\r\n][ \t"]*)(?=[=+\-@])/g

export function toCsvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  let s = String(value ?? '')
  if (FORMEL_ANFANG.test(s)) s = `'${s}`
  s = s.replace(SEGMENT_FORMEL, "$1'")
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
