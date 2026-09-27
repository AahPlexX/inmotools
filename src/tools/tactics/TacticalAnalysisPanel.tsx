import {
  buildOccupancyHeatMap,
  computeConvexTeamGeometry,
  computeEuclideanVoronoi,
  createDistanceRing,
  createPositionalGrid,
  createVisionSector,
  measurePassingLaneClearance,
  measureTether,
  measureTrajectory,
  sampleAuthoredTrajectory,
  type ConvexTeamGeometry,
  type DistanceRing,
  type OccupancyHeatMap,
  type PassingLaneClearance,
  type TacticalTether,
  type TrajectoryMetrics,
  type VisionSector,
  type VoronoiCell,
} from './analysis-engine';
import type { PlayerToken, TacticalProject } from './tactics-types';

export interface AnalysisDisplaySettings {
  voronoi: boolean;
  hulls: boolean;
  passingLane: boolean;
  vision: boolean;
  positionalGrid: boolean;
  distanceRing: boolean;
  tether: boolean;
  heatMap: boolean;
  includeGoalkeepers: boolean;
  defenderRadiusMeters: number;
  visionAngleDeg: number;
  visionRangeMeters: number;
  ringRadiusMeters: number;
  gridColumns: number;
  gridRows: number;
  heatColumns: number;
  heatRows: number;
  trajectoryStepMs: number;
  tetherTargetId: string;
  distanceUnit: 'metric' | 'imperial';
}

export const DEFAULT_ANALYSIS_DISPLAY_SETTINGS: AnalysisDisplaySettings = {
  voronoi: false,
  hulls: false,
  passingLane: false,
  vision: false,
  positionalGrid: false,
  distanceRing: false,
  tether: false,
  heatMap: false,
  includeGoalkeepers: true,
  defenderRadiusMeters: 1.5,
  visionAngleDeg: 90,
  visionRangeMeters: 15,
  ringRadiusMeters: 5,
  gridColumns: 5,
  gridRows: 3,
  heatColumns: 10,
  heatRows: 6,
  trajectoryStepMs: 250,
  tetherTargetId: 'ball',
  distanceUnit: 'metric',
};

export interface TeamGeometrySummary {
  teamId: string;
  geometry: ConvexTeamGeometry;
}

export interface TacticalAnalysisView {
  sceneTokens: PlayerToken[];
  selectedToken?: PlayerToken;
  voronoi: VoronoiCell[];
  hulls: TeamGeometrySummary[];
  passingLane?: PassingLaneClearance;
  vision?: VisionSector;
  grid: ReturnType<typeof createPositionalGrid>;
  ring?: DistanceRing;
  tether?: TacticalTether;
  heatMap?: OccupancyHeatMap;
  trajectoryMetrics?: TrajectoryMetrics;
}

function isGoalkeeper(project: TacticalProject, token: PlayerToken): boolean {
  const team = project.teams.find((candidate) => candidate.id === token.teamId);
  const player = team?.roster.find((candidate) => candidate.id === token.playerId);
  return /(^|\b)(goalkeeper|keeper|gk)(\b|$)/i.test(player?.role ?? '');
}

