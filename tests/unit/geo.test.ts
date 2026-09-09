import { describe, expect, it } from 'vitest';
import { computeGeoBounds, countCoordinates, roundGeoCoordinates, simplifyTopology, validateGeoJson } from '../../src/tools/geo/geo-engine';

const geometry={type:'FeatureCollection' as const,features:[{type:'Feature' as const,properties:{district:'west',untouched:1.23456789},geometry:{type:'MultiPolygon' as const,coordinates:[[[[0.123456789,0.987654321],[2.123456789,0.987654321],[2.123456789,2.987654321],[0.123456789,0.987654321]]]]}}]};
const sharedBorder={type:'FeatureCollection' as const,features:[{type:'Feature' as const,properties:{id:'left'},geometry:{type:'Polygon' as const,coordinates:[[[0,0],[2,0],[2,1],[2,2],[0,2],[0,0]]]}},{type:'Feature' as const,properties:{id:'right'},geometry:{type:'Polygon' as const,coordinates:[[[2,0],[4,0],[4,2],[2,2],[2,1],[2,0]]]}}]};

function positions(value: unknown, found: number[][] = []): number[][] {
  if (!Array.isArray(value)) return found;
  if (value.length >= 2 && value.every((item) => typeof item === 'number')) { found.push(value as number[]); return found; }
  for (const child of value) positions(child, found);
  return found;
}

describe('GeoJSON simplifier',()=>{
 it('rounds coordinate components without touching feature properties',()=>{const rounded=roundGeoCoordinates(geometry,5) as typeof geometry;expect(rounded.features[0].geometry.coordinates[0][0][0]).toEqual([0.12346,0.98765]);expect(rounded.features[0].properties).toEqual(geometry.features[0].properties);expect(countCoordinates(rounded)).toBe(countCoordinates(geometry));});
 it('preserves shared topology while reducing removable intermediate vertices',()=>{const result=simplifyTopology(sharedBorder,{decimals:6,retain:.6,output:'geojson'});expect(result.outputCoordinateCount).toBeLessThanOrEqual(result.originalCoordinateCount);expect(result.geojson).toBeTruthy();expect(result.topojson).toBeUndefined();const output=result.geojson as typeof sharedBorder;expect(JSON.stringify(output.features[0].geometry.coordinates)).toContain('[2,0]');expect(JSON.stringify(output.features[1].geometry.coordinates)).toContain('[2,2]');expect(result.outputValidation.valid).toBe(true);});
 it('returns the same GeoJSON preview with the requested TopoJSON export in one pass',()=>{const result=simplifyTopology(sharedBorder,{decimals:6,retain:.8,output:'topojson'});expect(result.geojson).toBeTruthy();expect(result.topojson?.type).toBe('Topology');expect(result.outputCoordinateCount).toBe(countCoordinates(result.geojson));expect(result.outputValidation.valid).toBe(true);});

 it('preserves altitude on every retained arc position and in TopoJSON export',()=>{
   const source={type:'LineString' as const,coordinates:[[0,0,10],[1,0.25,20],[2,-0.25,30],[3,0,40]]};
   const result=simplifyTopology(source,{decimals:6,retain:.6,output:'topojson'});
   expect(result.geojson.type).toBe('LineString');
   const outputPositions=positions(result.geojson.coordinates);
   expect(outputPositions.length).toBeGreaterThanOrEqual(2);
   expect(outputPositions.every((position)=>position.length===3)).toBe(true);
   expect(outputPositions[0]).toEqual([0,0,10]);
   expect(outputPositions.at(-1)).toEqual([3,0,40]);
   const arcPositions=positions(result.topojson?.arcs);
   expect(arcPositions.every((position)=>position.length===3)).toBe(true);
   expect(result.rootShape).toBe('LineString → LineString');
 });

 it('refuses lossy 3D simplification when one horizontal position has conflicting extra dimensions',()=>{
   const source={type:'MultiLineString',coordinates:[[[0,0,10],[1,0,20]],[[0,0,99],[0,1,30]]]};
   expect(()=>simplifyTopology(source,{decimals:6,retain:.5,output:'geojson'})).toThrow(/additional dimensions|altitude|3D/i);
 });
});

describe('RFC 7946 structural inspection',()=>{
 it('reports feature count, coordinate count, and finite bounds without spread operations',()=>{const report=validateGeoJson(geometry);expect(report.valid).toBe(true);expect(report.featureCount).toBe(1);expect(report.coordinateCount).toBe(4);expect(report.bounds).toEqual({minX:0.123456789,minY:0.987654321,maxX:2.123456789,maxY:2.987654321});expect(computeGeoBounds(geometry)).toEqual(report.bounds);});
 it('rejects unknown types and non-finite positions',()=>{expect(validateGeoJson({type:'Thing',coordinates:[0,0]}).valid).toBe(false);const invalid=validateGeoJson({type:'Point',coordinates:[0,Number.NaN]});expect(invalid.valid).toBe(false);expect(invalid.errors.join(' ')).toMatch(/non-finite/i);});
 it('warns about positions beyond three elements and out-of-range WGS84 latitude',()=>{const report=validateGeoJson({type:'Point',coordinates:[10,95,3,4]});expect(report.valid).toBe(true);expect(report.warnings.join(' ')).toMatch(/no more than three/i);expect(report.warnings.join(' ')).toMatch(/latitude/i);});
 it('requires FeatureCollection members to be Features and Feature properties to be object or null',()=>{expect(validateGeoJson({type:'FeatureCollection',features:[{type:'Point',coordinates:[0,0]}]}).valid).toBe(false);expect(validateGeoJson({type:'Feature',properties:'bad',geometry:{type:'Point',coordinates:[0,0]}}).valid).toBe(false);});

 it('rejects short or unclosed polygon rings instead of letting topology silently repair them',()=>{
   const short=validateGeoJson({type:'Polygon',coordinates:[[[0,0],[1,0],[0,0]]]});
   expect(short.valid).toBe(false);
   expect(short.errors.join(' ')).toMatch(/four|4|ring/i);
   const open=validateGeoJson({type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]});
   expect(open.valid).toBe(false);
   expect(open.errors.join(' ')).toMatch(/closed|first.*last/i);
 });

 it('requires LineStrings to contain at least two positions',()=>{
   const report=validateGeoJson({type:'LineString',coordinates:[[0,0]]});
   expect(report.valid).toBe(false);
   expect(report.errors.join(' ')).toMatch(/two|2|LineString/i);
 });
});
