// Anzeigenamen der vier Spielmodi — EINE zentrale Quelle.
// Vorher war dieses Objekt 5× identisch dupliziert (LiveStep, EndStep,
// SessionListStep, WaitingState, exportResults); ein Modus-Namenswechsel
// hätte alle fünf Stellen gebraucht.
export const MODE_LABEL = {
  kollokationen:  'Kollokationen',
  wortzwilling:   'Wort-Zwilling',
  zeitenwende:    'Zeitenwende',
  lueckenfueller: 'Lückenfüller',
}

// Tolerant gegen unbekannte/leere Modi: Fallback auf den Roh-Wert.
export function modeLabel(mode) {
  return MODE_LABEL[mode] || mode || ''
}
