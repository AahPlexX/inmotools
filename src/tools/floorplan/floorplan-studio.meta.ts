import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "floorplan-studio",
  category: "engineering",
  aliases: ["#/floorplan-studio"],
  shortTitle: "PlanCraft Studio",
  title: "PlanCraft Studio — Floor Plan Drawing & Clearance Checker",
  audience: "Homeowners · interior designers · architects · facilities teams",
  summary: "Draw walls, doors, and windows, drop in furniture and fixtures, and see room areas and clearance problems as you go. Work in millimeters or feet and inches, then export a PDF, a DXF for CAD, or an SVG.",
  privacy: "Your plan, its autosave, and every export stay in this browser. Nothing is uploaded.",
  accepts: "Mouse, touch, and keyboard drawing, plus PlanCraft JSON backups",
  outputs: "PDF on Letter, A4, or Arch sheets (fit to page or at drawing scale), DXF R12 or R2000 for CAD, layered SVG, and a JSON backup",
  steps: [
    "Pick Continuous Wall and click each corner. Click an existing corner or wall to connect to it; rooms appear once a space is enclosed.",
    "Click on a wall to add doors and windows, then place furniture from the library and drag it where you want it.",
    "Check the Rooms and Clearance panels, then export a PDF, DXF, or SVG, or save a JSON backup.",
  ],
  hint: "Hold Shift for straight 45° walls, press 0 to fit the whole plan, and use Ctrl+Z freely: every change can be undone. ADA and clearance checks are planning aids, not code-compliance certification; verify final drawings against the codes that govern your project.",
  load: () => import('./FloorplanWorkspace'),
} satisfies ToolMeta;
