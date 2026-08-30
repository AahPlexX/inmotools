import { describe, expect, it } from 'vitest';
import { countCoordinates, roundGeoCoordinates, simplifyTopology } from '../../src/tools/geo/geo-engine';

const geometry = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { district: 'west', untouched: 1.23456789 },
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: [[[[0.123456789, 0.987654321], [2.123456789, 0.987654321], [2.123456789, 2.987654321], [0.123456789, 0.987654321]]]],
      },
    },
  ],
};

const sharedBorder = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { id: 'left' },
      geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [2, 0], [2, 1], [2, 2], [0, 2], [0, 0]]] },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'right' },
      geometry: { type: 'Polygon' as const, coordinates: [[[2, 0], [4, 0], [4, 2], [2, 2], [2, 1], [2, 0]]] },
    },
  ],
};

describe('GeoJSON simplifier', () => {
  it('rounds coordinate components without touching feature properties', () => {
    const rounded = roundGeoCoordinates(geometry, 5) as typeof geometry;
    expect(rounded.features[0].geometry.coordinates[0][0][0]).toEqual([0.12346, 0.98765]);
    expect(rounded.features[0].properties).toEqual(geometry.features[0].properties);
    expect(countCoordinates(rounded)).toBe(countCoordinates(geometry));
  });

  it('preserves shared topology while reducing removable intermediate vertices', () => {
    const result = simplifyTopology(sharedBorder, { decimals: 6, retain: 0.6, output: 'geojson' });
    expect(result.originalCoordinateCount).toBe(countCoordinates(sharedBorder));
    expect(result.outputCoordinateCount).toBeLessThanOrEqual(result.originalCoordinateCount);
    expect(result.geojson).toBeTruthy();
    const output = result.geojson as typeof sharedBorder;
    expect(output.features).toHaveLength(2);
    const left = JSON.stringify(output.features[0].geometry.coordinates);
    const right = JSON.stringify(output.features[1].geometry.coordinates);
    expect(left).toContain('[2,0]');
    expect(left).toContain('[2,2]');
    expect(right).toContain('[2,0]');
    expect(right).toContain('[2,2]');
  });
});
