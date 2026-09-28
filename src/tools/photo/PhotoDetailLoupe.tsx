import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { renderPhoto } from './photo-renderer';
import type { PhotoRecipe } from './photo-types';

export interface PhotoDetailLoupeProps {
  file: Blob;
  recipe: PhotoRecipe;
  /** Edited-frame size at full resolution. */
  naturalWidth: number;
  naturalHeight: number;
}

/** A 1:1 view of the full-resolution render. Sharpening, noise reduction, grain, and fine
 * retouching can only be judged at actual pixels; the main preview is scaled for speed. The render
 * uses the export pipeline at the edited frame's own size and refreshes after edits settle. */
export default function PhotoDetailLoupe({ file, recipe, naturalWidth, naturalHeight }: PhotoDetailLoupeProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisionRef = useRef(0);
  const urlRef = useRef<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number; id: number } | null>(null);
  const centredRef = useRef(false);

  useEffect(() => {
    const revision = ++revisionRef.current;
    setBusy(true);
    const timer = window.setTimeout(() => {
      renderPhoto({ file, recipe, revision, mode: 'export', outputMime: 'image/png', requestedWidth: naturalWidth, requestedHeight: naturalHeight })
        .then((result) => {
          if (revision !== revisionRef.current) return;
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          const next = URL.createObjectURL(result.blob);
          urlRef.current = next;
          setUrl(next);
          setError(result.scaledForSafety ? `This photo is larger than this browser can render in one piece, so the detail view is ${result.width} × ${result.height}, not full size.` : null);
        })
        .catch((caught: unknown) => {
          if (revision === revisionRef.current) setError(`The 100% view could not be rendered: ${caught instanceof Error ? caught.message : 'unknown error'}`);
        })
        .finally(() => { if (revision === revisionRef.current) setBusy(false); });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [file, recipe, naturalWidth, naturalHeight]);

  useEffect(() => () => {
    revisionRef.current += 1;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  function centre(image: HTMLImageElement) {
    const viewport = viewportRef.current;
    if (!viewport || centredRef.current) return;
    centredRef.current = true;
    viewport.scrollLeft = (image.naturalWidth - viewport.clientWidth) / 2;
    viewport.scrollTop = (image.naturalHeight - viewport.clientHeight) / 2;
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport || event.button !== 0) return;
    viewport.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, id: event.pointerId };
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const start = dragRef.current;
    if (!viewport || !start || start.id !== event.pointerId) return;
    viewport.scrollLeft = start.left - (event.clientX - start.x);
    viewport.scrollTop = start.top - (event.clientY - start.y);
  }

  return (
    <div className="photo-loupe" data-testid="photo-detail-loupe">
      <div
        ref={viewportRef}
        className="photo-loupe-viewport"
        tabIndex={0}
        role="region"
        aria-label="Full-resolution detail view. Drag or use the arrow keys to move around."
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onKeyDown={(event) => {
          const viewport = viewportRef.current;
          if (!viewport) return;
          const step = event.shiftKey ? 200 : 40;
          const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          viewport.scrollBy({ left: move[0], top: move[1] });
        }}
      >
        {url ? <img src={url} alt="Full-resolution detail of the edited photo" draggable={false} data-testid="photo-loupe-image" onLoad={(event) => centre(event.currentTarget)} /> : null}
      </div>
      <p className="photo-export-note" role="status">
        {busy ? 'Rendering actual pixels…' : error ?? `Actual pixels · ${naturalWidth} × ${naturalHeight}. Drag to look around.`}
      </p>
    </div>
  );
}
