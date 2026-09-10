import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { findDuplicateClusters, jaroWinkler, levenshteinSimilarity, mergeCluster, pairScore, phoneticKeys } from '../../src/tools/dedupe/dedupe-engine';
import { matrixToRows, parseCsvMatrix, rowsToCsv } from '../../src/tools/dedupe/dedupe-table';

const rows=[{name:'Steven Smith',company:'North Shore Health',email:'steven@example.com'},{name:'Stephen Smith',company:'Northshore Health',email:'steven@example.com'},{name:'Maria Gonzales',company:'Acme Logistics',email:'maria@acme.test'},{name:'Marya Gonzalez',company:'Acme Logistics',email:'maria@acme.test'},{name:'Completely Different',company:'Elsewhere',email:'other@example.test'}];

describe('fuzzy deduplication engine',()=>{
 it('provides bounded deterministic similarity scores',()=>{expect(jaroWinkler('alpha','alpha')).toBe(1);expect(levenshteinSimilarity('kitten','sitting')).toBeGreaterThan(.5);expect(jaroWinkler('alpha','zulu')).toBeLessThan(.6)});
 it('uses Double Metaphone-compatible phonetic keys',()=>{const steven=phoneticKeys('Steven'),stephen=phoneticKeys('Stephen');expect(steven.some(key=>stephen.includes(key))).toBe(true)});
 it('returns stable clusters at the configured threshold',()=>{const config={columns:[{column:'name',weight:.45},{column:'company',weight:.25},{column:'email',weight:.3}],threshold:.82};const first=findDuplicateClusters(rows,config);expect(first).toEqual(findDuplicateClusters(rows,config));expect(first.map(cluster=>cluster.members.map(member=>member.index))).toEqual([[0,1],[2,3]]);expect(first.every(cluster=>cluster.confidence>=config.threshold)).toBe(true)});
 it('does not let a stricter hard-coded blocker hide a pair that meets a lower configured threshold',()=>{const input=[{company:'kitten'},{company:'sitting'}];const config={columns:[{column:'company',weight:1}],threshold:.55};expect(pairScore(input[0],input[1],config)).toBeGreaterThanOrEqual(.55);expect(findDuplicateClusters(input,config)).toHaveLength(1)});
 it('reports the weakest pair across a transitive cluster instead of only qualifying links',()=>{const input=[{company:'aaaa'},{company:'aabb'},{company:'abbb'}];const config={columns:[{column:'company',weight:1}],threshold:.7};const clusters=findDuplicateClusters(input,config);expect(clusters).toHaveLength(1);expect(clusters[0].members.map(member=>member.index)).toEqual([0,1,2]);const weakest=pairScore(input[0],input[2],config);expect(weakest).toBeLessThan(config.threshold);expect(clusters[0].confidence).toBeCloseTo(weakest,10)});
 it('defaults canonical fields to the first nonblank member',()=>{const cluster={confidence:.9,members:[{index:0,row:{name:'',email:'first@test'}},{index:1,row:{name:'Ada',email:''}}]};expect(mergeCluster(cluster,{})).toEqual({name:'Ada',email:'first@test'})});
});

describe('tabular import/export integrity',()=>{
 it('rejects malformed quoted CSV rather than accepting a partial row',()=>{expect(()=>parseCsvMatrix('name,email\r\n"Ada,a@example.com\r\n')).toThrow(/CSV parse failed|quote/i)});
 it('makes normalized header collisions unique and reports them',()=>{const table=matrixToRows([['Email',' email ','Name'],['a','b','Ada']]);expect(table.headers).toEqual(['Email','email 2','Name']);expect(table.rows[0]).toMatchObject({Email:'a','email 2':'b',Name:'Ada'});expect(table.diagnostics.some(item=>item.kind==='renamed-header')).toBe(true)});
 it('preserves cells beyond the header row with generated headers',()=>{const table=matrixToRows([['Name'],['Ada','extra','third']]);expect(table.headers).toEqual(['Name','Column 2','Column 3']);expect(table.rows[0]).toEqual({Name:'Ada','Column 2':'extra','Column 3':'third'});expect(table.diagnostics.some(item=>item.kind==='extra-columns')).toBe(true)});
 it('protects spreadsheet exports from formula execution prefixes',()=>{const csv=rowsToCsv([{name:'=HYPERLINK("bad")',safe:'Ada'}],['name','safe']);expect(csv).toContain("'=HYPERLINK");expect(csv).toContain('Ada')});
 it('neutralizes formula-like values while preserving ordinary signed numeric and phone values exactly',()=>{const values=['=1+1','+SUM(A1:A2)','-cmd','@SUM(A1:A2)','\t=1','\r=1','\n=1','＝1','＋SUM(A1:A2)','－cmd','＠SUM(A1:A2)','-7.5','+15551234567'];const csv=rowsToCsv(values.map(value=>({value})),['value']);const parsed=Papa.parse<string[]>(csv,{delimiter:','});expect(parsed.errors).toEqual([]);expect(parsed.data.slice(1).map(row=>row[0])).toEqual(["'=1+1","'+SUM(A1:A2)","'-cmd","'@SUM(A1:A2)","'\t=1","'\r=1","'\n=1","'＝1","'＋SUM(A1:A2)","'－cmd","'＠SUM(A1:A2)",'-7.5','+15551234567'])});
});
