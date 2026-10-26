import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

export async function stableTacticalTargetBox(target: Locator) {
  let box = await target.boundingBox();
  let stableSince = Date.now();
  await expect.poll(async () => {
    const next = await target.boundingBox();
    if (!next) { box = null; stableSince = Date.now(); return false; }
    const previous = box;
    if (!previous || (['x', 'y', 'width', 'height'] as const).some(key => Math.abs(next[key] - previous[key]) > 0.25)) {
      stableSince = Date.now();
    }
    box = next;
    return Date.now() - stableSince >= 100;
  }).toBe(true);
  if (!box) throw new Error('Touch target is unavailable.');
  return box;
}
