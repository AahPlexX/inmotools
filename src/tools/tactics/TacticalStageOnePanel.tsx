import { useMemo, useState, type FormEvent } from 'react';
import { authorCanonicalCoordinate, authorEntityCoordinate, readCanonicalCoordinate } from './coordinate-engine';
import { authorBallElevationKeyframe } from './elevation-engine';
import type { TacticalGuide } from './guide-engine';
import {
  addPresentationMark,
  captureScenario,
  compareScenarios,
  recordOnionSkinKeyframe,
} from './presentation-authoring-engine';
import { TRAINING_PROP_LIBRARY, placeTrainingProp, transformEquipment } from './prop-library';
import { MAX_ROSTER_PLAYERS_PER_TEAM, addSquadParticipant, scaleActiveSquad, squadCounts } from './squad-engine';
import { editRosterToken } from './token-editor-engine';
import type { RosterPlayerStatus } from './squad-engine';
import type { TacticalProject } from './tactics-types';

export interface TacticalSnapSettings {
  enabled: boolean;
  grid: boolean;
  pitchGuides: boolean;
  teammates: boolean;
  equalSpacing: boolean;
}

export const DEFAULT_TACTICAL_SNAP: TacticalSnapSettings = {
  enabled: false,
  grid: true,
  pitchGuides: true,
  teammates: true,
  equalSpacing: true,
};

export interface TacticalStageOnePanelProps {
  project: TacticalProject;
  sceneId: string;
  layerId: string;
  selectedTokenId?: string;
  previewTimeMs: number;
  snap: TacticalSnapSettings;
  onionSkin: boolean;
  scenarioOverlayId: string;
  guides: TacticalGuide[];
  onEdit: (label: string, updater: (current: TacticalProject) => TacticalProject, message: string) => boolean;
  onSnapChange: (snap: TacticalSnapSettings) => void;
  onOnionSkinChange: (enabled: boolean) => void;
  onScenarioOverlayChange: (scenarioId: string) => void;
}

const STATUSES: RosterPlayerStatus[] = ['active', 'substitute', 'neutral', 'coach'];

