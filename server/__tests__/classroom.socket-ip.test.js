// Client-IP fuer das Socket-Connect-Limit (Security-Audit 2026-10-30): nginx haengt die
// echte Adresse hinten an X-Forwarded-For an, der erste Eintrag kommt vom Client.
import { describe, expect, it } from 'vitest'
import { socketClientIp } from '../realtime/classroomSocket.js'

describe('socketClientIp', () => {
  it('nimmt hinter dem lokalen Proxy den letzten X-Forwarded-For-Eintrag', () => {
    const handshake = { address: '127.0.0.1', headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.7' } }
    expect(socketClientIp(handshake)).toBe('198.51.100.7')
  })

  it('ein gefälschter erster Eintrag ändert den Schlüssel nicht', () => {
    const echt = { address: '::ffff:127.0.0.1', headers: { 'x-forwarded-for': '198.51.100.7' } }
    const gefaelscht = { address: '::ffff:127.0.0.1', headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.7' } }
    expect(socketClientIp(gefaelscht)).toBe(socketClientIp(echt))
  })

  it('ignoriert X-Forwarded-For bei direkter Verbindung von außen', () => {
    const handshake = { address: '198.51.100.7', headers: { 'x-forwarded-for': '1.2.3.4' } }
    expect(socketClientIp(handshake)).toBe('198.51.100.7')
  })

  it('fällt ohne Header auf die Peer-Adresse zurück', () => {
    expect(socketClientIp({ address: '::1', headers: {} })).toBe('::1')
  })
})
