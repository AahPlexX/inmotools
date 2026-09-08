import type { DedupeRow } from './dedupe-engine';

export type DedupeTableDiagnostic={kind:'renamed-header'|'extra-columns';message:string};
export function normalizeHeaderKey(value:string):string{return value.trim().toLowerCase().replace(/\s+/g,' ')}
export function matrixToRows(matrix:unknown[][]):{headers:string[];rows:DedupeRow[];diagnostics:DedupeTableDiagnostic[]}{
 if(!matrix.length)return{headers:[],rows:[],diagnostics:[]};
 const diagnostics:DedupeTableDiagnostic[]=[];let widest=0;for(const row of matrix)if(row.length>widest)widest=row.length;const rawHeaders=Array.from({length:widest},(_,index)=>index<matrix[0].length?String(matrix[0][index]??'').trim():`Column ${index+1}`);if(widest>matrix[0].length)diagnostics.push({kind:'extra-columns',message:`${widest-matrix[0].length} column${widest-matrix[0].length===1?'':'s'} appeared beyond the header row and were preserved with generated names.`});
 const used=new Set<string>();const headers=rawHeaders.map((raw,index)=>{const base=raw||`Column ${index+1}`;let candidate=base;let suffix=2;while(used.has(normalizeHeaderKey(candidate)))candidate=`${base} ${suffix++}`;if(candidate!==base)diagnostics.push({kind:'renamed-header',message:`Header “${base}” was renamed to “${candidate}” so normalized column names remain unique.`});used.add(normalizeHeaderKey(candidate));return candidate;});
 const rows=matrix.slice(1).filter(values=>values.some(value=>value!==null&&value!==undefined&&String(value).trim()!=='')).map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??''])));
 return{headers,rows,diagnostics};
}
export function csvCell(value:unknown){const text=String(value??'');const safe=/^[=+\-@]/.test(text)?`'${text}`:text;return /[",\r\n]/.test(safe)?`"${safe.replace(/"/g,'""')}"`:safe}
export function rowsToCsv(rows:DedupeRow[],headers:string[]){return[headers.map(csvCell).join(','),...rows.map(row=>headers.map(header=>csvCell(row[header])).join(','))].join('\n')}
