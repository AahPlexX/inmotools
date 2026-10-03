import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "cad-studio",
  category: "engineering",
  aliases: ["#/cad-studio"],
  shortTitle: "CAD Studio",
  title: "CAD Studio — Local Parametric Sketch and Solid Modeler",
  audience: "Makers · engineers · students",
  summary: "Sketch with constraints, build parametric features, and inspect the resulting solid locally. The model stays in this browser.",
  privacy: "Projects, sketches, and exports stay on this device. Nothing is uploaded.",
  accepts: "Sketches, feature parameters, and project files you open here",
  outputs: "A local parametric model, inspection readouts, and project files",
  steps: [
    "Start a sketch and add geometry or constraints.",
    "Build features from that sketch.",
    "Inspect the model and keep the project on this device.",
  ],
  hint: "Kernel features that need the local geometry engine are labeled when that engine is unavailable.",
  load: () => import('./CadWorkspace'),
} satisfies ToolMeta;
