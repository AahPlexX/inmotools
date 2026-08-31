import type { ClearanceEnvelope, ComponentCategory } from './floorplan-types';

export interface SymbolDefinition {
  readonly key: string;
  readonly label: string;
  readonly category: ComponentCategory;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly clearance: ClearanceEnvelope;
  readonly glyph: 'rect' | 'circle' | 'chair' | 'bed' | 'sofa' | 'fixture' | 'mep';
}

const rectClearance = (width: number, depth: number, bufferOffset: number): ClearanceEnvelope => ({
  shape: 'rectangle', dimensions: { x: width, y: depth }, bufferOffset,
});

export const COMPONENT_LIBRARY: readonly SymbolDefinition[] = [
  { key: 'sofa-3-seat', label: '3-Seat Sofa', category: 'living', width: 2200, depth: 900, height: 850, clearance: rectClearance(2200, 900, 450), glyph: 'sofa' },
  { key: 'sectional', label: 'Sectional', category: 'living', width: 2800, depth: 1800, height: 850, clearance: rectClearance(2800, 1800, 450), glyph: 'sofa' },
  { key: 'armchair', label: 'Armchair', category: 'living', width: 850, depth: 850, height: 900, clearance: rectClearance(850, 850, 450), glyph: 'chair' },
  { key: 'coffee-table', label: 'Coffee Table', category: 'living', width: 1200, depth: 600, height: 450, clearance: rectClearance(1200, 600, 450), glyph: 'rect' },
  { key: 'media-credenza', label: 'Media Credenza', category: 'living', width: 1800, depth: 450, height: 650, clearance: rectClearance(1800, 450, 915), glyph: 'rect' },
  { key: 'king-bed', label: 'King Bed', category: 'bedroom', width: 1930, depth: 2030, height: 1100, clearance: rectClearance(1930, 2030, 760), glyph: 'bed' },
  { key: 'queen-bed', label: 'Queen Bed', category: 'bedroom', width: 1525, depth: 2030, height: 1100, clearance: rectClearance(1525, 2030, 760), glyph: 'bed' },
  { key: 'twin-bed', label: 'Twin Bed', category: 'bedroom', width: 990, depth: 1900, height: 900, clearance: rectClearance(990, 1900, 760), glyph: 'bed' },
  { key: 'nightstand', label: 'Nightstand', category: 'bedroom', width: 550, depth: 450, height: 600, clearance: rectClearance(550, 450, 300), glyph: 'rect' },
  { key: 'wardrobe', label: 'Wardrobe', category: 'bedroom', width: 1800, depth: 650, height: 2200, clearance: rectClearance(1800, 650, 915), glyph: 'rect' },
  { key: 'dining-6', label: '6-Seat Dining Table', category: 'dining', width: 1800, depth: 900, height: 750, clearance: rectClearance(1800, 900, 915), glyph: 'rect' },
  { key: 'round-table-1200', label: 'Round Table Ø1200', category: 'dining', width: 1200, depth: 1200, height: 750, clearance: { shape: 'circle', dimensions: { x: 1200, y: 1200 }, bufferOffset: 915 }, glyph: 'circle' },
  { key: 'buffet', label: 'Buffet', category: 'dining', width: 1600, depth: 500, height: 900, clearance: rectClearance(1600, 500, 915), glyph: 'rect' },
  { key: 'base-cabinet', label: 'Kitchen Base Unit', category: 'kitchen_bath', width: 600, depth: 600, height: 900, clearance: rectClearance(600, 600, 1065), glyph: 'fixture' },
  { key: 'upper-cabinet', label: 'Kitchen Upper Unit', category: 'kitchen_bath', width: 600, depth: 350, height: 750, clearance: rectClearance(600, 350, 0), glyph: 'fixture' },
  { key: 'sink', label: 'Sink', category: 'kitchen_bath', width: 900, depth: 600, height: 900, clearance: rectClearance(900, 600, 760), glyph: 'fixture' },
  { key: 'toilet', label: 'Toilet', category: 'kitchen_bath', width: 500, depth: 700, height: 800, clearance: { shape: 'rectangle', dimensions: { x: 760, y: 1220 }, bufferOffset: 0, adaRuleKey: 'ada_fixture_clearance' }, glyph: 'fixture' },
  { key: 'shower', label: 'Shower', category: 'kitchen_bath', width: 900, depth: 900, height: 2100, clearance: rectClearance(900, 900, 760), glyph: 'fixture' },
  { key: 'bathtub', label: 'Bathtub', category: 'kitchen_bath', width: 1700, depth: 760, height: 600, clearance: rectClearance(1700, 760, 760), glyph: 'fixture' },
  { key: 'executive-desk', label: 'Executive Desk', category: 'office', width: 1500, depth: 750, height: 740, clearance: rectClearance(1500, 750, 1065), glyph: 'rect' },
  { key: 'task-chair', label: 'Task Chair', category: 'office', width: 650, depth: 650, height: 1100, clearance: { shape: 'circle', dimensions: { x: 1065, y: 1065 }, bufferOffset: 0 }, glyph: 'chair' },
  { key: 'bookcase', label: 'Bookcase', category: 'office', width: 900, depth: 350, height: 2000, clearance: rectClearance(900, 350, 915), glyph: 'rect' },
  { key: 'closet', label: 'Closet', category: 'office', width: 1800, depth: 650, height: 2400, clearance: rectClearance(1800, 650, 915), glyph: 'rect' },
  { key: 'duplex-120v', label: '120V Duplex', category: 'mep', width: 120, depth: 60, height: 110, clearance: rectClearance(120, 60, 0), glyph: 'mep' },
  { key: 'dedicated-240v', label: 'Dedicated 240V', category: 'mep', width: 120, depth: 60, height: 110, clearance: rectClearance(120, 60, 0), glyph: 'mep' },
  { key: 'gfi', label: 'GFI Damp-Location', category: 'mep', width: 120, depth: 60, height: 110, clearance: rectClearance(120, 60, 0), glyph: 'mep' },
  { key: 'floor-drop', label: 'Floor Drop Box', category: 'mep', width: 150, depth: 150, height: 30, clearance: rectClearance(150, 150, 0), glyph: 'mep' },
  { key: 'switch-single', label: 'Single-Pole Switch', category: 'mep', width: 100, depth: 50, height: 110, clearance: rectClearance(100, 50, 0), glyph: 'mep' },
  { key: 'switch-3-way', label: '3-Way Switch', category: 'mep', width: 100, depth: 50, height: 110, clearance: rectClearance(100, 50, 0), glyph: 'mep' },
  { key: 'dimmer', label: 'Dimmer', category: 'mep', width: 100, depth: 50, height: 110, clearance: rectClearance(100, 50, 0), glyph: 'mep' },
  { key: 'thermostat', label: 'Thermostat', category: 'mep', width: 130, depth: 35, height: 90, clearance: rectClearance(130, 35, 0), glyph: 'mep' },
  { key: 'floor-drain', label: 'Floor Waste Drain', category: 'mep', width: 150, depth: 150, height: 20, clearance: rectClearance(150, 150, 0), glyph: 'mep' },
  { key: 'gas-shutoff', label: 'Gas Supply Shut-off', category: 'mep', width: 100, depth: 100, height: 100, clearance: rectClearance(100, 100, 0), glyph: 'mep' },
  { key: 'water-heater-pad', label: 'Water Heater Pad', category: 'mep', width: 700, depth: 700, height: 100, clearance: rectClearance(700, 700, 760), glyph: 'mep' },
  { key: 'supply-diffuser', label: 'Ceiling Supply Diffuser', category: 'mep', width: 300, depth: 300, height: 30, clearance: rectClearance(300, 300, 0), glyph: 'mep' },
  { key: 'return-grille', label: 'Wall Return Grille', category: 'mep', width: 500, depth: 60, height: 300, clearance: rectClearance(500, 60, 0), glyph: 'mep' },
];

export const getSymbolDefinition = (key: string) => COMPONENT_LIBRARY.find((symbol) => symbol.key === key);
