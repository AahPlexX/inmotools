import type { RegexCompatibilityEntry, RegexFlavor } from './regex-types';

type Feature = 'lookbehind' | 'backreference' | 'atomic' | 'possessive' | 'branchReset' | 'recursion' | 'conditional';
const detectFeatures = (pattern: string): Set<Feature> => {
  const features = new Set<Feature>();
  if (/\(\?<=[\s\S]|\(\?<!/.test(pattern)) features.add('lookbehind');
  if (/\\[1-9]|\\k<|\(\?P=/.test(pattern)) features.add('backreference');
  if (/\(\?>/.test(pattern)) features.add('atomic');
  if (/(?:\*|\+|\?|\{\d+(?:,\d*)?\})\+/.test(pattern)) features.add('possessive');
  if (/\(\?\|/.test(pattern)) features.add('branchReset');
  if (/\(\?R\)|\(\?&|\(\?P>/.test(pattern)) features.add('recursion');
  if (/\(\?\(/.test(pattern)) features.add('conditional');
  return features;
};

const unsupported: Record<RegexFlavor, readonly Feature[]> = {
  ecmascript: ['atomic', 'possessive', 'branchReset', 'recursion', 'conditional'],
  pcre2: [],
  python: ['branchReset', 'recursion'],
  'go-re2': ['lookbehind', 'backreference', 'atomic', 'possessive', 'branchReset', 'recursion', 'conditional'],
  rust: ['lookbehind', 'backreference', 'atomic', 'possessive', 'branchReset', 'recursion', 'conditional'],
  oniguruma: ['branchReset', 'conditional'],
};
const labels: Record<RegexFlavor, string> = { ecmascript: 'ECMAScript', pcre2: 'PCRE2 10.47', python: 'Python re', 'go-re2': 'Go / RE2', rust: 'Rust regex', oniguruma: 'Oniguruma' };
const notes: Record<RegexFlavor, string> = {
  ecmascript: 'Executes in the browser RegExp engine.',
  pcre2: 'Executes through the bundled PCRE2 WebAssembly runtime.',
  python: 'Compatibility analysis and code generation only in this release.',
  'go-re2': 'RE2-style compatibility analysis and Go code generation only in this release.',
  rust: 'Rust regex compatibility analysis and code generation only in this release.',
  oniguruma: 'Oniguruma compatibility analysis only in this release.',
};

export const analyzeCompatibility = (pattern: string): RegexCompatibilityEntry[] => {
  const found = detectFeatures(pattern);
  return (Object.keys(labels) as RegexFlavor[]).map((flavor) => {
    const issues = unsupported[flavor].filter((feature) => found.has(feature)).map((feature) => `Does not support ${feature.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)} in this compatibility model.`);
    return { flavor, label: labels[flavor], capability: flavor === 'ecmascript' || flavor === 'pcre2' ? 'execution' : 'compatibility', supported: issues.length === 0, issues, note: notes[flavor] };
  });
};
