import type { FloorplanAnalysis } from './floorplan-analysis';
import type { FloorplanProject, HostedOpening, PlanComponent, WallSegment } from './floorplan-types';

interface FloorplanInspectorProps {
  readonly project: FloorplanProject;
  readonly analysis: FloorplanAnalysis;
  readonly onProjectMeta: (patch: Partial<Pick<FloorplanProject, 'name' | 'author' | 'scaleNotation'>>) => void;
  readonly onWallUpdate: (id: string, patch: Partial<WallSegment>) => void;
  readonly onOpeningUpdate: (wallId: string, openingId: string, patch: Partial<HostedOpening>) => void;
  readonly onComponentUpdate: (id: string, patch: Partial<PlanComponent>) => void;
  readonly onDeleteSelected: () => void;
  readonly onToggleLayer: (id: string, visible: boolean) => void;
}

export const FloorplanInspector = ({
  project, analysis, onProjectMeta, onWallUpdate, onOpeningUpdate, onComponentUpdate, onDeleteSelected, onToggleLayer,
}: FloorplanInspectorProps) => {
  const selectedWall = project.walls.find((wall) => wall.id === project.selectedId);
  const selectedOpeningEntry = project.walls
    .map((wall) => ({ wall, opening: wall.openings.find((opening) => opening.id === project.selectedId) }))
    .find((entry) => entry.opening);
  const selectedComponent = project.components.find((component) => component.id === project.selectedId);
  const vertices = new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));
  const wallLength = selectedWall ? (() => {
    const start = vertices.get(selectedWall.startVertexId); const end = vertices.get(selectedWall.endVertexId);
    return start && end ? Math.hypot(end.x - start.x, end.y - start.y) : 0;
  })() : 0;

  return (
    <aside className="plancraft-inspector" aria-label="Parametric inspector">
      <div className="plancraft-panel-heading"><span>Parametric inspector</span><strong>{project.selectedId ?? 'Project'}</strong></div>
      {selectedWall ? (
        <div className="plancraft-form-stack">
          <div className="plancraft-readout"><span>Length</span><strong>{Math.round(wallLength)} mm</strong></div>
          <label>Thickness (mm)<input type="number" min="50" max="600" step="10" value={selectedWall.thickness} onChange={(event) => onWallUpdate(selectedWall.id, { thickness: Number(event.target.value) })} /></label>
          <label>Height (mm)<input type="number" min="300" max="12000" step="50" value={selectedWall.height} onChange={(event) => onWallUpdate(selectedWall.id, { height: Number(event.target.value) })} /></label>
          <label>Wall state<select value={selectedWall.state} onChange={(event) => onWallUpdate(selectedWall.id, { state: event.target.value as WallSegment['state'] })}><option value="existing">Existing</option><option value="new_construction">New construction</option><option value="demolition">Demolition</option></select></label>
          <label>Material<select value={selectedWall.material} onChange={(event) => onWallUpdate(selectedWall.id, { material: event.target.value as WallSegment['material'] })}><option value="drywall_stud">Drywall / stud</option><option value="concrete_masonry">Concrete masonry</option><option value="glass_partition">Glass partition</option><option value="brick">Brick</option></select></label>
          <label className="plancraft-check"><input type="checkbox" checked={selectedWall.isLoadBearing} onChange={(event) => onWallUpdate(selectedWall.id, { isLoadBearing: event.target.checked })} /> Load-bearing crosshatch</label>
          <button type="button" className="plancraft-button danger" onClick={onDeleteSelected}>Delete selection</button>
        </div>
      ) : selectedOpeningEntry?.opening ? (
        <div className="plancraft-form-stack">
          <div className="plancraft-readout"><span>Opening</span><strong>{selectedOpeningEntry.opening.type.replaceAll('_', ' ')}</strong></div>
          <label>Width (mm)<input type="number" min="300" max="5000" step="25" value={selectedOpeningEntry.opening.width} onChange={(event) => onOpeningUpdate(selectedOpeningEntry.wall.id, selectedOpeningEntry.opening!.id, { width: Number(event.target.value) })} /></label>
          <label>Nominal height (mm)<input type="number" min="300" max="5000" step="25" value={selectedOpeningEntry.opening.nominalHeight} onChange={(event) => onOpeningUpdate(selectedOpeningEntry.wall.id, selectedOpeningEntry.opening!.id, { nominalHeight: Number(event.target.value) })} /></label>
          <label>Sill height (mm)<input type="number" min="0" max="3000" step="25" value={selectedOpeningEntry.opening.sillHeight} onChange={(event) => onOpeningUpdate(selectedOpeningEntry.wall.id, selectedOpeningEntry.opening!.id, { sillHeight: Number(event.target.value) })} /></label>
          <button type="button" className="plancraft-button" onClick={() => onOpeningUpdate(selectedOpeningEntry.wall.id, selectedOpeningEntry.opening!.id, { flipSide: !selectedOpeningEntry.opening!.flipSide })}>Flip swing / exterior side</button>
          <button type="button" className="plancraft-button" onClick={() => onOpeningUpdate(selectedOpeningEntry.wall.id, selectedOpeningEntry.opening!.id, { flipHand: !selectedOpeningEntry.opening!.flipHand })}>Flip hand</button>
          <button type="button" className="plancraft-button danger" onClick={onDeleteSelected}>Delete selection</button>
        </div>
      ) : selectedComponent ? (
        <div className="plancraft-form-stack">
          <div className="plancraft-readout"><span>Symbol</span><strong>{selectedComponent.symbolKey.replaceAll('-', ' ')}</strong></div>
          <label>X (mm)<input type="number" step="10" value={Math.round(selectedComponent.position.x)} onChange={(event) => onComponentUpdate(selectedComponent.id, { position: { ...selectedComponent.position, x: Number(event.target.value) } })} /></label>
          <label>Y (mm)<input type="number" step="10" value={Math.round(selectedComponent.position.y)} onChange={(event) => onComponentUpdate(selectedComponent.id, { position: { ...selectedComponent.position, y: Number(event.target.value) } })} /></label>
          <label>Rotation (°)<input type="number" min="0" max="359" step="15" value={selectedComponent.rotation} onChange={(event) => onComponentUpdate(selectedComponent.id, { rotation: ((Number(event.target.value) % 360) + 360) % 360 })} /></label>
          <div className="plancraft-readout"><span>Clearance</span><strong>{selectedComponent.clearance.dimensions.x} × {selectedComponent.clearance.dimensions.y} mm</strong></div>
          <button type="button" className="plancraft-button danger" onClick={onDeleteSelected}>Delete selection</button>
        </div>
      ) : (
        <div className="plancraft-form-stack">
          <label>Project name<input type="text" value={project.name} onChange={(event) => onProjectMeta({ name: event.target.value })} /></label>
          <label>Author<input type="text" value={project.author} onChange={(event) => onProjectMeta({ author: event.target.value })} /></label>
          <label>Drawing scale<select value={project.scaleNotation} onChange={(event) => onProjectMeta({ scaleNotation: event.target.value })}><option value="1:20">1:20</option><option value="1:50">1:50</option><option value="1:100">1:100</option><option value={'1/4" = 1\'-0"'}>1/4&quot; = 1&apos;-0&quot;</option></select></label>
        </div>
      )}

      <details className="plancraft-details" open><summary>Layer stack</summary><div className="plancraft-layer-list">{project.layers.map((layer) => <label className="plancraft-check" key={layer.id}><input type="checkbox" checked={layer.visible} onChange={(event) => onToggleLayer(layer.id, event.target.checked)} /> {layer.name}</label>)}</div></details>
      <details className="plancraft-details"><summary>Detected rooms</summary><div className="plancraft-room-list">{analysis.rooms.length ? analysis.rooms.map((room) => <div key={room.id}><strong>{room.name}</strong><span>{room.areaSqMeters.toFixed(1)} m² · {room.areaSqFeet.toFixed(0)} ft²</span></div>) : <p>No enclosed room yet.</p>}</div></details>
      <details className="plancraft-details"><summary>Clearance findings ({analysis.clearanceViolations.length})</summary><div className="plancraft-room-list">{analysis.clearanceViolations.length ? analysis.clearanceViolations.map((violation) => <div key={violation.id}><strong>{violation.rule.replaceAll('_', ' ')}</strong><span>{violation.message}</span></div>) : <p>No current clearance intersections.</p>}</div></details>
    </aside>
  );
};

export default FloorplanInspector;
