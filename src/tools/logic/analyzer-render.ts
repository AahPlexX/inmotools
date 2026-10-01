import {
  edgesOf,
  firstTick,
  gridStepTicks,
  indexAtOrBefore,
  lastTick,
  latestLevel,
  sampleAt,
  tickToX,
  xToTick,
  type SampleBuffer,
  type TimeView,
} from './analyzer-engine';
import type { ThemePalette } from './render-engine';
import type { LogicLevel } from './logic-types';

/**
 * Canvas2D drawing for the logic-analyzer timing diagram. Layout numbers live
 * here, exported so the dock can size its canvas and map pointer positions to
 * ticks with the very same constants the drawing used.
 */

export const LABEL_WIDTH = 132;
export const ROW_HEIGHT = 34;
export const AXIS_HEIGHT = 26;
/** A strip under the rows that carries the cursor badges, so they never sit on top of an axis label or a trace. */
export const FOOTER_HEIGHT = 20;

const TRACE_INSET = 8;

export interface DiagramCursors {
  readonly a?: number;
  readonly b?: number;
}

export interface DiagramOptions {
  readonly buffer: SampleBuffer;
  /** The visible window; `widthPx` is the waveform width, excluding the label gutter. */
  readonly view: TimeView;
  readonly widthPx: number;
  readonly palette: ThemePalette;
  readonly cursors: DiagramCursors;
  readonly showEdges: boolean;
}

/** Total canvas height for a channel count. */
export const diagramHeight = (channelCount: number): number => AXIS_HEIGHT + Math.max(1, channelCount) * ROW_HEIGHT + FOOTER_HEIGHT;

const levelText = (level: LogicLevel | undefined): string => (level === undefined ? '–' : String(level));