export function deriveTacticalAnalysis(
  project: TacticalProject,
  sceneId: string,
  selectedTokenId: string | undefined,
  settings: AnalysisDisplaySettings,
): TacticalAnalysisView {
  const visibleSceneTokens = project.playerTokens.filter((token) => token.sceneId === sceneId && token.visible);
  const selectedToken = visibleSceneTokens.find((token) => token.id === selectedTokenId) ?? visibleSceneTokens[0];
  const sceneTokens = visibleSceneTokens.filter(
    (token) => settings.includeGoalkeepers || !isGoalkeeper(project, token),
  );

  const voronoi = settings.voronoi
    ? computeEuclideanVoronoi(
        sceneTokens.map((token) => ({ id: token.id, position: token.position })),
        project.pitch.dimensions,
      )
    : [];

  const teamIds = [...new Set(sceneTokens.map((token) => token.teamId))];
  const hulls = settings.hulls
    ? teamIds.map((teamId) => ({
        teamId,
        geometry: computeConvexTeamGeometry(
          sceneTokens.filter((token) => token.teamId === teamId).map((token) => token.position),
          project.pitch.dimensions,
        ),
      }))
    : [];

  const defenders = selectedToken
    ? sceneTokens
        .filter((token) => token.teamId !== selectedToken.teamId)
        .map((token) => ({ id: token.id, position: token.position }))
    : [];

  const passingLane = settings.passingLane && selectedToken
    ? measurePassingLaneClearance(
        selectedToken.position,
        project.ball.position,
        defenders,
        project.pitch.dimensions,
        settings.defenderRadiusMeters,
      )
    : undefined;

  const vision = settings.vision && selectedToken
    ? createVisionSector(
        selectedToken.position,
        selectedToken.rotationDeg,
        settings.visionAngleDeg,
        settings.visionRangeMeters,
        project.pitch.dimensions,
      )
    : undefined;

  const grid = createPositionalGrid(settings.gridColumns, settings.gridRows);
  const ring = settings.distanceRing && selectedToken
    ? createDistanceRing(selectedToken.position, settings.ringRadiusMeters, project.pitch.dimensions)
    : undefined;
  const tetherTarget = settings.tetherTargetId === 'ball'
    ? project.ball.position
    : visibleSceneTokens.find((token) => token.id === settings.tetherTargetId)?.position ?? project.ball.position;
  const tether = settings.tether && selectedToken
    ? measureTether(selectedToken.position, tetherTarget, project.pitch.dimensions)
    : undefined;

  const selectedTrack = selectedToken
    ? project.timeline.tracks.find((track) => track.targetId === selectedToken.id)
    : undefined;
  const authoredTimes = selectedTrack?.keyframes
    .filter((keyframe) => keyframe.position)
    .map((keyframe) => keyframe.timeMs) ?? [];
  const trajectorySamples = selectedTrack && authoredTimes.length
    ? sampleAuthoredTrajectory(
        selectedTrack,
        Math.min(...authoredTimes),
        Math.max(...authoredTimes),
        settings.trajectoryStepMs,
      )
    : [];
  const heatMap = settings.heatMap && trajectorySamples.length
    ? buildOccupancyHeatMap(trajectorySamples, settings.heatColumns, settings.heatRows)
    : undefined;
  const trajectoryMetrics = trajectorySamples.length
    ? measureTrajectory(trajectorySamples, project.pitch.dimensions, 'authored')
    : undefined;

  return {
    sceneTokens,
    selectedToken,
    voronoi,
    hulls,
    passingLane,
    vision,
    grid,
    ring,
    tether,
    heatMap,
    trajectoryMetrics,
  };
}

export interface TacticalAnalysisOverlayProps {
  project: TacticalProject;
  sceneId: string;
  selectedTokenId?: string;
  settings: AnalysisDisplaySettings;
}

function polygonPoints(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ');
}

