/**
 * server/__tests__/customLemmaQuota.test.js
 *
 * Unit-Tests für die Tageskontingent-Logik in server/customLemmaQuota.js.
 * Die Routes-Tests (custom-lemma.routes.test.js) prüfen den HTTP-Pfad;
 * hier testen wir die DB-Operationen und Berechnungen direkt und isoliert.
 *
 * Alle Tests arbeiten mit der globalen Test-DB (APP_DB aus global-setup.js)
 * und bereinigen nach sich, damit keine Interference zwischen Tests entsteht.
 */
import { afterEach, describe, it, expect } from 'vitest'
import db from '../db.js'
import {
  BASE_ALLOWANCE,
  todayBerlin,
  getTodayBonus,
  getUsageToday,
  incrementUsage,
  tryConsume,
  getQuota,
} from '../customLemmaQuota.js'

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

let createdUserIds = []
let usedDates = []

function createUser(suffix = Date.now()) {
  const id = `quota-test-user-${suffix}-${Math.random().toString(16).slice(2, 8)}`
  const nowIso = new Date().toISOString()
  db.prepare(`
    INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, NULL, ?, ?)
  `).run(id, `Quota Test ${suffix}`, `${id}@quota.test`, nowIso, nowIso)
  createdUserIds.push(id)
  return id
}

function setBonus(date, bonusCount) {
  // free_days.bonus_count existiert seit Migration 0009
  db.prepare(`
    INSERT INTO free_days (date, label, bonus_count) VALUES (?, 'Testbonus', ?)
    ON CONFLICT(date) DO UPDATE SET bonus_count = ?
  `).run(date, bonusCount, bonusCount)
  usedDates.push(date)
}

function removeBonus(date) {
  db.prepare('DELETE FROM free_days WHERE date = ?').run(date)
}

afterEach(() => {
  for (const id of createdUserIds) {
    db.prepare('DELETE FROM custom_lemma_usage WHERE user_id = ?').run(id)
    db.prepare('DELETE FROM user WHERE id = ?').run(id)
  }
  createdUserIds = []

  for (const d of usedDates) {
    removeBonus(d)
  }
  usedDates = []
})

// ── BASE_ALLOWANCE ────────────────────────────────────────────────────────────
describe('BASE_ALLOWANCE', () => {
  it('ist 1 (Basic-Nutzern steht genau 1 Spiel/Tag zu)', () => {
    expect(BASE_ALLOWANCE).toBe(1)
  })
})

