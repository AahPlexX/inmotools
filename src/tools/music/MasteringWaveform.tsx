import { useMemo, useRef, type PointerEvent } from 'react';
import type { MasteringMarker, MasteringRegion, PeakBucket, TimeSelection } from './mastering-engine';

interface Props {
  peaks: PeakBucket[];
  duration: number;
  playhead: number;
  selection: TimeSelection;
  markers: MasteringMarker[];
  regions: MasteringRegion[];
  onSeek: (seconds: number) => void;
  onSelect: (selection: TimeSelection) => void;
}

const WIDTH = 1000;
const HEIGHT = 220;

export default function MasteringWaveform({ peaks, duration, playhead, selection, markers, regions, onSeek, onSelect }: Props) {
  const dragStart = useRef<number | null>(null);
  const path = useMemo(() => peaks.map((peak, index) => {
    const x = peaks.length <= 1 ? 0 : index / (peaks.length - 1) * WIDTH;
    const top = HEIGHT / 2 - peak.max * (HEIGHT * 0.46);
    const bottom = HEIGHT / 2 - peak.min * (HEIGHT * 0.46);
    return `M${x.toFixed(2)} ${top.toFixed(2)}V${bottom.toFixed(2)}`;
  }).join(''), [peaks]);

  const xAt = (seconds: number) => duration > 0 ? Math.min(WIDTH, Math.max(0, seconds / duration * WIDTH)) : 0;
  const secondsAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0;
    return fraction * duration;
  };

  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (duration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = secondsAt(event);
    onSelect({ startSeconds: dragStart.current, endSeconds: dragStart.current });
  };

  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (dragStart.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onSelect({ startSeconds: dragStart.current, endSeconds: secondsAt(event) });
  };

  const pointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (dragStart.current === null) return;
    const endSeconds = secondsAt(event);
    onSelect({ startSeconds: dragStart.current, endSeconds });
    onSeek(endSeconds);
    dragStart.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
  };

  const selectionStart = xAt(Math.min(selection.startSeconds, selection.endSeconds));
  const selectionEnd = xAt(Math.max(selection.startSeconds, selection.endSeconds));

  return <div className="mastering-waveform-wrap">
    <svg
      className="mastering-waveform"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Waveform overview. Playhead ${playhead.toFixed(3)} seconds. Selection ${Math.min(selection.startSeconds, selection.endSeconds).toFixed(3)} to ${Math.max(selection.startSeconds, selection.endSeconds).toFixed(3)} seconds.`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => { dragStart.current = null; }}
    >
      <line className="mastering-waveform-center" x1="0" x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} />
      {regions.map((region) => {
        const start = xAt(region.startSeconds);
        const end = xAt(region.endSeconds);
        return <rect key={region.id} className="mastering-waveform-region" x={start} y="0" width={Math.max(1, end - start)} height={HEIGHT} aria-hidden="true" />;
      })}
      {selectionEnd > selectionStart && <rect className="mastering-waveform-selection" x={selectionStart} y="0" width={selectionEnd - selectionStart} height={HEIGHT} />}
      <path className="mastering-waveform-peaks" d={path} />
      {markers.map((marker) => <g key={marker.id}>
        <line className="mastering-waveform-marker" x1={xAt(marker.seconds)} x2={xAt(marker.seconds)} y1="0" y2={HEIGHT} />
        <title>{`${marker.label}: ${marker.seconds.toFixed(3)} s`}</title>
      </g>)}
      <line className="mastering-waveform-playhead" x1={xAt(playhead)} x2={xAt(playhead)} y1="0" y2={HEIGHT} />
    </svg>
    <div className="mastering-waveform-axis" aria-hidden="true"><span>0:00</span><span>{duration.toFixed(2)} s</span></div>
  </div>;
}