export function TacticalAnalysisOverlay({
  project,
  sceneId,
  selectedTokenId,
  settings,
}: TacticalAnalysisOverlayProps) {
  const view = deriveTacticalAnalysis(project, sceneId, selectedTokenId, settings);
  const selected = view.selectedToken;

  return (
    <svg
      className="tactical-analysis-overlay"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {settings.positionalGrid && settings.gridColumns === 5 ? (
        <>
          <rect data-analysis-kind="half-space-zone" x="200" y="0" width="200" height="1000" className="tactical-analysis-zone half-space" />
          <rect data-analysis-kind="central-corridor" x="400" y="0" width="200" height="1000" className="tactical-analysis-zone central" />
          <rect data-analysis-kind="half-space-zone" x="600" y="0" width="200" height="1000" className="tactical-analysis-zone half-space" />
        </>
      ) : null}

      {settings.heatMap && view.heatMap ? view.heatMap.cells
        .filter((cell) => cell.count > 0)
        .map((cell) => (
          <rect
            key={`heat-${cell.column}-${cell.row}`}
            data-analysis-kind="heat-cell"
            x={(cell.column / view.heatMap!.columns) * 1000}
            y={(cell.row / view.heatMap!.rows) * 1000}
            width={1000 / view.heatMap!.columns}
            height={1000 / view.heatMap!.rows}
            className="tactical-analysis-heat"
            style={{ opacity: 0.12 + cell.intensity * 0.38 }}
          />
        )) : null}

      {settings.voronoi ? view.voronoi.map((cell) => (
        <polygon
          key={cell.targetId}
          data-analysis-kind="voronoi-cell"
          points={polygonPoints(cell.polygon)}
          className="tactical-analysis-voronoi"
        />
      )) : null}

      {settings.hulls ? view.hulls.map(({ teamId, geometry }) => (
        <polygon
          key={teamId}
          data-analysis-kind="team-hull"
          points={polygonPoints(geometry.hull)}
          className="tactical-analysis-hull"
        />
      )) : null}

      {settings.positionalGrid ? (
        <>
          {view.grid.vertical.map((x) => (
            <line
              key={`grid-v-${x}`}
              data-analysis-kind="grid-line"
              x1={x * 1000}
              x2={x * 1000}
              y1="0"
              y2="1000"
              className="tactical-analysis-grid-line"
            />
          ))}
          {view.grid.horizontal.map((y) => (
            <line
              key={`grid-h-${y}`}
              data-analysis-kind="grid-line"
              x1="0"
              x2="1000"
              y1={y * 1000}
              y2={y * 1000}
              className="tactical-analysis-grid-line"
            />
          ))}
        </>
      ) : null}

      {settings.passingLane && selected ? (
        <line
          data-analysis-kind="passing-lane"
          x1={selected.position.x * 1000}
          y1={selected.position.y * 1000}
          x2={project.ball.position.x * 1000}
          y2={project.ball.position.y * 1000}
          className={view.passingLane?.blocked ? 'tactical-analysis-lane blocked' : 'tactical-analysis-lane'}
        />
      ) : null}

      {settings.vision && view.vision ? (
        <polygon
          data-analysis-kind="vision-sector"
          points={polygonPoints(view.vision.points)}
          className="tactical-analysis-vision"
        />
      ) : null}

      {settings.distanceRing && view.ring ? (
        <ellipse
          data-analysis-kind="distance-ring"
          cx={view.ring.center.x * 1000}
          cy={view.ring.center.y * 1000}
          rx={view.ring.radiusXNormalized * 1000}
          ry={view.ring.radiusYNormalized * 1000}
          className="tactical-analysis-ring"
        />
      ) : null}

      {settings.tether && view.tether ? (
        <line
          data-analysis-kind="tether"
          x1={view.tether.from.x * 1000}
          y1={view.tether.from.y * 1000}
          x2={view.tether.to.x * 1000}
          y2={view.tether.to.y * 1000}
          className="tactical-analysis-tether"
        />
      ) : null}
    </svg>
  );
}

export interface TacticalAnalysisPanelProps {
  project: TacticalProject;
  sceneId: string;
  selectedTokenId?: string;
  settings: AnalysisDisplaySettings;
  onSettingsChange: (settings: AnalysisDisplaySettings) => void;
  onSetOrientation?: (degrees: number) => void;
}

function numberInput(
  value: number,
  update: (value: number) => void,
  options: { min: number; max?: number; step: number },
) {
  return {
    type: 'number' as const,
    value,
    min: options.min,
    max: options.max,
    step: options.step,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (Number.isFinite(next) && next >= options.min && (options.max === undefined || next <= options.max)) {
        update(next);
      }
    },
  };
}

