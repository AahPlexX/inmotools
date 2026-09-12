import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  addElement,
  baseElement,
  createPolygonPath,
  createStarPath,
  moveSelection,
  pointsToPath,
  simplifyPoints,
  snapPoint,
} from './vector-engine';
import { vectorElementTransform } from './vector-transform';
import type { VectorDocument, VectorElement, VectorFill, VectorPoint, VectorTool } from './vector-types';

export interface VectorDrawSettings {
  polygonSides: number;
  starPoints: number;
  starInnerRatio: number;
  pencilSmoothing: number;
}

interface VectorCanvasProps {
  document: VectorDocument;
  selection: string[];
  tool: VectorTool;
  zoom: number;
  drawSettings: VectorDrawSettings;
  onDocumentChange: (document: VectorDocument, selection?: string[]) => void;
  onSelectionChange: (selection: string[]) => void;
  onStatus: (message: string) => void;
}

interface DragState {
  pointerId: number;
  start: VectorPoint;
  last: VectorPoint;
  selection: string[];
  moved: boolean;
}

interface PanState {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
}

function safeCanvasId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function paintId(element: VectorElement): string {
  return `canvas-paint-${safeCanvasId(element.id)}`;
}

function compositionId(element: VectorElement & { type: 'group' }, kind: 'clip' | 'mask'): string {
  return `canvas-${kind}-${safeCanvasId(element.id)}`;
}

function fillValue(fill: VectorFill, element: VectorElement): string {
  return fill.kind === 'solid' ? fill.color : `url(#${paintId(element)})`;
}

function PaintDefinition({ element }: { element: VectorElement }) {
  const fill = element.fill;
  if (fill.kind === 'solid') return null;
  const id = paintId(element);
  if (fill.kind === 'linear-gradient') {
    const radians = fill.angle * Math.PI / 180;
    const dx = Math.cos(radians) * 50;
    const dy = Math.sin(radians) * 50;
    return <linearGradient id={id} x1={`${50 - dx}%`} y1={`${50 - dy}%`} x2={`${50 + dx}%`} y2={`${50 + dy}%`}><stop offset="0%" stopColor={fill.start}/><stop offset="100%" stopColor={fill.end}/></linearGradient>;
  }
  if (fill.kind === 'radial-gradient') {
    return <radialGradient id={id} cx={`${fill.cx ?? 50}%`} cy={`${fill.cy ?? 50}%`}><stop offset="0%" stopColor={fill.start}/><stop offset="100%" stopColor={fill.end}/></radialGradient>;
  }
  const size = Math.max(2, fill.size);
  return <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" patternTransform={`rotate(${fill.rotation})`}>
    <rect width={size} height={size} fill={fill.background}/>
    {fill.pattern === 'dots' ? <circle cx={size / 2} cy={size / 2} r={Math.max(1, size / 6)} fill={fill.foreground}/> : null}
    {fill.pattern === 'grid' ? <path d={`M ${size} 0 L 0 0 0 ${size}`} fill="none" stroke={fill.foreground} strokeWidth="1"/> : null}
    {fill.pattern === 'stripes' ? <path d={`M 0 ${size} L ${size} 0 M ${-size / 2} ${size / 2} L ${size / 2} ${-size / 2} M ${size / 2} ${size * 1.5} L ${size * 1.5} ${size / 2}`} stroke={fill.foreground} strokeWidth={Math.max(1, size / 5)}/> : null}
  </pattern>;
}

function PaintDefinitions({ element }: { element: VectorElement }) {
  return <>
    <PaintDefinition element={element}/>
    {element.type === 'group' ? <>
      {element.children.map((child) => <PaintDefinitions key={`paint-${child.id}`} element={child}/>)}
      {element.composition ? <PaintDefinitions element={element.composition.shape}/> : null}
    </> : null}
  </>;
}

function commonProps(element: VectorElement) {
  return {
    fill: fillValue(element.fill, element),
    stroke: element.stroke.width > 0 ? element.stroke.color : 'none',
    strokeWidth: element.stroke.width,
    strokeLinecap: element.stroke.linecap,
    strokeLinejoin: element.stroke.linejoin,
    strokeDasharray: element.stroke.dash || undefined,
    opacity: element.opacity,
    style: { mixBlendMode: element.blendMode },
    transform: vectorElementTransform(element) ?? undefined,
  } as const;
}