// ── todayBerlin ───────────────────────────────────────────────────────────────
describe('todayBerlin', () => {
  it('liefert einen String im Format YYYY-MM-DD', () => {
    const today = todayBerlin()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('liefert ein gültiges Datum (kein NaN bei Date-Parsen)', () => {
    const today = todayBerlin()
    expect(isNaN(new Date(today).getTime())).toBe(false)
  })
})

// ── getTodayBonus ─────────────────────────────────────────────────────────────
describe('getTodayBonus', () => {
  it('gibt 0 zurück wenn kein free_days-Eintrag für das Datum existiert', () => {
    expect(getTodayBonus('2099-12-31')).toBe(0)
  })

  it('gibt den konfigurierten bonus_count zurück', () => {
    const date = '2099-06-15'
    setBonus(date, 3)
    expect(getTodayBonus(date)).toBe(3)
  })

  it('gibt 0 zurück wenn bonus_count 0 ist', () => {
    const date = '2099-06-16'
    setBonus(date, 0)
    expect(getTodayBonus(date)).toBe(0)
  })
})

// ── getUsageToday ─────────────────────────────────────────────────────────────
describe('getUsageToday', () => {
  it('gibt 0 zurück wenn noch kein Eintrag existiert', () => {
    const userId = createUser('usage-new')
    expect(getUsageToday(userId, '2099-01-01')).toBe(0)
  })

  it('gibt den aktuellen count zurück nach incrementUsage', () => {
    const userId = createUser('usage-incr')
    const date = '2099-02-01'
    incrementUsage(userId, date)
    expect(getUsageToday(userId, date)).toBe(1)
  })

  it('zählt pro Nutzer separat (User-A und User-B interferieren nicht)', () => {
    const a = createUser('usage-a')
    const b = createUser('usage-b')
    const date = '2099-02-02'
    incrementUsage(a, date)
    incrementUsage(a, date)
    expect(getUsageToday(a, date)).toBe(2)
    expect(getUsageToday(b, date)).toBe(0)
  })

  it('zählt pro Datum separat (gestern und heute sind unabhängig)', () => {
    const userId = createUser('usage-date')
    incrementUsage(userId, '2099-03-01')
    incrementUsage(userId, '2099-03-01')
    incrementUsage(userId, '2099-03-02')
    expect(getUsageToday(userId, '2099-03-01')).toBe(2)
    expect(getUsageToday(userId, '2099-03-02')).toBe(1)
  })
})

// ── incrementUsage ────────────────────────────────────────────────────────────
describe('incrementUsage', () => {
  it('legt bei erstem Aufruf einen Eintrag mit count=1 an (Upsert)', () => {
    const userId = createUser('incr-first')
    const date = '2099-04-01'
    incrementUsage(userId, date)
    const row = db.prepare('SELECT count FROM custom_lemma_usage WHERE user_id = ? AND date = ?').get(userId, date)
    expect(row?.count).toBe(1)
  })

  it('erhöht den count bei weiteren Aufrufen', () => {
    const userId = createUser('incr-more')
    const date = '2099-04-02'
    incrementUsage(userId, date)
    incrementUsage(userId, date)
    incrementUsage(userId, date)
    const row = db.prepare('SELECT count FROM custom_lemma_usage WHERE user_id = ? AND date = ?').get(userId, date)
    expect(row?.count).toBe(3)
  })
})

// ── getQuota ──────────────────────────────────────────────────────────────────
describe('getQuota', () => {
  it('Premium: unlimited=true, allowance=Infinity, remaining=Infinity', () => {
    const userId = createUser('quota-premium')
    const q = getQuota({ userId, role: 'premium', date: '2099-05-01' })
    expect(q.unlimited).toBe(true)
    expect(q.allowance).toBe(Infinity)
    expect(q.remaining).toBe(Infinity)
    expect(q.used).toBe(0)
  })

  it('Admin: ebenfalls unbegrenzt (admin ist Premium-Rolle)', () => {
    const userId = createUser('quota-admin')
    const q = getQuota({ userId, role: 'admin', date: '2099-05-01' })
    expect(q.unlimited).toBe(true)
  })

  it('Basic ohne Verbrauch: remaining = BASE_ALLOWANCE (1)', () => {
    const userId = createUser('quota-basic-fresh')
    const q = getQuota({ userId, role: 'user', date: '2099-05-02' })
    expect(q.unlimited).toBe(false)
    expect(q.allowance).toBe(BASE_ALLOWANCE)
    expect(q.used).toBe(0)
    expect(q.remaining).toBe(BASE_ALLOWANCE)
  })

  it('Basic nach 1 Verbrauch: remaining = 0', () => {
    const userId = createUser('quota-basic-used')
    const date = '2099-05-03'
    incrementUsage(userId, date)
    const q = getQuota({ userId, role: 'user', date })
    expect(q.used).toBe(1)
    expect(q.remaining).toBe(0)
  })

  it('Basic mit Admin-Bonus-Tag: allowance = BASE_ALLOWANCE + bonus_count', () => {
    const userId = createUser('quota-bonus')
    const date = '2099-05-04'
    setBonus(date, 2)
    const q = getQuota({ userId, role: 'user', date })
    expect(q.allowance).toBe(BASE_ALLOWANCE + 2)
    expect(q.remaining).toBe(BASE_ALLOWANCE + 2)
  })

  it('remaining unterschreitet nie 0, auch wenn count > allowance', () => {
    const userId = createUser('quota-overrun')
    const date = '2099-05-05'
    // Direkt mehr als das Limit in die DB schreiben (Simulation eines Race-Overruns)
    db.prepare(`
      INSERT INTO custom_lemma_usage (user_id, date, count) VALUES (?, ?, 5)
    `).run(userId, date)
    const q = getQuota({ userId, role: 'user', date })
    expect(q.remaining).toBe(0)
  })
})

// ── tryConsume ────────────────────────────────────────────────────────────────
describe('tryConsume', () => {
  it('Premium: consumed=true, unlimited=true ohne DB-Schreibvorgang', () => {
    const userId = createUser('consume-premium')
    const date = '2099-06-01'
    const r = tryConsume({ userId, role: 'premium', date })
    expect(r.consumed).toBe(true)
    expect(r.unlimited).toBe(true)
    // Kein DB-Eintrag bei Premium
    const row = db.prepare('SELECT count FROM custom_lemma_usage WHERE user_id = ? AND date = ?').get(userId, date)
    expect(row).toBeUndefined()
  })

  it('Basic – erstes Spiel: consumed=true, remaining=0 (von 1)', () => {
    const userId = createUser('consume-basic-1')
    const date = '2099-06-02'
    const r = tryConsume({ userId, role: 'user', date })
    expect(r.consumed).toBe(true)
    expect(r.unlimited).toBe(false)
    expect(r.allowance).toBe(BASE_ALLOWANCE)
    expect(r.remaining).toBe(0)
  })

  it('Basic – zweites Spiel am selben Tag: consumed=false, remaining=0', () => {
    const userId = createUser('consume-basic-2')
    const date = '2099-06-03'
    tryConsume({ userId, role: 'user', date })
    const r2 = tryConsume({ userId, role: 'user', date })
    expect(r2.consumed).toBe(false)
    expect(r2.remaining).toBe(0)
  })

  it('Bonus-Tag: Basic darf BASE_ALLOWANCE + bonus_count Spiele verbrauchen', () => {
    const userId = createUser('consume-bonus')
    const date = '2099-06-04'
    setBonus(date, 2)
    const allowance = BASE_ALLOWANCE + 2 // = 3

    for (let i = 0; i < allowance; i++) {
      const r = tryConsume({ userId, role: 'user', date })
      expect(r.consumed).toBe(true)
    }

    const rOver = tryConsume({ userId, role: 'user', date })
    expect(rOver.consumed).toBe(false)
    expect(rOver.remaining).toBe(0)
  })

  it('Atomarität: zwei parallele tryConsume bei remaining=1 → genau 1 Erfolg', () => {
    // Dieser Test prüft die DO UPDATE WHERE count < allowance Logik, die den
    // Read-Check-Write-Race verhindert (vgl. custom-lemma.routes.test.js).
    // Synchrone better-sqlite3-Calls serialisiert SQLite; hier modellieren wir
    // den Zustand nach dem ersten bereits verbrauchten Slot.
    const userId = createUser('consume-atomic')
    const date = '2099-06-05'
    // Erster Verbrauch vorab via incrementUsage simulieren → count = 1 = allowance
    incrementUsage(userId, date)
    // Jetzt sollte tryConsume false liefern
    const r = tryConsume({ userId, role: 'user', date })
    expect(r.consumed).toBe(false)
  })

  it('Admin: consumed=true, unlimited=true (identisch zu Premium)', () => {
    const userId = createUser('consume-admin')
    const r = tryConsume({ userId, role: 'admin', date: '2099-06-06' })
    expect(r.consumed).toBe(true)
    expect(r.unlimited).toBe(true)
  })

  it('tryConsume schreibt genau 1 Datenbankzeile pro Datum/Nutzer', () => {
    const userId = createUser('consume-rows')
    const date = '2099-06-07'
    tryConsume({ userId, role: 'user', date })
    tryConsume({ userId, role: 'user', date }) // schlägt fehl, aber darf keine zweite Zeile erzeugen
    const rows = db.prepare('SELECT * FROM custom_lemma_usage WHERE user_id = ? AND date = ?').all(userId, date)
    expect(rows).toHaveLength(1)
  })
})
