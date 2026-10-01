// Craft Yarn Council Standard Yarn Weight System reference data, current as checked 2026-09-15.
// The values below are guidelines, not guarantees; the CYC explicitly recommends making and
// comparing a gauge swatch because yarn, hook, stitch pattern, and maker tension vary.

export interface YarnWeightStandard {
  readonly weight: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly name: string;
  readonly commonYarns: readonly string[];
  readonly crochetGaugePer4In: { readonly min: number; readonly max: number | null };
  readonly hookMm: { readonly min: number; readonly max: number | null };
  readonly usHook: string;
  readonly note?: string;
}

export const CYC_YARN_WEIGHT_STANDARDS: readonly YarnWeightStandard[] = [
  {
    weight: 0,
    name: 'Lace',
    commonYarns: ['Fingering', '10-count crochet thread'],
    crochetGaugePer4In: { min: 32, max: 42 },
    hookMm: { min: 2.25, max: 2.25 },
    usHook: 'Regular B-1; steel 6, 7, 8',
    note: 'Lace projects often intentionally use larger hooks; the CYC treats this gauge range as guidance only.',
  },
  {
    weight: 1,
    name: 'Super Fine',
    commonYarns: ['Sock', 'Fingering', 'Baby'],
    crochetGaugePer4In: { min: 21, max: 32 },
    hookMm: { min: 2.25, max: 3.5 },
    usHook: 'B-1 to E-4',
  },
  {
    weight: 2,
    name: 'Fine',
    commonYarns: ['Sport', 'Baby'],
    crochetGaugePer4In: { min: 16, max: 20 },
    hookMm: { min: 3.5, max: 4.5 },
    usHook: 'E-4 to 7',
  },
  {
    weight: 3,
    name: 'Light',
    commonYarns: ['DK', 'Light Worsted'],
    crochetGaugePer4In: { min: 12, max: 17 },
    hookMm: { min: 4.5, max: 5.5 },
    usHook: '7 to I-9',
  },
  {
    weight: 4,
    name: 'Medium',
    commonYarns: ['Worsted', 'Afghan', 'Aran'],
    crochetGaugePer4In: { min: 11, max: 14 },
    hookMm: { min: 5.5, max: 6.5 },
    usHook: 'I-9 to K-10½',
  },
  {
    weight: 5,
    name: 'Bulky',
    commonYarns: ['Chunky', 'Craft', 'Rug'],
    crochetGaugePer4In: { min: 8, max: 11 },
    hookMm: { min: 6.5, max: 9 },
    usHook: 'K-10½ to M/N-13',
  },
  {
    weight: 6,
    name: 'Super Bulky',
    commonYarns: ['Super Bulky', 'Roving'],
    crochetGaugePer4In: { min: 7, max: 9 },
    hookMm: { min: 9, max: 15 },
    usHook: 'M/N-13 to Q',
  },
  {
    weight: 7,
    name: 'Jumbo',
    commonYarns: ['Jumbo', 'Roving'],
    crochetGaugePer4In: { min: 0, max: 6 },
    hookMm: { min: 15, max: null },
    usHook: 'Q and larger',
  },
];

export const getYarnWeightStandard = (weight: number): YarnWeightStandard => {
  const standard = CYC_YARN_WEIGHT_STANDARDS.find((entry) => entry.weight === weight);
  if (!standard) throw new Error(`Unknown yarn weight category: ${weight}`);
  return standard;
};

export const formatHookRange = (standard: YarnWeightStandard): string => standard.hookMm.max === null
  ? `${standard.hookMm.min} mm and larger`
  : standard.hookMm.min === standard.hookMm.max
    ? `${standard.hookMm.min} mm regular hook`
    : `${standard.hookMm.min}–${standard.hookMm.max} mm`;

export const formatCrochetGaugeRange = (standard: YarnWeightStandard): string => {
  if (standard.weight === 7) return '6 stitches or fewer per 4 in';
  return `${standard.crochetGaugePer4In.min}–${standard.crochetGaugePer4In.max} stitches per 4 in`;
};
