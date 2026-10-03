import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "gltf-optimizer",
  category: "media",
  shortTitle: "GLB Optimizer",
  title: "glTF / GLB Geometry & Texture Optimizer with Orbit Comparison",
  audience: "3D web developers · technical artists · performance teams",
  summary: "Inspect a self-contained GLB, reduce geometry with topology-aware mesh simplification, locally resize supported textures in their original format, compare before/after scene statistics in an orbit viewport, and download a new optimized GLB.",
  privacy: "GLB parsing, geometry changes, same-format texture resizing, optional WebP conversion, Three.js preview, and export all run on this device: the transform runs in a local Web Worker, and model bytes and textures are never uploaded.",
  accepts: "Self-contained binary .glb models",
  outputs: "Optimized GLB plus before/after byte, mesh, vertex, triangle, and texture metrics",
  steps: [
    "Choose a self-contained GLB and inspect the original scene/metrics.",
    "Set a polygon target and maximum texture dimension, then optimize locally.",
    "Toggle before/after and wireframe views, inspect the result, then download the new GLB.",
  ],
  hint: "Polygon reduction is lossy below a 100% target, and the reported percentage is measured from the actual result rather than the request. Textures keep their original format unless you opt into WebP, which makes the output require EXT_texture_webp with no PNG/JPEG fallback; conversions the browser cannot encode are skipped and reported rather than failing the model.",
  load: () => import('./GltfWorkspace'),
} satisfies ToolMeta;
