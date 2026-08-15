import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Retro Games',
        short_name: 'Retro Games',
        description:
          'Play NES, SNES, Game Boy, Genesis, PlayStation, and arcade ROMs in your browser.',
        theme_color: '#0b1a14',
        background_color: '#0b1a14',
        display: 'standalone',
        orientation: 'any',
        scope: '/retro-games/',
        start_url: '/retro-games/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/retro-games/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,wasm}'],
        // Emulator cores and shaders are fetched from Nostalgist CDN on first play.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nostalgist-cdn',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  // Project site: https://manishsharma004.github.io/retro-games/
  base: '/retro-games/',
})
