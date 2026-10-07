/** Read-only metadata representation; original source is never rewritten. */
export function formatFrontmatterValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  const parents: object[] = [];
  try {
    return JSON.stringify(value, function (this: unknown, _key: string, entry: unknown): unknown {
      if (typeof entry === 'number' && !Number.isFinite(entry)) return String(entry);
      if (typeof entry === 'bigint') return String(entry);
      if (entry === null || typeof entry !== 'object') return entry;
      while (parents.length && parents.at(-1) !== this) parents.pop();
      if (parents.includes(entry)) return '[Circular reference]';
      parents.push(entry);
      return entry;
    }) ?? String(value);
  } catch {
    return 'Unable to display this value; see its source.';
  }
}
