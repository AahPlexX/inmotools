# Photo Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local-first Photo Studio on INMOTOOLS Pages with 30+ functional non-destructive editing capabilities, safe browser rendering/export, professional metadata controls, local retouching, responsive accessibility, and focused validation.

**Architecture:** A serializable `PhotoRecipe` is the source of truth. A dedicated photo renderer applies geometry, global adjustments, local operations, and finishing to a preview/full-resolution canvas; the workspace treats rendering as revisioned asynchronous work so stale results cannot win. Metadata is inspected with the repository's existing ExifReader dependency and exported as reviewed XMP sidecars plus verified embedding where deterministic writers exist.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Canvas 2D/OffscreenCanvas, Web Workers, `createImageBitmap`, existing `exifreader`, existing `culori`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-photo-studio-design.md`

## Global Constraints

- Production target is the existing GitHub Pages deployment; no server runtime is introduced.
- Source image pixels remain local to the browser.
- `origin/main` remains the authoritative integrated branch.
- No new dependency is required for the first production implementation.
- Existing tools are not refactored as part of this work.
- Browser encoder support is capability-probed; unsupported MIME output is never silently mislabeled.
- Canvas dimension/area capability is checked before full-resolution export.
- All user-facing controls remain DOM-accessible and reflow at 320 CSS px without page-level horizontal scrolling.
- At least 30 listed editing capabilities must be implemented before the feature is represented as complete.

---

### Task 1: Photo document model, adjustment math, history, and metadata serialization

**Files:**
- Create: `src/tools/photo/photo-types.ts`
- Create: `src/tools/photo/photo-engine.ts`
- Create: `src/tools/photo/photo-metadata.ts`
- Test: `tests/unit/photo.test.ts`

**Interfaces:**
- Produces: `DEFAULT_RECIPE: PhotoRecipe`
- Produces: `normalizeRecipe(recipe: PhotoRecipe): PhotoRecipe`
- Produces: `applyPixelAdjustments(data: Uint8ClampedArray, width: number, height: number, recipe: PhotoRecipe, local?: LocalAdjustment[]): void`
- Produces: `sampleHistogram(data: Uint8ClampedArray): PhotoHistogram`
- Produces: `createHistory(initial: PhotoRecipe): PhotoHistory`
- Produces: `commitHistory(history: PhotoHistory, recipe: PhotoRecipe): PhotoHistory`
- Produces: `undoHistory(history: PhotoHistory): PhotoHistory`
- Produces: `redoHistory(history: PhotoHistory): PhotoHistory`
- Produces: `serializePhotoXmp(metadata: PhotoExportMetadata): string`
- Produces: `safePhotoFilename(sourceName: string, mime: PhotoOutputMime): string`

- [ ] **Step 1: Write unit tests first**

Create `tests/unit/photo.test.ts` with tests that prove:

