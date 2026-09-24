import type { PhotoQueueItem } from './photo-export-queue';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const STATUS_TEXT: Record<PhotoQueueItem<unknown>['status'], string> = {
  queued: 'Waiting',
  running: 'Exporting…',
  done: 'Saved',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export interface PhotoQueueListProps<T> {
  label: string;
  items: Array<PhotoQueueItem<T>>;
  running: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}

/** The ordered export queue. `data-status` keeps the historical `completed` value for finished
 * items so existing automation and styling continue to match. */
export default function PhotoQueueList<T>({ label, items, running, onMove, onRemove, onCancel, onRetry }: PhotoQueueListProps<T>) {
  if (!items.length) return null;
  return (
    <ol className="photo-batch-status photo-queue-list" aria-label={label}>
      {items.map((item, index) => (
        <li key={item.id} data-status={item.status === 'done' ? 'completed' : item.status}>
          <strong>{item.label}</strong>
          <span className="photo-queue-state">
            {item.status === 'done'
              ? `${item.width} × ${item.height}${item.bytes ? ` · ${formatBytes(item.bytes)}` : ''}${item.outputName && item.outputName !== item.label ? ` · saved as ${item.outputName}` : ''}`
              : item.status === 'failed' ? item.error : STATUS_TEXT[item.status]}
          </span>
          <span className="photo-inline-actions">
            {item.status === 'queued' && !running ? (
              <>
                <button type="button" aria-label={`Move ${item.label} earlier`} disabled={index === 0} onClick={() => onMove(item.id, -1)}>Up</button>
                <button type="button" aria-label={`Move ${item.label} later`} disabled={index === items.length - 1} onClick={() => onMove(item.id, 1)}>Down</button>
                <button type="button" aria-label={`Remove ${item.label} from the queue`} onClick={() => onRemove(item.id)}>Remove</button>
              </>
            ) : null}
            {(item.status === 'queued' || item.status === 'running') && running ? (
              <button type="button" aria-label={`Cancel ${item.label}`} onClick={() => onCancel(item.id)}>Cancel</button>
            ) : null}
            {(item.status === 'failed' || item.status === 'cancelled') && !running ? (
              <button type="button" aria-label={`Retry ${item.label}`} onClick={() => onRetry(item.id)}>Retry</button>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
