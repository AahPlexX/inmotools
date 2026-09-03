import { buildRegexAutomaton, type RegexAutomatonModel } from './regex-automaton';
import type { RegexExplanationNode } from './regex-types';
export interface RegexDebugStep { readonly index:number; readonly label:string; readonly source:string; readonly start:number; readonly end:number; readonly depth:number; }
export interface RegexDebugTrace { readonly nativeEngineTrace:false; readonly note:string; readonly steps:readonly RegexDebugStep[]; readonly automaton: RegexAutomatonModel; }
const flatten=(node:RegexExplanationNode,depth=0):RegexDebugStep[]=>node.children.flatMap((child)=>[{index:0,label:child.label,source:child.source,start:child.start,end:child.end,depth},...flatten(child,depth+1)]);
export const buildDebugTrace=(root:RegexExplanationNode):RegexDebugTrace=>({nativeEngineTrace:false,note:'Structural source traversal, not native engine backtracking steps.',steps:flatten(root).map((step,index)=>({...step,index})),automaton:buildRegexAutomaton(root.source)});
export const formatRegexForReview=(root:RegexExplanationNode):string=>{const trace=buildDebugTrace(root);if(!trace.steps.length)return`${root.source||'∅'} — ${root.label}`;return trace.steps.map((step)=>`${'  '.repeat(step.depth)}${String(step.index+1).padStart(2,'0')} [${step.start}–${step.end}] ${step.source||'∅'} — ${step.label}`).join('\n');};
