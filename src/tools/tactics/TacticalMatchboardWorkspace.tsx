import { useMemo, useState, type FormEvent } from 'react';
import { downloadText } from '../../lib/download';
import TacticalBoard from './TacticalBoard';
import { serializeTacticalBoardSvg } from './board-engine';
import {
  commitTacticalProject,
  createTacticalHistory,
  movePlayerToken,
  redoTacticalProject,
  undoTacticalProject,
} from './editor-engine';
import { FORMATION_TEMPLATES, getFormationTemplate } from './formation-engine';
import type { NormalizedPoint, TacticalProject } from './tactics-types';
import {
  addTacticalArrow,
  buildBeginnerTacticalProject,
  nudgeNormalizedPoint,
} from './workspace-engine';
import './tactical-matchboard.css';

type InteractionMode = 'move' | 'arrow';

interface SetupState {
  title: string;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  formationId: string;
  lengthMeters: string;
  widthMeters: string;
  direction: 'left-to-right' | 'right-to-left';
}

const INITIAL_SETUP: SetupState = {
  title: 'Training board',
  teamName: 'Team',
  primaryColor: '#154c79',
  secondaryColor: '#ffffff',
  formationId: 'ussf-7v7-1-3-2-1',
  lengthMeters: '60',
  widthMeters: '40',
  direction: 'left-to-right',
};

