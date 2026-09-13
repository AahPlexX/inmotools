import { describe, expect, it, vi } from 'vitest';
import {
  MAX_MERMAID_FLOWCHART_LINES,
  MAX_MERMAID_SOURCE_CHARS,
  prepareMermaidSource,
  renderMermaidDiagram,
  scheduleIdle,
} from '../../src/tools/markdown/diagram-engine';

describe('Mermaid source hardening', () => {
  it('rejects oversized source before Mermaid can silently replace it', () => {
    const source = `flowchart LR\nA-->B\n${'x'.repeat(MAX_MERMAID_SOURCE_CHARS + 1)}`;
    const result = prepareMermaidSource(source);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected oversized Mermaid source to be rejected.');
    expect(result.error).toMatch(/too large/i);
  });

  it('removes trailing whitespace that can trigger pathological parser work without changing diagram content', () => {
    const result = prepareMermaidSource('flowchart LR\nA-->B\n' + ' '.repeat(10_000));
    expect(result).toEqual({ ok: true, source: 'flowchart LR\nA-->B' });
  });

  it('rejects flowcharts with enough line tokens to trigger the residual quadratic Jison path', () => {
    const source = `flowchart LR\nA-->B\n${' \n'.repeat(MAX_MERMAID_FLOWCHART_LINES)}`;
    const result = prepareMermaidSource(source);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected token-heavy Mermaid flowchart source to be rejected.');
    expect(result.error).toMatch(/too many lines/i);
  });
});

describe('Mermaid render contract', () => {
  it('preserves Mermaid post-render bindings instead of discarding them', async () => {
    const bindFunctions = vi.fn();
    const render = vi.fn().mockResolvedValue({
      svg: '<svg>ok</svg>',
      diagramType: 'flowchart-v2',
      bindFunctions,
    });
    const result = await renderMermaidDiagram(render, 'diagram-1', 'flowchart LR\nA-->B');
    expect(result.svg).toBe('<svg>ok</svg>');
    expect(result.diagramType).toBe('flowchart-v2');
    expect(result.bindFunctions).toBe(bindFunctions);
  });

  it('turns Mermaid 12 Gantt metadata crashes into a line-specific authoring error', async () => {
    const source = [
      'gantt',
      '  title Schedule',
      '  dateFormat YYYY-MM-DD',
      '  Alpha :a1, 2026-01-05, 3d',
      '  Beta :b1, 2026-01-12, 2d, extra',
    ].join('\n');
    const render = vi.fn().mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'type')"));

    const result = await renderMermaidDiagram(render, 'gantt-1', source);
    expect(result).toEqual({
      error: 'Mermaid Gantt task on line 5 has too many metadata items. Use at most an id, a start value, and an end/duration value after optional task tags.',
    });
  });

  it('does not mistake Gantt directives or accessible descriptions for task metadata', async () => {
    const source = [
      '---',
      'config:',
      '  themeVariables: { fontFamily: "A,B,C,D" }',
      '---',
      'gantt',
      '  title Release: Q1,Q2,Q3,Q4',
      '  accDescr {',
      '    Owners: Ada,Ben,Cam,Dee',
      '  }',
      '  dateFormat YYYY-MM-DD',
      '  Alpha :a1, 2026-01-05, 3d',
    ].join('\n');
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>', diagramType: 'gantt' });

    const result = await renderMermaidDiagram(render, 'gantt-2', source);
    expect(result.svg).toBe('<svg>ok</svg>');
    expect(render).toHaveBeenCalledOnce();
  });
});

describe('idle scheduling', () => {
  it('returns a cancellation function and supplies a timeout for required work', () => {
    const callback = vi.fn();
    const idleCallback = vi.fn(() => 17);
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal('requestIdleCallback', idleCallback);
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallback);

    const cancel = scheduleIdle(callback);
    expect(idleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: expect.any(Number) });
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(17);

    vi.unstubAllGlobals();
  });
});
