import { useEffect, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import ShaderEditor from './ShaderEditor';
import {
  buildStandaloneShaderHtml,
  normalizeRenderScale,
  parseWebGlLog,
  type ShaderDiagnostic,
} from './shader-engine';

const DEFAULT_SOURCE = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
void main(){vec2 uv=gl_FragCoord.xy/max(u_resolution,vec2(1.0));float pulse=.5+.5*sin(u_time*1.8);outColor=vec4(uv.x,.22+uv.y*.55,.72+pulse*.28,1.0);}`;

const VERTEX_SOURCE = `#version 300 es
const vec2 positions[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(positions[gl_VertexID],0.,1.);}`;

type LocalTexture = { name: string; dataUrl: string } | null;

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string'
    ? resolve(reader.result)
    : reject(new Error('Image could not be encoded.'));
  reader.onerror = () => reject(reader.error ?? new Error('Image read failed.'));
  reader.readAsDataURL(file);
});

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export default function ShaderWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockStartRef = useRef(performance.now());
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [compiledSource, setCompiledSource] = useState(DEFAULT_SOURCE);
  const [lastLinkedSource, setLastLinkedSource] = useState(DEFAULT_SOURCE);
  const [textures, setTextures] = useState<LocalTexture[]>([null, null]);
  const [diagnostics, setDiagnostics] = useState<ShaderDiagnostic[]>([]);
  const [webgl2, setWebgl2] = useState(true);
  const [autoCompile, setAutoCompile] = useState(true);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [renderScale, setRenderScale] = useState(1);
  const [focusLine, setFocusLine] = useState<number>();
  const [view, setView] = useState<'split' | 'editor' | 'preview'>('split');
  const [contextRevision, setContextRevision] = useState(0);
  const [status, setStatus] = useState('Editing and rendering happen locally with WebGL2.');

  useEffect(() => {
    if (!autoCompile) return undefined;
    const id = window.setTimeout(() => setCompiledSource(source), 350);
    return () => clearTimeout(id);
  }, [autoCompile, source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view === 'editor') return undefined;

    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) {
      setWebgl2(false);
      setDiagnostics([]);
      setStatus('WebGL2 is not available in this browser or graphics environment.');
      return undefined;
    }

    setWebgl2(true);
    let animation: number | null = null;
    let disposed = false;
    let contextLost = false;
    const found: ShaderDiagnostic[] = [];

    const compile = (type: number, text: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      const log = gl.getShaderInfoLog(shader) ?? '';
      if (log.trim()) found.push(...parseWebGlLog(log));
      return shader;
    };

    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl.FRAGMENT_SHADER, compiledSource);
    if (
      !vertex
      || !fragment
      || !gl.getShaderParameter(vertex, gl.COMPILE_STATUS)
      || !gl.getShaderParameter(fragment, gl.COMPILE_STATUS)
    ) {
      setDiagnostics(found);
      setStatus('Shader compilation failed. Preview/export remain on the last successfully linked shader. Select a diagnostic to jump to its line.');
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return undefined;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      setStatus('WebGL2 could not create a shader program. Preview/export remain on the last successfully linked shader.');
      return undefined;
    }

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    const linkLog = gl.getProgramInfoLog(program) ?? '';
    if (linkLog.trim()) found.push(...parseWebGlLog(linkLog));
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setDiagnostics(found);
      setStatus('Shader linking failed. Preview/export remain on the last successfully linked shader.');
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return undefined;
    }

    gl.useProgram(program);
    setLastLinkedSource(compiledSource);
    setDiagnostics(found);
    setStatus(found.length
      ? `Shader linked with ${found.length} compiler message${found.length === 1 ? '' : 's'}.`
      : 'Shader compiled and linked successfully.');

    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const time = gl.getUniformLocation(program, 'u_time');
    const mouse = gl.getUniformLocation(program, 'u_mouse');
    const textureUniforms = [
      gl.getUniformLocation(program, 'u_texture0'),
      gl.getUniformLocation(program, 'u_texture1'),
    ];
    const handles: WebGLTexture[] = [];
    const pointer = { x: 0, y: 0 };

    const resize = () => {
      const scale = Math.max(
        0.25,
        Math.min(2, (window.devicePixelRatio || 1) * normalizeRenderScale(renderScale)),
      );
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const requestDraw = () => {
      if (disposed || contextLost || animation !== null) return;
      animation = requestAnimationFrame(draw);
    };

    const draw = (now: number) => {
      animation = null;
      if (disposed || contextLost) return;
      resize();
      gl.useProgram(program);
      if (resolution !== null) gl.uniform2f(resolution, canvas.width, canvas.height);
      if (time !== null) gl.uniform1f(time, paused ? elapsed : elapsed + (now - clockStartRef.current) / 1000);
      if (mouse !== null) gl.uniform2f(mouse, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!paused) requestDraw();
    };

    for (let index = 0; index < 2; index += 1) {
      const handle = gl.createTexture();
      if (!handle) continue;
      handles.push(handle);
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255]),
      );
      if (textureUniforms[index] !== null) gl.uniform1i(textureUniforms[index], index);

      const local = textures[index];
      if (!local) continue;
      const image = new Image();
      image.onload = () => {
        if (disposed || contextLost) return;
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, handle);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        requestDraw();
      };
      image.onerror = () => {
        if (disposed) return;
        setStatus(`Texture ${index} "${local.name}" could not be decoded. The black placeholder remains active.`);
        requestDraw();
      };
      image.src = local.dataUrl;
    }

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
      pointer.y = (rect.bottom - event.clientY) * (canvas.height / Math.max(1, rect.height));
      requestDraw();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      resize();
      if (pointer.x === 0 && pointer.y === 0) {
        pointer.x = canvas.width / 2;
        pointer.y = canvas.height / 2;
      }
      const step = Math.max(8, Math.min(canvas.width, canvas.height) * 0.05);
      if (event.key === 'ArrowLeft') pointer.x -= step;
      if (event.key === 'ArrowRight') pointer.x += step;
      if (event.key === 'ArrowUp') pointer.y += step;
      if (event.key === 'ArrowDown') pointer.y -= step;
      pointer.x = clamp(pointer.x, 0, canvas.width);
      pointer.y = clamp(pointer.y, 0, canvas.height);
      requestDraw();
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      if (animation !== null) {
        cancelAnimationFrame(animation);
        animation = null;
      }
      setStatus('WebGL context lost. Waiting for restoration.');
    };

    const onContextRestored = () => {
      if (disposed) return;
      setStatus('WebGL context restored. Rebuilding shader resources.');
      setContextRevision((revision) => revision + 1);
    };

    canvas.addEventListener('pointermove', onPointer, { passive: true });
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => requestDraw());
    resizeObserver?.observe(canvas);
    const onWindowResize = () => requestDraw();
    window.addEventListener('resize', onWindowResize, { passive: true });

    requestDraw();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onWindowResize);
      canvas.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (animation !== null) cancelAnimationFrame(animation);
      if (!gl.isContextLost()) {
        handles.forEach((texture) => gl.deleteTexture(texture));
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
      }
    };
  }, [compiledSource, contextRevision, elapsed, paused, renderScale, textures, view]);

  const togglePause = () => {
    if (paused) {
      clockStartRef.current = performance.now();
      setPaused(false);
    } else {
      setElapsed((value) => value + (performance.now() - clockStartRef.current) / 1000);
      setPaused(true);
    }
  };

  const resetTime = () => {
    setElapsed(0);
    clockStartRef.current = performance.now();
  };

  async function loadTexture(file: File | undefined, index: number) {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setTextures((current) => current.map((item, itemIndex) => (
        itemIndex === index ? { name: file.name, dataUrl } : item
      )));
      setStatus(`${file.name} ready for u_texture${index}.`);
    } catch (error) {
      setStatus(`Texture load failed: ${error instanceof Error ? error.message : 'unsupported image'}`);
    }
  }

  const exportHtml = () => {
    downloadText(
      buildStandaloneShaderHtml({
        fragmentSource: lastLinkedSource,
        textureDataUrls: textures.map((texture) => texture?.dataUrl ?? ''),
        renderScale,
      }),
      'shader-demo.html',
      'text/html;charset=utf-8',
    );
    setStatus('Exported standalone WebGL2 HTML from the last successfully linked shader with preview-equivalent placeholder textures.');
  };

  const resetStarterShader = () => {
    setSource(DEFAULT_SOURCE);
    setCompiledSource(DEFAULT_SOURCE);
    setLastLinkedSource(DEFAULT_SOURCE);
    setTextures([null, null]);
    resetTime();
    setStatus('Restored the local starter shader.');
  };

  const sourceProvenance = source !== compiledSource
    ? 'Editor has uncompiled changes. Preview/export remain on the last successfully linked shader until compilation succeeds.'
    : compiledSource !== lastLinkedSource
      ? 'The latest compile candidate did not link. Preview/export remain on the last successfully linked shader.'
      : 'Preview and export match the latest successfully linked shader.';

  return <>
    <div className="workspace-header">
      <div>
        <h2>Live GLSL sandbox</h2>
        <p>Compile fragment source locally, inspect diagnostics, test uniforms/textures, and export a standalone WebGL2 page.</p>
      </div>
    </div>
    <div className="workspace-body">
      <div className="button-row" role="group" aria-label="Shader workspace controls">
        <button className="action-button secondary" type="button" onClick={() => setView('editor')} aria-pressed={view === 'editor'}>Editor</button>
        <button className="action-button secondary" type="button" onClick={() => setView('split')} aria-pressed={view === 'split'}>Split</button>
        <button className="action-button secondary" type="button" onClick={() => setView('preview')} aria-pressed={view === 'preview'}>Preview</button>
        <button className="action-button secondary" type="button" onClick={togglePause}>{paused ? 'Resume time' : 'Pause time'}</button>
        <button className="action-button secondary" type="button" onClick={resetTime}>Reset time</button>
        <button className="action-button" type="button" onClick={() => setCompiledSource(source)}>Compile now</button>
      </div>

      <div className="workspace-grid three" style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={autoCompile} onChange={(event) => setAutoCompile(event.target.checked)} /> Auto-compile after 350 ms
        </label>
        <div className="field">
          <label htmlFor="shader-scale">Render scale</label>
          <input id="shader-scale" type="number" min="0.25" max="2" step="0.25" value={renderScale} onChange={(event) => setRenderScale(normalizeRenderScale(Number(event.target.value)))} />
        </div>
      </div>

      <div className={view === 'split' ? 'workspace-grid' : undefined}>
        {view !== 'preview' ? <div className="field">
          <span className="field-label">Fragment shader</span>
          <ShaderEditor value={source} onChange={setSource} focusLine={focusLine} />
          <small>{sourceProvenance}</small>
        </div> : null}

        {view !== 'editor' ? <div>
          <div className="workspace-grid">
            {[0, 1].map((index) => <div className="field" key={index}>
              <label htmlFor={`shader-texture-${index}`}>u_texture{index}</label>
              <input
                id={`shader-texture-${index}`}
                type="file"
                accept="image/*"
                onChange={(event) => consumeFileInput(event.target, () => loadTexture(event.target.files?.[0], index))}
              />
              {textures[index]
                ? <button type="button" className="action-button secondary" onClick={() => setTextures((current) => current.map((item, itemIndex) => itemIndex === index ? null : item))}>Remove texture {index}</button>
                : <small>Black 1×1 placeholder, matching exported HTML.</small>}
            </div>)}
          </div>
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label="Live WebGL2 fragment shader preview"
            aria-describedby="shader-preview-help"
            style={{
              display: 'block',
              width: '100%',
              height: 'clamp(200px, 55vh, 420px)',
              marginTop: 18,
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              background: '#000',
              touchAction: 'none',
            }}
          />
          <small id="shader-preview-help">Pointer movement sets u_mouse. When the preview is focused, arrow keys move u_mouse for keyboard testing.</small>
          {!webgl2 ? <div className="notice" style={{ marginTop: 14 }}>WebGL2 is unavailable here. Editing/export remain available.</div> : null}
        </div> : null}
      </div>

      <div className="button-row">
        <button className="action-button" type="button" onClick={exportHtml}>Export standalone HTML</button>
        <button className="action-button secondary" type="button" onClick={resetStarterShader}>Reset starter shader</button>
      </div>

      <h3 style={{ marginTop: 24 }}>Compiler diagnostics</h3>
      {diagnostics.length ? <div className="result-table-wrap" tabIndex={0} aria-label="Shader compiler diagnostics">
        <table>
          <thead><tr><th>Severity</th><th>Line</th><th>Column</th><th>Message</th></tr></thead>
          <tbody>{diagnostics.map((diagnostic, index) => <tr key={`${diagnostic.line}-${diagnostic.column ?? 0}-${index}`}>
            <td>{diagnostic.severity}</td>
            <td>{diagnostic.line ? <button type="button" className="action-button secondary" onClick={() => { setView('editor'); setFocusLine(diagnostic.line); }}>{diagnostic.line}</button> : '—'}</td>
            <td>{diagnostic.column ?? '—'}</td>
            <td style={{ whiteSpace: 'normal' }}>{diagnostic.message}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="notice">No compiler diagnostics.</div>}

      <div className={`status-line ${webgl2 && !diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
