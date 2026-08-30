import { describe, expect, it } from 'vitest';
import { buildStandaloneShaderHtml, parseWebGlLog } from '../../src/tools/shader/shader-engine';

describe('WebGL GLSL sandbox engine', () => {
  it('normalizes common WebGL compiler diagnostics into line-addressable messages', () => {
    const diagnostics = parseWebGlLog([
      "ERROR: 0:7: 'foo' : undeclared identifier",
      'WARNING: 0:12: precision qualifier ignored',
      '0:18(4): error: syntax error, unexpected NEW_IDENTIFIER',
    ].join('\n'));

    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', line: 7, message: expect.stringContaining('undeclared identifier') }),
      expect.objectContaining({ severity: 'warning', line: 12, message: expect.stringContaining('precision qualifier') }),
      expect.objectContaining({ severity: 'error', line: 18, column: 4, message: expect.stringContaining('syntax error') }),
    ]);
  });

  it('exports a zero-dependency WebGL2 page with standard uniforms and safe embedded shader source', () => {
    const fragmentSource = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform sampler2D u_texture0;
void main(){ outColor = vec4(u_mouse / u_resolution, fract(u_time), 1.0); }
// </script><script>alert('unsafe')</script>`;
    const html = buildStandaloneShaderHtml({ fragmentSource, textureDataUrls: ['data:image/png;base64,AAAA'] });

    expect(html).toContain('<canvas');
    expect(html).toContain('webgl2');
    expect(html).toContain('u_resolution');
    expect(html).toContain('u_time');
    expect(html).toContain('u_mouse');
    expect(html).toContain('u_texture0');
    expect(html).toContain('requestAnimationFrame');
    expect(html).toMatch(/resize/i);
    expect(html).toMatch(/pointer/i);
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).not.toContain("</script><script>alert('unsafe')</script>");
  });

  it('omits optional texture bootstrap when no local texture is exported', () => {
    const html = buildStandaloneShaderHtml({ fragmentSource: '#version 300 es\nprecision highp float;\nout vec4 outColor;\nvoid main(){outColor=vec4(1.);}' });
    expect(html).not.toContain('data:image/');
    expect(html).toContain('u_resolution');
  });
});
