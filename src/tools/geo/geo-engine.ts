import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';

export type GeoSimplifyOptions = { decimals: number; retain: number; output: 'geojson' | 'topojson' };
type JsonObject = Record<string, any>;
export type GeoBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type GeoValidation = { valid: boolean; errors: string[]; warnings: string[]; featureCount: number; coordinateCount: number; bounds: GeoBounds | null };
const GEOMETRY_TYPES = new Set(['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon','GeometryCollection']);
const GEO_TYPES = new Set([...GEOMETRY_TYPES,'Feature','FeatureCollection']);

function roundNumber(value: number, decimals: number) { const factor=10**Math.max(0,Math.min(12,Math.trunc(decimals))); return Math.round((value+Number.EPSILON)*factor)/factor; }
function roundCoordinates(value: unknown, decimals: number): unknown { if(!Array.isArray(value))return value; if(value.length>0&&value.every((item)=>typeof item==='number'))return value.map((item)=>roundNumber(item as number,decimals)); return value.map((item)=>roundCoordinates(item,decimals)); }
function roundGeometry(geometry: JsonObject|null, decimals:number):JsonObject|null { if(!geometry)return geometry; if(geometry.type==='GeometryCollection')return {...geometry,geometries:(geometry.geometries??[]).map((item:JsonObject)=>roundGeometry(item,decimals))}; return {...geometry,coordinates:roundCoordinates(geometry.coordinates,decimals)}; }
export function roundGeoCoordinates<T extends JsonObject>(input:T,decimals:number):T { if(input.type==='FeatureCollection')return {...input,features:(input.features??[]).map((item:JsonObject)=>({...item,geometry:roundGeometry(item.geometry,decimals)}))} as T; if(input.type==='Feature')return {...input,geometry:roundGeometry(input.geometry,decimals)} as T; return roundGeometry(input,decimals) as T; }

function visitPositions(value: unknown, visitor:(position:number[])=>void):void {
  if(!Array.isArray(value))return;
  if(value.length>=2&&value.every((item)=>typeof item==='number')){visitor(value as number[]);return;}
  for(const child of value)visitPositions(child,visitor);
}
function visitGeometry(geometry:any,visitor:(position:number[])=>void):void { if(!geometry)return; if(geometry.type==='GeometryCollection'){for(const child of geometry.geometries??[])visitGeometry(child,visitor);return;} visitPositions(geometry.coordinates,visitor); }
function visitGeo(input:any,visitor:(position:number[])=>void):void { if(!input)return; if(input.type==='FeatureCollection'){for(const item of input.features??[])visitGeo(item,visitor);return;} if(input.type==='Feature'){visitGeometry(input.geometry,visitor);return;} visitGeometry(input,visitor); }

export function countCoordinates(input: JsonObject|null):number { let count=0;visitGeo(input,()=>{count+=1});return count; }
export function computeGeoBounds(input:JsonObject|null):GeoBounds|null { let bounds:GeoBounds|null=null;visitGeo(input,(position)=>{const x=position[0],y=position[1];if(!Number.isFinite(x)||!Number.isFinite(y))return;if(!bounds)bounds={minX:x,minY:y,maxX:x,maxY:y};else{if(x<bounds.minX)bounds.minX=x;if(x>bounds.maxX)bounds.maxX=x;if(y<bounds.minY)bounds.minY=y;if(y>bounds.maxY)bounds.maxY=y;}});return bounds; }

export function validateGeoJson(input:unknown):GeoValidation {
  const errors:string[]=[];const warnings:string[]=[];let featureCount=0;let coordinateCount=0;let bounds:GeoBounds|null=null;
  const inspectPosition=(position:unknown,path:string)=>{if(!Array.isArray(position)||position.length<2){errors.push(`${path} must be a position with at least two numeric elements.`);return;}if(!position.every((value)=>typeof value==='number'&&Number.isFinite(value))){errors.push(`${path} contains a non-finite coordinate.`);return;}coordinateCount+=1;const[x,y]=position as number[];if(!bounds)bounds={minX:x,minY:y,maxX:x,maxY:y};else{bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);}if(position.length>3)warnings.push(`${path} has ${position.length} elements; RFC 7946 recommends no more than three.`);if(y<-90||y>90)warnings.push(`${path} latitude ${y} is outside the WGS84 latitude range.`);};
  const inspectCoordinates=(value:unknown,path:string)=>{if(!Array.isArray(value)){errors.push(`${path} must be an array.`);return;}if(value.length>=2&&value.every((item)=>typeof item==='number')){inspectPosition(value,path);return;}for(let i=0;i<value.length;i++)inspectCoordinates(value[i],`${path}[${i}]`);};
  const inspectGeometry=(geometry:any,path:string)=>{if(geometry===null)return;if(!geometry||typeof geometry!=='object'){errors.push(`${path} must be a geometry object or null.`);return;}if(!GEOMETRY_TYPES.has(geometry.type)){errors.push(`${path}.type is not a supported GeoJSON geometry type.`);return;}if(geometry.type==='GeometryCollection'){if(!Array.isArray(geometry.geometries)){errors.push(`${path}.geometries must be an array.`);return;}geometry.geometries.forEach((child:any,index:number)=>inspectGeometry(child,`${path}.geometries[${index}]`));return;}inspectCoordinates(geometry.coordinates,`${path}.coordinates`);};
  const inspect=(value:any,path='root')=>{if(!value||typeof value!=='object'||Array.isArray(value)){errors.push(`${path} must be a GeoJSON object.`);return;}if(!GEO_TYPES.has(value.type)){errors.push(`${path}.type must be a GeoJSON type.`);return;}if(value.type==='FeatureCollection'){if(!Array.isArray(value.features)){errors.push(`${path}.features must be an array.`);return;}value.features.forEach((child:any,index:number)=>{if(child?.type!=='Feature')errors.push(`${path}.features[${index}] must be a Feature.`);else inspect(child,`${path}.features[${index}]`);});return;}if(value.type==='Feature'){featureCount+=1;if(!('properties'in value)||(value.properties!==null&&(typeof value.properties!=='object'||Array.isArray(value.properties))))errors.push(`${path}.properties must be an object or null.`);inspectGeometry(value.geometry,`${path}.geometry`);return;}inspectGeometry(value,path);};
  inspect(input);
  return {valid:errors.length===0,errors,warnings:[...new Set(warnings)],featureCount,coordinateCount,bounds};
}

export function simplifyTopology<T extends JsonObject>(input:T,options:GeoSimplifyOptions){
  const validation=validateGeoJson(input);if(!validation.valid)throw new Error(`Invalid GeoJSON: ${validation.errors[0]}`);
  const rounded=roundGeoCoordinates(input,options.decimals);const originalCoordinateCount=countCoordinates(rounded);const generated=topology({data:rounded});const retain=Math.max(0,Math.min(1,options.retain));let simplified=generated;
  if(retain<1&&generated.arcs?.length){const prepared=presimplify(generated);const threshold=quantile(prepared,Math.max(0,Math.min(1,1-retain)));simplified=simplify(prepared,threshold);}
  const geojson=feature(simplified,simplified.objects.data) as unknown as T;
  return {originalCoordinateCount,outputCoordinateCount:countCoordinates(geojson),geojson,topojson:options.output==='topojson'?simplified:undefined,bounds:computeGeoBounds(geojson)};
}
