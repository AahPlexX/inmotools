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
        globPatterns: ['**/*.{js,mjs,css,html,svg,wasm,woff2}'],
        // pyodide/** and duckdb-*.wasm avoid precaching the DuckDB/Pyodide-scale
        // WASM/runtime payload for every visitor (see .tasks/NEXT.md TASK-003).
        // MarkdownWorkspace itself stays precached so an already-open client can
        // still enter the tool after a deployment replaces hashed assets. Its
        // heavy optional diagram/style/font dependencies remain lazy and can be
        // recovered through runtime caches if version skew or offline reuse occurs.
        //   - diagram.worker-*.js: the Graphviz Worker chunk; @hpcc-js/wasm-graphviz's
        //     WASM binary is inlined into this chunk rather than emitted as
        //     a separate .wasm file, so the whole chunk must be excluded.
        //   - mermaid-parser.core-*.js, cytoscape.esm-*.js, and every
        //     `*Diagram-*.js` / `diagram-*.js` chunk: Mermaid's per-diagram-type
        //     code-split chunks, only loaded when a document actually
        //     contains that diagram type. They are runtime-cached below.
        //   - apa-*.js, ieee-*.js, chicago-author-date-*.js, mla-*.js: the
        //     bundled CSL style XML files, loaded dynamically per style.
        //   - KaTeX_*.{woff,woff2,ttf}: KaTeX's web fonts (all formats);
        //     only needed once a document actually contains math.
        // `.mjs` and `.woff2` are precached on purpose: the Sightline reading
        // tool ships its six reading typefaces as woff2, and its PDF decoder
        // loads the pdf.js module worker, both of which must be available the
        // first time the tool is used offline.
        globIgnores: [
          'pyodide/**',
          '**/duckdb-*.wasm',
          // Camera RAW decoding is optional; do not download its WASM for every visitor.
          'assets/libraw-*.wasm',
          'assets/raw.worker-*.js',
          // ICC transforms are optional; cache LittleCMS only after a profile workflow is used.
          'assets/lcms-*.wasm',
          // Multi-image alignment embeds ~15 MB of OpenCV in its worker; fetch it only for merges.
          'assets/photo-merge.worker-*.js',
          // AVIF export ships a ~3.5 MB libavif encoder; fetch it only when someone exports AVIF.
          'assets/avif_enc-*.wasm',
          'assets/avif-encode.worker-*.js',
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
          'assets/*univer*',
          'assets/*Univer*',
          'assets/*preset-sheets*',
        ],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(?:libraw-[^/]+\.wasm|raw\.worker-[^/]+\.js)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'photo-raw-codecs',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 4, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/assets\/lcms-[^/]+\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'photo-color-management',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 2, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/assets\/photo-merge\.worker-[^/]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'photo-merge-engine',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 2, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/assets\/(?:avif_enc-[^/]+\.wasm|avif-encode\.worker-[^/]+\.js)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'photo-avif-encoder',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 4, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
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
          {
            urlPattern: /\/assets\/(?:mermaid-parser\.core-|cytoscape\.esm-|[^/]*Diagram-|diagram-)[^/]*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mermaid-diagram-chunks',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 64,
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
    modulePreload: {
      // Chrome rejects this tiny shared-runtime preload when extensions inject
      // isolated-world code, producing a cross-world mismatch warning. Keep
      // Vite's dynamic-import preload optimization, but let the entry module
      // fetch Rolldown's runtime normally instead of hinting it from HTML.
      resolveDependencies: (_filename, dependencies, context) =>
        context.hostType === 'html'
          ? dependencies.filter((dependency) => !dependency.includes('rolldown-runtime-'))
          : dependencies,
    },
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
