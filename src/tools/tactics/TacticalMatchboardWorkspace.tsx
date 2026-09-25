import { useMemo, useState, type FormEvent } from 'react';
import { downloadText } from '../../lib/download';
import TacticalBoard from './TacticalBoard';
import TacticalTimelinePanel from './TacticalTimelinePanel';
import { serializeTacticalBoardSvg } from './board-engine';
import {
  commitTacticalProject,
  createTacticalHistory,
  movePlayerToken,
  redoTacticalProject,
  undoTacticalProject,
} from './editor-engine';
import {
  captureFormationPhase,
  createCustomFormationTemplate,
  FORMATION_TEMPLATES,
  getFormationTemplate,
  morphFormationPhases,
  reviewFormationLegality,
} from './formation-engine';
import { transformTacticalProject } from './pitch-engine';
import { sampleTacticalProjectAtTime } from './timeline-engine';
import {
  PITCH_RULE_PROFILES,
  applyPitchRuleProfile,
  createCustomPitchRuleProfile,
  createEditablePitchRuleProfileCopy,
} from './rules-engine';
import {
  RESTART_TEMPLATES,
  applyRestartTemplate,
  createCustomRestartTemplate,
  reviewRestartLegality,
  type RestartTemplate,
} from './restart-engine';
import type { FormationTemplate, NormalizedPoint, PitchRuleProfile, TacticalProject } from './tactics-types';
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

const INITIAL_RULES_DRAFT = {
  id: 'academy-6v6',
  label: 'Academy 6v6',
  format: '6v6',
  teamSize: 6,
  lengthMeters: 48,
  widthMeters: 32,
  specialLines: 'Build-out line',
  restartNotes: 'Retreat to the build-out line.',
};

