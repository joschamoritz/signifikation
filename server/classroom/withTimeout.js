/**
 * server/classroom/withTimeout.js
 *
 * Promise mit hartem Timeout. Schützt async-Operationen davor, einen Request
 * unbegrenzt zu blockieren — konkret den content_snapshot-Aufbau, der aus
 * wortprofil.db/belege.db liest. Hängt eine Sekundär-DB (voller Storage,
 * laufendes Backup, blockierter FTS5-Index), würde der „Anlegen"/„Starten"-
 * Request der Lehrkraft sonst ewig hängen (Node ist single-threaded).
 */
export function withTimeout(promise, ms, label = 'operation') {
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label} nach ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
