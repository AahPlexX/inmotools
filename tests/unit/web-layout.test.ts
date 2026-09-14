import { DEFAULT_OPTIONS, parseOptions } from '../../src/tools/web-layout/layout-options';
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
  it('migrates legacy projects without altering flow and rejects unsafe area maps', () => {
    const { gridAreas: _areas, ...legacy } = INITIAL_PROJECT;
    expect(parseProject(JSON.stringify(legacy)).gridAreas).toEqual([]);
    for (const gridAreas of [null, ['a a b', 'a b b'], ['auto b c'], ['span b c'], ['inherit b c']]) {
      expect(() => parseProject(JSON.stringify({ ...INITIAL_PROJECT, gridAreas }))).toThrow();
    }
    const mapped = { ...INITIAL_PROJECT, gridAreas: ['a a b', 'a a c'] };
    expect(parseProject(JSON.stringify(mapped)).gridAreas).toEqual(mapped.gridAreas);
    expect(() => parseProject(JSON.stringify({ ...mapped, columns: 4 }))).toThrow();
    expect(buildCss(mapped)).toContain('@container(min-width:calc(36rem + 48px))');
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


it('exports every navigation target, multiline content and a consistent print palette', () => {
  const project = { ...INITIAL_PROJECT, theme: 'dark' as const, blocks: [{id: 'nav', kind: 'navigation' as const, title: 'Contents', text: ''}, ...Array.from({length: 8}, (_,i) => ({id: `item${i}`, kind: 'card' as const, title: `Item ${i}`, text: 'Line one\nLine two'}))] };
  const html = buildHtml(project);
  expect(html).toContain('href="#item7"');
  expect(html).toContain('white-space:pre-wrap');
  expect(html).toContain('@media print{:root{--surface:#fff;--ink:#000;--canvas:#fff;color-scheme:light}');
  const tokens = JSON.parse(buildTokens(project));
  expect(tokens.color.canvas.$value.hex).toBe('#111827');
  expect(tokens.typography.headingMax.$value.value).toBe(project.fontMax);
});


it('round-trips authoring options and escapes custom metadata while rejecting CSS injection', () => {
  const project = { ...INITIAL_PROJECT, options: { ...DEFAULT_OPTIONS, tracks: 'repeat(3, minmax(0, 1fr))', textDirection: 'rtl' as const, metaTitle: 'A separate title', customMeta: [{ name: 'application-name', content: '"/><script>bad()</script>' }] } };
  expect(parseProject(JSON.stringify(project))).toEqual(project);
  const html = buildHtml(project);
  expect(html).toContain('dir="rtl"');
  expect(html).toContain('<title>A separate title</title>');
  expect(html).not.toContain('<script>bad()');
  expect(html).toContain('grid-template-columns:repeat(3, minmax(0, 1fr))');
  for (const tracks of ['1fr; color:red', 'url(https://example.com)', 'repeat(999, 1fr)', 'minmax(1fr, 1fr)']) expect(() => parseOptions({ ...DEFAULT_OPTIONS, tracks })).toThrow();
  expect(() => parseOptions({ ...DEFAULT_OPTIONS, customMeta: [{name:'viewport',content:'width=3000'}] })).toThrow();
});


it('keeps enabled source in project backups and exports matching CSS without script breakout', () => {
  const project = { ...INITIAL_PROJECT, code: {enabled:true,html:'<p>Custom content</p>',css:'.demo{color:red}',js:'console.log("</script>")'} };
  expect(parseProject(JSON.stringify(project))).toEqual(project);
  expect(buildHtml(project)).toContain('<p>Custom content</p>');
  expect(buildCss(project)).toContain('.demo{color:red}');
  expect(buildHtml(project)).not.toContain('console.log("</script>")');
  expect(buildHtml({...project,code:{...project.code,enabled:false}})).not.toContain('<p>Custom content</p>');
  expect(() => parseProject(JSON.stringify({...project,code:{...project.code,js:1}}))).toThrow();
});

it('validates nested blocks and preserves descendants through duplicate, remove and export', async () => {
  const { reparentBlock, duplicateBlock, removeBlock, orderedBlocks } = await import('../../src/tools/web-layout/block-tree');
  const blocks = reparentBlock(INITIAL_PROJECT.blocks, 'learn', 'welcome');
  const project = { ...INITIAL_PROJECT, blocks };
  expect(parseProject(JSON.stringify(project))).toEqual(project);
  expect(buildHtml(project)).toContain('<div class="block-children"><details');
  expect(() => reparentBlock(blocks, 'welcome', 'learn')).toThrow();
  const duplicated = duplicateBlock(blocks, 'welcome');
  expect(duplicated).toHaveLength(5);
  expect(orderedBlocks(duplicated).filter(entry => entry.depth === 1)).toHaveLength(2);
  const removed = removeBlock(blocks, 'welcome');
  expect(removed.find(b => b.id === 'learn')?.parentId).toBe('');
  expect(removed).toHaveLength(2);
});

it('validates appearance and exports motion, layers and a final print palette', async () => {
  const { DEFAULT_APPEARANCE, parseAppearance } = await import('../../src/tools/web-layout/appearance');
  const appearance = parseAppearance({...DEFAULT_APPEARANCE, animated:true, palettes:{...DEFAULT_APPEARANCE.palettes,dark:{accent:'oklch(65% 0.2 240)',ink:'#eeeeee',surface:'rgb(0 0 0 / 0.5)',canvas:'#111111'}}, gradients:[{type:'conic',angle:45,stops:[{color:'#fff',position:100},{color:'#000',position:0}]}],shadows:[{x:0,y:8,blur:24,spread:2,color:'#123456',inset:false}]});
  const project = {...INITIAL_PROJECT,theme:'dark' as const,appearance};
  expect(parseProject(JSON.stringify(project))).toEqual(project);
  const css = buildCss(project);
  expect(css).toContain('conic-gradient(from 45deg,#000 0%,#fff 100%)');
  expect(css).toContain('box-shadow:0px 8px 24px 2px #123456');
  expect(css).toContain('@keyframes wl-enter');
  expect(css.lastIndexOf('--ink:#000')).toBeGreaterThan(css.indexOf('--ink:#eeeeee'));
  expect(css).toContain('prefers-reduced-motion:reduce');
  expect(()=>parseAppearance({...appearance,blur:NaN})).toThrow();
  expect(()=>parseAppearance({...appearance,easing:[2,0,1,1]})).toThrow();
  expect(()=>parseAppearance({...appearance,steps:[appearance.steps[0],appearance.steps[0]]})).toThrow();
  expect(()=>parseAppearance({...appearance,palettes:{...appearance.palettes,dark:{...appearance.palettes.dark,ink:'red;}body{display:none'}}})).toThrow();
});

it('resolves typed token aliases and JSON pointers without losing source references', async () => {
  const {inspectTokens,tokenCss,setToken,removeToken,tokenVariable}=await import('../../src/tools/web-layout/token-engine');
  const tokens={spacing:{$type:'dimension',base:{$value:{value:20,unit:'px'}},card:{$value:'{spacing.base}'}},scale:{$type:'number',$value:{$ref:'#/spacing/base/$value/value'}}};
  const result=inspectTokens(tokens);
  expect(result.document).toEqual(tokens);
  expect(result.entries.find(e=>e.path==='spacing.card')?.css).toBe('20px');
  expect(result.entries.find(e=>e.path==='scale')?.css).toBe('20');
  const changed=setToken(tokens,'spacing.base','dimension',{value:2,unit:'rem'},'Base spacing');
  expect(tokenCss(changed)).toContain('--token-spacing--card: 2rem');
  expect(()=>removeToken(tokens,'spacing.base')).toThrow('Missing token alias');
  expect(()=>inspectTokens({a:{$type:'number',$value:'{b}'},b:{$type:'number',$value:'{a}'}})).toThrow('Circular');
  expect(()=>inspectTokens({a:{$type:'number',$value:{$ref:'#/a/$value'}}})).toThrow('Circular');
  expect(()=>inspectTokens({a:{$type:'fontWeight',$value:400},b:{$type:'number',$value:'{a}'}})).toThrow('different type');
  expect(()=>inspectTokens({a:{$type:'number',$value:{$ref:'#/constructor'}}})).toThrow('Missing');
  expect(tokenVariable('a.b')).not.toBe(tokenVariable('a--b'));
  const project={...INITIAL_PROJECT,tokens};
  expect(parseProject(JSON.stringify(project)).tokens).toEqual(tokens);
  expect(JSON.parse(buildTokens(project))).toEqual(tokens);
  expect(buildCss(project)).toContain('--token-spacing--card: 20px');
});

it('exports correct token color units and escapes font names', async () => {
  const {tokenValueCss,inspectTokens}=await import('../../src/tools/web-layout/token-engine');
  expect(tokenValueCss('color',{colorSpace:'hsl',components:[330,100,50]})).toBe('hsl(330 100% 50% / 1)');
  expect(tokenValueCss('color',{colorSpace:'oklch',components:[.6,.2,40],alpha:.5})).toBe('oklch(0.6 0.2 40 / 0.5)');
  expect(()=>tokenValueCss('color',{colorSpace:'hsl',components:[360,100,50]})).toThrow();
  expect(()=>tokenValueCss('color',{colorSpace:'srgb',components:[2,0,0]})).toThrow();
  expect(tokenValueCss('fontFamily','</style><script>')).not.toContain('</style>');
  expect(()=>inspectTokens({a:{$type:'dimension',$value:{value:1,unit:'px;display:none'}}})).toThrow();
  expect(()=>inspectTokens({a:{$type:'number',$value:NaN}})).toThrow();
  expect(()=>inspectTokens({a:{$type:'unknown',$value:{}}})).toThrow('Unsupported token type');
});

it('validates composite tokens, typed subvalue references and complete typography exports', async () => {
  const {inspectTokens,tokenCss,tokenValueCss}=await import('../../src/tools/web-layout/token-engine');
  const px=(value:number)=>({value,unit:'px'}),color={colorSpace:'srgb',components:[0,0,0]};
  const tokens={weight:{$type:'fontWeight',$value:600},text:{$type:'typography',$value:{fontFamily:['system-ui','sans-serif'],fontSize:px(18),fontWeight:'{weight}',letterSpacing:px(.5),lineHeight:1.5}},border:{$type:'border',$value:{color,width:px(2),style:'solid'}},shadow:{$type:'shadow',$value:{color,offsetX:px(0),offsetY:px(4),blur:px(8),spread:px(0),inset:true}}};
  expect(inspectTokens(tokens).document).toEqual(tokens);
  expect(tokenCss(tokens)).toContain('--token-text-letter-spacing: 0.5px');
  expect(tokenCss(tokens)).toContain('inset 0px 4px 8px 0px color(srgb 0 0 0 / 1)');
  expect(()=>inspectTokens({...tokens,weight:{$type:'number',$value:600}})).toThrow('required fontWeight');
  expect(tokenValueCss('gradient',[{color,position:-1},{color,position:2}])).toContain('0%, color(srgb 0 0 0 / 1) 100%');
  expect(tokenValueCss('transition',{duration:{value:200,unit:'ms'},delay:{value:-.1,unit:'s'},timingFunction:[0,0,1,1]})).toBe('200ms cubic-bezier(0,0,1,1) -0.1s');
  expect(()=>tokenValueCss('border',{color,width:px(1),style:'solid',bad:true})).toThrow();
  expect(()=>tokenValueCss('shadow',{color,offsetX:px(0),offsetY:px(4),blur:px(-1),spread:px(0)})).toThrow();
});
