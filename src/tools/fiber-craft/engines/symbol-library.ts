// Crochet and knitting chart symbol definitions.
//
// Stitch names, abbreviations, and the US/Canada <-> UK/Australia terminology mapping below are
// verified against the Craft Yarn Council's published industry standards (Crochet Chart Symbols,
// Crochet Abbreviations Master List, and Knit Chart Symbols — craftyarncouncil.com/standards),
// which is the standards body actually credited by yarn/hook/needle manufacturers and pattern
// publishers for this terminology. Glyphs here are original, simple geometric marks that follow
// the same *functional* conventions described by that standard (for example, an "X" for a stitch
// with one yarn-over and a "T" shape with crossbars for taller stitches) — this module does not
// reproduce the Council's copyrighted downloadable artwork.
//
// This module is pure data plus pure lookup functions; it has no dependency on rendering code.

export type CrochetDialect = 'us' | 'uk';

export type CrochetGlyphKind =
  | 'oval' // chain
  | 'dot' // slip stitch
  | 'cross' // single crochet (US) / double crochet (UK)
  | 't-bar-1' // half double crochet
  | 't-bar-2' // double crochet (US) / treble (UK)
  | 't-bar-3' // treble crochet (US) / double treble (UK)
  | 't-bar-4' // double treble crochet (US) / triple treble (UK)
  | 'post-front' // front post variant
  | 'post-back' // back post variant
  | 'picot'
  | 'cluster'
  | 'puff'
  | 'popcorn'
  | 'decrease';

export interface CrochetSymbolDefinition {
  readonly id: string;
  readonly usName: string;
  readonly usAbbreviation: string;
  readonly ukName: string;
  readonly ukAbbreviation: string;
  readonly glyph: CrochetGlyphKind;
  /** How many base loops/stitches this symbol consumes when compiling written instructions. */
  readonly stitchesConsumed: number;
  /** How many stitches this symbol produces (>1 for increases/clusters, <1 for decreases). */
  readonly stitchesProduced: number;
}

// Ordered from shortest to tallest, matching the Craft Yarn Council's published symbol set.
export const CROCHET_SYMBOLS: readonly CrochetSymbolDefinition[] = [
  { id: 'chain', usName: 'chain', usAbbreviation: 'ch', ukName: 'chain', ukAbbreviation: 'ch', glyph: 'oval', stitchesConsumed: 0, stitchesProduced: 1 },
  { id: 'slip-stitch', usName: 'slip stitch', usAbbreviation: 'sl st', ukName: 'slip stitch', ukAbbreviation: 'ss', glyph: 'dot', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'sc-dc', usName: 'single crochet', usAbbreviation: 'sc', ukName: 'double crochet', ukAbbreviation: 'dc', glyph: 'cross', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'hdc-htr', usName: 'half double crochet', usAbbreviation: 'hdc', ukName: 'half treble', ukAbbreviation: 'htr', glyph: 't-bar-1', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'dc-tr', usName: 'double crochet', usAbbreviation: 'dc', ukName: 'treble', ukAbbreviation: 'tr', glyph: 't-bar-2', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'tr-dtr', usName: 'treble crochet', usAbbreviation: 'tr', ukName: 'double treble', ukAbbreviation: 'dtr', glyph: 't-bar-3', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'dtr-trtr', usName: 'double treble crochet', usAbbreviation: 'dtr', ukName: 'triple treble', ukAbbreviation: 'trtr', glyph: 't-bar-4', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'fpdc', usName: 'front post double crochet', usAbbreviation: 'FPdc', ukName: 'raised front treble', ukAbbreviation: 'RFtr', glyph: 'post-front', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'bpdc', usName: 'back post double crochet', usAbbreviation: 'BPdc', ukName: 'raised back treble', ukAbbreviation: 'RBtr', glyph: 'post-back', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'picot', usName: 'picot', usAbbreviation: 'picot', ukName: 'picot', ukAbbreviation: 'picot', glyph: 'picot', stitchesConsumed: 0, stitchesProduced: 0 },
  { id: 'cluster-3dc', usName: '3-dc cluster', usAbbreviation: 'CL', ukName: '3-tr cluster', ukAbbreviation: 'CL', glyph: 'cluster', stitchesConsumed: 3, stitchesProduced: 1 },
  { id: 'puff', usName: 'puff stitch', usAbbreviation: 'puff', ukName: 'puff stitch', ukAbbreviation: 'puff', glyph: 'puff', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'popcorn-5dc', usName: '5-dc popcorn', usAbbreviation: 'pc', ukName: '5-tr popcorn', ukAbbreviation: 'pc', glyph: 'popcorn', stitchesConsumed: 5, stitchesProduced: 1 },
  { id: 'sc2tog-dc2tog', usName: 'single crochet 2 together', usAbbreviation: 'sc2tog', ukName: 'double crochet 2 together', ukAbbreviation: 'dc2tog', glyph: 'decrease', stitchesConsumed: 2, stitchesProduced: 1 },
];