```ts
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RECIPE,
  applyPixelAdjustments,
  commitHistory,
  createHistory,
  normalizeRecipe,
  redoHistory,
  sampleHistogram,
  undoHistory,
} from '../../src/tools/photo/photo-engine';
import { safePhotoFilename, serializePhotoXmp } from '../../src/tools/photo/photo-metadata';

describe('Photo Studio engine', () => {
  test('neutral recipe preserves an opaque mid-gray pixel', () => {
    const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
    applyPixelAdjustments(pixels, 1, 1, DEFAULT_RECIPE);
    expect([...pixels]).toEqual([128, 128, 128, 255]);
  });

  test('one EV doubles linear-light exposure without changing alpha', () => {
    const pixels = new Uint8ClampedArray([64, 64, 64, 200]);
    applyPixelAdjustments(pixels, 1, 1, normalizeRecipe({ ...DEFAULT_RECIPE, exposure: 1 }));
    expect(pixels[0]).toBeGreaterThan(80);
    expect(pixels[0]).toBeLessThan(110);
    expect(pixels[3]).toBe(200);
  });

  test('recipe normalization clamps public adjustment domains', () => {
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, exposure: 99, saturation: -99, sharpenAmount: 99 });
    expect(recipe.exposure).toBe(5);
    expect(recipe.saturation).toBe(-1);
    expect(recipe.sharpenAmount).toBe(2);
  });

  test('history undo and redo preserve recipe revisions', () => {
    const start = createHistory(DEFAULT_RECIPE);
    const changed = { ...DEFAULT_RECIPE, exposure: 1 };
    const committed = commitHistory(start, changed);
    expect(undoHistory(committed).present.exposure).toBe(0);
    expect(redoHistory(undoHistory(committed)).present.exposure).toBe(1);
  });

  test('histogram accounts for every opaque pixel', () => {
    const histogram = sampleHistogram(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]));
    expect(histogram.luminance.reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  test('XMP escapes text and maps reviewed rights/descriptive fields', () => {
    const xmp = serializePhotoXmp({
      title: 'A&B <test>',
      creator: 'Photographer',
      copyright: 'Copyright 2026',
      keywords: ['one', 'two'],
    });
    expect(xmp).toContain('A&amp;B &lt;test&gt;');
    expect(xmp).toContain('dc:creator');
    expect(xmp).toContain('photoshop:Credit');
  });

  test('output filename extension follows requested MIME', () => {
    expect(safePhotoFilename('portrait.CR2', 'image/jpeg')).toBe('portrait-edited.jpg');
    expect(safePhotoFilename('portrait.jpg', 'image/webp')).toBe('portrait-edited.webp');
  });
});
```

- [ ] **Step 2: Run the focused unit test and verify RED**

Run:

```bash
pnpm exec vitest run tests/unit/photo.test.ts
```

Expected: fail because the photo modules do not exist yet.

- [ ] **Step 3: Implement the typed recipe and engine**

`photo-types.ts` defines geometry, global adjustments, HSL arrays, grading, masks/brush strokes/retouch operations, export metadata, histogram, and history types. `photo-engine.ts` implements clamping, sRGB/linear conversion, global adjustments, histogram sampling, local-operation helpers, and bounded recipe history. Neutral defaults must be mathematically identity-preserving aside from integer round-trip noise, which the neutral path avoids entirely by returning early.

- [ ] **Step 4: Implement metadata serialization**

`photo-metadata.ts` generates XML-escaped XMP using standard Dublin Core, Photoshop, XMP Rights, IPTC Core/Extension, and EXIF GPS namespace fields used by the UI. It must not invent source metadata. It also owns output extension/filename mapping.

- [ ] **Step 5: Run unit test GREEN**

Run:

```bash
pnpm exec vitest run tests/unit/photo.test.ts
```

Expected: all Photo Studio unit tests pass.

- [ ] **Step 6: Commit Task 1**

Commit message:

```text
feat(photo): add non-destructive recipe engine
```

---

### Task 2: Revisioned preview/export renderer and capability probing

**Files:**
- Create: `src/tools/photo/photo-renderer.ts`
- Create: `src/tools/photo/photo.worker.ts`
- Modify: `tests/unit/photo.test.ts`

**Interfaces:**
- Consumes: `PhotoRecipe`, `applyPixelAdjustments`, `sampleHistogram`
- Produces: `probePhotoCapabilities(): Promise<PhotoCapabilities>`
- Produces: `renderPhoto(request: PhotoRenderRequest): Promise<PhotoRenderResult>`
- Worker messages carry `{ revision, type, ...payload }` and every response echoes the same revision.

- [ ] **Step 1: Add failing capability/geometry tests**

Append tests for:

```ts
test('geometry normalization rejects an empty crop', () => {
  const recipe = normalizeRecipe({
    ...DEFAULT_RECIPE,
    crop: { x: 0.4, y: 0.4, width: 0, height: 0.2 },
  });
  expect(recipe.crop.width).toBeGreaterThan(0);
});

test('revision comparator rejects stale render results', () => {
  expect(isRenderResultCurrent(7, { revision: 6 })).toBe(false);
  expect(isRenderResultCurrent(7, { revision: 7 })).toBe(true);
});
```

