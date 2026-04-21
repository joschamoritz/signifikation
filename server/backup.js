/**
 * backup.js – Automatisches Backup nach GitHub Gist
 *
 * Hält die letzten KEEP_COUNT Gists (Standard: 5).
 * Wird täglich via Railway Cron aufgerufen: node server/backup.js
 */
import { loadReadOnly, loadStatsRows } from './store.js'
import logger from './logger.js'

const GIST_TOKEN  = process.env.GITHUB_GIST_TOKEN
const KEEP_COUNT  = parseInt(process.env.BACKUP_KEEP ?? '5')
const GIST_DESC   = 'Signifikation Backup'
const FILES       = ['kalender.json', 'lemmata.json', 'zeitreise.json', 'wortzwilling.json', 'zeitenwende.json', 'stats.json']

async function gistFetch(path, options = {}) {
  const res = await fetch(`https://api.github.com/gists${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${GIST_TOKEN}`,
      'Accept':        'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':  'application/json',
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub API ${res.status}: ${body}`)
  }
  return res.json()
}

export async function runBackup() {
  if (!GIST_TOKEN) throw new Error('GITHUB_GIST_TOKEN nicht gesetzt')

  // Bundle bauen
  const bundle = { exportedAt: new Date().toISOString(), files: {} }
  for (const f of FILES) {
    try { bundle.files[f] = loadReadOnly(f) } catch { bundle.files[f] = null }
  }

  try {
    bundle.files['stats-rows.json'] = loadStatsRows()
  } catch {
    bundle.files['stats-rows.json'] = null
  }

  const date    = new Date().toISOString().slice(0, 10)
  const content = JSON.stringify(bundle, null, 2)

  // Neuen Gist anlegen
  const created = await gistFetch('', {
    method: 'POST',
    body: JSON.stringify({
      description: `${GIST_DESC} ${date}`,
      public: false,
      files: {
        [`signifikation-backup-${date}.json`]: { content },
      },
    }),
  })
  logger.info({ gistId: created.id }, `Backup erstellt: ${date}`)

  // Alte Gists aufräumen – nur eigene Signifikation-Backups
  const allGists = await gistFetch('?per_page=100')
  const backups  = allGists
    .filter(g => g.description?.startsWith(GIST_DESC))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const toDelete = backups.slice(KEEP_COUNT)
  for (const g of toDelete) {
    await gistFetch(`/${g.id}`, { method: 'DELETE' })
    logger.info({ gistId: g.id }, `Altes Backup gelöscht: ${g.description}`)
  }

  return { gistId: created.id, date, deleted: toDelete.length }
}

// Direktaufruf via: GITHUB_GIST_TOKEN=ghp_... node server/backup.js
if (process.argv[1]?.endsWith('backup.js')) {
  runBackup()
    .then(r => { logger.info(r, 'Backup erfolgreich'); process.exit(0) })
    .catch(err => { logger.error({ err }, 'Backup fehlgeschlagen'); process.exit(1) })
}
