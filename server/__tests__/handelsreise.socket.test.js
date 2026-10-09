/**
 * Klassenmarkt über echte Sockets: Wiederverbinden nach Funkloch (Test mit Q2, 09.10.2026).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import { setupHandelsreiseSocket } from '../realtime/handelsreiseSocket.js'
import { spielAnlegen, zustandFuerLeitung } from '../handelsreise/spiel.js'

let server, io, url
const clients = []

beforeAll(async () => {
  server = http.createServer()
  io = new Server(server, { path: '/socket.io' })
  setupHandelsreiseSocket(io)
  await new Promise((r) => server.listen(0, r))
  url = `http://localhost:${server.address().port}/handelsreise`
})
afterAll(async () => {
  for (const c of clients) c.close()
  io.close()
  await new Promise((r) => server.close(r))
})

const warte = (ms) => new Promise((r) => setTimeout(r, ms))
function client() {
  const c = ioClient(url, { path: '/socket.io', transports: ['websocket'], reconnectionDelay: 50, reconnectionDelayMax: 100 })
  clients.push(c)
  return c
}
const verbunden = (c) => (c.connected ? Promise.resolve() : new Promise((r) => c.once('connect', r)))
const emit = (c, ev, d) => c.timeout(2000).emitWithAck(ev, d)

describe('Handelsreise – Wiederverbinden', () => {
  it('Funkloch: Gerät verbindet sich neu, Beamer zeigt es wieder als verbunden', async () => {
    const s = spielAnlegen()
    const c = client()
    // so macht es das Gerät: bei jedem connect „team:wieder“ senden
    let token = null
    c.on('connect', () => { if (token) c.emit('team:wieder', { code: s.code, token }) })
    await verbunden(c)
    const res = await emit(c, 'team:beitreten', { code: s.code, name: 'Lea und Tom', haus: 'Fugger' })
    expect(res.ok).toBe(true)
    token = res.token
    const team = () => zustandFuerLeitung(s).teams[0]
    expect(team().verbunden).toBe(true)

    c.io.engine.close()            // Verbindung reißt ab, Client versucht es selbst neu
    await warte(20)
    expect(team().verbunden).toBe(false)
    expect(typeof team().getrenntSeit).toBe('number')

    await verbunden(c)
    await warte(50)
    expect(team().verbunden).toBe(true)
    expect(team().getrenntSeit).toBe(null)
  })

  it('Lebenszeichen nach manuellem Neu-Verbinden heilt den Zustand', async () => {
    const s = spielAnlegen()
    const c = client()
    await verbunden(c)
    const { token } = await emit(c, 'team:beitreten', { code: s.code, name: 'Ali', haus: 'Hanse' })
    c.disconnect()                 // so wie „Neu verbinden“ – socket.io versucht es dann nicht selbst
    await warte(20)
    expect(zustandFuerLeitung(s).teams[0].verbunden).toBe(false)
    c.connect()
    await verbunden(c)
    const r = await emit(c, 'team:wieder', { code: s.code, token })
    expect(r.ok).toBe(true)
    expect(r.zustand.code).toBe(s.code)
    expect(zustandFuerLeitung(s).teams[0].verbunden).toBe(true)
  })

  it('alte, tote Verbindung meldet sich spät ab: Team bleibt verbunden', async () => {
    const s = spielAnlegen()
    const alt = client()
    await verbunden(alt)
    const { token } = await emit(alt, 'team:beitreten', { code: s.code, name: 'Mia', haus: 'Medici' })
    const neu = client()
    await verbunden(neu)
    expect((await emit(neu, 'team:wieder', { code: s.code, token })).ok).toBe(true)
    alt.disconnect()
    await warte(30)
    expect(zustandFuerLeitung(s).teams[0].verbunden).toBe(true)
  })

  it('unbekannter Code beim Lebenszeichen: Gerät erfährt es', async () => {
    const c = client()
    await verbunden(c)
    const r = await emit(c, 'team:wieder', { code: '0000', token: 'x' })
    expect(r).toEqual({ ok: false, fehler: 'unbekannt' })
  })
})
