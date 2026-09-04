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
        // pyodide/** and duckdb-*.wasm avoid precaching the DuckDB/Pyodide-scale
        // WASM/runtime payload for every visitor (see .tasks/NEXT.md TASK-003).
        // The Markdown Workbench entries below apply the same discipline to its
        // own heavy, lazily-loaded dependencies, so a visitor who never
        // opens that tool never downloads them by default; they are instead
        // cached at runtime on first actual use via the service worker's
        // default runtime-caching behavior for same-origin requests.
        //   - MarkdownWorkspace-*.{js,css}: the tool's own chunk, which
        //     bundles citeproc-js, docx, and jszip directly (they are not
        //     split into separate chunks by the bundler).
        //   - diagram.worker-*.js: the Graphviz Worker chunk; @hpcc-js/wasm-graphviz's
        //     WASM binary is inlined into this chunk rather than emitted as
        //     a separate .wasm file, so the whole chunk must be excluded.
        //   - mermaid-parser.core-*.js, cytoscape.esm-*.js, and every
        //     `*Diagram-*.js` / `diagram-*.js` chunk: Mermaid's per-diagram-type
        //     code-split chunks, only loaded when a document actually
        //     contains that diagram type.
        //   - apa-*.js, ieee-*.js, chicago-author-date-*.js, mla-*.js: the
        //     bundled CSL style XML files, loaded dynamically per style.
        //   - KaTeX_*.{woff,woff2,ttf}: KaTeX's web fonts (all formats);
        //     only needed once a document actually contains math.
        globIgnores: [
          'pyodide/**',
          '**/duckdb-*.wasm',
          'assets/MarkdownWorkspace-*.{js,css}',
          'assets/diagram.worker-*.js',
          'assets/mermaid-parser.core-*.js',
          'assets/cytoscape.esm-*.js',
          'assets/*Diagram-*.js',
          'assets/diagram-*.js',
          'assets/apa-*.js',
          'assets/ieee-*.js',
          'assets/chicago-author-date-*.js',
          'assets/mla-*.js',
          'assets/KaTeX_*.{woff,woff2,ttf}',
        ],
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