function uniqueId(used: Set<string>, prefix: string): string {
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export default function TacticalStageOnePanel({
  project,
  sceneId,
  layerId,
  selectedTokenId,
  previewTimeMs,
  snap,
  onionSkin,
  scenarioOverlayId,
  guides,
  onEdit,
  onSnapChange,
  onOnionSkinChange,
  onScenarioOverlayChange,
}: TacticalStageOnePanelProps) {
  const [equipmentId, setEquipmentId] = useState(project.equipment[0]?.id ?? '');
  const [leftScenarioId, setLeftScenarioId] = useState(project.scenarios[0]?.id ?? '');
  const [rightScenarioId, setRightScenarioId] = useState(project.scenarios[1]?.id ?? '');
  const selectedToken = project.playerTokens.find((token) => token.id === selectedTokenId);
  const team = project.teams.find((candidate) => candidate.id === selectedToken?.teamId) ?? project.teams[0];
  const player = team?.roster.find((candidate) => candidate.id === selectedToken?.playerId);
  const counts = team ? squadCounts(project, team.id) : null;
  const reading = selectedToken ? readCanonicalCoordinate(selectedToken.position, project.pitch.dimensions) : null;
  const selectedEquipment = project.equipment.find((item) => item.id === equipmentId) ?? project.equipment[0];
  const comparison = useMemo(() => {
    if (!leftScenarioId || !rightScenarioId || leftScenarioId === rightScenarioId) return null;
    if (!project.scenarios.some((scenario) => scenario.id === leftScenarioId)) return null;
    if (!project.scenarios.some((scenario) => scenario.id === rightScenarioId)) return null;
    return compareScenarios(project, leftScenarioId, rightScenarioId);
  }, [leftScenarioId, project, rightScenarioId]);

  function occupiedIds(): Set<string> {
    const ids = new Set<string>();
    for (const item of project.teams) {
      ids.add(item.id);
      for (const rosterPlayer of item.roster) ids.add(rosterPlayer.id);
    }
    for (const token of project.playerTokens) ids.add(token.id);
    for (const annotation of project.annotations) ids.add(annotation.id);
    for (const scenario of project.scenarios) ids.add(scenario.id);
    return ids;
  }

  function scaleSquad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team) return;
    const activeCount = Number(new FormData(event.currentTarget).get('activeCount'));
    onEdit(
      'Scale active squad',
      (current) => scaleActiveSquad(current, team.id, activeCount, { sceneId, layerId }),
      `Active squad set to ${activeCount}.`,
    );
  }

  function addParticipant(status: 'neutral' | 'coach') {
    if (!team) return;
    const ids = occupiedIds();
    const id = uniqueId(ids, status);
    const position = status === 'coach' ? { x: 0.5, y: 0.94 } : { x: 0.5, y: 0.06 };
    onEdit(
      status === 'coach' ? 'Add coach' : 'Add neutral player',
      (current) => addSquadParticipant(current, team.id, {
        id,
        displayName: status === 'coach' ? 'Coach' : 'Neutral player',
        status,
      }, { sceneId, layerId, position }),
      status === 'coach' ? 'Coach added on the sideline.' : 'Neutral player added.',
    );
  }

  function saveToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team || !player) return;
    const data = new FormData(event.currentTarget);
    const status = String(data.get('status') ?? player.status) as RosterPlayerStatus;
    onEdit(
      'Edit roster token',
      (current) => editRosterToken(current, team.id, player.id, {
        displayName: String(data.get('displayName') ?? ''),
        jerseyNumber: String(data.get('jerseyNumber') ?? ''),
        role: String(data.get('role') ?? ''),
        status,
        ageOrDevelopmentTag: String(data.get('development') ?? ''),
        avatarAssetId: String(data.get('avatarAssetId') ?? ''),
        primaryColor: String(data.get('primaryColor') ?? team.primaryColor),
        secondaryColor: String(data.get('secondaryColor') ?? team.secondaryColor),
      }),
      'Roster token updated.',
    );
  }

  function applyCoordinate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const mode = String(data.get('coordinateMode') ?? 'normalized') === 'meters' ? 'meters' : 'normalized';
    const target = String(data.get('coordinateTarget') ?? 'ball');
    const point = authorCanonicalCoordinate(
      mode,
      Number(data.get('coordX')),
      Number(data.get('coordY')),
      project.pitch.dimensions,
    );
    onEdit(
      'Set canonical coordinates',
      (current) => {
        if (target === 'ball') return authorEntityCoordinate(current, { kind: 'ball' }, point);
        if (target.startsWith('equipment:')) {
          return authorEntityCoordinate(current, { kind: 'equipment', equipmentId: target.slice('equipment:'.length) }, point);
        }
        if (!selectedToken) throw new Error('Select a player before setting player coordinates.');
        return authorEntityCoordinate(current, { kind: 'player', tokenId: selectedToken.id }, point);
      },
      'Canonical coordinates applied.',
    );
  }

  function authorElevation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const timeMs = Number(data.get('elevationTime'));
    const elevationMeters = Number(data.get('elevationMeters'));
    onEdit(
      'Author ball elevation',
      (current) => authorBallElevationKeyframe(current, timeMs, elevationMeters),
      `Ball elevation ${elevationMeters} m authored at ${timeMs} ms.`,
    );
  }

  function placeProp(kind: string, index: number) {
    const definition = TRAINING_PROP_LIBRARY.find((item) => item.kind === kind);
    if (!definition) return;
    let sequence = 1;
    while (project.equipment.some((item) => item.id === `prop-${kind}-${sequence}`)) sequence += 1;
    const id = `prop-${kind}-${sequence}`;
    const saved = onEdit(
      `Place ${definition.label}`,
      (current) => placeTrainingProp(current, kind, sceneId, layerId, {
        x: Math.min(0.9, 0.12 + index * 0.08),
        y: 0.82,
      }),
      `${definition.label} placed from the local prop library.`,
    );
    if (saved) setEquipmentId(id);
  }

  function applyPropTransform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEquipment) return;
    const data = new FormData(event.currentTarget);
    onEdit(
      'Transform training prop',
      (current) => transformEquipment(current, selectedEquipment.id, {
        rotationDeg: Number(data.get('propRotation')),
        scale: Number(data.get('propScale')),
        position: {
          x: Number(data.get('propX')) / 100,
          y: Number(data.get('propY')) / 100,
        },
      }),
      'Training prop transformed.',
    );
  }

  function addSpotlight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const id = uniqueId(occupiedIds(), 'spotlight');
    const center = selectedToken?.position ?? { x: 0.5, y: 0.5 };
    onEdit(
      'Add spotlight',
      (current) => addPresentationMark(current, {
        id,
        kind: 'spotlight',
        sceneId,
        layerId,
        points: [center],
        label: String(data.get('spotLabel') ?? ''),
        startMs: Number(data.get('spotStart')),
        endMs: Number(data.get('spotEnd')),
      }),
      'Spotlight added on the board.',
    );
  }

  function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = String(new FormData(event.currentTarget).get('scenarioLabel') ?? '').trim();
    const id = uniqueId(occupiedIds(), 'scenario');
    const saved = onEdit(
      'Capture scenario',
      (current) => captureScenario(current, { id, label, sceneId }),
      `Scenario ${label} captured.`,
    );
    if (saved) {
      if (!leftScenarioId) setLeftScenarioId(id);
      else if (!rightScenarioId || rightScenarioId === leftScenarioId) setRightScenarioId(id);
    }
  }

  return (
    <details className="tactical-setup tactical-stage-panel">
      <summary>Squad, props and presentation</summary>
      <div className="tactical-stage-grid">
        <section aria-labelledby="squad-scaler-heading">
          <h3 id="squad-scaler-heading">Squad scaler</h3>
          {counts ? (
            <p data-testid="squad-summary">
              {counts.active} active, {counts.substitute} substitute, {counts.neutral} neutral, {counts.coach} coach, {counts.roster} on the roster.
            </p>
          ) : <p>Build a team before scaling the squad.</p>}
          <form onSubmit={scaleSquad}>
            <label>
              Active players
              <input name="activeCount" type="number" min="0" max={MAX_ROSTER_PLAYERS_PER_TEAM} step="1" defaultValue={counts?.active ?? 0} required />
            </label>
            <button type="submit">Scale squad</button>
          </form>
          <div className="tactical-stage-actions">
            <button type="button" onClick={() => addParticipant('neutral')}>Add neutral player</button>
            <button type="button" onClick={() => addParticipant('coach')}>Add coach</button>
          </div>
          <small>Type an active-player count, then choose Scale squad. The count can pass the formation (the starting arrangement) size. The team stops at {MAX_ROSTER_PLAYERS_PER_TEAM} players. {MAX_ROSTER_PLAYERS_PER_TEAM} is the Pages-safe ceiling (the most players you can add on one team from this page), not a format cap (not the player count of a 7v7 or 11v11 formation). Neutral players and coaches stay out of the active count.</small>
        </section>

        <section aria-labelledby="token-editor-heading">
          <h3 id="token-editor-heading">Token editor</h3>
          {team && player ? (
            <form key={`${player.id}-${player.jerseyNumber ?? ''}-${player.role ?? ''}`} onSubmit={saveToken}>
              <label>
                Display name
                <input name="displayName" defaultValue={player.displayName} required />
              </label>
              <label>
                Jersey
                <input name="jerseyNumber" defaultValue={player.jerseyNumber ?? ''} maxLength={3} />
              </label>
              <label>
                Role
                <input name="role" defaultValue={player.role ?? ''} />
              </label>
              <label>
                Status
                <select name="status" defaultValue={player.status}>
                  {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label>
                Developmental token
                <input name="development" defaultValue={player.ageOrDevelopmentTag ?? ''} />
              </label>
              <label>
                Avatar asset id
                <input name="avatarAssetId" defaultValue={player.avatarAssetId ?? ''} />
              </label>
              <label>
                Primary kit
                <input name="primaryColor" type="color" defaultValue={team.primaryColor} />
              </label>
              <label>
                Secondary kit
                <input name="secondaryColor" type="color" defaultValue={team.secondaryColor} />
              </label>
              <button type="submit">Save token</button>
            </form>
          ) : <p>Select a player to edit jersey, role, kit, and developmental token.</p>}
          <small>The developmental token belongs to this player. Session development level stays in the coaching plan.</small>
        </section>

        <section aria-labelledby="coordinate-surface-heading">
          <h3 id="coordinate-surface-heading">Coordinate surface</h3>
          {reading ? (
            <p>
              Selected player is stored as normalized {reading.x.toFixed(3)}, {reading.y.toFixed(3)} ({reading.xMeters.toFixed(2)} m, {reading.yMeters.toFixed(2)} m).
            </p>
          ) : <p>Select a player to read pitch metres.</p>}
          <form onSubmit={applyCoordinate}>
            <label>
              Coordinate target
              <select name="coordinateTarget" defaultValue={selectedToken ? 'player' : 'ball'}>
                <option value="player">Selected player</option>
                <option value="ball">Ball</option>
                {project.equipment.map((item) => (
                  <option key={item.id} value={`equipment:${item.id}`}>{item.kind} {item.id}</option>
                ))}
              </select>
            </label>
            <label>
              Entry
              <select name="coordinateMode" defaultValue="normalized">
                <option value="normalized">Normalized 0 to 1</option>
                <option value="meters">Pitch metres</option>
              </select>
            </label>
            <label>
              Coordinate X
              <input name="coordX" type="number" step="0.01" required />
            </label>
            <label>
              Coordinate Y
              <input name="coordY" type="number" step="0.01" required />
            </label>
            <button type="submit">Apply coordinates</button>
          </form>
          <small>Stored positions stay in normalized units. Metres are derived from the pitch dimensions.</small>
        </section>

        <section aria-labelledby="elevation-heading">
          <h3 id="elevation-heading">Ball elevation trajectory</h3>
          <form onSubmit={authorElevation}>
            <label>
              Elevation time (ms)
              <input name="elevationTime" type="number" min="0" step="1" defaultValue={previewTimeMs} required />
            </label>
            <label>
              Elevation (m)
              <input name="elevationMeters" type="number" min="0" step="0.1" defaultValue="0" required />
            </label>
            <button type="submit">Author elevation</button>
          </form>
          <small>Elevation keyframes ride the ball track. The resting ball elevation stays separate from this trajectory.</small>
        </section>

        <section aria-labelledby="prop-library-heading">
          <h3 id="prop-library-heading">Prop library</h3>
          <p>{TRAINING_PROP_LIBRARY[0]?.provenance.note}</p>
          <div className="tactical-stage-actions">
            {TRAINING_PROP_LIBRARY.map((prop, index) => (
              <button key={prop.kind} type="button" onClick={() => placeProp(prop.kind, index)}>
                Place {prop.label}
              </button>
            ))}
          </div>
          {selectedEquipment ? (
            <form key={selectedEquipment.id} onSubmit={applyPropTransform}>
              <label>
                Prop
                <select value={selectedEquipment.id} onChange={(event) => setEquipmentId(event.target.value)}>
                  {project.equipment.map((item) => (
                    <option key={item.id} value={item.id}>{item.kind} {item.id}</option>
                  ))}
                </select>
              </label>
              <label>
                Prop X %
                <input name="propX" type="number" min="0" max="100" step="0.1" defaultValue={(selectedEquipment.position.x * 100).toFixed(1)} required />
              </label>
              <label>
                Prop Y %
                <input name="propY" type="number" min="0" max="100" step="0.1" defaultValue={(selectedEquipment.position.y * 100).toFixed(1)} required />
              </label>
              <label>
                Rotation
                <input name="propRotation" type="number" step="1" defaultValue={selectedEquipment.rotationDeg} required />
              </label>
              <label>
                Prop scale
                <input name="propScale" type="number" min="0.2" max="8" step="0.1" defaultValue={selectedEquipment.scale} required />
              </label>
              <button type="submit">Apply prop transform</button>
            </form>
          ) : <p>Place a prop to rotate or scale it.</p>}
        </section>

        <section aria-labelledby="snap-guides-heading">
          <h3 id="snap-guides-heading">Snapping and guides</h3>
          <label className="tactical-include">
            <input
              type="checkbox"
              checked={snap.enabled}
              onChange={(event) => onSnapChange({ ...snap, enabled: event.target.checked })}
            />
            <span>Snap movement</span>
          </label>
          <label className="tactical-include">
            <input
              type="checkbox"
              checked={snap.grid}
              onChange={(event) => onSnapChange({ ...snap, grid: event.target.checked })}
            />
            <span>Grid</span>
          </label>
          <label className="tactical-include">
            <input
              type="checkbox"
              checked={snap.pitchGuides}
              onChange={(event) => onSnapChange({ ...snap, pitchGuides: event.target.checked })}
            />
            <span>Pitch guides</span>
          </label>
          <label className="tactical-include">
            <input
              type="checkbox"
              checked={snap.teammates}
              onChange={(event) => onSnapChange({ ...snap, teammates: event.target.checked })}
            />
            <span>Teammate alignment</span>
          </label>
          <label className="tactical-include">
            <input
              type="checkbox"
              checked={snap.equalSpacing}
              onChange={(event) => onSnapChange({ ...snap, equalSpacing: event.target.checked })}
            />
            <span>Equal spacing</span>
          </label>
          {snap.enabled ? (
            <ul>
              {guides.slice(0, 4).map((guide) => <li key={`${guide.axis}-${guide.value}`}>{guide.label}</li>)}
            </ul>
          ) : <small>Snapping stays off until you enable it, so exact clicks are unchanged.</small>}
        </section>

        <section aria-labelledby="spotlight-heading">
          <h3 id="spotlight-heading">Spotlight telestration</h3>
          <form onSubmit={addSpotlight}>
            <label>
              Spotlight label
              <input name="spotLabel" defaultValue="Spotlight" required />
            </label>
            <label>
              Spotlight start (ms)
              <input name="spotStart" type="number" min="0" step="1" defaultValue={previewTimeMs} required />
            </label>
            <label>
              Spotlight end (ms)
              <input name="spotEnd" type="number" min="0" step="1" defaultValue={Math.min(project.timeline.durationMs, previewTimeMs + 1000)} required />
            </label>
            <button type="submit">Add spotlight</button>
          </form>
          <small>Board spotlight marks are separate from video telestration.</small>
        </section>

        <section aria-labelledby="onion-skin-heading">
          <h3 id="onion-skin-heading">Onion skin</h3>
          <label className="tactical-include">
            <input
              type="checkbox"
              checked={onionSkin}
              onChange={(event) => onOnionSkinChange(event.target.checked)}
            />
            <span>Show onion skin</span>
          </label>
          <button
            type="button"
            onClick={() => onEdit(
              'Record onion-skin positions',
              (current) => recordOnionSkinKeyframe(current, sceneId, previewTimeMs),
              `Positions recorded for onion skin at ${previewTimeMs} ms.`,
            )}
          >
            Record onion-skin positions
          </button>
          <small>Ghosts show the previous and next recorded positions around the playhead.</small>
        </section>

        <section aria-labelledby="scenario-comparison-heading">
          <h3 id="scenario-comparison-heading">Scenario comparison</h3>
          <form onSubmit={capture}>
            <label>
              Scenario label
              <input name="scenarioLabel" defaultValue="Base shape" required />
            </label>
            <button type="submit">Capture scenario</button>
          </form>
          <label>
            Compare from
            <select value={leftScenarioId} onChange={(event) => setLeftScenarioId(event.target.value)}>
              <option value="">Choose scenario</option>
              {project.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
            </select>
          </label>
          <label>
            Compare with
            <select value={rightScenarioId} onChange={(event) => setRightScenarioId(event.target.value)}>
              <option value="">Choose scenario</option>
              {project.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
            </select>
          </label>
          <label>
            Overlay scenario
            <select value={scenarioOverlayId} onChange={(event) => onScenarioOverlayChange(event.target.value)}>
              <option value="">No overlay</option>
              {project.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
            </select>
          </label>
          <div data-testid="scenario-comparison">
            {comparison ? (
              <>
                <p>{comparison.movedTokens.length} moved, {comparison.unchangedTokenIds.length} unchanged. Ball moved {comparison.ballDistanceMeters.toFixed(2)} m.</p>
                <ul>
                  {comparison.movedTokens.slice(0, 6).map((item) => (
                    <li key={item.tokenId}>{item.tokenId}: {item.distanceMeters.toFixed(2)} m</li>
                  ))}
                </ul>
              </>
            ) : <p>Capture two scenarios to compare positions in pitch metres.</p>}
          </div>
        </section>
      </div>
    </details>
  );
}
