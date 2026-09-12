export interface ElementReference {
  readonly symbol: string;
  readonly atomicNumber: number;
  readonly atomicWeight: number | null;
  readonly covalentRadius: number | null;
  readonly color: `#${string}`;
}

// Reference provenance:
// - Atomic weights: CIAAW, Abridged Standard Atomic Weights 2024. Values here
//   use the abridged representative value intended for routine calculations.
// - Covalent radii: Cordero et al., Dalton Trans. 2008, 2832-2838,
//   DOI 10.1039/B801115J. Radii are in ångström.
// - Element colors: Jmol documented default CPK/Jmol element colors.
// The illustrative pseudo-element X intentionally has no mass/radius so a
// downstream scientific calculation cannot accidentally treat it as an atom.
export const ELEMENTS: Readonly<Record<string, ElementReference>> = {
  X:  { symbol:'X',  atomicNumber:0,  atomicWeight:null, covalentRadius:null, color:'#B0B0B0' },
  H:  { symbol:'H',  atomicNumber:1,  atomicWeight:1.0080, covalentRadius:0.31, color:'#FFFFFF' },
  C:  { symbol:'C',  atomicNumber:6,  atomicWeight:12.011, covalentRadius:0.76, color:'#909090' },
  N:  { symbol:'N',  atomicNumber:7,  atomicWeight:14.007, covalentRadius:0.71, color:'#3050F8' },
  O:  { symbol:'O',  atomicNumber:8,  atomicWeight:15.999, covalentRadius:0.66, color:'#FF0D0D' },
  F:  { symbol:'F',  atomicNumber:9,  atomicWeight:18.998, covalentRadius:0.57, color:'#90E050' },
  Na: { symbol:'Na', atomicNumber:11, atomicWeight:22.990, covalentRadius:1.66, color:'#AB5CF2' },
  Mg: { symbol:'Mg', atomicNumber:12, atomicWeight:24.305, covalentRadius:1.41, color:'#8AFF00' },
  Al: { symbol:'Al', atomicNumber:13, atomicWeight:26.982, covalentRadius:1.21, color:'#BFA6A6' },
  Si: { symbol:'Si', atomicNumber:14, atomicWeight:28.085, covalentRadius:1.11, color:'#F0C8A0' },
  P:  { symbol:'P',  atomicNumber:15, atomicWeight:30.974, covalentRadius:1.07, color:'#FF8000' },
  S:  { symbol:'S',  atomicNumber:16, atomicWeight:32.06, covalentRadius:1.05, color:'#FFFF30' },
  Cl: { symbol:'Cl', atomicNumber:17, atomicWeight:35.45, covalentRadius:1.02, color:'#1FF01F' },
  K:  { symbol:'K',  atomicNumber:19, atomicWeight:39.098, covalentRadius:2.03, color:'#8F40D4' },
  Ca: { symbol:'Ca', atomicNumber:20, atomicWeight:40.078, covalentRadius:1.76, color:'#3DFF00' },
  Ti: { symbol:'Ti', atomicNumber:22, atomicWeight:47.867, covalentRadius:1.60, color:'#BFC2C7' },
  Fe: { symbol:'Fe', atomicNumber:26, atomicWeight:55.845, covalentRadius:1.52, color:'#E06633' },
  Cu: { symbol:'Cu', atomicNumber:29, atomicWeight:63.546, covalentRadius:1.32, color:'#C88033' },
  Zn: { symbol:'Zn', atomicNumber:30, atomicWeight:65.38, covalentRadius:1.22, color:'#7D80B0' },
  Sr: { symbol:'Sr', atomicNumber:38, atomicWeight:87.62, covalentRadius:1.95, color:'#00FF00' },
  Cs: { symbol:'Cs', atomicNumber:55, atomicWeight:132.91, covalentRadius:2.44, color:'#57178F' },
};

export const getElementReference = (symbol: string): ElementReference | undefined => ELEMENTS[symbol];
