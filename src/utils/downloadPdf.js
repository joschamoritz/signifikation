import { Capacitor } from '@capacitor/core'
import { apiFetch } from './apiFetch'

// Authentifizierter Datei-Download (Kurs-Material, PDF oder DOCX). Problem: ein
// einfacher <a href download> navigiert die native iOS-WKWebView direkt zur URL
// — OHNE Authorization-Bearer (Cookies sind dort cross-origin) → 401. Deshalb
// holen wir die Datei über apiFetch (setzt den Bearer) als Blob und
// speichern/teilen sie nativ; im Web bleibt Cookie-Auth und der Blob-Download
// funktioniert ohnehin.

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Lädt eine geschützte Datei (PDF/DOCX) und liefert sie an den Nutzer aus.
 * @param {string} url  Voll qualifizierte Download-URL (Premium-gegated, Bearer nötig)
 * @param {string} filename  Dateiname für Speichern/Teilen (inkl. Endung)
 * @throws bei HTTP-Fehler (z. B. 401/404) — Aufrufer zeigt eine Meldung
 */
export async function downloadAuthenticatedPdf(url, filename) {
  const res = await apiFetch(url)
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`)
  const blob = await res.blob()

  if (Capacitor.isNativePlatform()) {
    // Bewährtes Muster (vgl. shareImage.js): base64 → Cache-Datei → Share-Sheet,
    // damit der Nutzer die PDF in „Dateien“ sichern oder weitergeben kann.
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const base64 = await blobToBase64(blob)
    const saved = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    })
    try {
      await Share.share({ title: filename, url: saved.uri })
    } catch (e) {
      // Nutzer hat den Share-Sheet geschlossen — kein Fehler (vgl. shareImage.js)
      if (e?.name !== 'AbortError' && !e?.message?.toLowerCase().includes('cancel')) throw e
    }
    return
  }

  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objUrl)
}
