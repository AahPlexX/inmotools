import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "crystal-lattice-studio",
  category: "engineering",
  shortTitle: "Crystal Lattice Studio",
  title: "Crystal Lattice Studio — Crystallography, Symmetry & Diffraction Workbench",
  audience: "Learners · educators · mineralogists · chemists · materials scientists · crystallographers",
  summary: "Explore crystal structures in a local workspace that connects lattice geometry, symmetry, measurements, reciprocal space, diffraction, observed-reflection residuals, scalar fields, voids, morphology, and scientific export workflows.",
  privacy: "Structure coordinates, settings, calculations, and generated files stay in this browser. No crystal data is uploaded.",
  accepts: "CIF, mmCIF, PDB, POSCAR, and XYZ files, or a built-in starter crystal",
  outputs: "CIF, POSCAR, XYZ, reflection lists (CSV/HKL), measurements, and a saved project file",
  steps: [
    "Open a structure file, or pick a familiar starter crystal like sodium chloride.",
    "Look around the cell: rotate it, edit atoms, check symmetry, bonds, and geometry.",
    "Simulate a powder pattern or explore reciprocal space, then try the Advanced analysis tools: compare observed reflections, load a density grid, find voids, or build a crystal shape. Export what you need.",
  ],
  hint: "Start with sodium chloride, body-centered cubic, or diamond if you are new to crystallography; each is a useful way to see how a repeating cell builds a solid.",
  load: () => import('./CrystalWorkspace'),
} satisfies ToolMeta;