const truncate = (text: string, maxChars: number): string => (text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}…`);

const traceColor = (palette: ThemePalette, level: LogicLevel): string => {
  if (level === 1) return palette.levelHigh;
  if (level === 0) return palette.levelLow;
  if (level === 'X') return palette.levelContention;
  return palette.levelFloating;
};

const drawEdgeMarker = (ctx: CanvasRenderingContext2D, x: number, y: number, kind: 'rising' | 'falling' | 'unknown', color: string): void => {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === 'rising') {
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x - 4, y + 3);
    ctx.lineTo(x + 4, y + 3);
  } else if (kind === 'falling') {
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x - 4, y - 3);
    ctx.lineTo(x + 4, y - 3);
  } else {
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x - 4, y);
  }
  ctx.closePath();
  ctx.fill();
};

/** One channel's trace: a step function, each sample held until the next one. */
const drawTrace = (ctx: CanvasRenderingContext2D, options: DiagramOptions, channel: number, rowTop: number): void => {
  const { buffer, view, widthPx, palette } = options;
  const yHigh = rowTop + TRACE_INSET;
  const yLow = rowTop + ROW_HEIGHT - TRACE_INSET;
  const yMid = (yHigh + yLow) / 2;
  const newest = lastTick(buffer);
  if (newest === undefined) return;
  const startIndex = indexAtOrBefore(buffer, view.startTick) ?? 0;

  let previousLevel: LogicLevel | undefined;
  for (let index = startIndex; index < buffer.count; index += 1) {
    const sample = sampleAt(buffer, channel, index);
    if (!sample) break;
    const next = sampleAt(buffer, channel, index + 1);
    const x0 = Math.max(0, tickToX(view, sample.tick));
    const x1 = Math.min(widthPx, tickToX(view, next ? next.tick : newest + 1));
    if (tickToX(view, sample.tick) > widthPx) break;
    if (x1 <= 0) {
      previousLevel = sample.level;
      continue;
    }

    const color = traceColor(palette, sample.level);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    if (sample.level === 'X') {
      ctx.globalAlpha = 0.28;
      ctx.fillRect(x0, yHigh, x1 - x0, yLow - yHigh);
      ctx.globalAlpha = 1;
      ctx.strokeRect(x0, yHigh, x1 - x0, yLow - yHigh);
    } else if (sample.level === 'Z') {
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, yMid);
      ctx.lineTo(x1, yMid);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const y = sample.level === 1 ? yHigh : yLow;
      ctx.beginPath();
      // The riser joins the previous level's line to this one at the sample's own tick.
      if (previousLevel !== undefined && (previousLevel === 0 || previousLevel === 1) && previousLevel !== sample.level && tickToX(view, sample.tick) >= 0) {
        ctx.moveTo(x0, previousLevel === 1 ? yHigh : yLow);
        ctx.lineTo(x0, y);
      } else {
        ctx.moveTo(x0, y);
      }
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    previousLevel = sample.level;
  }
};

export const drawTimingDiagram = (ctx: CanvasRenderingContext2D, options: DiagramOptions): void => {
  const { buffer, view, widthPx, palette, cursors, showEdges } = options;
  const channelCount = buffer.channels.length;
  const height = diagramHeight(channelCount);
  const totalWidth = LABEL_WIDTH + widthPx;

  ctx.save();
  ctx.fillStyle = palette.componentFill;
  ctx.fillRect(0, 0, totalWidth, height);

  // --- Label gutter: channel name and latest value. ---
  ctx.font = '11px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  for (let channel = 0; channel < channelCount; channel += 1) {
    const rowTop = AXIS_HEIGHT + channel * ROW_HEIGHT;
    ctx.fillStyle = palette.label;
    ctx.textAlign = 'left';
    ctx.fillText(truncate(buffer.channels[channel]!.label, 14), 8, rowTop + ROW_HEIGHT / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = traceColor(palette, latestLevel(buffer, channel) ?? 'Z');
    ctx.fillText(levelText(latestLevel(buffer, channel)), LABEL_WIDTH - 8, rowTop + ROW_HEIGHT / 2);
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rowTop + ROW_HEIGHT + 0.5);
    ctx.lineTo(totalWidth, rowTop + ROW_HEIGHT + 0.5);
    ctx.stroke();
  }

  // --- Waveform area, clipped so traces never spill into the gutter. ---
  ctx.save();
  ctx.translate(LABEL_WIDTH, 0);
  ctx.beginPath();
  ctx.rect(0, 0, widthPx, height);
  ctx.clip();

  // Time axis: gridlines at round tick values, labelled along the top.
  const step = gridStepTicks(view.ticksPerPixel);
  const firstGrid = Math.ceil(view.startTick / step) * step;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (let tick = firstGrid; tickToX(view, tick) <= widthPx; tick += step) {
    const x = Math.round(tickToX(view, tick)) + 0.5;
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, AXIS_HEIGHT - 6);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.fillStyle = palette.label;
    ctx.fillText(String(tick), x, AXIS_HEIGHT / 2 - 2);
  }

  for (let channel = 0; channel < channelCount; channel += 1) {
    const rowTop = AXIS_HEIGHT + channel * ROW_HEIGHT;
    drawTrace(ctx, options, channel, rowTop);
    if (showEdges) {
      const toTick = xToTick(view, widthPx);
      for (const edge of edgesOf(buffer, channel, view.startTick, toTick)) {
        const kindColor = edge.kind === 'rising' ? palette.levelHigh : edge.kind === 'falling' ? palette.levelLow : palette.levelContention;
        drawEdgeMarker(ctx, tickToX(view, edge.tick), edge.kind === 'falling' ? rowTop + 5 : rowTop + ROW_HEIGHT - 5, edge.kind, kindColor);
      }
    }
  }

  // Cursors: a translucent band between the two, and a labelled line for each.
  const cursorEntries = ([['A', cursors.a], ['B', cursors.b]] as const).filter((entry): entry is readonly ['A' | 'B', number] => entry[1] !== undefined);
  if (cursors.a !== undefined && cursors.b !== undefined) {
    const left = Math.min(tickToX(view, cursors.a), tickToX(view, cursors.b));
    const right = Math.max(tickToX(view, cursors.a), tickToX(view, cursors.b));
    ctx.fillStyle = `${palette.selection}22`;
    ctx.fillRect(left, AXIS_HEIGHT, right - left, height - AXIS_HEIGHT - FOOTER_HEIGHT);
  }
  for (const [name, tick] of cursorEntries) {
    const x = Math.round(tickToX(view, tick)) + 0.5;
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.setLineDash([]);
    const badgeTop = height - FOOTER_HEIGHT + 3;
    ctx.fillStyle = palette.selection;
    ctx.fillRect(x - 8, badgeTop, 16, 14);
    ctx.fillStyle = palette.componentFill;
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillText(name, x, badgeTop + 7);
  }
  ctx.restore();

  // Gutter divider.
  ctx.strokeStyle = palette.componentStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LABEL_WIDTH + 0.5, 0);
  ctx.lineTo(LABEL_WIDTH + 0.5, height);
  ctx.stroke();

  // An empty buffer still draws the axis frame; say why nothing is plotted.
  if (firstTick(buffer) === undefined && channelCount > 0) {
    ctx.fillStyle = palette.label;
    ctx.textAlign = 'center';
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Waiting for the simulation to step…', LABEL_WIDTH + widthPx / 2, AXIS_HEIGHT + (channelCount * ROW_HEIGHT) / 2);
  }
  ctx.restore();
};
