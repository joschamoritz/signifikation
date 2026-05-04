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

function printInfo(message = '') {
  process.stdout.write(`${message}\n`)
}

function printError(message) {
  process.stderr.write(`${message}\n`)
}

function questionHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt)
    const stdin = process.stdin
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    function onData(char) {
      if (char === '\n' || char === '\r' || char === '') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(value)
      } else if (char === '') {
        process.exit()
      } else if (char === '') {
        value = value.slice(0, -1)
      } else {
        value += char
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  try {
    let email = process.argv[2]
    let password = process.argv[3]

    if (!email) {
      printInfo('')
      printInfo('Admin-User Setup fuer Signifikation')
      printInfo('')
      email = await question('Admin-Email: ')
    }

    if (!password) {
      password = await questionHidden('Admin-Passwort: ')
    }

    if (!email || !password) {
      printError('Email und Passwort sind erforderlich.')
      process.exit(1)
    }

    // Prüfe ob User schon existiert
    const existing = db.prepare('SELECT id FROM user WHERE email = ?').get(email)
    if (existing) {
      printError(`User mit Email "${email}" existiert bereits.`)
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

    printInfo('')
    printInfo('Admin-User erstellt:')
    printInfo(`  Email: ${email}`)
    printInfo(`  User ID: ${userId}`)
    printInfo('')
    printInfo('Merke dir das Passwort - es wird nicht angezeigt.')
    printInfo('')
    printInfo('Login: Gehe zu /admin.html und melde dich an.')
    printInfo('')

  } catch (err) {
    logger.error({ err }, 'Setup-Fehler')
    printError(`Fehler: ${err.message}`)
    process.exit(1)
  } finally {
    rl.close()
    db.close()
  }
}

main().catch((err) => {
  logger.error({ err }, 'Setup-Fehler ausserhalb von main')
  printError(`Fehler: ${err?.message || err}`)
  process.exit(1)
})