function projectFromSetup(setup: SetupState, formation?: FormationTemplate): TacticalProject {
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
  }, formation);
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
  const [setupOpen, setSetupOpen] = useState(true);
  const [history, setHistory] = useState(() => createTacticalHistory(projectFromSetup(INITIAL_SETUP)));
  const [selectedTokenId, setSelectedTokenId] = useState<string | undefined>(() => history.present.playerTokens[0]?.id);
  const [mode, setMode] = useState<InteractionMode>('move');
  const [arrowStart, setArrowStart] = useState<NormalizedPoint | null>(null);
  const [arrowLabel, setArrowLabel] = useState('');
  const [customFormations, setCustomFormations] = useState<FormationTemplate[]>([]);
  const [customProfiles, setCustomProfiles] = useState<PitchRuleProfile[]>([]);
  const [customRestarts, setCustomRestarts] = useState<RestartTemplate[]>([]);
  const [activeFormation, setActiveFormation] = useState(() => getFormationTemplate(INITIAL_SETUP.formationId)!);
  const [rulesProfileId, setRulesProfileId] = useState('training-7v7');
  const [rulesDraft, setRulesDraft] = useState(INITIAL_RULES_DRAFT);
  const [rulesDraftSourceId, setRulesDraftSourceId] = useState('');
  const [rulesDraftRevision, setRulesDraftRevision] = useState(0);
  const [restartTemplateId, setRestartTemplateId] = useState(RESTART_TEMPLATES[0]!.id);
  const [phaseLabel, setPhaseLabel] = useState('Base shape');
  const [phaseTimeMs, setPhaseTimeMs] = useState('0');
  const [fromPhaseId, setFromPhaseId] = useState('');
  const [toPhaseId, setToPhaseId] = useState('');
  const [morphPercent, setMorphPercent] = useState('50');
  const [activeSceneId, setActiveSceneId] = useState('scene-1');
  const [previewTimeMs, setPreviewTimeMs] = useState(0);
  const [status, setStatus] = useState('Board ready. Select a player or choose the arrow tool.');

  const project = history.present;
  const presentationProject = useMemo(
    () => sampleTacticalProjectAtTime(project, Math.min(previewTimeMs, project.timeline.durationMs)),
    [previewTimeMs, project],
  );
  const activeScene = project.scenes.find((scene) => scene.id === activeSceneId) ?? project.scenes[0];
  const sceneId = activeScene?.id ?? '';
  const layerId = activeScene?.layers[0]?.id ?? '';
  const sceneTokens = project.playerTokens.filter((token) => token.sceneId === sceneId);
  const selectedToken = sceneTokens.find((token) => token.id === selectedTokenId);
  const availableFormations = useMemo(
    () => [...FORMATION_TEMPLATES, ...customFormations],
    [customFormations],
  );
  const selectedFormation = useMemo(
    () => availableFormations.find((formation) => formation.id === setup.formationId),
    [availableFormations, setup.formationId],
  );
  const availableProfiles = useMemo(() => [...PITCH_RULE_PROFILES, ...customProfiles], [customProfiles]);
  const availableRestarts = useMemo(() => [...RESTART_TEMPLATES, ...customRestarts], [customRestarts]);
  const selectedRulesProfile = availableProfiles.find((profile) => profile.id === rulesProfileId);
  const selectedRestartTemplate = availableRestarts.find((template) => template.id === restartTemplateId);
  const restartReviewIssues = useMemo(
    () => selectedRestartTemplate
      ? reviewRestartLegality(project, selectedRestartTemplate, project.teams[0]?.id)
      : [],
    [project, selectedRestartTemplate],
  );
  const legalityIssues = useMemo(
    () => reviewFormationLegality(project, activeFormation, sceneId),
    [activeFormation, project, sceneId],
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
      if (!selectedFormation) throw new Error('Select a valid formation before building the board.');
      const nextProject = projectFromSetup(setup, selectedFormation);
      setHistory(createTacticalHistory(nextProject));
      setActiveFormation(selectedFormation);
      setActiveSceneId(nextProject.scenes[0]?.id ?? '');
      setPreviewTimeMs(0);
      setSelectedTokenId(nextProject.playerTokens[0]?.id);
      setMode('move');
      setArrowStart(null);
      setStatus(`Built ${nextProject.ruleset.teamSize}v${nextProject.ruleset.teamSize} board with ${nextProject.playerTokens.length} placed players.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function applySelectedRulesProfile() {
    applyEdit(
      'Apply pitch rules profile',
      (current) => {
        const profile = availableProfiles.find((candidate) => candidate.id === rulesProfileId);
        if (!profile) throw new Error('Select a valid rules profile.');
        return applyPitchRuleProfile(current, profile);
      },
      'Pitch rules profile and overlays applied.',
    );
  }

  function authorCustomRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const authored = createCustomPitchRuleProfile({
        id: String(data.get('rulesId') ?? ''),
        label: String(data.get('rulesLabel') ?? ''),
        format: String(data.get('rulesFormat') ?? ''),
        teamSize: Number(data.get('rulesTeamSize')),
        dimensions: {
          lengthMeters: Number(data.get('rulesLength')),
          widthMeters: Number(data.get('rulesWidth')),
        },
        specialLines: String(data.get('rulesSpecialLines') ?? '').split(','),
        restartNotes: String(data.get('rulesRestartNotes') ?? '').split('\n'),
      });
      const source = availableProfiles.find((profile) => profile.id === rulesDraftSourceId);
      const profile = source
        ? createEditablePitchRuleProfileCopy(source, { id: authored.id, label: authored.label }, authored)
        : authored;
      setCustomProfiles((current) => [...current.filter((item) => item.id !== profile.id), profile]);
      setRulesProfileId(profile.id);
      setHistory(commitTacticalProject(history, 'Apply custom rules profile', (current) => applyPitchRuleProfile(current, profile)));
      setStatus('Custom rules profile authored and applied locally.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function prepareEditableRulesCopy() {
    if (!selectedRulesProfile) {
      setStatus('Select a rules profile before creating an editable copy.');
      return;
    }
    const dimensions = selectedRulesProfile.dimensions ?? project.pitch.dimensions;
    setRulesDraft({
      id: `${selectedRulesProfile.id}-local`,
      label: selectedRulesProfile.label + ' \u2014 local copy',
      format: selectedRulesProfile.format,
      teamSize: selectedRulesProfile.teamSize,
      lengthMeters: dimensions.lengthMeters,
      widthMeters: dimensions.widthMeters,
      specialLines: selectedRulesProfile.specialLines?.join(', ') ?? '',
      restartNotes: selectedRulesProfile.restartNotes?.join('\n') ?? '',
    });
    setRulesDraftSourceId(selectedRulesProfile.id);
    setRulesDraftRevision((current) => current + 1);
    setStatus('Selected rules profile loaded into the editable local-copy form.');
  }

  function authorCustomFormation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const formation = createCustomFormationTemplate({
        id: String(data.get('formationId') ?? ''),
        label: String(data.get('formationLabel') ?? ''),
        teamSize: Number(data.get('formationTeamSize')),
        goalkeepers: Number(data.get('formationGoalkeepers')),
        outfieldLines: String(data.get('formationLines') ?? '')
          .split(/[-,\s]+/)
          .filter(Boolean)
          .map(Number),
      });
      setCustomFormations((current) => [...current.filter((item) => item.id !== formation.id), formation]);
      setSetup((current) => ({ ...current, formationId: formation.id }));
      setStatus('Custom formation authored. Choose Build board to place it.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function applySelectedRestart() {
    if (!sceneId || !layerId) {
      setStatus('The current scene does not have an editable layer.');
      return;
    }
    applyEdit(
      'Apply restart template',
      (current) => {
        const template = availableRestarts.find((candidate) => candidate.id === restartTemplateId);
        if (!template) throw new Error('Select a valid restart template.');
        return applyRestartTemplate(current, sceneId, layerId, template);
      },
      'Editable restart starter applied.',
    );
  }

  function authorCustomRestart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const guidePoints = String(data.get('restartGuidePoints') ?? '')
        .split(';')
        .filter(Boolean)
        .map((pair) => {
          const [x, y] = pair.split(',').map((value) => Number(value.trim()) / 100);
          return { x: x!, y: y! };
        });
      const template = createCustomRestartTemplate({
        id: String(data.get('restartId') ?? ''),
        label: String(data.get('restartLabel') ?? ''),
        kind: String(data.get('restartKind') ?? '') as RestartTemplate['kind'],
        ballPosition: {
          x: Number(data.get('restartBallX')) / 100,
          y: Number(data.get('restartBallY')) / 100,
        },
        guideLabel: String(data.get('restartGuideLabel') ?? ''),
        guidePoints,
      });
      setCustomRestarts((current) => [...current.filter((item) => item.id !== template.id), template]);
      setRestartTemplateId(template.id);
      setStatus('Custom restart template authored. Choose Apply restart starter to place it.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function capturePhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const teamId = project.teams[0]?.id;
    if (!teamId) {
      setStatus('Build a team before capturing a formation phase.');
      return;
    }
    const occupied = new Set(project.formationStates.map((state) => state.id));
    let index = project.formationStates.length + 1;
    while (occupied.has(`phase-${index}`)) index += 1;
    const id = `phase-${index}`;
    try {
      setHistory(commitTacticalProject(history, 'Capture formation phase', (current) => captureFormationPhase(current, {
        id,
        label: phaseLabel,
        teamId,
        timeMs: Number(phaseTimeMs),
      })));
      if (!fromPhaseId) setFromPhaseId(id);
      else setToPhaseId(id);
      setPhaseLabel(`Phase ${index + 1}`);
      setPhaseTimeMs(String(Number(phaseTimeMs) + 1_000));
      setStatus('Formation phase captured from the current player positions.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function applyPhaseMorph() {
    applyEdit(
      'Morph formation phase',
      (current) => morphFormationPhases(current, fromPhaseId, toPhaseId, Number(morphPercent) / 100),
      `Formation previewed at ${morphPercent}% between the selected phases.`,
    );
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
        <details
          className="tactical-setup"
          open={setupOpen}
          onToggle={(event) => setSetupOpen(event.currentTarget.open)}
        >
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
                {availableFormations.map((formation) => (
                  <option key={formation.id} value={formation.id}>{formation.label}</option>
                ))}
              </select>
              {selectedFormation?.provenance ? (
                <small>
                  {selectedFormation.provenance.sourceTitle}
                  {selectedFormation.provenance.note ? ' \u2014 ' + selectedFormation.provenance.note : ''}
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

        <details className="tactical-setup tactical-authoring">
          <summary>Rules, formations &amp; restarts</summary>
          <div className="tactical-authoring-grid">
            <section aria-labelledby="tactical-rules-heading">
              <h3 id="tactical-rules-heading">Pitch rules profile</h3>
              <label>
                Rules profile
                <select value={rulesProfileId} onChange={(event) => setRulesProfileId(event.target.value)}>
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={applySelectedRulesProfile}>Apply rules profile</button>
              <button type="button" className="secondary" onClick={prepareEditableRulesCopy}>Load editable copy</button>
              {selectedRulesProfile ? (
                <small>
                  {selectedRulesProfile.provenance.sourceTitle}
                  {selectedRulesProfile.provenance.sourceVersion ? ` (${selectedRulesProfile.provenance.sourceVersion})` : ''}
                  {selectedRulesProfile.provenance.note ? ' \u2014 ' + selectedRulesProfile.provenance.note : ''}
                </small>
              ) : null}
            </section>

            <form key={rulesDraftRevision} onSubmit={authorCustomRules} aria-labelledby="custom-rules-heading">
              <h3 id="custom-rules-heading">Custom rules profile</h3>
              <label>Profile id<input name="rulesId" defaultValue={rulesDraft.id} required /></label>
              <label>Profile label<input name="rulesLabel" defaultValue={rulesDraft.label} required /></label>
              <label>Format<input name="rulesFormat" defaultValue={rulesDraft.format} required /></label>
              <label>Team size<input name="rulesTeamSize" type="number" min="1" step="1" defaultValue={rulesDraft.teamSize} required /></label>
              <label>Pitch length (m)<input name="rulesLength" type="number" min="1" step="0.1" defaultValue={rulesDraft.lengthMeters} required /></label>
              <label>Pitch width (m)<input name="rulesWidth" type="number" min="1" step="0.1" defaultValue={rulesDraft.widthMeters} required /></label>
              <label>Special lines, comma separated<input name="rulesSpecialLines" defaultValue={rulesDraft.specialLines} /></label>
              <label>Restart notes<textarea name="rulesRestartNotes" defaultValue={rulesDraft.restartNotes} /></label>
              <button type="submit">Author and apply rules</button>
            </form>

            <form onSubmit={authorCustomFormation} aria-labelledby="custom-formation-heading">
              <h3 id="custom-formation-heading">Custom formation</h3>
              <label>Formation id<input name="formationId" defaultValue="academy-8v8" required /></label>
              <label>Formation label<input name="formationLabel" defaultValue="Academy 8v8" required /></label>
              <label>Team size<input name="formationTeamSize" type="number" min="1" step="1" defaultValue="8" required /></label>
              <label>Goalkeepers<input name="formationGoalkeepers" type="number" min="0" step="1" defaultValue="1" required /></label>
              <label>Outfield lines<input name="formationLines" defaultValue="3-3-1" required /></label>
              <button type="submit">Author formation</button>
            </form>

            <section aria-labelledby="scenario-tools-heading">
              <h3 id="scenario-tools-heading">Scenario tools</h3>
              <div className="tactical-authoring-actions">
                <button type="button" onClick={() => applyEdit('Mirror board', (current) => transformTacticalProject(current, 'horizontal'), 'Board mirrored with direction of play.')}>Mirror direction</button>
                <button type="button" onClick={() => applyEdit('Flip board', (current) => transformTacticalProject(current, 'vertical'), 'Board flipped across the touchline axis.')}>Flip vertical</button>
              </div>
              <label>
                Restart starter
                <select value={restartTemplateId} onChange={(event) => setRestartTemplateId(event.target.value)}>
                  {availableRestarts.map((template) => (
                    <option key={template.id} value={template.id}>{template.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={applySelectedRestart}>Apply restart starter</button>
              <div className={`tactical-restart-review ${restartReviewIssues.length ? 'notice' : 'good'}`} aria-live="polite">
                <strong>Restart review</strong>
                {restartReviewIssues.length
                  ? <ul>{restartReviewIssues.map((issue) => <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>)}</ul>
                  : <p>No placement or opponent-position conflicts were found for rules the selected profile can verify.</p>}
                <small>Source-backed authoring aid only; quick restarts and match decisions remain with the referee and competition rules.</small>
              </div>
              <form onSubmit={authorCustomRestart} className="tactical-phase-form" aria-label="Custom restart template">
                <label>Restart id<input name="restartId" defaultValue="academy-goal-kick" required /></label>
                <label>Restart label<input name="restartLabel" defaultValue="Academy goal-kick build" required /></label>
                <label>
                  Restart kind
                  <select name="restartKind" defaultValue="goal-kick">
                    <option value="kick-off">Kick-off</option>
                    <option value="corner">Corner</option>
                    <option value="free-kick">Free-kick</option>
                    <option value="goal-kick">Goal-kick</option>
                  </select>
                </label>
                <label>Ball X %<input name="restartBallX" type="number" min="0" max="100" step="0.1" defaultValue="8" required /></label>
                <label>Ball Y %<input name="restartBallY" type="number" min="0" max="100" step="0.1" defaultValue="50" required /></label>
                <label>Guide label<input name="restartGuideLabel" defaultValue="Build-out route" required /></label>
                <label>Guide points (% x,y; x,y)<input name="restartGuidePoints" defaultValue="8,50; 30,25" required /></label>
                <button type="submit">Author restart template</button>
              </form>
              <form onSubmit={capturePhase} className="tactical-phase-form">
                <label>Phase label<input value={phaseLabel} onChange={(event) => setPhaseLabel(event.target.value)} required /></label>
                <label>Phase time (ms)<input type="number" min="0" step="1" value={phaseTimeMs} onChange={(event) => setPhaseTimeMs(event.target.value)} required /></label>
                <button type="submit">Capture formation phase</button>
              </form>
              {project.formationStates.length ? (
                <div className="tactical-phase-form">
                  <label>
                    From phase
                    <select value={fromPhaseId} onChange={(event) => setFromPhaseId(event.target.value)}>
                      <option value="">Choose phase</option>
                      {project.formationStates.map((phase) => <option key={phase.id} value={phase.id}>{phase.label}</option>)}
                    </select>
                  </label>
                  <label>
                    To phase
                    <select value={toPhaseId} onChange={(event) => setToPhaseId(event.target.value)}>
                      <option value="">Choose phase</option>
                      {project.formationStates.map((phase) => <option key={phase.id} value={phase.id}>{phase.label}</option>)}
                    </select>
                  </label>
                  <label>Morph %<input type="number" min="0" max="100" step="1" value={morphPercent} onChange={(event) => setMorphPercent(event.target.value)} /></label>
                  <button type="button" disabled={!fromPhaseId || !toPhaseId} onClick={applyPhaseMorph}>Preview phase morph</button>
                </div>
              ) : null}
              <div className={`tactical-legality ${legalityIssues.length ? 'notice' : 'good'}`} aria-live="polite">
                <strong>Formation review</strong>
                {legalityIssues.length
                  ? <ul>{legalityIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                  : <p>Placed-player, goalkeeper, roster-assignment, and profile counts agree.</p>}
                <small>This is an authoring aid, not an officiating decision.</small>
              </div>
            </section>
          </div>
        </details>


        <TacticalTimelinePanel
          project={project}
          activeSceneId={sceneId}
          previewTimeMs={Math.min(previewTimeMs, project.timeline.durationMs)}
          onPreviewTimeChange={setPreviewTimeMs}
          onTransportStatus={setStatus}
          onEdit={applyEdit}
        />

        <div className="tactical-command-bar" aria-label="Board commands">
          <label className="tactical-arrow-label tactical-scene-picker">
            Scene view
            <select
              aria-label="Scene view"
              value={sceneId}
              onChange={(event) => {
                const nextSceneId = event.target.value;
                setActiveSceneId(nextSceneId);
                setSelectedTokenId(project.playerTokens.find((token) => token.sceneId === nextSceneId)?.id);
                setArrowStart(null);
                setStatus('Scene view changed.');
              }}
            >
              {project.scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
            </select>
          </label>
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
            project={presentationProject}
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
            <div className="tactical-player-list">
              {sceneTokens.map((token) => {
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
                    <strong>{player?.jerseyNumber ?? '\u2014'}</strong>
                    <span>{player?.displayName ?? token.id}</span>
                  </button>
                );
              })}
            </div>

            <h3>Precision move</h3>
            <div className="tactical-dpad" role="group" aria-label="Nudge selected player">
              <button type="button" onClick={() => nudge(0, -0.02)} aria-label="Move player up">\u2191</button>
              <button type="button" onClick={() => nudge(-0.02, 0)} aria-label="Move player left">\u2190</button>
              <button type="button" onClick={() => nudge(0.02, 0)} aria-label="Move player right">\u2192</button>
              <button type="button" onClick={() => nudge(0, 0.02)} aria-label="Move player down">\u2193</button>
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
