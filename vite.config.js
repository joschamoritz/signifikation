import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
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
      includeAssets: ['favicon.svg', 'favicon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallbackDenylist: [/^\/admin/, /^\/impressum/, /^\/datenschutz/, /^\/nutzungsbedingungen/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/v1\/heute/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-heute',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^\/api\/v1\/zeitreise/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-zeitreise',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^\/api\/v1\/wortzwilling/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-wortzwilling',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^\/api\/v1\/zeitenwende/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-zeitenwende',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      manifest: {
        name: 'Signifikation',
        short_name: 'Signifikation',
        description: 'Tägliches linguistisches Quiz basierend auf DWDS-Daten',
        theme_color: '#9b1c1c',
        background_color: '#faf9f7',
        display: 'standalone',
        lang: 'de',
        start_url: '/',
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
      '/api':   'http://localhost:3001',
      '/admin': 'http://localhost:3001',
    },
  },
})
