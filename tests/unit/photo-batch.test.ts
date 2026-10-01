import { describe, expect, test } from 'vitest';
import { processPhotoBatch } from '../../src/tools/photo/photo-batch';

describe('Photo Studio batch processing', () => {
  test('processes files strictly sequentially and consumes each result before moving on', async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    const items = [
      { id: 'a', name: 'a.jpg', file: new Blob(['a'], { type: 'image/jpeg' }) },
      { id: 'b', name: 'b.jpg', file: new Blob(['b'], { type: 'image/jpeg' }) },
      { id: 'c', name: 'c.jpg', file: new Blob(['c'], { type: 'image/jpeg' }) },
    ];

    const summary = await processPhotoBatch(
      items,
      async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        events.push(`render:${item.id}`);
        await Promise.resolve();
        active -= 1;
        return { blob: new Blob([item.id]), width: 10, height: 10 };
      },
      async (item, result) => {
        events.push(`consume:${item.id}:${await result.blob.text()}`);
      },
    );

    expect(maxActive).toBe(1);
    expect(events).toEqual([
      'render:a', 'consume:a:a',
      'render:b', 'consume:b:b',
      'render:c', 'consume:c:c',
    ]);
    expect(summary.completed).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.items.every((item) => !('blob' in item))).toBe(true);
  });

  test('isolates a failed file and continues with the rest of the queue', async () => {
    const consumed: string[] = [];
    const items = [
      { id: 'a', name: 'a.jpg', file: new Blob(['a']) },
      { id: 'bad', name: 'bad.jpg', file: new Blob(['bad']) },
      { id: 'c', name: 'c.jpg', file: new Blob(['c']) },
    ];

    const summary = await processPhotoBatch(
      items,
      async (item) => {
        if (item.id === 'bad') throw new Error('decode failed');
        return { blob: new Blob([item.id]), width: 20, height: 15 };
      },
      async (item) => { consumed.push(item.id); },
    );

    expect(consumed).toEqual(['a', 'c']);
    expect(summary.completed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.items.find((item) => item.id === 'bad')).toMatchObject({ status: 'failed', error: 'decode failed' });
  });

  test('consumer failures are isolated just like render failures', async () => {
    const summary = await processPhotoBatch(
      [
        { id: 'a', name: 'a.jpg', file: new Blob(['a']) },
        { id: 'b', name: 'b.jpg', file: new Blob(['b']) },
      ],
      async (item) => ({ blob: new Blob([item.id]), width: 1, height: 1 }),
      async (item) => {
        if (item.id === 'a') throw new Error('download blocked');
      },
    );

    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.items[0]).toMatchObject({ id: 'a', status: 'failed', error: 'download blocked' });
    expect(summary.items[1]).toMatchObject({ id: 'b', status: 'completed' });
  });
});