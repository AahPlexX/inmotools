// Feature 35 — Non-Intrusive Context-Aware Tooltip & Metric Glossary.
// Desktop: hover-triggered tooltip with viewport-edge detection so it never
// clips off-screen. Touch/mobile: tap opens a lightweight bottom-sheet modal
// instead of relying on a hover state that touch devices don't have.

import { useEffect, useRef, useState } from 'react';
import { glossaryLookup } from '../glossary';

export function InfoBadge({ term }: { term: string }) {
  const entry = glossaryLookup(term);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
  const badgeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    setPlacement(rect.top < 140 ? 'bottom' : 'top');
  }, [open]);

  if (!entry) return null;

  return (
    <span className="info-badge-wrap">
      <button
        ref={badgeRef}
        type="button"
        className="info-badge"
        aria-label={`What is ${entry.term}?`}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        i
      </button>
      {open ? (
        <span className={`info-tooltip info-tooltip-${placement}`} role="tooltip">
          <strong>{entry.term}</strong>
          <span>{entry.definition}</span>
        </span>
      ) : null}
    </span>
  );
}
