import type { VectorElement } from './vector-types';

function number(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function vectorElementTransform(element: VectorElement): string | null {
  const flipX = Boolean(element.flipX);
  const flipY = Boolean(element.flipY);
  if (!element.rotation && !flipX && !flipY) return null;

  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const operations = [`translate(${number(cx)} ${number(cy)})`];
  if (element.rotation) operations.push(`rotate(${number(element.rotation)})`);
  if (flipX || flipY) operations.push(`scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`);
  operations.push(`translate(${number(-cx)} ${number(-cy)})`);
  return operations.join(' ');
}
