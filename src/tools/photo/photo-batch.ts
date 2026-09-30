export interface PhotoBatchItem {
  id: string;
  name: string;
  file: Blob;
}

export interface PhotoBatchRenderResult {
  blob: Blob;
  width: number;
  height: number;
}

export interface PhotoBatchItemStatus {
  id: string;
  name: string;
  status: 'completed' | 'failed';
  width?: number;
  height?: number;
  error?: string;
}

export interface PhotoBatchSummary {
  total: number;
  completed: number;
  failed: number;
  items: PhotoBatchItemStatus[];
}

export async function processPhotoBatch(
  items: readonly PhotoBatchItem[],
  render: (item: PhotoBatchItem, index: number) => Promise<PhotoBatchRenderResult>,
  consume: (item: PhotoBatchItem, result: PhotoBatchRenderResult, index: number) => Promise<void> | void,
  onProgress?: (status: PhotoBatchItemStatus, index: number, total: number) => void,
): Promise<PhotoBatchSummary> {
  const statuses: PhotoBatchItemStatus[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    try {
      const result = await render(item, index);
      await consume(item, result, index);
      const status: PhotoBatchItemStatus = {
        id: item.id,
        name: item.name,
        status: 'completed',
        width: result.width,
        height: result.height,
      };
      statuses.push(status);
      onProgress?.(status, index, items.length);
    } catch (error) {
      const status: PhotoBatchItemStatus = {
        id: item.id,
        name: item.name,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
      statuses.push(status);
      onProgress?.(status, index, items.length);
    }
  }

  const completed = statuses.filter((item) => item.status === 'completed').length;
  return {
    total: statuses.length,
    completed,
    failed: statuses.length - completed,
    items: statuses,
  };
}
