import { useEffect, useState, type KeyboardEvent } from 'react';
import { componentName, roomKey, type FloorplanAnalysis } from './floorplan-analysis';
import { getSymbolDefinition } from './symbol-library';
import { formatArea, formatLength, parseLength, type DisplayUnits } from './units';
import type { FloorplanDimension, FloorplanProject, HostedOpening, PlanComponent, WallSegment } from './floorplan-types';

type ProjectMeta = Partial<Pick<FloorplanProject, 'name' | 'author' | 'scaleNotation' | 'units'>>;

interface FloorplanInspectorProps {
  readonly project: FloorplanProject;
  readonly analysis: FloorplanAnalysis;
  readonly onProjectMeta: (patch: ProjectMeta) => void;
  readonly onWallUpdate: (id: string, patch: Partial<WallSegment>) => void;
  readonly onWallLength: (id: string, lengthMm: number) => void;
  readonly onOpeningUpdate: (wallId: string, openingId: string, patch: Partial<HostedOpening>) => void;
  readonly onOpeningOffset: (wallId: string, openingId: string, fromStartMm: number) => void;
  readonly onComponentUpdate: (id: string, patch: Partial<PlanComponent>) => void;
  readonly onDimensionUpdate: (id: string, patch: Partial<FloorplanDimension>) => void;
  readonly onDeleteSelected: () => void;
  readonly onDuplicateSelected: () => void;
  readonly onRotateSelected: () => void;
  readonly onToggleLayer: (id: string, visible: boolean) => void;
  readonly onRoomRename: (key: string, name: string) => void;
  readonly onSelect: (id: string) => void;
  readonly onNewPlan: () => void;
}

// --- Draft-then-commit fields ---------------------------------------------
// Typing never writes a half-finished value into the plan: the field keeps its own
// draft and commits on Enter or blur. Escape, or anything unreadable, restores the
// current value. Each commit is one undo step.

const useDraft = (value: string) => {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(value); }, [editing, value]);
  return { draft, setDraft, editing, setEditing };
};

const commitKeys = (event: KeyboardEvent<HTMLInputElement>, reset: () => void) => {
  if (event.key === 'Enter') event.currentTarget.blur();
  if (event.key === 'Escape') { reset(); event.currentTarget.blur(); }
};

const LengthField = ({ label, valueMm, units, min, max, onCommit, hint }: {
  label: string; valueMm: number; units: DisplayUnits; min: number; max: number; onCommit: (mm: number) => void; hint?: string;
}) => {
  const shown = units === 'metric' ? String(Math.round(valueMm)) : formatLength(valueMm, units);
  const { draft, setDraft, setEditing } = useDraft(shown);
  const commit = () => {
    setEditing(false);
    const parsed = parseLength(draft, units);
    if (parsed === undefined) { setDraft(shown); return; }
    const clamped = Math.min(max, Math.max(min, parsed));
    if (Math.abs(clamped - valueMm) > 0.01) onCommit(clamped);
    setDraft(units === 'metric' ? String(Math.round(clamped)) : formatLength(clamped, units));
  };
  return (
    <label>
      {label} ({units === 'metric' ? 'mm' : 'ft-in'})
      <input
        type="text"
        inputMode={units === 'metric' ? 'decimal' : 'text'}
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => commitKeys(event, () => setDraft(shown))}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
};

const TextField = ({ label, value, placeholder, onCommit, ariaLabel }: { label?: string; value: string; placeholder?: string; onCommit: (value: string) => void; ariaLabel?: string }) => {
  const { draft, setDraft, setEditing } = useDraft(value);
  const commit = () => { setEditing(false); if (draft !== value) onCommit(draft); };
  const input = (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={() => setEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => commitKeys(event, () => setDraft(value))}
    />
  );
  return label ? <label>{label}{input}</label> : input;
};

