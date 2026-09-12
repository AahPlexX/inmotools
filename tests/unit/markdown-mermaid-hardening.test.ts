import { describe, expect, it, vi } from 'vitest';
import {
  MAX_MERMAID_SOURCE_CHARS,
  prepareMermaidSource,
  renderMermaidDiagram,
  scheduleIdle,
} from '../../src/tools/markdown/diagram-engine';

describe('Mermaid source hardening', () => {
  it('rejects oversized source before Mermaid can silently replace it', () => {
    const source = `flowchart LR\nA-->B\n${'x'.repeat(MAX_MERMAID_SOURCE_CHARS + 1)}`;
    const result = prepareMermaidSource(source);
    expect(result.source).toBeUndefined();
    expect(result.error).toMatch(/too large/i);
  });

  it('removes trailing whitespace that can trigger pathological parser work without changing diagram content', () => {
    const result = prepareMermaidSource('flowchart LR\nA-->B\n' + ' '.repeat(10_000));
    expect(result).toEqual({ source: 'flowchart LR\nA-->B' });
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