function DefinitionShape({ element, maskCutout = false }: { element: VectorElement; maskCutout?: boolean }) {
  if (!element.visible) return null;
  const source = maskCutout
    ? ({ ...element, opacity: 1, fill: { kind: 'solid', color: '#000000' }, stroke: { ...element.stroke, width: 0 }, blendMode: 'normal' } as VectorElement)
    : element;
  const common = commonProps(source);
  switch (source.type) {
    case 'rect': return <rect {...common} x={source.x} y={source.y} width={source.width} height={source.height} rx={source.cornerRadius}/>;
    case 'ellipse': return <ellipse {...common} cx={source.x + source.width / 2} cy={source.y + source.height / 2} rx={Math.abs(source.width / 2)} ry={Math.abs(source.height / 2)}/>;
    case 'line': return <line {...common} x1={source.x} y1={source.y} x2={source.x2} y2={source.y2}/>;
    case 'path': return <path {...common} d={source.d}/>;
    case 'text': return <text {...common} x={source.x} y={source.y + source.fontSize} fontFamily={source.fontFamily} fontSize={source.fontSize} fontWeight={source.fontWeight} letterSpacing={source.letterSpacing} textAnchor={source.textAnchor}>{source.text}</text>;
    case 'image': return <image x={source.x} y={source.y} width={source.width} height={source.height} href={source.href} preserveAspectRatio={source.preserveAspectRatio} opacity={source.opacity} transform={common.transform}/>;
    case 'group': return <g opacity={source.opacity} style={common.style} transform={common.transform}>{source.children.map((child) => <DefinitionShape key={child.id} element={child} maskCutout={maskCutout}/>)}</g>;
    case 'symbol-instance': return <use {...common} href={`#${source.symbolId}`} x={source.x} y={source.y} width={source.width} height={source.height}/>;
  }
}

function CompositionDefinitions({ element }: { element: VectorElement }) {
  if (element.type !== 'group') return null;
  return <>
    {element.composition?.mode === 'clip' ? <clipPath id={compositionId(element, 'clip')}><DefinitionShape element={element.composition.shape}/></clipPath> : null}
    {element.composition?.mode === 'difference' ? <mask id={compositionId(element, 'mask')} maskUnits="userSpaceOnUse" x={element.x} y={element.y} width={Math.max(1, element.width)} height={Math.max(1, element.height)} style={{ maskType: 'luminance' }}>
      <rect x={element.x} y={element.y} width={Math.max(1, element.width)} height={Math.max(1, element.height)} fill="#ffffff"/>
      <DefinitionShape element={element.composition.shape} maskCutout/>
    </mask> : null}
    {element.children.map((child) => <CompositionDefinitions key={`composition-${child.id}`} element={child}/>)}
  </>;
}

