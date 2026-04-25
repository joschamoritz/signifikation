#!/usr/bin/env node
/**
 * Setup-Skript: Admin-User für betterAuth erstellen
 * Nutze: node server/setup-admin.js <email> <password>
 * oder:  node server/setup-admin.js (interaktiv)
 */

import { randomUUID } from 'crypto'
import * as readline from 'readline'
import bcryptjs from 'bcryptjs'
import db from './db.js'
import logger from './logger.js'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function main() {
  try {
    let email = process.argv[2]
    let password = process.argv[3]

    if (!email) {
      console.log('\n🔐 Admin-User Setup für Signifikation\n')
      email = await question('Admin-Email: ')
    }

    if (!password) {
      password = await question('Admin-Passwort: ')
    }

    if (!email || !password) {
      console.error('❌ Email und Passwort sind erforderlich.')
      process.exit(1)
    }

    // Prüfe ob User schon existiert
    const existing = db.prepare('SELECT id FROM user WHERE email = ?').get(email)
    if (existing) {
      console.error(`❌ User mit Email "${email}" existiert bereits.`)
      process.exit(1)
    }

    // Erstelle User
    const userId = randomUUID()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(userId, email.split('@')[0], email, now, now)

    // Hash Passwort mit bcryptjs (betterAuth nutzt das gleiche Schema)
    const hashedPassword = await bcryptjs.hash(password, 10)

    // Erstelle Account mit gehashtem Passwort
    const accountId = randomUUID()
    db.prepare(`
      INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
      VALUES (?, ?, ?, 'credential', ?, ?, ?)
    `).run(accountId, userId, email, hashedPassword, now, now)

    // Erstelle User-Profil mit admin-Role
    const timestamp = Math.floor(Date.now() / 1000)
    db.prepare(`
      INSERT INTO user_profiles (user_id, role, created_at, updated_at)
      VALUES (?, 'admin', ?, ?)
    `).run(userId, timestamp, timestamp)

    console.log(`\n✅ Admin-User erstellt:`)
    console.log(`   Email: ${email}`)
    console.log(`   User ID: ${userId}`)
    console.log(`\n📝 Merke dir das Passwort – es wird nicht angezeigt.`)
    console.log(`\n🔑 Login: Gehe zu /admin.html und melde dich an.\n`)

  } catch (err) {
    logger.error({ err }, 'Setup-Fehler')
    console.error(`❌ Fehler: ${err.message}`)
    process.exit(1)
  } finally {
    rl.close()
    db.close()
  }
}

main().catch(console.error)
