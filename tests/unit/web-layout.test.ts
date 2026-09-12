import { describe, expect, it } from 'vitest';
import { buildCss, buildHtml, buildPreview, buildTokens, INITIAL_PROJECT, parseProject } from '../../src/tools/web-layout/layout-engine';

describe('Web Layout Studio portable projects', () => {
  it('round-trips the actual starter with all five component patterns', () => {
    const project = { ...INITIAL_PROJECT, blocks: [...INITIAL_PROJECT.blocks, { id: 'nav', kind: 'navigation' as const, title: 'Explore', text: 'Find your way' }, { id: 'note', kind: 'notice' as const, title: 'Remember', text: 'Bring your ideas' }] };
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    const html = buildHtml(project);
    for (const tag of ['article', 'details', 'summary', 'nav', 'aside', 'label']) expect(html).toContain(`<${tag}`);
    expect(html).toContain('for="join-email"');
    expect(html).toContain('id="join-email"');
  });
  it('escapes hostile text in metadata and content without executing it', () => {
    const html = buildHtml({ ...INITIAL_PROJECT, title: '</title><script>alert(1)</script>', description: '" onload="alert(1)' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot; onload=&quot;');
  });
  it('rejects CSS injection, unsafe links, duplicate IDs, reserved IDs, and malformed versions', () => {
    for (const patch of [
      { accent: 'red; background:url(https://example.com)' }, { canonical: 'javascript:alert(1)' },
      { version: 2 }, { columns: 2.5 }, { fontMin: 80, fontMax: 20 },
      { blocks: [INITIAL_PROJECT.blocks[0], INITIAL_PROJECT.blocks[0]] },
      { blocks: [{ ...INITIAL_PROJECT.blocks[0], id: 'page-title' }] },
    ]) expect(() => parseProject(JSON.stringify({ ...INITIAL_PROJECT, ...patch }))).toThrow();
  });
  it('rejects oversized projects and excessive blocks before they reach rendering', () => {
    expect(() => parseProject(' '.repeat(1_000_001))).toThrow(/limit/);
    expect(() => parseProject(JSON.stringify({ ...INITIAL_PROJECT, blocks: Array.from({ length: 101 }, (_, i) => ({ ...INITIAL_PROJECT.blocks[0], id: `item${i}` })) }))).toThrow(/100 blocks/);
  });
  it('binds layout and breakpoint output to the same project as the preview', () => {
    const project = { ...INITIAL_PROJECT, columns: 5, breakpoint: 710, gap: 18 };
    const css = buildCss(project);
    expect(css).toContain('repeat(auto-fit,minmax(min(100%,max(12rem,calc((100% - 4 * var(--space)) / 5))),1fr))');
    expect(css).toContain('@media(max-width:710px)');
    expect(css).toContain('--space:18px');
    expect(buildHtml(project)).toContain(css);
    expect(buildCss({ ...project, layout: 'flex' })).toContain('display:flex');
  });
  it('validates rectangular named grid areas and emits responsive placements', () => {
    const project = { ...INITIAL_PROJECT, gridAreas: ['a a b', 'a a c'] };
    expect(buildCss(project)).toContain('grid-template-areas:"a a b" "a a c"');
    expect(buildCss(project)).toContain('.block:nth-child(1){grid-area:a}');
    expect(() => parseProject(JSON.stringify({ ...project, gridAreas: ['a b', 'a a'] }))).toThrow(/rectangular|exactly/);
  });
  it('uses a restrictive preview policy without imposing it on portable exports', () => {
    const preview = buildPreview(INITIAL_PROJECT);
    expect(preview).toContain("default-src 'none'");
    expect(preview).toContain("form-action 'none'");
    expect(buildHtml(INITIAL_PROJECT)).not.toContain('Content-Security-Policy');
  });
  it('exports typed DTCG color and dimension values, not untyped strings', () => {
    const tokens = JSON.parse(buildTokens(INITIAL_PROJECT));
    expect(tokens.color.accent.$value.colorSpace).toBe('srgb');
    expect(tokens.color.accent.$value.components).toHaveLength(3);
    expect(tokens.spacing.gap).toEqual({ $type: 'dimension', $value: { value: 24, unit: 'px' } });
  });
  it('includes editable language, canonical, author and social metadata', () => {
    const html = buildHtml({ ...INITIAL_PROJECT, language: 'fr', author: 'A & B', canonical: 'https://example.com/page?a=1&b=2', robots: 'noindex,nofollow' });
    expect(html).toContain('lang="fr"');
    expect(html).toContain('content="A &amp; B"');
    expect(html).toContain('rel="canonical" href="https://example.com/page?a=1&amp;b=2"');
    expect(html).toContain('noindex,nofollow');
    expect(html).toContain('property="og:title"');
  });
});