function projectFromSetup(setup: SetupState): TacticalProject {
  return buildBeginnerTacticalProject({
    title: setup.title,
    teamName: setup.teamName,
    primaryColor: setup.primaryColor,
    secondaryColor: setup.secondaryColor,
    formationId: setup.formationId,
    pitchDimensions: {
      lengthMeters: Number(setup.lengthMeters),
      widthMeters: Number(setup.widthMeters),
    },
    direction: setup.direction,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown tactical workspace error.';
}

function downloadStem(title: string): string {
  const stem = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stem || 'tactical-board';
}

export default function TacticalMatchboardWorkspace() {
  const [setup, setSetup] = useState<SetupState>(INITIAL_SETUP);
  const [history, setHistory] = useState(() => createTacticalHistory(projectFromSetup(INITIAL_SETUP)));
  const [selectedTokenId, setSelectedTokenId] = useState(() => history.present.playerTokens[0]?.id);
  const [mode, setMode] = useState<InteractionMode>('move');
  const [arrowStart, setArrowStart] = useState<NormalizedPoint | null>(null);
  const [arrowLabel, setArrowLabel] = useState('');
  const [status, setStatus] = useState('Board ready. Select a player or choose the arrow tool.');

  const project = history.present;
  const sceneId = project.scenes[0]?.id ?? '';
  const layerId = project.scenes[0]?.layers[0]?.id ?? '';
  const selectedToken = project.playerTokens.find((token) => token.id === selectedTokenId);
  const selectedFormation = useMemo(
    () => getFormationTemplate(setup.formationId),
    [setup.formationId],
  );

  function applyEdit(label: string, updater: (current: TacticalProject) => TacticalProject, message: string) {
    try {
      setHistory(commitTacticalProject(history, label, updater));
      setStatus(message);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function rebuildBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const nextProject = projectFromSetup(setup);
      setHistory(createTacticalHistory(nextProject));
      setSelectedTokenId(nextProject.playerTokens[0]?.id);
      setMode('move');
      setArrowStart(null);
      setStatus(`Built ${nextProject.ruleset.teamSize}v${nextProject.ruleset.teamSize} board with ${nextProject.playerTokens.length} placed players.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function handlePitchPoint(point: NormalizedPoint) {
    if (mode === 'arrow') {
      if (!arrowStart) {
        setArrowStart(point);
        setStatus('Arrow start set. Choose the end point.');
        return;
      }
      if (!sceneId || !layerId) {
        setStatus('The current scene does not have an editable layer.');
        return;
      }
      applyEdit(
        'Add tactical arrow',
        (current) => addTacticalArrow(current, sceneId, layerId, arrowStart, point, arrowLabel),
        'Tactical arrow added.',
      );
      setArrowStart(null);
      return;
    }

    if (!selectedToken) {
      setStatus('Select a player before choosing a destination.');
      return;
    }
    applyEdit(
      `Move ${selectedToken.id}`,
      (current) => movePlayerToken(current, selectedToken.id, point),
      'Player moved.',
    );
  }

  function nudge(dx: number, dy: number) {
    if (!selectedToken) {
      setStatus('Select a player before using precision movement.');
      return;
    }
    const next = nudgeNormalizedPoint(selectedToken.position, dx, dy);
    applyEdit(
      `Nudge ${selectedToken.id}`,
      (current) => movePlayerToken(current, selectedToken.id, next),
      'Player position adjusted.',
    );
  }

  function setPrecisePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedToken) {
      setStatus('Select a player before setting an exact position.');
      return;
    }
    const data = new FormData(event.currentTarget);
    const x = Number(data.get('xPercent')) / 100;
    const y = Number(data.get('yPercent')) / 100;
    applyEdit(
      `Set ${selectedToken.id} position`,
      (current) => movePlayerToken(current, selectedToken.id, { x, y }),
      'Exact player position applied.',
    );
  }

  function exportSvg() {
    try {
      const svg = serializeTacticalBoardSvg(project, sceneId);
      downloadText(svg, `${downloadStem(project.metadata.title)}.svg`, 'image/svg+xml;charset=utf-8');
      setStatus('SVG board exported.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function undo() {
    const next = undoTacticalProject(history);
    setHistory(next);
    setArrowStart(null);
    setStatus(next === history ? 'Nothing to undo.' : 'Undid the last board edit.');
  }

  function redo() {
    const next = redoTacticalProject(history);
    setHistory(next);
    setArrowStart(null);
    setStatus(next === history ? 'Nothing to redo.' : 'Redid the next board edit.');
  }

  return (
    <>
      <div className="workspace-header tactical-workspace-header">
        <div>
          <h2>Tactical Matchboard Studio</h2>
          <p>Build a local tactical board, place a formation, move players precisely, add arrows, and export SVG.</p>
        </div>
      </div>
      <div className="workspace-body tactical-matchboard-workspace">
        <details className="tactical-setup" open>
          <summary>Board setup</summary>
          <form onSubmit={rebuildBoard} className="tactical-setup-grid">
            <label>
              Project title
              <input
                value={setup.title}
                onChange={(event) => setSetup({ ...setup, title: event.target.value })}
              />
            </label>
            <label>
              Team
              <input
                value={setup.teamName}
                onChange={(event) => setSetup({ ...setup, teamName: event.target.value })}
              />
            </label>
            <label>
              Formation
              <select
                value={setup.formationId}
                onChange={(event) => setSetup({ ...setup, formationId: event.target.value })}
              >
                {FORMATION_TEMPLATES.map((formation) => (
                  <option key={formation.id} value={formation.id}>{formation.label}</option>
                ))}
              </select>
              {selectedFormation?.provenance ? (
                <small>
                  {selectedFormation.provenance.sourceTitle}
                  {selectedFormation.provenance.note ? ` — ${selectedFormation.provenance.note}` : ''}
                </small>
              ) : null}
            </label>
            <label>
              Pitch length (m)
              <input
                type="number"
                min="1"
                step="0.1"
                value={setup.lengthMeters}
                onChange={(event) => setSetup({ ...setup, lengthMeters: event.target.value })}
              />
            </label>
            <label>
              Pitch width (m)
              <input
                type="number"
                min="1"
                step="0.1"
                value={setup.widthMeters}
                onChange={(event) => setSetup({ ...setup, widthMeters: event.target.value })}
              />
            </label>
            <label>
              Direction
              <select
                value={setup.direction}
                onChange={(event) => setSetup({ ...setup, direction: event.target.value as SetupState['direction'] })}
              >
                <option value="left-to-right">Left to right</option>
                <option value="right-to-left">Right to left</option>
              </select>
            </label>
            <label>
              Primary color
              <input
                type="color"
                value={setup.primaryColor}
                onChange={(event) => setSetup({ ...setup, primaryColor: event.target.value })}
              />
            </label>
            <label>
              Number color
              <input
                type="color"
                value={setup.secondaryColor}
                onChange={(event) => setSetup({ ...setup, secondaryColor: event.target.value })}
              />
            </label>
            <div className="tactical-setup-action">
              <button className="action-button" type="submit">Build board</button>
              <small>Dimensions are editable training inputs unless a sourced rules profile explicitly states otherwise.</small>
            </div>
          </form>
        </details>

        <div className="tactical-command-bar" aria-label="Board commands">
          <button
            className={`action-button ${mode === 'move' ? '' : 'secondary'}`}
            type="button"
            aria-pressed={mode === 'move'}
            onClick={() => { setMode('move'); setArrowStart(null); setStatus('Move tool active.'); }}
          >
            Move
          </button>
          <button
            className={`action-button ${mode === 'arrow' ? '' : 'secondary'}`}
            type="button"
            aria-pressed={mode === 'arrow'}
            onClick={() => { setMode('arrow'); setArrowStart(null); setStatus('Arrow tool active. Choose a start point.'); }}
          >
            Arrow
          </button>
          <label className="tactical-arrow-label">
            Arrow label
            <input value={arrowLabel} onChange={(event) => setArrowLabel(event.target.value)} />
          </label>
          <button className="action-button secondary" type="button" disabled={!history.past.length} onClick={undo}>Undo</button>
          <button className="action-button secondary" type="button" disabled={!history.future.length} onClick={redo}>Redo</button>
          <button className="action-button secondary" type="button" onClick={exportSvg}>Export SVG</button>
        </div>

        <div className="tactical-editor-layout">
          <TacticalBoard
            project={project}
            sceneId={sceneId}
            selectedTokenId={selectedTokenId}
            interactionMode={mode}
            arrowStart={arrowStart}
            onSelectToken={(tokenId) => {
              setSelectedTokenId(tokenId);
              setStatus(`Selected ${tokenId}.`);
            }}
            onPitchPoint={handlePitchPoint}
          />

          <aside className="tactical-inspector" aria-label="Player precision controls">
            <h3>Players</h3>
            <div className="tactical-player-list" role="list">
              {project.playerTokens.map((token) => {
                const team = project.teams.find((candidate) => candidate.id === token.teamId);
                const player = team?.roster.find((candidate) => candidate.id === token.playerId);
                return (
                  <button
                    key={token.id}
                    type="button"
                    className={token.id === selectedTokenId ? 'selected' : ''}
                    aria-pressed={token.id === selectedTokenId}
                    onClick={() => setSelectedTokenId(token.id)}
                  >
                    <strong>{player?.jerseyNumber ?? '—'}</strong>
                    <span>{player?.displayName ?? token.id}</span>
                  </button>
                );
              })}
            </div>

            <h3>Precision move</h3>
            <div className="tactical-dpad" role="group" aria-label="Nudge selected player">
              <button type="button" onClick={() => nudge(0, -0.02)} aria-label="Move player up">↑</button>
              <button type="button" onClick={() => nudge(-0.02, 0)} aria-label="Move player left">←</button>
              <button type="button" onClick={() => nudge(0.02, 0)} aria-label="Move player right">→</button>
              <button type="button" onClick={() => nudge(0, 0.02)} aria-label="Move player down">↓</button>
            </div>

            {selectedToken ? (
              <form
                className="tactical-coordinate-form"
                onSubmit={setPrecisePosition}
                key={`${selectedToken.id}-${selectedToken.position.x}-${selectedToken.position.y}`}
              >
                <label>
                  X %
                  <input
                    name="xPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    defaultValue={(selectedToken.position.x * 100).toFixed(1)}
                  />
                </label>
                <label>
                  Y %
                  <input
                    name="yPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    defaultValue={(selectedToken.position.y * 100).toFixed(1)}
                  />
                </label>
                <button type="submit">Set position</button>
              </form>
            ) : <p>Select a player to enable exact coordinates.</p>}
          </aside>
        </div>

        <div className="status-line good" role="status" aria-live="polite">{status}</div>
      </div>
    </>
  );
}