- [ ] **Step 2: Verify RED**

Run the single Photo Studio unit file and confirm the new assertions fail for missing behavior.

- [ ] **Step 3: Implement renderer**

The renderer must:

1. decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`;
2. compute crop/rotation/flip/perspective bounds;
3. use `OffscreenCanvas` when available and a document canvas fallback otherwise;
4. render a reduced preview first;
5. process `ImageData` through the recipe engine;
6. coalesce preview requests with revision IDs;
7. probe JPEG/WebP encoding by checking returned `Blob.type`;
8. probe safe canvas dimensions and expose the result;
9. export at requested safe dimensions only;
10. close bitmaps and release temporary canvases promptly.

The worker uses the same pure engine and returns transferable `ImageBitmap` previews where supported. If worker setup fails, `photo-renderer.ts` performs equivalent processing on the main thread without changing the public API.

- [ ] **Step 4: Verify unit/build**

Run:

```bash
pnpm exec vitest run tests/unit/photo.test.ts
pnpm build
```

Expected: Photo unit suite passes and TypeScript/Vite build succeeds.

- [ ] **Step 5: Commit Task 2**

Commit message:

```text
feat(photo): add revisioned local renderer
```

---

### Task 3: Production workspace with 30+ global/local editing controls

**Files:**
- Create: `src/tools/photo/PhotoWorkspace.tsx`
- Create: `src/tools/photo/PhotoCanvas.tsx`
- Create: `src/tools/photo/photo.css`
- Create: `tests/e2e/photo.spec.ts`
- Modify: `src/catalog.ts`
- Modify: `src/tools/workspaces.tsx`
- Modify: `scripts/select-e2e-specs.mjs`

**Interfaces:**
- Consumes: Task 1/2 engine, renderer, metadata and types.
- Produces: catalog slug `photo-studio` and lazy workspace loader.

- [ ] **Step 1: Write browser tests before route wiring**

Create `tests/e2e/photo.spec.ts` that generates a small PNG fixture in-page and verifies:

```ts
import { expect, test } from '@playwright/test';

test('Photo Studio loads, edits, compares, undoes and exports', async ({ page }) => {
  await page.goto('/#/tools/photo-studio');
  await expect(page.getByRole('heading', { name: /Photo Studio/i })).toBeVisible();
  await page.setInputFiles('input[type="file"]', {
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHgQCAfT5J9kAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByText(/2 × 2/)).toBeVisible();
  await page.getByLabel('Exposure').fill('1');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: /Before/i }).click();
  await expect(page.locator('[data-photo-canvas]')).toBeVisible();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('dialog', { name: /Export photo/i })).toBeVisible();
});

test('Photo Studio reflows at 320 CSS pixels without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#/tools/photo-studio');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
```

Add tests for keyboard undo/redo, crop numeric fields, metadata sidecar download, local brush creation, and export capability warnings.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm exec playwright test tests/e2e/photo.spec.ts --project=chromium
```

Expected: route/tool missing.

- [ ] **Step 3: Wire catalog/router/focused selector**

Add `photo-studio` to `ToolSlug`, add a catalog definition that accurately describes local photo editing, add the lazy workspace loader, and map `src/tools/photo/**` to `tests/e2e/photo.spec.ts` in the focused selector.

- [ ] **Step 4: Implement workspace and canvas**

`PhotoWorkspace.tsx` owns source selection, recipe/history state, grouped control UI, export dialog, metadata editor, snapshots/presets, recipe import/export, batch queue, and live status. Controls are generated from strongly typed control descriptors where possible to avoid repetitive state plumbing.

