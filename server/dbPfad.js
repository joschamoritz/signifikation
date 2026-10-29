// Pfad der Spieldaten-DB, ohne die Verbindung zu öffnen. db.js öffnet beim Import und migriert;
// Worker-Threads, die nur lesen wollen (belegPruefung/details.js), brauchen nur den Pfad.
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DB_PATH = process.env.APP_DB || join(__dirname, 'data', 'signifikation.db')
