import { describe, expect, it, vi } from 'vitest';
import { renderMermaidDiagram, scheduleIdle } from '../../src/tools/markdown/diagram-engine';

// This project's plain Vitest environment has no DOM and no Worker global
// (confirmed: `typeof Worker` is `undefined` under Node), matching how this
// catalog's other Worker-backed tools (floorplan, dedupe) only unit test
// their pure analysis functions rather than the Worker wiring itself. The
// same approach applies here: renderGraphvizDiagram's real Worker
// orchestration is exercised by this tool's end-to-end test instead, while
// the two functions below - which do not touch the DOM or Worker APIs - are
// fully unit-testable via an injected render function.

describe('mermaid render dispatch', () => {
  it('returns the rendered SVG on success', async () => {
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' });
    const result = await renderMermaidDiagram(render, 'diagram-1', 'graph TD; A-->B;');
    expect(result.svg).toBe('<svg>ok</svg>');
    expect(result.error).toBeUndefined();
    expect(render).toHaveBeenCalledWith('diagram-1', 'graph TD; A-->B;');
  });

  it('returns a labeled error instead of throwing when the render function rejects', async () => {
    const render = vi.fn().mockRejectedValue(new Error('Parse error on line 1'));
    await expect(renderMermaidDiagram(render, 'diagram-1', 'not a diagram')).resolves.toEqual({
      error: 'Parse error on line 1',
    });
  });

  it('falls back to a generic error message when the rejection is not an Error instance', async () => {
    const render = vi.fn().mockRejectedValue('a string rejection');
    const result = await renderMermaidDiagram(render, 'diagram-1', 'x');
    expect(result.error).toBe('Mermaid rendering failed.');
  });
});

describe('idle scheduling', () => {
  it('invokes the callback', async () => {
    const callback = vi.fn();
    scheduleIdle(callback);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback).toHaveBeenCalledOnce();
  });
});
