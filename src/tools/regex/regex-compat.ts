import type { RegexCompatibilityEntry, RegexFlavor } from './regex-types';

type Feature = 'lookbehind' | 'backreference' | 'atomic' | 'possessive' | 'branchReset' | 'recursion' | 'conditional';
export interface RegexFlavorDescriptor { readonly value: RegexFlavor; readonly label: string; readonly capability: 'execution' | 'compatibility'; readonly note: string; }
export const REGEX_FLAVOR_CATALOG: readonly RegexFlavorDescriptor[] = [
  { value:'ecmascript', label:'ECMAScript', capability:'execution', note:'Executes in the browser RegExp engine.' },
  { value:'pcre2', label:'PCRE2 10.47 WASM', capability:'execution', note:'Executes through the bundled PCRE2 WebAssembly runtime.' },
  { value:'pcre', label:'PCRE legacy · compatibility', capability:'compatibility', note:'Syntax compatibility analysis and code guidance; no legacy PCRE runtime is bundled.' },
  { value:'python', label:'Python re · compatibility', capability:'compatibility', note:'Compatibility analysis and Python code generation; no Python runtime is bundled.' },
  { value:'go-re2', label:'Go / RE2 · compatibility', capability:'compatibility', note:'RE2-style compatibility analysis and Go code generation; no Go runtime is bundled.' },
  { value:'java', label:'Java Pattern · compatibility', capability:'compatibility', note:'Java Pattern syntax compatibility analysis and Java code generation.' },
  { value:'dotnet', label:'.NET Regex · compatibility', capability:'compatibility', note:'.NET Regex compatibility analysis and C# code generation.' },
  { value:'rust', label:'Rust regex · compatibility', capability:'compatibility', note:'Rust regex crate compatibility analysis and Rust code generation.' },
  { value:'posix-ere', label:'POSIX ERE · compatibility', capability:'compatibility', note:'POSIX Extended Regular Expression compatibility analysis.' },
  { value:'posix-bre', label:'POSIX BRE · compatibility', capability:'compatibility', note:'POSIX Basic Regular Expression compatibility analysis.' },
  { value:'oniguruma', label:'Oniguruma WASM', capability:'execution', note:'Executes locally through Microsoft’s bundled vscode-oniguruma WebAssembly binding.' },
];
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
  ecmascript:['atomic','possessive','branchReset','recursion','conditional'], pcre:[], pcre2:[], python:['branchReset','recursion'],
  'go-re2':['lookbehind','backreference','atomic','possessive','branchReset','recursion','conditional'], java:['branchReset','recursion','conditional'],
  dotnet:['possessive','branchReset','recursion'], rust:['lookbehind','backreference','atomic','possessive','branchReset','recursion','conditional'],
  'posix-ere':['lookbehind','backreference','atomic','possessive','branchReset','recursion','conditional'], 'posix-bre':['lookbehind','atomic','possessive','branchReset','recursion','conditional'],
  oniguruma:['branchReset','conditional'],
};
const featureLabel=(feature:Feature)=>feature.replace(/[A-Z]/g,(letter)=>` ${letter.toLowerCase()}`);
export const analyzeCompatibility=(pattern:string):RegexCompatibilityEntry[]=>{ const found=detectFeatures(pattern); return REGEX_FLAVOR_CATALOG.map((descriptor)=>{ const issues=unsupported[descriptor.value].filter((feature)=>found.has(feature)).map((feature)=>`Does not support ${featureLabel(feature)} in this compatibility model.`); return { flavor:descriptor.value,label:descriptor.label.replace(' · compatibility','').replace(' WASM',''),capability:descriptor.capability,supported:issues.length===0,issues,note:descriptor.note }; }); };