const CROCHET_SYMBOLS_BY_ID = new Map(CROCHET_SYMBOLS.map((symbol) => [symbol.id, symbol]));

export function getCrochetSymbol(id: string): CrochetSymbolDefinition {
  const found = CROCHET_SYMBOLS_BY_ID.get(id);
  if (!found) throw new Error(`Unknown crochet symbol id: ${id}`);
  return found;
}

export function crochetSymbolLabel(id: string, dialect: CrochetDialect): string {
  const symbol = getCrochetSymbol(id);
  return dialect === 'us'
    ? `${symbol.usName} (${symbol.usAbbreviation})`
    : `${symbol.ukName} (${symbol.ukAbbreviation})`;
}

export function crochetSymbolAbbreviation(id: string, dialect: CrochetDialect): string {
  const symbol = getCrochetSymbol(id);
  return dialect === 'us' ? symbol.usAbbreviation : symbol.ukAbbreviation;
}

// --- Knitting chart symbols ---
// Verified against the Craft Yarn Council's published Knit Chart Symbols standard.

export type KnittingGlyphKind =
  | 'blank' // knit on RS
  | 'dot' // purl on RS
  | 'yo' // yarn over
  | 'k2tog'
  | 'ssk'
  | 'cable-cross';

export interface KnittingSymbolDefinition {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly glyph: KnittingGlyphKind;
  readonly stitchesConsumed: number;
  readonly stitchesProduced: number;
}

export const KNITTING_SYMBOLS: readonly KnittingSymbolDefinition[] = [
  { id: 'knit', name: 'Knit on RS, purl on WS', abbreviation: 'k', glyph: 'blank', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'purl', name: 'Purl on RS, knit on WS', abbreviation: 'p', glyph: 'dot', stitchesConsumed: 1, stitchesProduced: 1 },
  { id: 'yarn-over', name: 'Yarn over', abbreviation: 'yo', glyph: 'yo', stitchesConsumed: 0, stitchesProduced: 1 },
  { id: 'k2tog', name: 'Knit 2 together (right-slanting decrease)', abbreviation: 'k2tog', glyph: 'k2tog', stitchesConsumed: 2, stitchesProduced: 1 },
  { id: 'ssk', name: 'Slip, slip, knit (left-slanting decrease)', abbreviation: 'ssk', glyph: 'ssk', stitchesConsumed: 2, stitchesProduced: 1 },
];

const KNITTING_SYMBOLS_BY_ID = new Map(KNITTING_SYMBOLS.map((symbol) => [symbol.id, symbol]));

export function getKnittingSymbol(id: string): KnittingSymbolDefinition {
  const found = KNITTING_SYMBOLS_BY_ID.get(id);
  if (!found) throw new Error(`Unknown knitting symbol id: ${id}`);
  return found;
}

/** A cable cross consumes and produces the same stitch count; only left/right order changes. */
export function createCableCrossSymbol(width: number, direction: 'left' | 'right'): KnittingSymbolDefinition {
  if (width < 1) throw new Error('Cable width must be at least 1 stitch per side.');
  return {
    id: `cable-${width}-${direction}`,
    name: `${width}-over-${width} ${direction === 'left' ? 'left' : 'right'}-cross cable`,
    abbreviation: direction === 'left' ? `C${width * 2}L` : `C${width * 2}R`,
    glyph: 'cable-cross',
    stitchesConsumed: width * 2,
    stitchesProduced: width * 2,
  };
}
