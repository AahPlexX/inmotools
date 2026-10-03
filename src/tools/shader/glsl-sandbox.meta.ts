import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "glsl-sandbox",
  category: "design",
  shortTitle: "GLSL Sandbox",
  title: "WebGL2 GLSL Live Sandbox & Standalone Shader Exporter",
  audience: "Creative developers · graphics engineers · technical artists",
  summary: "Edit a GLSL ES fragment shader with CodeMirror, compile it against WebGL2, inspect line-addressable diagnostics, drive resolution/time/pointer uniforms, bind up to two local textures, and export a zero-dependency HTML demo.",
  privacy: "Shader source, image textures, compilation, rendering, and HTML export remain in the browser. No source or texture bytes are uploaded.",
  accepts: "GLSL ES fragment source and up to two optional local image textures",
  outputs: "Live WebGL2 preview, compiler diagnostics, and standalone HTML export",
  steps: [
    "Edit or paste fragment shader source in the local CodeMirror editor.",
    "Review compile/link diagnostics while testing u_resolution, u_time, u_mouse, and optional texture uniforms.",
    "Export the current shader and embedded local textures as a standalone HTML file.",
  ],
  hint: "WebGL compiler messages can vary by browser and GPU driver. The standalone export targets WebGL2 and should be tested on the browsers/devices you intend to support.",
  load: () => import('./ShaderWorkspace'),
} satisfies ToolMeta;
