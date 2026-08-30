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
    let animation = 0;
    let disposed = false;
    const found: ShaderDiagnostic[] = [];

    function compile(type: number, shaderSource: string): WebGLShader | null {
      const compiled = gl.createShader(type);
      if (!compiled) return null;
      gl.shaderSource(compiled, shaderSource);
      gl.compileShader(compiled);
      const log = gl.getShaderInfoLog(compiled) ?? '';
      if (log.trim()) found.push(...parseWebGlLog(log));
      if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) return compiled;
      return compiled;
    }

    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl.FRAGMENT_SHADER, source);
    if (!vertex || !fragment || !gl.getShaderParameter(vertex, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) {
      setDiagnostics(found);
      setStatus('Shader compilation failed. Review the line-addressable diagnostics below.');
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      setStatus('WebGL2 could not allocate a shader program.');
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    const linkLog = gl.getProgramInfoLog(program) ?? '';
    if (linkLog.trim()) found.push(...parseWebGlLog(linkLog));
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setDiagnostics(found);
      setStatus('Shader linking failed. Review the diagnostics below.');
      gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
      return;
    }

    gl.useProgram(program);
    setDiagnostics(found);
    setStatus(found.length ? `Shader linked with ${found.length} compiler message${found.length === 1 ? '' : 's'}.` : 'Shader compiled and linked successfully.');

    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const time = gl.getUniformLocation(program, 'u_time');
    const mouse = gl.getUniformLocation(program, 'u_mouse');
    const textureUniforms = [gl.getUniformLocation(program, 'u_texture0'), gl.getUniformLocation(program, 'u_texture1')];
    const textureHandles: WebGLTexture[] = [];
    const pointer = { x: 0, y: 0 };

    for (let index = 0; index < 2; index += 1) {
      const handle = gl.createTexture();
      if (!handle) continue;
      textureHandles.push(handle);
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      if (textureUniforms[index] !== null) gl.uniform1i(textureUniforms[index], index);
      const local = textures[index];
      if (local) {
        const image = new Image();
        image.onload = () => {
          if (disposed) return;
          gl.activeTexture(gl.TEXTURE0 + index);
          gl.bindTexture(gl.TEXTURE_2D, handle);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        };
        image.src = local.dataUrl;
      }
    }

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
      pointer.y = (rect.bottom - event.clientY) * (canvas.height / Math.max(1, rect.height));
    };
    canvas.addEventListener('pointermove', onPointer, { passive: true });

    function resize() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    const startedAt = performance.now();
    const render = (now: number) => {
      resize();
      gl.useProgram(program);
      if (resolution !== null) gl.uniform2f(resolution, canvas.width, canvas.height);
      if (time !== null) gl.uniform1f(time, (now - startedAt) / 1000);
      if (mouse !== null) gl.uniform2f(mouse, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      animation = requestAnimationFrame(render);
    };
    animation = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(animation);
      canvas.removeEventListener('pointermove', onPointer);
      textureHandles.forEach((texture) => gl.deleteTexture(texture));
      gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
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