function RenderElement({ element, selected, onPointerDown }: { element: VectorElement; selected: boolean; onPointerDown: (event: ReactPointerEvent<SVGElement>, element: VectorElement) => void }) {
  if (!element.visible) return null;
  const common = commonProps(element);
  const pointer = (event: ReactPointerEvent<SVGElement>) => onPointerDown(event, element);
  let shape: React.ReactNode;
  switch (element.type) {
    case 'rect': shape = <rect {...common} x={element.x} y={element.y} width={element.width} height={element.height} rx={element.cornerRadius} onPointerDown={pointer}/>; break;
    case 'ellipse': shape = <ellipse {...common} cx={element.x + element.width / 2} cy={element.y + element.height / 2} rx={Math.abs(element.width / 2)} ry={Math.abs(element.height / 2)} onPointerDown={pointer}/>; break;
    case 'line': shape = <line {...common} x1={element.x} y1={element.y} x2={element.x2} y2={element.y2} onPointerDown={pointer}/>; break;
    case 'path': shape = <path {...common} d={element.d} onPointerDown={pointer}/>; break;
    case 'text': shape = <text {...common} x={element.x} y={element.y + element.fontSize} fontFamily={element.fontFamily} fontSize={element.fontSize} fontWeight={element.fontWeight} letterSpacing={element.letterSpacing} textAnchor={element.textAnchor} onPointerDown={pointer}>{element.text}</text>; break;
    case 'image': shape = <image x={element.x} y={element.y} width={element.width} height={element.height} href={element.href} preserveAspectRatio={element.preserveAspectRatio} opacity={element.opacity} transform={common.transform} onPointerDown={pointer}/>; break;
    case 'group': {
      const clipPath = element.composition?.mode === 'clip' ? `url(#${compositionId(element, 'clip')})` : undefined;
      const mask = element.composition?.mode === 'difference' ? `url(#${compositionId(element, 'mask')})` : undefined;
      shape = <g opacity={element.opacity} style={common.style} transform={common.transform} onPointerDown={pointer}><g clipPath={clipPath} mask={mask}>{element.children.map((child) => <RenderElement key={child.id} element={child} selected={false} onPointerDown={onPointerDown}/>)}</g></g>;
      break;
    }
    case 'symbol-instance': shape = <use {...common} href={`#${element.symbolId}`} x={element.x} y={element.y} width={element.width} height={element.height} onPointerDown={pointer}/>; break;
  }
  return <g data-vector-element={element.id} aria-label={element.name}>{shape}{selected ? <rect className="vector-selection-outline" x={element.x - 4} y={element.y - 4} width={Math.max(8, element.width + 8)} height={Math.max(8, element.height + 8)} pointerEvents="none"/> : null}</g>;
}

function defaultElement(tool: VectorTool, point: VectorPoint, settings: VectorDrawSettings): VectorElement | null {
  if (tool === 'rect') return { ...baseElement('rect', 'Rectangle', point.x - 70, point.y - 50, 140, 100), type: 'rect', cornerRadius: 14 };
  if (tool === 'ellipse') return { ...baseElement('ellipse', 'Ellipse', point.x - 65, point.y - 50, 130, 100), type: 'ellipse' };
  if (tool === 'line') return { ...baseElement('line', 'Line', point.x - 70, point.y, 140, 1), type: 'line', x2: point.x + 70, y2: point.y };
  if (tool === 'polygon') return { ...baseElement('path', 'Polygon', point.x - 60, point.y - 60, 120, 120), type: 'path', d: createPolygonPath(point.x, point.y, 60, Math.max(3, Math.round(settings.polygonSides))), closed: true };
  if (tool === 'star') return { ...baseElement('path', 'Star', point.x - 65, point.y - 65, 130, 130), type: 'path', d: createStarPath(point.x, point.y, 65, Math.max(0.05, Math.min(0.95, settings.starInnerRatio)), Math.max(2, Math.round(settings.starPoints))), closed: true };
  if (tool === 'text') return { ...baseElement('text', 'Text', point.x, point.y - 28, 260, 64), type: 'text', text: 'Type something', fontFamily: 'system-ui, sans-serif', fontSize: 48, fontWeight: 700, letterSpacing: 0, textAnchor: 'start' };
  return null;
}

