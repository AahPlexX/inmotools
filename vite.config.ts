import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/inmotools/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'InMo Tools',
        short_name: 'InMo',
        description: 'Private, local-first browser tools for serious work.',
        theme_color: '#0b1220',
        background_color: '#f7f8fa',
        display: 'standalone',
        start_url: '/inmotools/',
        scope: '/inmotools/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm}'],
        globIgnores: ['pyodide/**', '**/duckdb-*.wasm'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/duckdb-.*\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'duckdb-wasm',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1800,
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
