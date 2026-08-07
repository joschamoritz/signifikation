const KEY = 'sig_cache_heute'

// Wie lange ein zwischengespeicherter Tagesinhalt als Offline-Notbehelf gilt.
// Bewusst grosszuegig: ein leicht veralteter Eintrag ist fuer den Nutzer immer
// besser als ein leerer Bildschirm, und `isOfflineFallback` macht den Zustand
// sichtbar.
const MAX_AGE_MS = 36 * 60 * 60 * 1000

export function saveHeuteCache(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, cachedAt: new Date().toISOString() }))
  } catch (_) {}
}

export function loadHeuteCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY))
    if (!cached?.datum || !cached?.lemmata) return null

    // Frueher wurde `cached.datum` (das SERVER-Datum in Europe/Berlin) gegen das
    // GERAETE-Datum geprueft. In Zeitzonen westlich von Berlin faellt beides
    // taeglich auseinander — in Kalifornien ab etwa 15 Uhr Ortszeit —, und der
    // Cache lieferte dann systematisch null, obwohl gueltige Daten vorlagen.
    // Deshalb jetzt gegen das Alter des Eintrags pruefen, nicht gegen ein
    // Datum aus einer anderen Zeitzone.
    const cachedAtMs = Date.parse(cached.cachedAt ?? '')
    if (!Number.isFinite(cachedAtMs)) return null
    if (Date.now() - cachedAtMs > MAX_AGE_MS) return null

    return cached
  } catch (_) {
    return null
  }
}
