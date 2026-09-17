import { expect, test } from 'vitest';
import { adjustPhotoCrop, type PhotoCropHandle } from '../../src/tools/photo/photo-crop';

const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
test.each([
  ['move', 0.5, -0.5, { x: 0.5, y: 0, width: 0.5, height: 0.5 }],
  ['nw', -0.25, -0.25, { x: 0, y: 0, width: 0.75, height: 0.75 }],
  ['n', 0.2, -0.25, { x: 0.25, y: 0, width: 0.5, height: 0.75 }],
  ['ne', 0.25, -0.25, { x: 0.25, y: 0, width: 0.75, height: 0.75 }],
  ['e', 0.25, 0.2, { x: 0.25, y: 0.25, width: 0.75, height: 0.5 }],
  ['se', 0.25, 0.25, { x: 0.25, y: 0.25, width: 0.75, height: 0.75 }],
  ['s', 0.2, 0.25, { x: 0.25, y: 0.25, width: 0.5, height: 0.75 }],
  ['sw', -0.25, 0.25, { x: 0, y: 0.25, width: 0.75, height: 0.75 }],
  ['w', -0.25, 0.2, { x: 0, y: 0.25, width: 0.75, height: 0.5 }],
] as const)('%s crop gesture bounds the rectangle and preserves opposite edges', (handle, dx, dy, want) => {
  expect(adjustPhotoCrop(crop, handle, dx, dy)).toEqual(want);
  expect(crop).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
});
test.each(['nw', 'ne', 'se', 'sw'] as PhotoCropHandle[])('%s crossing cannot invert or collapse the crop', (handle) => {
  const result = adjustPhotoCrop(crop, handle, handle.includes('w') ? 2 : -2, handle.includes('n') ? 2 : -2);
  expect(result.width).toBeCloseTo(0.001, 8);
  expect(result.height).toBeCloseTo(0.001, 8);
  expect(result.x).toBeCloseTo(handle.includes('w') ? 0.749 : 0.25, 8);
  expect(result.y).toBeCloseTo(handle.includes('n') ? 0.749 : 0.25, 8);
});
test('nonfinite gesture deltas leave the existing crop intact', () => {
  expect(adjustPhotoCrop(crop, 'se', NaN, Infinity)).toEqual(crop);
});
