/**
 * Reproduzierbarer, je Nummer verschiedener Satzzusatz für Belege-Fixtures.
 *
 * Seit dem Dublettenfilter in `besteBelege()` gelten Schablonen-Sätze, die sich nur in
 * einer Zahl unterscheiden („… bauen, Nummer 12.“), als Nahdubletten – echte Korpussätze
 * tun das nicht. Der Zusatz besteht aus Kunstwörtern aus zufälligen Silben und macht jeden
 * Fixture-Satz so verschieden wie zwei echte; mit keinem Suchwort der Tests verwechselbar.
 */
const SILBEN = [
  'ka', 'lo', 'mi', 'tu', 'ber', 'son', 'gri', 'fla', 'dro', 'pel', 'wun', 'zet', 'hab', 'quo',
  'rix', 'vel', 'nam', 'tos', 'jup', 'kre', 'sil', 'mau', 'gof', 'bim', 'wes', 'dar', 'ulm', 'ech',
]

function* zufall(seed) {
  let x = (seed * 2654435761) >>> 0 || 1
  for (;;) {
    x ^= x << 13; x >>>= 0
    x ^= x >>> 17
    x ^= x << 5; x >>>= 0
    yield x
  }
}

/** Vierzehn Kunstwörter aus je drei Silben, durch die Nummer bestimmt. */
export function abwechslung(nummer) {
  const z = zufall(nummer + 7)
  const silbe = () => SILBEN[z.next().value % SILBEN.length]
  const woerter = Array.from({ length: 14 }, () => silbe() + silbe() + silbe())
  return `neben ${woerter.join(' ')}`
}
