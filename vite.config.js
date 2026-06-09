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
    setupFiles: ['./vitest.setup.js'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
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
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['favicon.svg', 'favicon.png'],
      injectManifest: {
        // JS-Chunks (insb. realtime-vendor, vendor, react-vendor) müssen mit
        // precached werden, sonst kommt es nach einem Deploy zur Mischung aus
        // alten JS-Chunks (SWR) und frischem CSS/HTML.
        globPatterns: ['**/*.{js,css,html,webmanifest}'],
        maximumFileSizeToCacheInBytes: 512 * 1024,
      },
      manifest: {
        name: 'Signifikation',
        short_name: 'Signifikation',
        description: 'Tägliches linguistisches Quiz aus eigenen Korpusdaten',
        theme_color: '#9b1c1c',
        background_color: '#faf9f7',
        display: 'standalone',
        lang: 'de',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api':   'http://localhost:3000',
      '/admin': 'http://localhost:3000',
    },
  },
})
