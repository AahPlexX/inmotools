import { bomToCsv, bomToJson, buildBom, pinAllocationToCsv } from './bom-engine';
import { exportEdif } from './edif-export';
import { projectFileName, renderSchematicSvg, serializeProject } from './export-engine';
import { exportVerilog } from './hdl-verilog';
import { exportVhdl } from './hdl-vhdl';
import { exportKicadNetlist } from './kicad-export';
import type { LogicDocument } from './logic-types';
import { OG_HEIGHT, OG_WIDTH, ogFieldsFromMetadata, ogMetaTags, renderOgCardSvg, type OgOverrides } from './og-card';
import { exportSchematicPdf, type PaperSize } from './pdf-export';
import { exportSpice } from './spice-export';

/**
 * Every file the workstation can write, in one list, so the Export dock is a
 * table of buttons and the whole set can be tested without a browser. Each
 * format turns the circuit into a named file; the ones that can lose something
 * on the way (a part with no HDL equivalent, an image address a page still
 * needs) also say so in `warnings`.
 */

export type ExportGroup = 'Drawings' | 'Hardware description' | 'Netlists' | 'Parts list' | 'Sharing' | 'Project';

export type ExportFormatId =
  | 'svg-sheet'
  | 'pdf'
  | 'verilog'
  | 'verilog-timing'
  | 'vhdl'
  | 'spice'
  | 'kicad'
  | 'edif'
  | 'bom-csv'
  | 'bom-json'
  | 'pins-csv'
  | 'og-png'
  | 'og-svg'
  | 'og-meta'
  | 'project';

export interface ExportFormat {
  readonly id: ExportFormatId;
  readonly label: string;
  readonly group: ExportGroup;
  readonly description: string;
}

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  { id: 'svg-sheet', label: 'Schematic SVG (drawing sheet)', group: 'Drawings', description: 'The schematic on a bordered sheet with reference designators, net names and a title block.' },
  { id: 'pdf', label: 'Schematic PDF', group: 'Drawings', description: 'The same sheet as a one-page vector PDF, with the project details in the file properties.' },
  { id: 'verilog', label: 'Verilog', group: 'Hardware description', description: 'A structural module of gate primitives and small behavioral cells, simulatable in Icarus Verilog or Verilator.' },
  { id: 'verilog-timing', label: 'Verilog with gate delays', group: 'Hardware description', description: 'The same module with each gate\'s propagation delay on its primitive, for timing simulation.' },
  { id: 'vhdl', label: 'VHDL', group: 'Hardware description', description: 'An entity and architecture that GHDL analyzes and simulates.' },
  { id: 'spice', label: 'SPICE netlist', group: 'Netlists', description: 'Behavioral subcircuits and voltage sources for ngspice or LTspice.' },
  { id: 'kicad', label: 'KiCad netlist', group: 'Netlists', description: 'A KiCad s-expression netlist with a library part for every kind of component.' },
  { id: 'edif', label: 'EDIF 2 0 0', group: 'Netlists', description: 'A library of cells and the circuit as instances and nets, for tools that read EDIF.' },
  { id: 'bom-csv', label: 'Bill of materials (CSV)', group: 'Parts list', description: 'Which 74-series packages build the circuit and how many of each.' },
  { id: 'bom-json', label: 'Bill of materials (JSON)', group: 'Parts list', description: 'The parts list with every allocation, spare gate and note.' },
  { id: 'pins-csv', label: 'Pin allocation (CSV)', group: 'Parts list', description: 'For every gate, the package and pin each signal lands on.' },
  { id: 'og-png', label: 'Social card (PNG)', group: 'Sharing', description: 'A 1200 x 630 preview picture with the title, description, author, license and a schematic thumbnail.' },
  { id: 'og-svg', label: 'Social card (SVG)', group: 'Sharing', description: 'The same card as scalable vector art.' },
  { id: 'og-meta', label: 'Open Graph meta tags', group: 'Sharing', description: 'The <meta> tags that make a page show the card when its link is shared.' },
  { id: 'project', label: 'Project file', group: 'Project', description: 'The whole circuit as JSON, to open again later.' },
];

export const EXPORT_GROUPS: readonly ExportGroup[] = ['Drawings', 'Hardware description', 'Netlists', 'Parts list', 'Sharing', 'Project'];

