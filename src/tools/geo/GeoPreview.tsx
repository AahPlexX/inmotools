import type { GeoBounds } from './geo-engine';

type Point=[number,number];
type View={zoom:number;panX:number;panY:number};
type Props={data:any;label:string;bounds:GeoBounds|null;view:View;onViewChange:(view:View)=>void;maxPoints?:number};

type Preview={lines:Point[][];pointsSeen:number;truncated:boolean};
function collectPreview(data:any,maxPoints:number):Preview{
 const lines:Point[][]=[];let pointsSeen=0;let kept=0;let truncated=false;
 const pushLine=(coordinates:unknown)=>{if(!Array.isArray(coordinates))return;if(coordinates.length>=2&&coordinates.every(item=>typeof item==='number')){pointsSeen++;if(kept<maxPoints){lines.push([[coordinates[0] as number,coordinates[1] as number]]);kept++;}else truncated=true;return;}if(coordinates.length&&coordinates.every(item=>Array.isArray(item)&&item.length>=2&&item.every(component=>typeof component==='number'))){const line:Point[]=[];const remaining=Math.max(0,maxPoints-kept);const stride=Math.max(1,Math.ceil(coordinates.length/Math.max(1,remaining)));for(let i=0;i<coordinates.length;i++){pointsSeen++;if(kept<maxPoints&&(i%stride===0||i===coordinates.length-1)){const point=coordinates[i] as number[];line.push([point[0],point[1]]);kept++;}else truncated=true;}if(line.length)lines.push(line);return;}for(const child of coordinates)pushLine(child);};
 const visit=(value:any)=>{if(!value)return;if(value.type==='FeatureCollection'){for(const feature of value.features??[])visit(feature);return;}if(value.type==='Feature'){visit(value.geometry);return;}if(value.type==='GeometryCollection'){for(const geometry of value.geometries??[])visit(geometry);return;}pushLine(value.coordinates);};
 visit(data);return{lines,pointsSeen,truncated};
}

export default function GeoPreview({data,label,bounds,view,onViewChange,maxPoints=5000}:Props){
 const preview=collectPreview(data,maxPoints);if(!preview.lines.length||!bounds)return <div className="notice">No plottable coordinates found.</div>;
 const width=600,height=300,pad=18;const spanX=Math.max(1e-12,bounds.maxX-bounds.minX),spanY=Math.max(1e-12,bounds.maxY-bounds.minY);const baseScale=Math.min((width-pad*2)/spanX,(height-pad*2)/spanY);const scale=baseScale*view.zoom;const centerX=(bounds.minX+bounds.maxX)/2;const centerY=(bounds.minY+bounds.maxY)/2;
 const project=([x,y]:Point)=>[width/2+(x-centerX)*scale+view.panX,height/2-(y-centerY)*scale+view.panY] as const;
 const updatePan=(dx:number,dy:number)=>onViewChange({...view,panX:view.panX+dx,panY:view.panY+dy});
 return <div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{width:'100%',height:260,display:'block',background:'#fbfcfd',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',touchAction:'none'}} onWheel={(event)=>{event.preventDefault();const next=Math.max(.5,Math.min(20,view.zoom*(event.deltaY<0?1.15:.87)));onViewChange({...view,zoom:next})}} onPointerDown={(event)=>{const target=event.currentTarget;target.setPointerCapture(event.pointerId);target.dataset.dragX=String(event.clientX);target.dataset.dragY=String(event.clientY)}} onPointerMove={(event)=>{const target=event.currentTarget;if(!target.hasPointerCapture(event.pointerId))return;const previousX=Number(target.dataset.dragX),previousY=Number(target.dataset.dragY);if(Number.isFinite(previousX)&&Number.isFinite(previousY))updatePan(event.clientX-previousX,event.clientY-previousY);target.dataset.dragX=String(event.clientX);target.dataset.dragY=String(event.clientY)}}>
 <rect x="0" y="0" width={width} height={height} fill="transparent"/>{preview.lines.map((line,index)=>{const projected=line.map(project);if(projected.length===1)return <circle key={index} cx={projected[0][0]} cy={projected[0][1]} r="2.5" fill="var(--signal)"/>;const d=projected.map(([x,y],pointIndex)=>`${pointIndex?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');return <path key={index} d={d} fill="none" stroke="var(--signal)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>})}</svg>{preview.truncated?<p className="help-text">Preview sampled at most {maxPoints.toLocaleString()} positions to keep interaction responsive. Export still uses the complete geometry.</p>:null}</div>;
}
