export type ShaderDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  line: number;
  column?: number;
  message: string;
  raw: string;
};

export type ShaderExportInput = {
  fragmentSource: string;
  textureDataUrls?: string[];
};

export function parseWebGlLog(log: string): ShaderDiagnostic[] {
  return log
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((raw) => {
      const angle = raw.match(/^(ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/i);
      if (angle) {
        return {
          severity: angle[1].toLowerCase() === 'warning' ? 'warning' as const : 'error' as const,
          line: Number(angle[2]),
          message: angle[3].trim(),
          raw,
        };
      }

      const mesa = raw.match(/^\d+:(\d+)\((\d+)\):\s*(error|warning)?\s*:?\s*(.*)$/i);
      if (mesa) {
        const stated = (mesa[3] ?? '').toLowerCase();
        return {
          severity: stated === 'warning' ? 'warning' as const : stated === 'error' ? 'error' as const : 'info' as const,
          line: Number(mesa[1]),
          column: Number(mesa[2]),
          message: mesa[4].trim(),
          raw,
        };
      }

      return {
        severity: /warning/i.test(raw) ? 'warning' as const : /error/i.test(raw) ? 'error' as const : 'info' as const,
        line: 0,
        message: raw,
        raw,
      };
    });
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildStandaloneShaderHtml(input: ShaderExportInput): string {
  const fragment = safeJsonForScript(input.fragmentSource);
  const textures = safeJsonForScript((input.textureDataUrls ?? []).slice(0, 2));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WebGL2 Shader</title>
<style>html,body,canvas{width:100%;height:100%;margin:0;display:block;background:#000;overflow:hidden}</style>
</head>
<body>
<canvas id="shader-canvas" aria-label="WebGL shader preview"></canvas>
<script>
(() => {
  'use strict';
  const fragmentSource = ${fragment};
  const textureDataUrls = ${textures};
  const canvas = document.getElementById('shader-canvas');
  const gl = canvas.getContext('webgl2', { antialias: true });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const vertexSource = '#version 300 es\\nin vec2 a_position;\\nvoid main(){ gl_Position = vec4(a_position,0.0,1.0); }';
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed.');
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed.');
  gl.useProgram(program);

  const position = gl.getAttribLocation(program, 'a_position');
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const resolution = gl.getUniformLocation(program, 'u_resolution');
  const time = gl.getUniformLocation(program, 'u_time');
  const mouse = gl.getUniformLocation(program, 'u_mouse');
  const textureUniforms = [gl.getUniformLocation(program, 'u_texture0'), gl.getUniformLocation(program, 'u_texture1')];
  const pointer = { x: 0, y: 0 };

  function resize() {
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(canvas.clientWidth * scale));
    const height = Math.max(1, Math.floor(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize, { passive: true });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
    pointer.y = (rect.bottom - event.clientY) * (canvas.height / Math.max(1, rect.height));
  }, { passive: true });

  textureDataUrls.forEach((url, index) => {
    const image = new Image();
    image.onload = () => {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      if (textureUniforms[index]) gl.uniform1i(textureUniforms[index], index);
    };
    image.src = url;
  });

  const start = performance.now();
  function render(now) {
    resize();
    if (resolution) gl.uniform2f(resolution, canvas.width, canvas.height);
    if (time) gl.uniform1f(time, (now - start) / 1000);
    if (mouse) gl.uniform2f(mouse, pointer.x, pointer.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
<\/script>
</body>
</html>`;
}
