import { describe, expect, it } from 'vitest';
import { buildStandaloneShaderHtml, normalizeRenderScale, parseWebGlLog } from '../../src/tools/shader/shader-engine';

describe('WebGL GLSL sandbox engine', () => {
  it('normalizes common WebGL compiler diagnostics into line-addressable messages', () => {
    const diagnostics = parseWebGlLog(["ERROR: 0:7: 'foo' : undeclared identifier", 'WARNING: 0:12: precision qualifier ignored', '0:18(4): error: syntax error, unexpected NEW_IDENTIFIER'].join('\n'));
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', line: 7, message: expect.stringContaining('undeclared identifier') }),
      expect.objectContaining({ severity: 'warning', line: 12, message: expect.stringContaining('precision qualifier') }),
      expect.objectContaining({ severity: 'error', line: 18, column: 4, message: expect.stringContaining('syntax error') }),
    ]);
  });

  it('exports preview-equivalent placeholder textures for both sampler slots', () => {
    const html = buildStandaloneShaderHtml({ fragmentSource: '#version 300 es\nprecision highp float;\nout vec4 outColor;\nuniform sampler2D u_texture0;\nuniform sampler2D u_texture1;\nvoid main(){outColor=texture(u_texture0,vec2(.5))+texture(u_texture1,vec2(.5));}' });
    expect(html).toContain("new Uint8Array([0,0,0,255])");
    expect(html).toContain('textureDataUrls.forEach');
    expect(html).toContain('[null,null]');
  });

  it('embeds supplied textures without losing the placeholder setup for absent slots', () => {
    const html = buildStandaloneShaderHtml({ fragmentSource: '#version 300 es\nprecision highp float;\nout vec4 outColor;\nvoid main(){outColor=vec4(1.);}', textureDataUrls: ['data:image/png;base64,AAAA'] });
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).toContain('null');
    expect(html).not.toContain("</script><script>alert('unsafe')</script>");
  });

  it('bounds render scale to a predictable device-load range', () => {
    expect(normalizeRenderScale(0)).toBe(0.25);
    expect(normalizeRenderScale(1)).toBe(1);
    expect(normalizeRenderScale(99)).toBe(2);
    expect(normalizeRenderScale(Number.NaN)).toBe(1);
  });
});