`PhotoCanvas.tsx` owns fit/pan/zoom, before/after split, crop handles, local-tool pointer gestures, brush overlay, clone/heal source-target overlays, histogram/clipping overlay, and sampler. Pointer coordinates are stored normalized to image space so the same operations reproduce at export resolution.

`photo.css` provides the desktop three-region workbench and responsive stacked/bottom-sheet behavior. It must avoid viewport-locked heights on narrow devices and respect `prefers-reduced-motion`.

- [ ] **Step 5: Ensure feature count is real**

Before claiming the milestone, verify every control listed in the design maps to a state field and renderer behavior. A DOM control without render/state effect is a failing requirement.

- [ ] **Step 6: Run targeted validation**

Run:

```bash
pnpm exec vitest run tests/unit/photo.test.ts
pnpm build
pnpm exec playwright test tests/e2e/photo.spec.ts
```

Expected: all pass.

- [ ] **Step 7: Commit Task 3**

Commit message:

```text
feat(photo): ship local Photo Studio workspace
```

---

### Task 4: Metadata, batch workflow, hardening, Pages verification, and task closure

**Files:**
- Modify: `src/tools/photo/PhotoWorkspace.tsx`
- Modify: `src/tools/photo/photo-metadata.ts`
- Modify: `tests/unit/photo.test.ts`
- Modify: `tests/e2e/photo.spec.ts`
- Modify: `.tasks/IN_PROGRESS.md`
- Modify: `.tasks/DONE.md`
- Modify: `.tasks/WORK_LOG.md`

**Interfaces:**
- Consumes all prior Photo Studio interfaces.
- Produces final verified Pages-ready tool and task records.

- [ ] **Step 1: Add metadata and batch regression tests first**

Tests must prove XML escaping, keywords, GPS omission under strip policy, explicit location retention under custom policy, batch failure isolation, recipe round-trip stability, and stale-result rejection.

- [ ] **Step 2: Verify RED**

Run only the newly added Photo Studio unit/browser cases and confirm each new assertion fails for the intended missing behavior.

- [ ] **Step 3: Complete metadata/export workflow**

The export dialog must expose filename, format, quality, resize mode/value, background, output sharpening, metadata policy, editable metadata, XMP sidecar, and per-format capability status. Metadata errors must not destroy the pixel render.

- [ ] **Step 4: Complete batch and project workflow**

Batch processing runs sequentially, reports each file's status, applies the current recipe, and never holds all rendered full-resolution outputs simultaneously. JSON recipe import validates shape/version and clamps values through `normalizeRecipe`.

- [ ] **Step 5: Run focused validation**

Run:

```bash
pnpm exec vitest run tests/unit/photo.test.ts
pnpm build
pnpm exec playwright test tests/e2e/photo.spec.ts
```

- [ ] **Step 6: Run repository validation required by changed global paths**

Run:

```bash
pnpm test:unit
pnpm build
pnpm exec playwright test
```

If the pre-existing baseline is red, compare the fresh failure signature to the baseline and do not attribute unrelated failures to Photo Studio.

- [ ] **Step 7: Verify GitHub Actions and Pages**

After pushing to `origin/main`, verify the focused validation run and Pages workflow against the exact final SHA. Confirm the live route `https://aahplexx.github.io/inmotools/#/tools/photo-studio` loads the new workspace and that an uncached browser can open the editor.

- [ ] **Step 8: Close repository task tracking**

Move Photo Studio from `.tasks/IN_PROGRESS.md` to `.tasks/DONE.md`, append a concise factual entry to `.tasks/WORK_LOG.md`, and leave any genuinely deferred decoder extension in `.tasks/NEXT.md` only if it is still intended.

- [ ] **Step 9: Final verification**

Re-check `origin/main`, branch inventory, exact changed-file set, CI status, live route, and that no source file contains private prompting/internal discussion.

- [ ] **Step 10: Commit closure**

Commit message:

```text
chore(photo): close Photo Studio validation
```
