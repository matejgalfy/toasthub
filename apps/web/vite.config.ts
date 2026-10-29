/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // SPEC §10: installable, app shell cached. API responses are never cached and logging needs the network.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Toasthub',
        short_name: 'Toasthub',
        description: 'Count your toasts, keep your streak and out-toast your friends.',
        start_url: '/home',
        scope: '/',
        display: 'standalone',
        // The light theme's --background and --primary (src/styles/theme.css); the manifest takes no CSS.
        background_color: '#fefaf1',
        theme_color: '#a05000',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Deep links open the cached shell; /api (including the magic-link verify redirect) must hit the server.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    // Bundle @toasthub/shared from source so it needs no build step and hot-reloads.
    conditions: ['@toasthub/source', ...defaultClientConditions],
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Same origin as in prod (nginx routes /api), so no CORS and first-party auth cookies in dev too.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