export default function VectorCanvas({ document, selection, tool, zoom, drawSettings, onDocumentChange, onSelectionChange, onStatus }: VectorCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [pencilPoints, setPencilPoints] = useState<VectorPoint[]>([]);
  const [penPoints, setPenPoints] = useState<VectorPoint[]>([]);
  const [cursor, setCursor] = useState<VectorPoint>({ x: 0, y: 0 });

  const guides = useMemo(() => {
    const selected = new Set(selection);
    const x: number[] = [0, document.artboard.width / 2, document.artboard.width];
    const y: number[] = [0, document.artboard.height / 2, document.artboard.height];
    for (const element of document.elements) {
      if (selected.has(element.id) || !element.visible) continue;
      x.push(element.x, element.x + element.width / 2, element.x + element.width);
      y.push(element.y, element.y + element.height / 2, element.y + element.height);
    }
    return { x, y };
  }, [document, selection]);

  function svgPoint(event: Pick<PointerEvent, 'clientX' | 'clientY'> | ReactPointerEvent): VectorPoint {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * document.artboard.width,
      y: ((event.clientY - rect.top) / rect.height) * document.artboard.height,
    };
    if (!document.artboard.snapToGrid && !document.artboard.snapToObjects) return point;
    const snapped = snapPoint(point, {
      grid: document.artboard.snapToGrid ? document.artboard.gridSize : 0,
      threshold: 8 / Math.max(0.25, zoom),
      guidesX: document.artboard.snapToObjects ? guides.x : [],
      guidesY: document.artboard.snapToObjects ? guides.y : [],
    });
    return { x: snapped.x, y: snapped.y };
  }

  function selectElement(event: ReactPointerEvent<SVGElement>, element: VectorElement) {
    if (tool === 'pan') return;
    event.stopPropagation();
    if (tool !== 'select' || element.locked) return;
    const extend = event.shiftKey || event.ctrlKey || event.metaKey;
    const nextSelection = extend
      ? selection.includes(element.id) ? selection.filter((id) => id !== element.id) : [...selection, element.id]
      : [element.id];
    onSelectionChange(nextSelection);
    const point = svgPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, start: point, last: point, selection: nextSelection, moved: false });
  }

  function createAt(point: VectorPoint) {
    const element = defaultElement(tool, point, drawSettings);
    if (!element) return false;
    onDocumentChange(addElement(document, element), [element.id]);
    onStatus(`${element.name} added. Use the inspector for precise size and position.`);
    return true;
  }

  function beginPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool !== 'pan' || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    };
    setIsPanning(true);
    onStatus('Panning artboard viewport.');
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const activePan = panRef.current;
    if (activePan?.pointerId !== event.pointerId) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    event.preventDefault();
    scroller.scrollLeft = activePan.scrollLeft - (event.clientX - activePan.clientX);
    scroller.scrollTop = activePan.scrollTop - (event.clientY - activePan.clientY);
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onStatus('Artboard viewport moved.');
  }

  function handlePanCaptureLost(event: ReactPointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setIsPanning(false);
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (tool === 'pan') return;
    const point = svgPoint(event);
    setCursor(point);
    if (tool === 'pencil') {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPencilPoints([point]);
      return;
    }
    if (tool === 'pen') {
      setPenPoints((current) => [...current, point]);
      onStatus('Pen point added. Double-click the artboard or use Finish pen path to complete it.');
      return;
    }
    if (tool === 'select') {
      onSelectionChange([]);
      return;
    }
    createAt(point);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (tool === 'pan') return;
    const point = svgPoint(event);
    setCursor(point);
    if (pencilPoints.length) {
      setPencilPoints((current) => [...current, point]);
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = point.x - drag.last.x;
    const dy = point.y - drag.last.y;
    if (Math.abs(dx) + Math.abs(dy) < 0.001) return;
    onDocumentChange(moveSelection(document, drag.selection, dx, dy), drag.selection);
    setDrag({ ...drag, last: point, moved: true });
  }

  function finishPencil() {
    if (pencilPoints.length < 2) {
      setPencilPoints([]);
      return;
    }
    const tolerance = Math.max(0.1, drawSettings.pencilSmoothing / Math.max(0.25, zoom));
    const points = simplifyPoints(pencilPoints, tolerance);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const element: VectorElement = {
      ...baseElement('path', 'Pencil path', x, y, Math.max(1, Math.max(...xs) - x), Math.max(1, Math.max(...ys) - y)),
      type: 'path',
      d: pointsToPath(points),
      closed: false,
      fill: { kind: 'solid', color: 'none' },
      stroke: { color: '#111827', width: 4, linecap: 'round', linejoin: 'round', dash: '' },
    };
    onDocumentChange(addElement(document, element), [element.id]);
    setPencilPoints([]);
    onStatus('Smoothed pencil path added.');
  }

  function finishPen() {
    if (penPoints.length < 2) return;
    const xs = penPoints.map((point) => point.x);
    const ys = penPoints.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const element: VectorElement = {
      ...baseElement('path', 'Pen path', x, y, Math.max(1, Math.max(...xs) - x), Math.max(1, Math.max(...ys) - y)),
      type: 'path',
      d: pointsToPath(penPoints),
      closed: false,
      fill: { kind: 'solid', color: 'none' },
      stroke: { color: '#7c3aed', width: 4, linecap: 'round', linejoin: 'round', dash: '' },
    };
    onDocumentChange(addElement(document, element), [element.id]);
    setPenPoints([]);
    onStatus('Pen path added.');
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (pencilPoints.length) finishPencil();
    if (drag?.pointerId === event.pointerId) setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const gridSize = Math.max(4, document.artboard.gridSize);
  return <div className="vector-canvas-shell" aria-label="Vector artboard area">
    <div className="vector-ruler-origin" aria-label="Artboard ruler origin">0,0</div>
    <div className="vector-ruler vector-ruler-x" aria-hidden="true"><span>0</span><span>{Math.round(document.artboard.width / 4)}</span><span>{Math.round(document.artboard.width / 2)}</span><span>{Math.round(document.artboard.width * 3 / 4)}</span><span>{document.artboard.width}</span></div>
    <div className="vector-ruler vector-ruler-y" aria-hidden="true"><span>0</span><span>{Math.round(document.artboard.height / 4)}</span><span>{Math.round(document.artboard.height / 2)}</span><span>{Math.round(document.artboard.height * 3 / 4)}</span><span>{document.artboard.height}</span></div>
    <div className="vector-coordinate-readout" aria-live="off"><span>x {Math.round(cursor.x)} · y {Math.round(cursor.y)}</span><span data-testid="vector-zoom-readout">{Math.round(zoom * 100)}%</span></div>
    <div
      ref={scrollRef}
      className="vector-canvas-scroll"
      style={tool === 'pan' ? { cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' } : undefined}
      onPointerDown={beginPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onLostPointerCapture={handlePanCaptureLost}
    >
      <svg
        ref={svgRef}
        data-testid="vector-canvas"
        className={`vector-canvas vector-tool-${tool}`}
        viewBox={`0 0 ${document.artboard.width} ${document.artboard.height}`}
        width={document.artboard.width * zoom}
        height={document.artboard.height * zoom}
        role="img"
        aria-label="Editable vector artboard"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => tool === 'pen' && finishPen()}
      >
        <defs>
          <pattern id="vector-grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse"><path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="currentColor" strokeOpacity="0.10" strokeWidth="1"/></pattern>
          {document.elements.map((element) => <PaintDefinitions key={`paint-tree-${element.id}`} element={element}/>)}
          {document.elements.map((element) => <CompositionDefinitions key={`composition-tree-${element.id}`} element={element}/>)}
          {document.symbols.map((symbol) => <symbol key={symbol.id} id={symbol.id} viewBox={symbol.viewBox}>{symbol.elements.map((element) => <RenderElement key={element.id} element={element} selected={false} onPointerDown={selectElement}/>)}</symbol>)}
        </defs>
        <rect width="100%" height="100%" fill={document.artboard.background}/>
        {document.artboard.gridVisible ? <rect width="100%" height="100%" fill="url(#vector-grid)" color="#111827" pointerEvents="none"/> : null}
        {document.elements.map((element) => <RenderElement key={element.id} element={element} selected={selection.includes(element.id)} onPointerDown={selectElement}/>)}
        {pencilPoints.length > 1 ? <path d={pointsToPath(pencilPoints)} fill="none" stroke="#7c3aed" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/> : null}
        {penPoints.length ? <g pointerEvents="none"><path d={pointsToPath(penPoints)} fill="none" stroke="#7c3aed" strokeWidth={3}/>{penPoints.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={5 / Math.max(0.5, zoom)} fill="#fff" stroke="#7c3aed" strokeWidth={2 / Math.max(0.5, zoom)}/>)}</g> : null}
      </svg>
    </div>
    {tool === 'pen' && penPoints.length >= 2 ? <button className="vector-floating-action" type="button" onClick={finishPen}>Finish pen path</button> : null}
  </div>;
}
