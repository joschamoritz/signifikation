import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  resolve: {
    alias: {
      // Geteilte, framework-freie Module (z. B. Scoring-Regeln, P6), die sowohl
      // das Frontend (hier via Alias) als auch der Server (relativer Import)
      // nutzen. Single Source ohne Duplizierung.
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // @dnd-kit nur in WortZwilling genutzt – Rollup automatisch in den
          // WortZwilling-Lazy-Chunk packen lassen, statt in vendor.js zu zwingen.
          if (id.includes('@dnd-kit')) return undefined
          // jsqr nur im lazy QrScanner (Kiosk-Beitritt per QR) – nicht in den
          // eager vendor-Chunk zwingen, sonst laden ALLE Nutzer den QR-Decoder.
          if (id.includes('jsqr')) return undefined
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
          if (id.includes('socket.io-client') || id.includes('engine.io-client')) return 'realtime-vendor'
          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['./vitest.global-setup.js'],
    setupFiles: ['./vitest.setup.js'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Ratchet-Boden knapp unter dem Ist-Stand (2026-06-11: 59/51/61/62) —
      // Abdeckung darf nicht unbemerkt sinken; bei Steigerung nachziehen.
      thresholds: {
        statements: 55,
        branches: 47,
        functions: 56,
        lines: 58,
      },
      exclude: [
        'node_modules/**',
        'server/public/**',
        'dist/**',
        '**/*.test.{js,ts}',
        'vite.config.js',
      ],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Keine automatische Registrierungs-Injektion in index.html: dieselbe
      // dist/ wird per cap sync in die Native-Apps kopiert, und unter
      // capacitor:// wirft serviceWorker.register() nur eine Unhandled
      // Rejection. Registrierung passiert explizit in main.jsx (!IS_NATIVE).
      injectRegister: null,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['favicon.svg', 'favicon.png'],
      injectManifest: {
        // EAGER JS-Chunks (vendor, react-vendor, App-Entry) MÜSSEN precached
        // werden, sonst kommt es nach einem Deploy zur Mischung aus alten
        // JS-Chunks und frischem CSS/HTML.
        //
        // Ausnahme: realtime-vendor (socket.io-client, ~10 KB gz) ist ein
        // LAZY-Chunk, den nur Klassenraum-Nutzer brauchen. Per globIgnores aus
        // dem Precache nehmen, damit nicht JEDER Nutzer ihn beim SW-Install
        // eager lädt. Bedient wird er stattdessen vom bestehenden
        // StaleWhileRevalidate-Route für /assets/*.js in src/sw.js. Sicher,
        // weil der Dateiname content-gehasht ist: der precachte Importer-Chunk
        // referenziert immer den exakten neuen Hash → kein Mischversions-Risiko
        // (anders als bei den Eager-Chunks). Klassenraum ist ohnehin online-only
        // (Socket.io), die erste Netz-Holung des Chunks ist also unkritisch.
        // scripts/check-precache.mjs ignoriert realtime-vendor entsprechend.
        globPatterns: ['**/*.{js,css,html,webmanifest}'],
        globIgnores: ['**/realtime-vendor-*.js'],
        maximumFileSizeToCacheInBytes: 512 * 1024,
      },
      // EINZIGE Quelle des Web-App-Manifests. Frueher lag daneben ein
      // gepflegtes public/manifest.webmanifest — das wurde beim Build von
      // dieser generierten Datei ueberschrieben und deshalb NIE ausgeliefert.
      // Ausgespielt wurde eine duennere Fassung ohne description, categories
      // und orientation und mit rotem statt pergamentfarbenem theme_color.
      // Der gepflegte Inhalt steht jetzt hier; die Public-Datei ist entfernt.
      // Wer hier etwas aendert, aendert das, was Nutzer wirklich bekommen.
      manifest: {
        name: 'Signifikation – Tägliches Linguistik-Quiz',
        short_name: 'Signifikation',
        description: 'Tägliches Linguistik-Quiz: Kollokationsanalyse, Wortgeschichte, semantische Verwandtschaft und Lückentexte – empirisch ermittelt aus deutschsprachigen Korpusdaten.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'de-DE',
        dir: 'ltr',
        theme_color: '#faf9f7',
        background_color: '#faf9f7',
        categories: ['education', 'games', 'books'],
        icons: [
          { src: '/icon-192.png',      sizes: '192x192',   type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png',      sizes: '512x512',   type: 'image/png', purpose: 'any' },
          { src: '/icon-1024.png',     sizes: '1024x1024', type: 'image/png', purpose: 'any' },
          { src: '/icon-192-dark.png', sizes: '192x192',   type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512-dark.png', sizes: '512x512',   type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // Muss zum Backend-Default-Port passen (PORT=3001, siehe .env.example) —
      // stand faelschlich auf 3000, damit funktionierte das README-Dev-Setup nicht.
      '/api':   'http://localhost:3001',
      '/admin': 'http://localhost:3001',
    },
  },
})
