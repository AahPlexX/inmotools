import { useMemo, useState } from 'react';
import { buildClamp, buildScaleMatrix } from './fluid-engine';

export default function TypographyWorkspace(){
 const [min,setMin]=useState(1);const[max,setMax]=useState(2);const[minVp,setMinVp]=useState(320);const[maxVp,setMaxVp]=useState(1440);const[ratio,setRatio]=useState(1.25);
 const clamp=useMemo(()=>{try{return buildClamp({minValue:min,maxValue:max,minViewport:minVp,maxViewport:maxVp,unit:'rem'}).css}catch{return 'Invalid range'}},[min,max,minVp,maxVp]);
 const matrix=useMemo(()=>buildScaleMatrix({minBase:min,maxBase:max,ratio,steps:[-1,0,1,2,3]}),[min,max,ratio]);
 const css=matrix.map((step)=>`--${step.name}: clamp(${Number(step.min.toFixed(4))}rem, ${clamp==='Invalid range'?'1rem':clamp.replace(/^clamp\([^,]+, /,'').replace(/, [^)]+\)$/,'')}, ${Number(step.max.toFixed(4))}rem);`).join('\n');
 return <><div className="workspace-header"><div><h2>Fluid scale matrix</h2><p>Compare one responsive rule at four representative widths.</p></div></div><div className="workspace-body"><div className="workspace-grid three">
  <div className="field"><label htmlFor="min-type">Minimum rem</label><input id="min-type" type="number" step="0.125" value={min} onChange={(e)=>setMin(Number(e.target.value))}/></div><div className="field"><label htmlFor="max-type">Maximum rem</label><input id="max-type" type="number" step="0.125" value={max} onChange={(e)=>setMax(Number(e.target.value))}/></div><div className="field"><label htmlFor="ratio">Scale ratio</label><input id="ratio" type="number" step="0.01" value={ratio} onChange={(e)=>setRatio(Number(e.target.value))}/></div><div className="field"><label htmlFor="min-vp">Minimum viewport px</label><input id="min-vp" type="number" value={minVp} onChange={(e)=>setMinVp(Number(e.target.value))}/></div><div className="field"><label htmlFor="max-vp">Maximum viewport px</label><input id="max-vp" type="number" value={maxVp} onChange={(e)=>setMaxVp(Number(e.target.value))}/></div></div>
  <div className="notice" style={{marginTop:18}}><strong>Base clamp</strong><div><code>{clamp}</code></div></div>
  <div className="workspace-grid" style={{marginTop:18}}>{[320,768,1024,1440].map((width)=><div className="metric" key={width}><span>{width}px viewport</span><strong style={{fontSize:clamp==='Invalid range'?'1rem':clamp}}>Aa Responsive</strong><p className="help-text">Typography stays fluid without breakpoint jumps.</p></div>)}</div>
  <h3>CSS custom properties</h3><pre className="code-output">{`:root {\n${css.split('\n').map(line=>`  ${line}`).join('\n')}\n}`}</pre>
 </div></>;
}