export default function TacticalAnalysisPanel({
  project,
  sceneId,
  selectedTokenId,
  settings,
  onSettingsChange,
  onSetOrientation,
}: TacticalAnalysisPanelProps) {
  const view = deriveTacticalAnalysis(project, sceneId, selectedTokenId, settings);
  const update = <K extends keyof AnalysisDisplaySettings>(key: K, value: AnalysisDisplaySettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };
  const visibleTargets = project.playerTokens.filter(
    (token) => token.sceneId === sceneId && token.visible && token.id !== view.selectedToken?.id,
  );
  const formatDistance = (meters: number) => settings.distanceUnit === 'metric'
    ? `${meters.toFixed(2)} m`
    : `${(meters * 3.28084).toFixed(2)} ft`;
  const nearestClearance = view.passingLane?.minimumClearanceMeters;
  const clearanceText = nearestClearance === undefined
    ? 'Enable the passing-lane aid to inspect geometric clearance.'
    : Number.isFinite(nearestClearance)
      ? `Geometric clearance: ${nearestClearance.toFixed(2)} m (${view.passingLane?.blocked ? 'within configured defender radius' : 'outside configured defender radius'}).`
      : 'Geometric clearance: ∞ m (no opposing defender geometry is present).';

  return (
    <details className="tactical-setup tactical-authoring">
      <summary>Spatial analysis</summary>
      <div className="tactical-authoring-grid">
        <section aria-labelledby="spatial-overlays-heading">
          <h3 id="spatial-overlays-heading">Geometry overlays</h3>
          <label><input type="checkbox" checked={settings.voronoi} onChange={(event) => update('voronoi', event.target.checked)} /> Voronoi territory</label>
          <label><input type="checkbox" checked={settings.hulls} onChange={(event) => update('hulls', event.target.checked)} /> Team hulls</label>
          <label><input type="checkbox" checked={settings.passingLane} onChange={(event) => update('passingLane', event.target.checked)} /> Passing lane to ball</label>
          <label><input type="checkbox" checked={settings.vision} onChange={(event) => update('vision', event.target.checked)} /> Orientation sector</label>
          <label><input type="checkbox" checked={settings.positionalGrid} onChange={(event) => update('positionalGrid', event.target.checked)} /> Positional grid</label>
          <label><input type="checkbox" checked={settings.distanceRing} onChange={(event) => update('distanceRing', event.target.checked)} /> Distance ring</label>
          <label><input type="checkbox" checked={settings.tether} onChange={(event) => update('tether', event.target.checked)} /> Tether to ball</label>
          <label><input type="checkbox" checked={settings.heatMap} onChange={(event) => update('heatMap', event.target.checked)} /> Occupancy heat map</label>
          <label><input type="checkbox" checked={settings.includeGoalkeepers} onChange={(event) => update('includeGoalkeepers', event.target.checked)} /> Include goalkeepers in team geometry</label>
        </section>

        <section aria-labelledby="spatial-settings-heading">
          <h3 id="spatial-settings-heading">Analysis settings</h3>
          <label>Defender radius (m)<input {...numberInput(settings.defenderRadiusMeters, (value) => update('defenderRadiusMeters', value), { min: 0.1, step: 0.1 })} /></label>
          <label>Vision angle (deg)<input {...numberInput(settings.visionAngleDeg, (value) => update('visionAngleDeg', value), { min: 1, max: 360, step: 1 })} /></label>
          <label>Vision range (m)<input {...numberInput(settings.visionRangeMeters, (value) => update('visionRangeMeters', value), { min: 0.1, step: 0.1 })} /></label>
          <label>Distance-ring radius (m)<input {...numberInput(settings.ringRadiusMeters, (value) => update('ringRadiusMeters', value), { min: 0.1, step: 0.1 })} /></label>
          <label>Grid columns<input {...numberInput(settings.gridColumns, (value) => update('gridColumns', Math.round(value)), { min: 1, max: 12, step: 1 })} /></label>
          <label>Grid rows<input {...numberInput(settings.gridRows, (value) => update('gridRows', Math.round(value)), { min: 1, max: 12, step: 1 })} /></label>
          <label>Trajectory sample step (ms)<input {...numberInput(settings.trajectoryStepMs, (value) => update('trajectoryStepMs', Math.round(value)), { min: 1, step: 1 })} /></label>
          <label>
            Distance units
            <select value={settings.distanceUnit} onChange={(event) => update('distanceUnit', event.target.value as 'metric' | 'imperial')}>
              <option value="metric">Metric (m)</option>
              <option value="imperial">Imperial (ft)</option>
            </select>
          </label>
          <label>
            Tether target
            <select value={settings.tetherTargetId} onChange={(event) => update('tetherTargetId', event.target.value)}>
              <option value="ball">Ball</option>
              {visibleTargets.map((token) => <option key={token.id} value={token.id}>{token.id}</option>)}
            </select>
          </label>
        </section>

        <form
          aria-label="Player orientation"
          key={`orientation-${view.selectedToken?.id ?? 'none'}-${view.selectedToken?.rotationDeg ?? 0}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!onSetOrientation || !view.selectedToken) return;
            const degrees = Number(new FormData(event.currentTarget).get('bodyOrientationDeg'));
            if (!Number.isFinite(degrees) || degrees < 0 || degrees > 360) return;
            onSetOrientation(degrees === 360 ? 0 : degrees);
          }}
        >
          <h3>Player orientation</h3>
          <p>Orientation is authored by the user; it is not inferred from match footage or player attention.</p>
          <label>
            Body orientation (deg)
            <input
              name="bodyOrientationDeg"
              type="number"
              min="0"
              max="360"
              step="1"
              defaultValue={view.selectedToken?.rotationDeg ?? 0}
              disabled={!view.selectedToken}
            />
          </label>
          <button type="submit" disabled={!view.selectedToken || !onSetOrientation}>Set orientation</button>
        </form>

        <section aria-labelledby="team-geometry-heading">
          <h3 id="team-geometry-heading">Team geometry</h3>
          <div data-testid="team-geometry-summary">
            {view.hulls.length ? view.hulls.map(({ teamId, geometry }) => (
              <p key={teamId}>
                {teamId}: width {geometry.widthMeters.toFixed(2)} m; depth {geometry.depthMeters.toFixed(2)} m; hull area {geometry.areaSquareMeters.toFixed(2)} m²; centroid {Math.round(geometry.centroid.x * 100)}%, {Math.round(geometry.centroid.y * 100)}%.
              </p>
            )) : <p>Enable team hulls to inspect width, depth, area, and centroid geometry.</p>}
          </div>
          <p data-testid="passing-lane-summary">{clearanceText}</p>
          {view.tether ? (
            <p>
              {settings.tetherTargetId === 'ball' ? 'Selected-player tether to ball' : 'Player/unit spacing'}: {formatDistance(view.tether.distanceMeters)}.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="trajectory-metrics-heading">
          <h3 id="trajectory-metrics-heading">Trajectory metrics</h3>
          <div data-testid="trajectory-metrics-summary">
            {view.trajectoryMetrics ? (
              <p>
                Authored trajectory: distance {view.trajectoryMetrics.distanceMeters.toFixed(2)} m; average speed {view.trajectoryMetrics.averageSpeedMetersPerSecond.toFixed(2)} m/s; peak sampled speed {view.trajectoryMetrics.maxSegmentSpeedMetersPerSecond.toFixed(2)} m/s; duration {view.trajectoryMetrics.durationMs} ms.
              </p>
            ) : <p>No authored trajectory is available for the selected player.</p>}
          </div>
          <small>Authored/import-derived values are geometric calculations from the configured pitch dimensions and timestamps, not GPS measurements.</small>
        </section>

        <section aria-labelledby="analysis-honesty-heading">
          <h3 id="analysis-honesty-heading">Interpretation</h3>
          <p>Geometric analysis only. Voronoi shows nearest-player Euclidean territory, not true pitch control. Passing-lane clearance is not a success probability. Orientation sectors are authored visualization, not inferred attention.</p>
          <p>The default five-channel, three-row grid highlights wide channels, half-spaces, a central corridor, and thirds; custom rows/columns remain editable.</p>
        </section>
      </div>
    </details>
  );
}
