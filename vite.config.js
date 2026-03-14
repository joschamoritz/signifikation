import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Signifikation',
        short_name: 'Signifikation',
        description: 'Tägliches linguistisches Quiz basierend auf DWDS-Daten',
        theme_color: '#faf9f7',
        background_color: '#faf9f7',
        display: 'standalone',
        lang: 'de',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api':   'http://localhost:3001',
      '/admin': 'http://localhost:3001',
    }
  }
})
