export interface ElementReference {
  readonly symbol: string;
  readonly atomicNumber: number;
  readonly atomicWeight: number | null;
  readonly covalentRadius: number | null;
  readonly color: `#${string}`;
  /**
   * Bound coherent neutron scattering length b (femtometers). This is the
   * neutron analog of the X-ray atomic scattering factor and does NOT track
   * atomic number (e.g. H is negative). Used only in neutron-mode structure
   * factors; null means no verified value is bundled for that symbol.
   */
  readonly coherentScatteringLength: number | null;
}

// Reference provenance:
// - Atomic weights: CIAAW, Abridged Standard Atomic Weights 2024. Values here
//   use the abridged representative value intended for routine calculations.
// - Covalent radii: Cordero et al., Dalton Trans. 2008, 2832-2838,
//   DOI 10.1039/B801115J. Radii are in ångström.
// - Element colors: Jmol documented default CPK/Jmol element colors.
// - Coherent neutron scattering lengths (b, fm): NIST Center for Neutron
//   Research, "Neutron scattering lengths and cross sections" reference
//   table (https://www.ncnr.nist.gov/resources/n-lengths/), cross-checked
//   against the canonical Sears (1992) compilation.
// The illustrative pseudo-element X intentionally has no mass/radius so a
// downstream scientific calculation cannot accidentally treat it as an atom.
export const ELEMENTS: Readonly<Record<string, ElementReference>> = {
  X:  { symbol:'X',  atomicNumber:0,  atomicWeight:null, covalentRadius:null, color:'#B0B0B0', coherentScatteringLength:null },
  H:  { symbol:'H',  atomicNumber:1,  atomicWeight:1.0080, covalentRadius:0.31, color:'#FFFFFF', coherentScatteringLength:-3.7409 },
  C:  { symbol:'C',  atomicNumber:6,  atomicWeight:12.011, covalentRadius:0.76, color:'#909090', coherentScatteringLength:6.6472 },
  N:  { symbol:'N',  atomicNumber:7,  atomicWeight:14.007, covalentRadius:0.71, color:'#3050F8', coherentScatteringLength:9.36 },
  O:  { symbol:'O',  atomicNumber:8,  atomicWeight:15.999, covalentRadius:0.66, color:'#FF0D0D', coherentScatteringLength:5.803 },
  F:  { symbol:'F',  atomicNumber:9,  atomicWeight:18.998, covalentRadius:0.57, color:'#90E050', coherentScatteringLength:5.654 },
  Na: { symbol:'Na', atomicNumber:11, atomicWeight:22.990, covalentRadius:1.66, color:'#AB5CF2', coherentScatteringLength:3.63 },
  Mg: { symbol:'Mg', atomicNumber:12, atomicWeight:24.305, covalentRadius:1.41, color:'#8AFF00', coherentScatteringLength:5.375 },
  Al: { symbol:'Al', atomicNumber:13, atomicWeight:26.982, covalentRadius:1.21, color:'#BFA6A6', coherentScatteringLength:3.449 },
  Si: { symbol:'Si', atomicNumber:14, atomicWeight:28.085, covalentRadius:1.11, color:'#F0C8A0', coherentScatteringLength:4.1507 },
  P:  { symbol:'P',  atomicNumber:15, atomicWeight:30.974, covalentRadius:1.07, color:'#FF8000', coherentScatteringLength:5.13 },
  S:  { symbol:'S',  atomicNumber:16, atomicWeight:32.06, covalentRadius:1.05, color:'#FFFF30', coherentScatteringLength:2.847 },
  Cl: { symbol:'Cl', atomicNumber:17, atomicWeight:35.45, covalentRadius:1.02, color:'#1FF01F', coherentScatteringLength:9.5792 },
  K:  { symbol:'K',  atomicNumber:19, atomicWeight:39.098, covalentRadius:2.03, color:'#8F40D4', coherentScatteringLength:3.67 },
  Ca: { symbol:'Ca', atomicNumber:20, atomicWeight:40.078, covalentRadius:1.76, color:'#3DFF00', coherentScatteringLength:4.70 },
  Ti: { symbol:'Ti', atomicNumber:22, atomicWeight:47.867, covalentRadius:1.60, color:'#BFC2C7', coherentScatteringLength:-3.370 },
  Fe: { symbol:'Fe', atomicNumber:26, atomicWeight:55.845, covalentRadius:1.52, color:'#E06633', coherentScatteringLength:9.45 },
  Cu: { symbol:'Cu', atomicNumber:29, atomicWeight:63.546, covalentRadius:1.32, color:'#C88033', coherentScatteringLength:7.718 },
  Zn: { symbol:'Zn', atomicNumber:30, atomicWeight:65.38, covalentRadius:1.22, color:'#7D80B0', coherentScatteringLength:5.68 },
  Sr: { symbol:'Sr', atomicNumber:38, atomicWeight:87.62, covalentRadius:1.95, color:'#00FF00', coherentScatteringLength:7.02 },
  Cs: { symbol:'Cs', atomicNumber:55, atomicWeight:132.91, covalentRadius:2.44, color:'#57178F', coherentScatteringLength:5.42 },
};

export const getElementReference = (symbol: string): ElementReference | undefined => ELEMENTS[symbol];
