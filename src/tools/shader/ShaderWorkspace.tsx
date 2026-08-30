import { useEffect, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import ShaderEditor from './ShaderEditor';
import { buildStandaloneShaderHtml, parseWebGlLog, type ShaderDiagnostic } from './shader-engine';

const DEFAULT_SOURCE = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;

void main() {
  vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  vec2 mouse = u_mouse / max(u_resolution, vec2(1.0));
  float pulse = 0.5 + 0.5 * sin(u_time * 1.8);
  float ring = smoothstep(0.28, 0.275, abs(length(uv - mouse) - 0.18 - pulse * 0.02));
  outColor = vec4(uv.x, 0.22 + uv.y * 0.55, 0.72 + ring * 0.28, 1.0);
}`;

type LocalTexture = { name: string; dataUrl: string };

const VERTEX_SOURCE = `#version 300 es
const vec2 positions[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0); }`;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be encoded.'));
    reader.onerror = () => reject(reader.error ?? new Error('Image read failed.'));
    reader.readAsDataURL(file);
  });
}

export default function ShaderWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [textures, setTextures] = useState<LocalTexture[]>([]);
  const [diagnostics, setDiagnostics] = useState<ShaderDiagnostic[]>([]);
  const [webgl2, setWebgl2] = useState(true);
  const [status, setStatus] = useState('Editing and rendering happen locally with WebGL2.');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) {
      setWebgl2(false);
      setDiagnostics([]);
      setStatus('WebGL2 is not available in this browser or graphics environment.');
      return;
    }
    setWebgl2(true);
    const context: WebGL2RenderingContext = gl;
    const surface: HTMLCanvasElement = canvas;
    let animation = 0;
    let disposed = false;
    const found: ShaderDiagnostic[] = [];

    function compile(type: number, shaderSource: string): WebGLShader | null {
      const compiled = context.createShader(type);
      if (!compiled) return null;
      context.shaderSource(compiled, shaderSource);
      context.compileShader(compiled);
      const log = context.getShaderInfoLog(compiled) ?? '';
      if (log.trim()) found.push(...parseWebGlLog(log));
      if (!context.getShaderParameter(compiled, context.COMPILE_STATUS)) return compiled;
      return compiled;
    }

    const vertex = compile(context.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(context.FRAGMENT_SHADER, source);
    if (!vertex || !fragment || !context.getShaderParameter(vertex, context.COMPILE_STATUS) || !context.getShaderParameter(fragment, context.COMPILE_STATUS)) {
      setDiagnostics(found);
      setStatus('Shader compilation failed. Review the line-addressable diagnostics below.');
      if (vertex) context.deleteShader(vertex);
      if (fragment) context.deleteShader(fragment);
      return;
    }

    const program = context.createProgram();
    if (!program) {
      context.deleteShader(vertex); context.deleteShader(fragment);
      setStatus('WebGL2 could not allocate a shader program.');
      return;
    }
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    const linkLog = context.getProgramInfoLog(program) ?? '';
    if (linkLog.trim()) found.push(...parseWebGlLog(linkLog));
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      setDiagnostics(found);
      setStatus('Shader linking failed. Review the diagnostics below.');
      context.deleteProgram(program); context.deleteShader(vertex); context.deleteShader(fragment);
      return;
    }

    context.useProgram(program);
    setDiagnostics(found);
    setStatus(found.length ? `Shader linked with ${found.length} compiler message${found.length === 1 ? '' : 's'}.` : 'Shader compiled and linked successfully.');

    const resolution = context.getUniformLocation(program, 'u_resolution');
    const time = context.getUniformLocation(program, 'u_time');
    const mouse = context.getUniformLocation(program, 'u_mouse');
    const textureUniforms = [context.getUniformLocation(program, 'u_texture0'), context.getUniformLocation(program, 'u_texture1')];
    const textureHandles: WebGLTexture[] = [];
    const pointer = { x: 0, y: 0 };

    for (let index = 0; index < 2; index += 1) {
      const handle = context.createTexture();
      if (!handle) continue;
      textureHandles.push(handle);
      context.activeTexture(context.TEXTURE0 + index);
      context.bindTexture(context.TEXTURE_2D, handle);
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, 1, 1, 0, context.RGBA, context.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      if (textureUniforms[index] !== null) context.uniform1i(textureUniforms[index], index);
      const local = textures[index];
      if (local) {
        const image = new Image();
        image.onload = () => {
          if (disposed) return;
          context.activeTexture(context.TEXTURE0 + index);
          context.bindTexture(context.TEXTURE_2D, handle);
          context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true);
          context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, image);
        };
        image.src = local.dataUrl;
      }
    }

    const onPointer = (event: PointerEvent) => {
      const rect = surface.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) * (surface.width / Math.max(1, rect.width));
      pointer.y = (rect.bottom - event.clientY) * (surface.height / Math.max(1, rect.height));
    };
    surface.addEventListener('pointermove', onPointer, { passive: true });

    function resize() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(surface.clientWidth * dpr));
      const height = Math.max(1, Math.round(surface.clientHeight * dpr));
      if (surface.width !== width || surface.height !== height) { surface.width = width; surface.height = height; }
      context.viewport(0, 0, surface.width, surface.height);
    }

    const startedAt = performance.now();
    const render = (now: number) => {
      resize();
      context.useProgram(program);
      if (resolution !== null) context.uniform2f(resolution, surface.width, surface.height);
      if (time !== null) context.uniform1f(time, (now - startedAt) / 1000);
      if (mouse !== null) context.uniform2f(mouse, pointer.x, pointer.y);
      context.drawArrays(context.TRIANGLES, 0, 3);
      animation = requestAnimationFrame(render);
    };
    animation = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(animation);
      surface.removeEventListener('pointermove', onPointer);
      textureHandles.forEach((texture) => context.deleteTexture(texture));
      context.deleteProgram(program); context.deleteShader(vertex); context.deleteShader(fragment);
    };
  }, [source, textures]);

  async function loadTextures(files: FileList | null) {
    try {
      const chosen = Array.from(files ?? []).slice(0, 2);
      const next = await Promise.all(chosen.map(async (file) => ({ name: file.name, dataUrl: await fileToDataUrl(file) })));
      setTextures(next);
      setStatus(`${next.length} local texture${next.length === 1 ? '' : 's'} ready for u_texture0/u_texture1.`);
    } catch (error) {
      setTextures([]);
      setStatus(`Texture load failed: ${error instanceof Error ? error.message : 'unsupported image'}`);
    }
  }

  function exportHtml() {
    const html = buildStandaloneShaderHtml({ fragmentSource: source, textureDataUrls: textures.map((texture) => texture.dataUrl) });
    downloadText(html, 'shader-demo.html', 'text/html;charset=utf-8');
    setStatus(`Exported standalone WebGL2 HTML${textures.length ? ` with ${textures.length} embedded texture${textures.length === 1 ? '' : 's'}` : ''}.`);
  }

  return <>
    <div className="workspace-header"><div><h2>Live GLSL sandbox</h2><p>Compile fragment source locally, inspect diagnostics, test uniforms/textures, and export a standalone WebGL2 page.</p></div></div>
    <div className="workspace-body">
      <div className="workspace-grid">
        <div className="field"><span className="field-label">Fragment shader</span><ShaderEditor value={source} onChange={setSource}/><small>CodeMirror uses the maintained legacy shader stream mode. Compiler messages come from your browser/GPU driver.</small></div>
        <div>
          <div className="field"><label htmlFor="shader-textures">Optional local textures (up to 2)</label><input id="shader-textures" type="file" accept="image/*" multiple onChange={(event) => void loadTextures(event.target.files)}/><small>{textures.length ? textures.map((texture, index) => `u_texture${index}: ${texture.name}`).join(' · ') : 'Texture uniforms receive black 1×1 placeholders until local images are selected.'}</small></div>
          <canvas ref={canvasRef} tabIndex={0} aria-label="Live WebGL2 fragment shader preview" style={{ display: 'block', width: '100%', height: 420, marginTop: 18, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: '#000', touchAction: 'none' }}/>
          {!webgl2 ? <div className="notice" style={{ marginTop: 14 }}>WebGL2 is unavailable here. You can still edit and export source, but live compilation/preview requires WebGL2.</div> : null}
        </div>
      </div>

      <div className="button-row"><button className="action-button" type="button" onClick={exportHtml}>Export standalone HTML</button><button className="action-button secondary" type="button" onClick={() => { setSource(DEFAULT_SOURCE); setTextures([]); setStatus('Restored the local starter shader.'); }}>Reset starter shader</button></div>

      <h3 style={{ marginTop: 24 }}>Compiler diagnostics</h3>
      {diagnostics.length ? <div className="result-table-wrap" tabIndex={0} aria-label="Shader compiler diagnostics"><table><thead><tr><th scope="col">Severity</th><th scope="col">Line</th><th scope="col">Column</th><th scope="col">Message</th></tr></thead><tbody>{diagnostics.map((diagnostic, index) => <tr key={`${diagnostic.line}-${diagnostic.column ?? 0}-${index}`}><td>{diagnostic.severity}</td><td>{diagnostic.line || '—'}</td><td>{diagnostic.column ?? '—'}</td><td style={{ whiteSpace: 'normal' }}>{diagnostic.message}</td></tr>)}</tbody></table></div> : <div className="notice">No compiler diagnostics. A successful blank result means the current program compiled and linked without messages.</div>}
      <div className={`status-line ${webgl2 && !diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
