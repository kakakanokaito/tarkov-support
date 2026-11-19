import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages では /tarkov-support/ 配下で公開する
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'タルコフサポート',
        short_name: 'Tarkov',
        description: 'Escape from Tarkov の進行サポート（タスク・ハイドアウト・アイテム判定）',
        lang: 'ja',
        theme_color: '#0b0c0a',
        background_color: '#0b0c0a',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // アイテム画像はキャッシュしてオフラインでも表示
            urlPattern: /^https:\/\/assets\.tarkov\.dev\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'tarkov-images', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
})
