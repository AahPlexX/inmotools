# InMo Tools

InMo Tools is a local-first collection of focused browser utilities for privacy-sensitive, technical work. Tool engines process user-provided data in browser memory; the static application is deployed with GitHub Pages.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- pnpm with exact dependency versions
- Vitest + Playwright + axe-core
- GitHub Actions / GitHub Pages

## Local development

```bash
corepack enable
pnpm install
pnpm dev
```

Validation:

```bash
pnpm test:unit
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Privacy model

The application is intentionally backend-free. Tool input files and text are processed locally in the browser. Do not add analytics, telemetry, remote file conversion, or any network upload path to a tool engine.

## Architecture

The landing page reads from a central tool registry. Each suite owns its engine and UI and is loaded only when opened. Adding a tool means adding a registry entry and its isolated module; display order is derived from the registry rather than embedded tool numbers.