export interface ExportOptions {
  readonly paper?: PaperSize;
  /** Title, description, site name and addresses typed for the social card at export time. */
  readonly og?: OgOverrides;
  /** The date written into files that carry one; today when omitted. */
  readonly date?: Date;
}

export interface ExportOutput {
  readonly filename: string;
  readonly mime: string;
  /** Text files. */
  readonly text?: string;
  /** Binary files. */
  readonly bytes?: Uint8Array;
  /** Set when `text` is an SVG that the browser must draw as a PNG of this size before saving. */
  readonly raster?: { readonly width: number; readonly height: number };
  readonly warnings: readonly string[];
}

const TEXT = 'text/plain;charset=utf-8';

/**
 * Builds one export.
 *
 * @param id The format to write.
 * @param document The whole circuit (not a subcircuit being edited).
 * @param options Paper size, social-card fields and the date to write.
 * @returns The file's name, type and contents, with any warnings.
 * @throws {Error} When the format cannot be written for this circuit (the message says why).
 */
export const runExport = async (id: ExportFormatId, document: LogicDocument, options: ExportOptions = {}): Promise<ExportOutput> => {
  const name = (extension: string): string => projectFileName(document, extension);
  switch (id) {
    case 'svg-sheet':
      return { filename: name('sheet.svg'), mime: 'image/svg+xml', text: renderSchematicSvg(document, { designators: true, netLabels: true, sheet: true }), warnings: [] };
    case 'pdf':
      return { filename: name('pdf'), mime: 'application/pdf', bytes: await exportSchematicPdf(document, { paper: options.paper, date: options.date }), warnings: [] };
    case 'verilog': {
      const result = exportVerilog(document);
      return { filename: name('v'), mime: TEXT, text: result.text, warnings: result.warnings };
    }
    case 'verilog-timing': {
      const result = exportVerilog(document, { delays: true });
      return { filename: name('timing.v'), mime: TEXT, text: result.text, warnings: result.warnings };
    }
    case 'vhdl': {
      const result = exportVhdl(document);
      return { filename: name('vhd'), mime: TEXT, text: result.text, warnings: result.warnings };
    }
    case 'spice': {
      const result = exportSpice(document);
      return { filename: name('cir'), mime: TEXT, text: result.text, warnings: result.warnings };
    }
    case 'kicad': {
      const result = exportKicadNetlist(document, { date: options.date });
      return { filename: name('net'), mime: TEXT, text: result.text, warnings: result.warnings };
    }
    case 'edif': {
      const result = exportEdif(document, { date: options.date });
      return { filename: name('edif'), mime: TEXT, text: result.text, warnings: result.warnings };
    }
    case 'bom-csv': {
      const bom = buildBom(document);
      return { filename: name('bom.csv'), mime: 'text/csv;charset=utf-8', text: `${bomToCsv(bom)}\n`, warnings: bom.notes };
    }
    case 'bom-json': {
      const bom = buildBom(document);
      return { filename: name('bom.json'), mime: 'application/json', text: `${bomToJson(bom)}\n`, warnings: bom.notes };
    }
    case 'pins-csv': {
      const bom = buildBom(document);
      return { filename: name('pins.csv'), mime: 'text/csv;charset=utf-8', text: `${pinAllocationToCsv(bom)}\n`, warnings: bom.notes };
    }
    case 'og-png':
    case 'og-svg': {
      const { fields, problems } = ogFieldsFromMetadata(document.metadata, options.og);
      const svg = renderOgCardSvg(document, fields);
      return id === 'og-png'
        ? { filename: name('og-card.png'), mime: 'image/png', text: svg, raster: { width: OG_WIDTH, height: OG_HEIGHT }, warnings: problems }
        : { filename: name('og-card.svg'), mime: 'image/svg+xml', text: svg, warnings: problems };
    }
    case 'og-meta': {
      const { fields, problems } = ogFieldsFromMetadata(document.metadata, options.og);
      const tags = ogMetaTags(fields);
      return { filename: name('og-meta.html'), mime: 'text/html;charset=utf-8', text: tags.text, warnings: [...problems, ...tags.warnings] };
    }
    case 'project':
      return { filename: name('circuit.json'), mime: 'application/json', text: serializeProject(document), warnings: [] };
  }
};
