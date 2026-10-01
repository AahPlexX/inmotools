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
//   DOI 10.1039/B801115J. Radii are in ångström. Carbon uses the sp3 value;
//   Mn, Fe and Co use the high-spin values.
// - Coverage: H through Bi plus Th and U, except Tc and Pm, which have no
//   stable isotope and therefore no standard atomic weight. Po-Ra, Ac and Pa
//   are deliberately absent; an unknown symbol fails loudly instead of being
//   guessed. B, Cd, In, Sm and Gd carry null neutron lengths because their
//   published values are complex (strongly absorbing) and a real-only number
//   would misstate the intensity.
// - Element colors: Jmol documented default CPK/Jmol element colors.
// - Coherent neutron scattering lengths (b, fm): NIST Center for Neutron
//   Research, "Neutron scattering lengths and cross sections" reference
//   table (https://www.ncnr.nist.gov/resources/n-lengths/), cross-checked
//   against the canonical Sears (1992) compilation.
// The illustrative pseudo-element X intentionally has no mass/radius so a
// downstream scientific calculation cannot accidentally treat it as an atom.
export const ELEMENTS: Readonly<Record<string, ElementReference>> = {
  X:  { symbol:'X',  atomicNumber:0,  atomicWeight:null, covalentRadius:null, color:'#B0B0B0', coherentScatteringLength:null },
  H:  { symbol:'H', atomicNumber:1, atomicWeight:1.0080, covalentRadius:0.31, color:'#FFFFFF', coherentScatteringLength:-3.7409 },
  He: { symbol:'He', atomicNumber:2, atomicWeight:4.0026, covalentRadius:0.28, color:'#D9FFFF', coherentScatteringLength:3.0985 },
  Li: { symbol:'Li', atomicNumber:3, atomicWeight:6.94, covalentRadius:1.28, color:'#CC80FF', coherentScatteringLength:-1.930 },
  Be: { symbol:'Be', atomicNumber:4, atomicWeight:9.0122, covalentRadius:0.96, color:'#C2FF00', coherentScatteringLength:7.790 },
  B:  { symbol:'B', atomicNumber:5, atomicWeight:10.81, covalentRadius:0.84, color:'#FFB5B5', coherentScatteringLength:null },
  C:  { symbol:'C', atomicNumber:6, atomicWeight:12.011, covalentRadius:0.76, color:'#909090', coherentScatteringLength:6.6472 },
  N:  { symbol:'N', atomicNumber:7, atomicWeight:14.007, covalentRadius:0.71, color:'#3050F8', coherentScatteringLength:9.36 },
  O:  { symbol:'O', atomicNumber:8, atomicWeight:15.999, covalentRadius:0.66, color:'#FF0D0D', coherentScatteringLength:5.803 },
  F:  { symbol:'F', atomicNumber:9, atomicWeight:18.998, covalentRadius:0.57, color:'#90E050', coherentScatteringLength:5.654 },
  Ne: { symbol:'Ne', atomicNumber:10, atomicWeight:20.180, covalentRadius:0.58, color:'#B3E3F5', coherentScatteringLength:4.566 },
  Na: { symbol:'Na', atomicNumber:11, atomicWeight:22.990, covalentRadius:1.66, color:'#AB5CF2', coherentScatteringLength:3.63 },
  Mg: { symbol:'Mg', atomicNumber:12, atomicWeight:24.305, covalentRadius:1.41, color:'#8AFF00', coherentScatteringLength:5.375 },
  Al: { symbol:'Al', atomicNumber:13, atomicWeight:26.982, covalentRadius:1.21, color:'#BFA6A6', coherentScatteringLength:3.449 },
  Si: { symbol:'Si', atomicNumber:14, atomicWeight:28.085, covalentRadius:1.11, color:'#F0C8A0', coherentScatteringLength:4.1507 },
  P:  { symbol:'P', atomicNumber:15, atomicWeight:30.974, covalentRadius:1.07, color:'#FF8000', coherentScatteringLength:5.13 },
  S:  { symbol:'S', atomicNumber:16, atomicWeight:32.06, covalentRadius:1.05, color:'#FFFF30', coherentScatteringLength:2.847 },
  Cl: { symbol:'Cl', atomicNumber:17, atomicWeight:35.45, covalentRadius:1.02, color:'#1FF01F', coherentScatteringLength:9.5792 },
  Ar: { symbol:'Ar', atomicNumber:18, atomicWeight:39.95, covalentRadius:1.06, color:'#80D1E3', coherentScatteringLength:1.909 },
  K:  { symbol:'K', atomicNumber:19, atomicWeight:39.098, covalentRadius:2.03, color:'#8F40D4', coherentScatteringLength:3.67 },
  Ca: { symbol:'Ca', atomicNumber:20, atomicWeight:40.078, covalentRadius:1.76, color:'#3DFF00', coherentScatteringLength:4.70 },
  Sc: { symbol:'Sc', atomicNumber:21, atomicWeight:44.956, covalentRadius:1.70, color:'#E6E6E6', coherentScatteringLength:12.10 },
  Ti: { symbol:'Ti', atomicNumber:22, atomicWeight:47.867, covalentRadius:1.60, color:'#BFC2C7', coherentScatteringLength:-3.370 },
  V:  { symbol:'V', atomicNumber:23, atomicWeight:50.942, covalentRadius:1.53, color:'#A6A6AB', coherentScatteringLength:-0.443 },
  Cr: { symbol:'Cr', atomicNumber:24, atomicWeight:51.996, covalentRadius:1.39, color:'#8A99C7', coherentScatteringLength:3.635 },
  Mn: { symbol:'Mn', atomicNumber:25, atomicWeight:54.938, covalentRadius:1.61, color:'#9C7AC7', coherentScatteringLength:-3.750 },
  Fe: { symbol:'Fe', atomicNumber:26, atomicWeight:55.845, covalentRadius:1.52, color:'#E06633', coherentScatteringLength:9.45 },
  Co: { symbol:'Co', atomicNumber:27, atomicWeight:58.933, covalentRadius:1.50, color:'#F090A0', coherentScatteringLength:2.490 },
  Ni: { symbol:'Ni', atomicNumber:28, atomicWeight:58.693, covalentRadius:1.24, color:'#50D050', coherentScatteringLength:10.30 },
  Cu: { symbol:'Cu', atomicNumber:29, atomicWeight:63.546, covalentRadius:1.32, color:'#C88033', coherentScatteringLength:7.718 },
  Zn: { symbol:'Zn', atomicNumber:30, atomicWeight:65.38, covalentRadius:1.22, color:'#7D80B0', coherentScatteringLength:5.68 },
  Ga: { symbol:'Ga', atomicNumber:31, atomicWeight:69.723, covalentRadius:1.22, color:'#C28F8F', coherentScatteringLength:7.288 },
  Ge: { symbol:'Ge', atomicNumber:32, atomicWeight:72.630, covalentRadius:1.20, color:'#668F8F', coherentScatteringLength:8.185 },
  As: { symbol:'As', atomicNumber:33, atomicWeight:74.922, covalentRadius:1.19, color:'#BD80E3', coherentScatteringLength:6.580 },
  Se: { symbol:'Se', atomicNumber:34, atomicWeight:78.971, covalentRadius:1.20, color:'#FFA100', coherentScatteringLength:7.970 },
  Br: { symbol:'Br', atomicNumber:35, atomicWeight:79.904, covalentRadius:1.20, color:'#A62929', coherentScatteringLength:6.790 },
  Kr: { symbol:'Kr', atomicNumber:36, atomicWeight:83.798, covalentRadius:1.16, color:'#5CB8D1', coherentScatteringLength:7.810 },
  Rb: { symbol:'Rb', atomicNumber:37, atomicWeight:85.468, covalentRadius:2.20, color:'#702EB0', coherentScatteringLength:7.080 },
  Sr: { symbol:'Sr', atomicNumber:38, atomicWeight:87.62, covalentRadius:1.95, color:'#00FF00', coherentScatteringLength:7.02 },
  Y:  { symbol:'Y', atomicNumber:39, atomicWeight:88.906, covalentRadius:1.90, color:'#94FFFF', coherentScatteringLength:7.750 },
  Zr: { symbol:'Zr', atomicNumber:40, atomicWeight:91.222, covalentRadius:1.75, color:'#94E0E0', coherentScatteringLength:7.160 },
  Nb: { symbol:'Nb', atomicNumber:41, atomicWeight:92.906, covalentRadius:1.64, color:'#73C2C9', coherentScatteringLength:7.054 },
  Mo: { symbol:'Mo', atomicNumber:42, atomicWeight:95.95, covalentRadius:1.54, color:'#54B5B5', coherentScatteringLength:6.715 },
  Ru: { symbol:'Ru', atomicNumber:44, atomicWeight:101.07, covalentRadius:1.46, color:'#248F8F', coherentScatteringLength:7.020 },
  Rh: { symbol:'Rh', atomicNumber:45, atomicWeight:102.91, covalentRadius:1.42, color:'#0A7D8C', coherentScatteringLength:5.90 },
  Pd: { symbol:'Pd', atomicNumber:46, atomicWeight:106.42, covalentRadius:1.39, color:'#006985', coherentScatteringLength:5.91 },
  Ag: { symbol:'Ag', atomicNumber:47, atomicWeight:107.87, covalentRadius:1.45, color:'#C0C0C0', coherentScatteringLength:5.922 },
  Cd: { symbol:'Cd', atomicNumber:48, atomicWeight:112.41, covalentRadius:1.44, color:'#FFD98F', coherentScatteringLength:null },
  In: { symbol:'In', atomicNumber:49, atomicWeight:114.82, covalentRadius:1.42, color:'#A67573', coherentScatteringLength:null },
  Sn: { symbol:'Sn', atomicNumber:50, atomicWeight:118.71, covalentRadius:1.39, color:'#668080', coherentScatteringLength:6.2239 },
  Sb: { symbol:'Sb', atomicNumber:51, atomicWeight:121.76, covalentRadius:1.39, color:'#9E63B5', coherentScatteringLength:5.570 },
  Te: { symbol:'Te', atomicNumber:52, atomicWeight:127.60, covalentRadius:1.38, color:'#D47A00', coherentScatteringLength:5.680 },
  I:  { symbol:'I', atomicNumber:53, atomicWeight:126.90, covalentRadius:1.39, color:'#940094', coherentScatteringLength:5.280 },
  Xe: { symbol:'Xe', atomicNumber:54, atomicWeight:131.29, covalentRadius:1.40, color:'#429EB0', coherentScatteringLength:4.69 },
  Cs: { symbol:'Cs', atomicNumber:55, atomicWeight:132.91, covalentRadius:2.44, color:'#57178F', coherentScatteringLength:5.42 },
  Ba: { symbol:'Ba', atomicNumber:56, atomicWeight:137.33, covalentRadius:2.15, color:'#00C900', coherentScatteringLength:5.070 },
  La: { symbol:'La', atomicNumber:57, atomicWeight:138.91, covalentRadius:2.07, color:'#70D4FF', coherentScatteringLength:8.24 },
  Ce: { symbol:'Ce', atomicNumber:58, atomicWeight:140.12, covalentRadius:2.04, color:'#FFFFC7', coherentScatteringLength:4.840 },
  Pr: { symbol:'Pr', atomicNumber:59, atomicWeight:140.91, covalentRadius:2.03, color:'#D9FFC7', coherentScatteringLength:4.44 },
  Nd: { symbol:'Nd', atomicNumber:60, atomicWeight:144.24, covalentRadius:2.01, color:'#C7FFC7', coherentScatteringLength:7.87 },
  Sm: { symbol:'Sm', atomicNumber:62, atomicWeight:150.36, covalentRadius:1.98, color:'#8FFFC7', coherentScatteringLength:null },
  Eu: { symbol:'Eu', atomicNumber:63, atomicWeight:151.96, covalentRadius:1.98, color:'#61FFC7', coherentScatteringLength:5.30 },
  Gd: { symbol:'Gd', atomicNumber:64, atomicWeight:157.25, covalentRadius:1.96, color:'#45FFC7', coherentScatteringLength:null },
  Tb: { symbol:'Tb', atomicNumber:65, atomicWeight:158.93, covalentRadius:1.94, color:'#30FFC7', coherentScatteringLength:7.340 },
  Dy: { symbol:'Dy', atomicNumber:66, atomicWeight:162.50, covalentRadius:1.92, color:'#1FFFC7', coherentScatteringLength:16.90 },
  Ho: { symbol:'Ho', atomicNumber:67, atomicWeight:164.93, covalentRadius:1.92, color:'#00FF9C', coherentScatteringLength:8.440 },
  Er: { symbol:'Er', atomicNumber:68, atomicWeight:167.26, covalentRadius:1.89, color:'#00E675', coherentScatteringLength:7.790 },
  Tm: { symbol:'Tm', atomicNumber:69, atomicWeight:168.93, covalentRadius:1.90, color:'#00D452', coherentScatteringLength:7.070 },
  Yb: { symbol:'Yb', atomicNumber:70, atomicWeight:173.05, covalentRadius:1.87, color:'#00BF38', coherentScatteringLength:12.410 },
  Lu: { symbol:'Lu', atomicNumber:71, atomicWeight:174.97, covalentRadius:1.87, color:'#00AB24', coherentScatteringLength:7.210 },
  Hf: { symbol:'Hf', atomicNumber:72, atomicWeight:178.49, covalentRadius:1.75, color:'#4DC2FF', coherentScatteringLength:7.77 },
  Ta: { symbol:'Ta', atomicNumber:73, atomicWeight:180.95, covalentRadius:1.70, color:'#4DA6FF', coherentScatteringLength:6.91 },
  W:  { symbol:'W', atomicNumber:74, atomicWeight:183.84, covalentRadius:1.62, color:'#2194D6', coherentScatteringLength:4.755 },
  Re: { symbol:'Re', atomicNumber:75, atomicWeight:186.21, covalentRadius:1.51, color:'#267DAB', coherentScatteringLength:9.20 },
  Os: { symbol:'Os', atomicNumber:76, atomicWeight:190.23, covalentRadius:1.44, color:'#266696', coherentScatteringLength:10.70 },
  Ir: { symbol:'Ir', atomicNumber:77, atomicWeight:192.22, covalentRadius:1.41, color:'#175487', coherentScatteringLength:10.60 },
  Pt: { symbol:'Pt', atomicNumber:78, atomicWeight:195.08, covalentRadius:1.36, color:'#D0D0E0', coherentScatteringLength:9.600 },
  Au: { symbol:'Au', atomicNumber:79, atomicWeight:196.97, covalentRadius:1.36, color:'#FFD123', coherentScatteringLength:7.90 },
  Hg: { symbol:'Hg', atomicNumber:80, atomicWeight:200.59, covalentRadius:1.32, color:'#B8B8D0', coherentScatteringLength:12.60 },
  Tl: { symbol:'Tl', atomicNumber:81, atomicWeight:204.38, covalentRadius:1.45, color:'#A6544D', coherentScatteringLength:8.776 },
  Pb: { symbol:'Pb', atomicNumber:82, atomicWeight:207.2, covalentRadius:1.46, color:'#575961', coherentScatteringLength:9.4024 },
  Bi: { symbol:'Bi', atomicNumber:83, atomicWeight:208.98, covalentRadius:1.48, color:'#9E4FB5', coherentScatteringLength:8.5242 },
  Th: { symbol:'Th', atomicNumber:90, atomicWeight:232.04, covalentRadius:2.06, color:'#00BAFF', coherentScatteringLength:10.310 },
  U:  { symbol:'U', atomicNumber:92, atomicWeight:238.03, covalentRadius:1.96, color:'#008FFF', coherentScatteringLength:8.417 },
};

export const getElementReference = (symbol: string): ElementReference | undefined => ELEMENTS[symbol];
