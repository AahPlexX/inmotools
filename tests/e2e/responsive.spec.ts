import { expect, test } from '@playwright/test';
import { loadTools } from '../../scripts/tool-registry.mjs';

// Catalog-wide phone and tablet layout checks. The workspace clips horizontal overflow
// (overflow-x: hidden / clip), so a page can be "not scrollable" while content is cut off;
// document.scrollWidth cannot see that. These checks look at each element instead.
//
// Checked at 320, 390 and 768 px wide with touch and 2x pixel density, in each tool's first screen:
//  1. no visible content is cut off by a clipping ancestor (scrollable regions are fine);
//  2. no editable text field is under 16px (iPhone Safari zooms the page on focus);
//  3. the shared header links are at least 24x24 CSS px (WCAG 2.2 target size minimum).
const TOOLS = await loadTools();
const WIDTHS = [320, 390, 768];

/** Surfaces that are meant to be larger than the screen and are panned or zoomed inside a frame. */
const PAN_SURFACES = ['.lattice-viewport'];

interface Finding { clipped: string[]; smallFields: string[]; smallLinks: string[] }

function inspect(panSurfaces: string[]): Finding {
  const vw = window.innerWidth;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const label = (el: Element) => {
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const txt = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
  };
  const hiddenByDesign = 'script, style, svg *, [aria-hidden="true"], [inert], [hidden], .katex-mathml, .sr-only, .visually-hidden';
  const inFixed = (el: Element) => {
    for (let p: Element | null = el; p && p !== document.documentElement; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'fixed') return true;
    }
    return false;
  };
  // Returns how many px of the element is cut off, or 0.
  const cutOff = (el: Element, r: DOMRect): { by: number; clipper: string } | null => {
    if (inFixed(el)) {
      const by = Math.max(r.right - vw, -r.left);
      return by > 1 ? { by: Math.round(by), clipper: 'viewport (fixed)' } : null;
    }
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return null;
      if (ox === 'hidden' || ox === 'clip') {
        const pr = p.getBoundingClientRect();
        if (pr.width <= 2 || pr.height <= 2) return null; // visually hidden by design
        const by = Math.max(r.right - pr.right, pr.left - r.left);
        return by > 1 ? { by: Math.round(by), clipper: label(p).split(' "')[0] } : null;
      }
    }
    const by = Math.max(r.right - vw, -r.left);
    return by > 1 ? { by: Math.round(by), clipper: 'viewport' } : null;
  };

  const clipped: string[] = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest(hiddenByDesign)) continue;
    if (panSurfaces.some((s) => el.closest(s))) continue;
    const closedDetails = el.closest('details:not([open])');
    if (closedDetails && !el.closest('summary')) continue; // collapsed content is not shown
    // Trailing whitespace that pre-wrap text lets hang past the edge is not visible content;
    // replaced and form elements (canvas, input, ...) are real content even though they have no text.
    const replaced = ['CANVAS', 'INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'VIDEO', 'IFRAME', 'BUTTON', 'HR', 'OBJECT', 'EMBED'];
    if (el.children.length === 0 && (el.textContent ?? '').length > 0 && (el.textContent ?? '').trim() === '' && !replaced.includes(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) continue;
    const c = cutOff(el, r);
    if (!c) continue;
    const par = el.parentElement; // report only the outermost cut-off element
    if (par && visible(par) && cutOff(par, par.getBoundingClientRect())) continue;
    clipped.push(`${label(el)} cut ${c.by}px by ${c.clipper}`);
  }

  const smallFields: string[] = [];
  const fields = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]), textarea, select, [contenteditable="true"], [contenteditable=""]',
  );
  for (const el of fields) {
    if (!visible(el) || el.closest(hiddenByDesign) || el.classList.contains('inputarea')) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) smallFields.push(`${label(el)} ${fs}px`);
  }

  const smallLinks: string[] = [];
  for (const el of document.querySelectorAll('.site-header nav a, .back-link')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) smallLinks.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return { clipped, smallFields, smallLinks };
}

test.describe.configure({ mode: 'parallel' });
test.setTimeout(120_000);

for (const tool of TOOLS) {
  test(`${tool.slug} fits phone and tablet screens: nothing cut off, fields at least 16px, header links at least 24px`, async ({ browser, isMobile }) => {
    test.skip(isMobile, 'the device matrix runs on the desktop project');
    const context = await browser.newContext({
      viewport: { width: WIDTHS[0], height: 800 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      baseURL: test.info().project.use.baseURL,
    });
    const page = await context.newPage();
    const problems: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width >= 768 ? 1024 : 800 });
      await page.goto(`./#/tools/${tool.slug}`);
      await page.reload();
      await page.getByTestId('suite-workspace').waitFor({ state: 'visible', timeout: 60_000 });
      await page.waitForTimeout(1200);
      const found = await page.evaluate(inspect, PAN_SURFACES);
      for (const line of found.clipped) problems.push(`${width}px cut off: ${line}`);
      for (const line of found.smallFields) problems.push(`${width}px field under 16px: ${line}`);
      for (const line of found.smallLinks) problems.push(`${width}px header link under 24px: ${line}`);
    }
    await context.close();
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