const DegreesField = ({ value, onCommit }: { value: number; onCommit: (degrees: number) => void }) => {
  const { draft, setDraft, setEditing } = useDraft(String(Math.round(value)));
  const commit = () => {
    setEditing(false);
    const parsed = Number(draft.replace('°', '').trim());
    if (!draft.trim() || !Number.isFinite(parsed)) { setDraft(String(Math.round(value))); return; }
    const normalized = ((parsed % 360) + 360) % 360;
    if (normalized !== value) onCommit(normalized);
    setDraft(String(Math.round(normalized)));
  };
  return (
    <label>
      Rotation (degrees)
      <input type="text" inputMode="decimal" value={draft} onFocus={() => setEditing(true)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => commitKeys(event, () => setDraft(String(Math.round(value))))} />
    </label>
  );
};

const OPENING_NAMES: Record<HostedOpening['type'], string> = {
  door_single: 'Door', door_double: 'Double door', door_pocket: 'Pocket door', door_bifold: 'Bifold door', door_sliding: 'Sliding door',
  window_casement: 'Window', window_double_hung: 'Double-hung window', cased_opening: 'Cased opening',
};

export const FloorplanInspector = ({
  project, analysis, onProjectMeta, onWallUpdate, onWallLength, onOpeningUpdate, onOpeningOffset, onComponentUpdate,
  onDimensionUpdate, onDeleteSelected, onDuplicateSelected, onRotateSelected, onToggleLayer, onRoomRename, onSelect, onNewPlan,
}: FloorplanInspectorProps) => {
  const units: DisplayUnits = project.units ?? 'metric';
  const selectedWall = project.walls.find((wall) => wall.id === project.selectedId);
  const selectedOpeningEntry = project.walls
    .map((wall) => ({ wall, opening: wall.openings.find((opening) => opening.id === project.selectedId) }))
    .find((entry) => entry.opening);
  const selectedComponent = project.components.find((component) => component.id === project.selectedId);
  const selectedDimension = project.dimensions.find((dimension) => dimension.id === project.selectedId);
  const vertices = new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));
  const wallLength = (wall: WallSegment) => {
    const start = vertices.get(wall.startVertexId); const end = vertices.get(wall.endVertexId);
    return start && end ? Math.hypot(end.x - start.x, end.y - start.y) : 0;
  };
  const heading = selectedWall ? 'Wall'
    : selectedOpeningEntry?.opening ? OPENING_NAMES[selectedOpeningEntry.opening.type]
      : selectedComponent ? componentName(selectedComponent)
        : selectedDimension ? 'Dimension' : 'Plan settings';

  return (
    <aside className="plancraft-inspector" aria-label="Properties">
      <div className="plancraft-panel-heading"><span>Properties</span><strong>{heading}</strong></div>
      {selectedWall ? (
        <div className="plancraft-form-stack">
          <LengthField label="Length" valueMm={wallLength(selectedWall)} units={units} min={50} max={100_000} onCommit={(mm) => onWallLength(selectedWall.id, mm)} hint="Moves the wall's end corner along the wall." />
          <LengthField label="Thickness" valueMm={selectedWall.thickness} units={units} min={50} max={600} onCommit={(mm) => onWallUpdate(selectedWall.id, { thickness: mm })} />
          <LengthField label="Height" valueMm={selectedWall.height} units={units} min={300} max={12_000} onCommit={(mm) => onWallUpdate(selectedWall.id, { height: mm })} />
          <label>Wall status<select value={selectedWall.state} onChange={(event) => onWallUpdate(selectedWall.id, { state: event.target.value as WallSegment['state'] })}><option value="existing">Existing</option><option value="new_construction">New construction</option><option value="demolition">To be demolished</option></select></label>
          <label>Material<select value={selectedWall.material} onChange={(event) => onWallUpdate(selectedWall.id, { material: event.target.value as WallSegment['material'] })}><option value="drywall_stud">Drywall on studs</option><option value="concrete_masonry">Concrete block</option><option value="glass_partition">Glass partition</option><option value="brick">Brick</option></select></label>
          <label className="plancraft-check"><input type="checkbox" checked={selectedWall.isLoadBearing} onChange={(event) => onWallUpdate(selectedWall.id, { isLoadBearing: event.target.checked })} /> Load-bearing (hatched)</label>
          <button type="button" className="plancraft-button danger" onClick={onDeleteSelected}>Delete wall</button>
        </div>
      ) : selectedOpeningEntry?.opening ? (() => {
        const { wall } = selectedOpeningEntry;
        const opening = selectedOpeningEntry.opening;
        const length = wallLength(wall);
        const isDoor = opening.type.startsWith('door');
        return (
          <div className="plancraft-form-stack">
            <LengthField label="Width" valueMm={opening.width} units={units} min={300} max={Math.max(300, Math.min(5000, length))} onCommit={(mm) => onOpeningUpdate(wall.id, opening.id, { width: mm })} />
            <LengthField label="Center from wall start" valueMm={opening.offsetRatio * length} units={units} min={opening.width / 2} max={Math.max(opening.width / 2, length - opening.width / 2)} onCommit={(mm) => onOpeningOffset(wall.id, opening.id, mm)} />
            <LengthField label="Height" valueMm={opening.nominalHeight} units={units} min={300} max={5000} onCommit={(mm) => onOpeningUpdate(wall.id, opening.id, { nominalHeight: mm })} />
            {isDoor ? null : <LengthField label="Sill height" valueMm={opening.sillHeight} units={units} min={0} max={3000} onCommit={(mm) => onOpeningUpdate(wall.id, opening.id, { sillHeight: mm })} />}
            {isDoor ? (
              <div className="plancraft-button-row">
                <button type="button" className="plancraft-button" onClick={() => onOpeningUpdate(wall.id, opening.id, { flipSide: !opening.flipSide })}>Swing other way <kbd>F</kbd></button>
                <button type="button" className="plancraft-button" onClick={() => onOpeningUpdate(wall.id, opening.id, { flipHand: !opening.flipHand })}>Move hinge</button>
              </div>
            ) : null}
            <button type="button" className="plancraft-button danger" onClick={onDeleteSelected}>Delete {isDoor ? 'door' : 'window'}</button>
          </div>
        );
      })() : selectedComponent ? (
        <div className="plancraft-form-stack">
          <LengthField label="X" valueMm={selectedComponent.position.x} units={units} min={-1_000_000} max={1_000_000} onCommit={(mm) => onComponentUpdate(selectedComponent.id, { position: { ...selectedComponent.position, x: mm } })} />
          <LengthField label="Y" valueMm={selectedComponent.position.y} units={units} min={-1_000_000} max={1_000_000} onCommit={(mm) => onComponentUpdate(selectedComponent.id, { position: { ...selectedComponent.position, y: mm } })} />
          <DegreesField value={selectedComponent.rotation} onCommit={(degrees) => onComponentUpdate(selectedComponent.id, { rotation: degrees })} />
          {(() => {
            const symbol = getSymbolDefinition(selectedComponent.symbolKey);
            const clearance = symbol?.clearance ?? selectedComponent.clearance;
            const size = symbol ? `${formatLength(symbol.width, units)} × ${formatLength(symbol.depth, units)}` : undefined;
            const access = clearance.adaRuleKey === 'ada_fixture_clearance' ? `60" × 56" ADA clearance`
              : clearance.adaRuleKey === 'ada_turning_circle' ? '60" (1525 mm) turning circle'
                : clearance.shape === 'circle' ? `${formatLength(clearance.bufferOffset, units)} all around`
                  : clearance.bufferOffset > 0 ? `${formatLength(clearance.bufferOffset, units)} in front` : 'None';
            return <>{size ? <div className="plancraft-readout"><span>Size</span><strong>{size}</strong></div> : null}<div className="plancraft-readout"><span>Clear space needed</span><strong>{access}</strong></div></>;
          })()}
          <div className="plancraft-button-row">
            <button type="button" className="plancraft-button" onClick={onRotateSelected}>Rotate 90° <kbd>R</kbd></button>
            <button type="button" className="plancraft-button" onClick={onDuplicateSelected}>Duplicate</button>
          </div>
          <button type="button" className="plancraft-button danger" onClick={onDeleteSelected}>Delete item</button>
        </div>
      ) : selectedDimension ? (
        <div className="plancraft-form-stack">
          <div className="plancraft-readout"><span>Measured</span><strong>{formatLength(Math.hypot(selectedDimension.end.x - selectedDimension.start.x, selectedDimension.end.y - selectedDimension.start.y), units)}</strong></div>
          <TextField label="Label (leave empty to show the measurement)" value={selectedDimension.label ?? ''} onCommit={(value) => onDimensionUpdate(selectedDimension.id, { label: value.trim() || undefined })} />
          <button type="button" className="plancraft-button danger" onClick={onDeleteSelected}>Delete dimension</button>
        </div>
      ) : (
        <div className="plancraft-form-stack">
          <TextField label="Project name" value={project.name} onCommit={(name) => onProjectMeta({ name: name.trim() || 'Untitled Plan' })} />
          <TextField label="Author" value={project.author} placeholder="Shown on the PDF title block" onCommit={(author) => onProjectMeta({ author })} />
          <label>Drawing scale<select value={project.scaleNotation} onChange={(event) => onProjectMeta({ scaleNotation: event.target.value })}><option value="1:20">1:20</option><option value="1:50">1:50</option><option value="1:100">1:100</option><option value={'1/4" = 1\'-0"'}>1/4&quot; = 1&apos;-0&quot;</option></select></label>
          <label>Units<select value={units} onChange={(event) => onProjectMeta({ units: event.target.value as DisplayUnits })}><option value="metric">Millimeters</option><option value="imperial">Feet and inches</option></select></label>
          <p className="plancraft-help">Nothing selected. Click a wall, door, item, or dimension to edit it.</p>
          <button type="button" className="plancraft-button" onClick={onNewPlan}>Start a new plan</button>
        </div>
      )}

      <details className="plancraft-details" open><summary>Layer stack</summary><div className="plancraft-layer-list">{project.layers.map((layer) => <label className="plancraft-check" key={layer.id}><input type="checkbox" checked={layer.visible} onChange={(event) => onToggleLayer(layer.id, event.target.checked)} /> {layer.name}</label>)}</div></details>
      <details className="plancraft-details"><summary>Rooms ({analysis.rooms.length})</summary><div className="plancraft-room-list">{analysis.rooms.length ? analysis.rooms.map((room) => (
        <div key={roomKey(room.boundaryVertexIds)}>
          <TextField ariaLabel={`Name for ${room.name}`} value={room.name} onCommit={(name) => onRoomRename(roomKey(room.boundaryVertexIds), name)} />
          <span>{formatArea(room.areaSqMeters, units)} · perimeter {formatLength(room.perimeterMeters * 1000, units)}</span>
        </div>
      )) : <p>No closed rooms yet. Rooms appear when walls meet to enclose a space.</p>}</div></details>
      <details className="plancraft-details" open={analysis.clearanceViolations.length > 0}><summary>Clearance check ({analysis.clearanceViolations.length})</summary><div className="plancraft-room-list">{analysis.clearanceViolations.length ? analysis.clearanceViolations.map((violation) => (
        <button type="button" className="plancraft-finding" key={violation.id} onClick={() => onSelect(violation.componentId)}>{violation.message}</button>
      )) : <p>Nothing is blocked or overlapping.</p>}</div></details>
    </aside>
  );
};

export default FloorplanInspector;
