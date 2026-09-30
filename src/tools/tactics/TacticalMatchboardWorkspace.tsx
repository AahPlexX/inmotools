import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { downloadText } from '../../lib/download';
import TacticalAnalysisPanel, { DEFAULT_ANALYSIS_DISPLAY_SETTINGS } from './TacticalAnalysisPanel';
import TacticalBoard from './TacticalBoard';
import TacticalExportPanel from './TacticalExportPanel';
import TacticalInspector from './TacticalInspector';
import { TacticalDialog } from './TacticalOverlay';
import TacticalPersistencePanel from './TacticalPersistencePanel';
import TacticalStageOnePanel, { DEFAULT_TACTICAL_SNAP } from './TacticalStageOnePanel';
import TacticalTimelinePanel from './TacticalTimelinePanel';
import TacticalVideoPanel from './TacticalVideoPanel';
import {
  TACTICAL_HELP_SECTIONS,
  TACTICAL_SHORTCUTS,
  classifyTacticalFocus,
  placeCollisionSafeTooltip,
  resolveTacticalShortcut,
  type TacticalTransportRequest,
} from './accessibility-engine';
import { serializeTacticalBoardSvg } from './board-engine';
import {
  commitTacticalProject,
  createTacticalHistory,
  groupPlayerTokens,
  layerPlayerTokenIds,
  movePlayerToken,
  redoTacticalProject,
  reorderSceneLayer,
  setPlayerTokenLocked,
  setSceneLayerState,
  soloSceneLayer,
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
import { authorEntityCoordinate } from './coordinate-engine';
import { tacticalPitchGuides, snapWithTacticalAssist } from './guide-engine';
import { applyPresentationVisibility, onionSkinGhosts } from './presentation-authoring-engine';
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
import type { CameraState, FormationTemplate, NormalizedPoint, PitchRuleProfile, TacticalProject } from './tactics-types';
import {
  CAMERA_PRESET_IDS,
  createCameraPresetState,
  sampleCameraState,
  upsertCameraState,
  type CameraPresetId,
} from './presentation3d-engine';
import { MAX_TELESTRATION_POINTS } from './video-review-engine';
import {
  addTacticalArrow,
  addTacticalFreehand,
  buildBeginnerTacticalProject,
  nudgeNormalizedPoint,
  placeMirroredOpposition,
  removeTacticalAnnotation,
} from './workspace-engine';
import './tactical-matchboard.css';

const Tactical3DView = lazy(() => import('./Tactical3DView'));

type InteractionMode = 'move' | 'arrow' | 'freehand';

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
  const [freehandPoints, setFreehandPoints] = useState<NormalizedPoint[]>([]);
  const freehandStrokeRef = useRef<{ points: NormalizedPoint[]; moved: boolean } | null>(null);
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
  const [analysisSettings, setAnalysisSettings] = useState(DEFAULT_ANALYSIS_DISPLAY_SETTINGS);
  const [show3D, setShow3D] = useState(false);
  const [cameraPresetId, setCameraPresetId] = useState<CameraPresetId>('tactical');
  const [cameraDraft, setCameraDraft] = useState<CameraState | null>(null);
  const [status, setStatus] = useState('Board ready. Select a player or choose the arrow tool.');
  const [helpOpen, setHelpOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [inspectorSheet, setInspectorSheet] = useState(false);
  const [timelineSheet, setTimelineSheet] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'players' | 'layers'>('players');
  const [groupedTokenIds, setGroupedTokenIds] = useState<string[]>([]);
  const [transportRequest, setTransportRequest] = useState<TacticalTransportRequest | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [snapAssist, setSnapAssist] = useState(DEFAULT_TACTICAL_SNAP);
  const [onionSkin, setOnionSkin] = useState(false);
  const [boardTarget, setBoardTarget] = useState<'player' | 'ball'>('player');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [oppositionName, setOppositionName] = useState('Opposition');
  const [oppositionColor, setOppositionColor] = useState('#9f1239');
  const [oppositionFormationId, setOppositionFormationId] = useState(INITIAL_SETUP.formationId);
  const [scenarioOverlayId, setScenarioOverlayId] = useState('');
  const [tip, setTip] = useState<{ text: string; top: number; left: number; width: number; height: number } | null>(null);
  const tipHostRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const transportSerialRef = useRef(0);
  const overlayOpen = helpOpen || actionsOpen || inspectorSheet || timelineSheet;

  const project = history.present;
  const presentationProject = useMemo(
    () => {
      const timeMs = Math.min(previewTimeMs, project.timeline.durationMs);
      return applyPresentationVisibility(sampleTacticalProjectAtTime(project, timeMs), timeMs);
    },
    [previewTimeMs, project],
  );
  const sampledCamera = useMemo(
    () => sampleCameraState(project.cameraStates, Math.min(previewTimeMs, project.timeline.durationMs), project.pitch.dimensions),
    [previewTimeMs, project.cameraStates, project.pitch.dimensions, project.timeline.durationMs],
  );
  const activeCamera = cameraDraft ?? sampledCamera;
  const activeScene = project.scenes.find((scene) => scene.id === activeSceneId) ?? project.scenes[0];
  const sceneId = activeScene?.id ?? '';
  const layerId = activeScene?.layers[0]?.id ?? '';
  const boardRenderOptions = useMemo(() => {
    const timeMs = Math.min(previewTimeMs, project.timeline.durationMs);
    const overlay = project.scenarios.find((scenario) => scenario.id === scenarioOverlayId);
    return {
      ghosts: onionSkin ? onionSkinGhosts(project, timeMs, sceneId) : undefined,
      guides: snapAssist.enabled && snapAssist.pitchGuides ? tacticalPitchGuides(project) : undefined,
      scenarioGhosts: overlay
        ? Object.entries(overlay.tokenPositions).map(([tokenId, position]) => ({ tokenId, position }))
        : undefined,
      selectedTokenId: boardTarget === 'player' ? selectedTokenId : undefined,
      selectedAnnotationId: selectedAnnotationId ?? undefined,
      ballSelected: boardTarget === 'ball',
    };
  }, [
    boardTarget,
    onionSkin,
    previewTimeMs,
    project,
    scenarioOverlayId,
    sceneId,
    selectedAnnotationId,
    selectedTokenId,
    snapAssist.enabled,
    snapAssist.pitchGuides,
  ]);
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

  function applyEdit(label: string, updater: (current: TacticalProject) => TacticalProject, message: string): boolean {
    try {
      setHistory(commitTacticalProject(history, label, updater));
      setStatus(message);
      return true;
    } catch (error) {
      setStatus(errorMessage(error));
      return false;
    }
  }

  function applyCameraPreset(preset: CameraPresetId) {
    const next = createCameraPresetState(
      preset,
      project.pitch.dimensions,
      Math.min(previewTimeMs, project.timeline.durationMs),
    );
    setCameraPresetId(preset);
    setCameraDraft(next);
    setStatus(`3D camera changed to ${preset.replace('-', ' ')} view. Capture it to animate this camera.`);
  }

  function captureCameraKeyframe() {
    const timeMs = Math.min(previewTimeMs, project.timeline.durationMs);
    const next = {
      ...activeCamera,
      id: `camera-${timeMs}`,
      timeMs,
      position: { ...activeCamera.position },
      target: { ...activeCamera.target },
    };
    applyEdit(
      'Capture 3D camera',
      (current) => ({ ...current, cameraStates: upsertCameraState(current.cameraStates, next) }),
      `3D camera keyframe captured at ${timeMs} ms.`,
    );
    setCameraDraft(null);
  }

  function replaceProject(nextProject: TacticalProject, message: string) {
    const firstSceneId = nextProject.scenes[0]?.id ?? '';
    const firstTokenId = nextProject.playerTokens.find((token) => token.sceneId === firstSceneId)?.id
      ?? nextProject.playerTokens[0]?.id;
    const primaryTeam = nextProject.teams[0];
    const matchingFormation = availableFormations.find(
      (formation) => formation.teamSize === nextProject.ruleset.teamSize,
    );

    setHistory(createTacticalHistory(nextProject));
    setActiveSceneId(firstSceneId);
    setPreviewTimeMs(0);
    setCameraDraft(null);
    setSelectedTokenId(firstTokenId);
    setBoardTarget('player');
    setSelectedAnnotationId(null);
    setMode('move');
    setArrowStart(null);
    setSetup((current) => ({
      ...current,
      title: nextProject.metadata.title,
      teamName: primaryTeam?.name ?? current.teamName,
      primaryColor: primaryTeam?.primaryColor ?? current.primaryColor,
      secondaryColor: primaryTeam?.secondaryColor ?? current.secondaryColor,
      formationId: matchingFormation?.id ?? current.formationId,
      lengthMeters: String(nextProject.pitch.dimensions.lengthMeters),
      widthMeters: String(nextProject.pitch.dimensions.widthMeters),
      direction: nextProject.pitch.direction,
    }));
    if (matchingFormation) setActiveFormation(matchingFormation);
    setStatus(message);
  }

  function rebuildBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm('Build board replaces this board and clears undo. Choose OK and the new board appears. Choose Cancel and the current board and undo stay unchanged.')) {
      setStatus('Build board cancelled. The current board and undo are unchanged.');
      return;
    }
    try {
      if (!selectedFormation) throw new Error('Select a valid formation before building the board.');
      const nextProject = projectFromSetup(setup, selectedFormation);
      setHistory(createTacticalHistory(nextProject));
      setActiveFormation(selectedFormation);
      setActiveSceneId(nextProject.scenes[0]?.id ?? '');
      setPreviewTimeMs(0);
      setSelectedTokenId(nextProject.playerTokens[0]?.id);
      setBoardTarget('player');
      setSelectedAnnotationId(null);
      setMode('move');
      setArrowStart(null);
      freehandStrokeRef.current = null;
      setFreehandPoints([]);
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

  function assistPoint(point: NormalizedPoint): { point: NormalizedPoint; snapped: boolean } {
    if (!snapAssist.enabled || !sceneId) return { point, snapped: false };
    const result = snapWithTacticalAssist(project, sceneId, point, {
      threshold: 0.025,
      gridStep: snapAssist.grid ? 0.05 : undefined,
      pitchGuides: snapAssist.pitchGuides,
      teammateSnap: snapAssist.teammates,
      equalSpacing: snapAssist.equalSpacing,
      excludeTokenId: selectedTokenId,
    });
    return { point: result.point, snapped: result.snappedX || result.snappedY };
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

    if (boardTarget === 'ball') {
      const assisted = assistPoint(point);
      applyEdit(
        'Move ball',
        (current) => authorEntityCoordinate(current, { kind: 'ball' }, assisted.point),
        assisted.snapped ? 'Ball snapped to a tactical guide.' : 'Ball moved.',
      );
      setSelectedAnnotationId(null);
      return;
    }

    if (!selectedToken) {
      setStatus('Select a player before choosing a destination.');
      return;
    }
    const assisted = assistPoint(point);
    applyEdit(
      `Move ${selectedToken.id}`,
      (current) => movePlayerToken(current, selectedToken.id, assisted.point),
      assisted.snapped ? 'Player snapped to a tactical guide.' : 'Player moved.',
    );
    setSelectedAnnotationId(null);
  }

  function nudge(dx: number, dy: number, subject: 'player' | 'ball' = boardTarget) {
    if (subject === 'ball') {
      const assisted = assistPoint(nudgeNormalizedPoint(project.ball.position, dx, dy));
      applyEdit(
        'Nudge ball',
        (current) => authorEntityCoordinate(current, { kind: 'ball' }, assisted.point),
        assisted.snapped ? 'Ball snapped to a tactical guide.' : 'Ball position adjusted.',
      );
      return;
    }
    if (!selectedToken) {
      setStatus('Select a player before using precision movement.');
      return;
    }
    const assisted = assistPoint(nudgeNormalizedPoint(selectedToken.position, dx, dy));
    applyEdit(
      `Nudge ${selectedToken.id}`,
      (current) => movePlayerToken(current, selectedToken.id, assisted.point),
      assisted.snapped ? 'Player snapped to a tactical guide.' : 'Player position adjusted.',
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

  function selectPlayer(tokenId: string) {
    setSelectedTokenId(tokenId);
    setBoardTarget('player');
    setSelectedAnnotationId(null);
    setStatus(`Selected ${tokenId}.`);
  }

  function selectBall() {
    setBoardTarget('ball');
    setSelectedAnnotationId(null);
    setMode('move');
    setArrowStart(null);
    setStatus('Ball selected. Click the pitch or use the arrow keys to move it.');
  }

  function selectAnnotation(annotationId: string) {
    setSelectedAnnotationId(annotationId);
    setStatus('Drawing selected. Remove drawing deletes it and leaves the players in place.');
  }

  function placeOpposition() {
    if (!sceneId || !layerId) {
      setStatus('The current scene does not have an editable layer.');
      return;
    }
    const formation = availableFormations.find((item) => item.id === oppositionFormationId);
    if (!formation) {
      setStatus('Select an opposition formation before placing the other team.');
      return;
    }
    applyEdit(
      'Place opposition',
      (current) => placeMirroredOpposition(current, sceneId, layerId, {
        teamName: oppositionName,
        primaryColor: oppositionColor,
        formation,
      }),
      `Opposition placed from ${formation.label} in the other half. Choose Undo and the previous board comes back.`,
    );
  }

  function commitFreehand(points: readonly NormalizedPoint[]) {
    if (!sceneId || !layerId) {
      setStatus('The current scene does not have an editable layer.');
      return;
    }
    const saved = applyEdit(
      'Add freehand stroke',
      (current) => addTacticalFreehand(current, sceneId, layerId, points),
      'Freehand stroke added.',
    );
    if (saved) {
      freehandStrokeRef.current = null;
      setFreehandPoints([]);
    }
  }

  function handleFreehandGesture(phase: 'start' | 'extend' | 'end', point: NormalizedPoint) {
    if (phase === 'start') {
      freehandStrokeRef.current = { points: [point], moved: false };
      setFreehandPoints([point]);
      return;
    }
    if (phase === 'extend') {
      const stroke = freehandStrokeRef.current;
      if (!stroke || stroke.points.length >= MAX_TELESTRATION_POINTS) return;
      const last = stroke.points[stroke.points.length - 1];
      if (!last) return;
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      if (dx * dx + dy * dy < 0.000016) return;
      stroke.moved = true;
      stroke.points = [...stroke.points, point];
      setFreehandPoints(stroke.points);
      return;
    }
    const stroke = freehandStrokeRef.current;
    freehandStrokeRef.current = null;
    if (!stroke) return;
    if (stroke.moved && stroke.points.length >= 2) {
      commitFreehand(stroke.points);
      return;
    }
    setFreehandPoints(stroke.points);
  }

  function addFreehandPoint() {
    setFreehandPoints((current) => {
      if (current.length >= MAX_TELESTRATION_POINTS) return current;
      const index = current.length;
      const point = {
        x: Math.min(0.92, 0.18 + (index % 12) * 0.06),
        y: Math.min(0.88, 0.22 + Math.floor(index / 12) * 0.08),
      };
      return [...current, point];
    });
  }

  function removeSelectedDrawing() {
    if (!selectedAnnotationId) {
      setStatus('Select a drawing on the pitch before removing it.');
      return;
    }
    const annotationId = selectedAnnotationId;
    const removed = applyEdit(
      'Remove drawing',
      (current) => removeTacticalAnnotation(current, annotationId),
      'Drawing removed.',
    );
    if (removed) setSelectedAnnotationId(null);
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
    setSelectedAnnotationId((current) => (
      current && next.present.annotations.some((annotation) => annotation.id === current) ? current : null
    ));
    setStatus(next === history ? 'Nothing to undo.' : 'Undid the last board edit.');
  }

  function redo() {
    const next = redoTacticalProject(history);
    setHistory(next);
    setArrowStart(null);
    setSelectedAnnotationId((current) => (
      current && next.present.annotations.some((annotation) => annotation.id === current) ? current : null
    ));
    setStatus(next === history ? 'Nothing to redo.' : 'Redid the next board edit.');
  }

  function closeOverlay() {
    if (helpOpen) setHelpOpen(false);
    else if (actionsOpen) setActionsOpen(false);
    else if (inspectorSheet) setInspectorSheet(false);
    else if (timelineSheet) setTimelineSheet(false);
  }

  function openHelp() {
    setActionsOpen(false);
    setInspectorSheet(false);
    setTimelineSheet(false);
    setHelpOpen(true);
    setStatus('Help reference opened.');
  }

  function openActions(tokenId?: string) {
    const nextToken = tokenId ?? selectedTokenId;
    if (!nextToken || !sceneTokens.some((token) => token.id === nextToken)) {
      setStatus('Select a player before opening player actions.');
      return;
    }
    if (tokenId) setSelectedTokenId(tokenId);
    setHelpOpen(false);
    setInspectorSheet(false);
    setTimelineSheet(false);
    setActionsOpen(true);
    setStatus('Player actions opened.');
  }

  function issueTransport(action: TacticalTransportRequest['action']) {
    transportSerialRef.current += 1;
    setTransportRequest({ serial: transportSerialRef.current, action });
  }

  function hideTip() {
    if (tipHostRef.current) tipHostRef.current.removeAttribute('aria-describedby');
    tipHostRef.current = null;
    setTip(null);
  }

  function focusedTipHost() {
    const active = document.activeElement;
    return active instanceof Element ? active.closest<HTMLElement>('[data-tactical-tip]') : null;
  }

  function showTip(target: EventTarget | null) {
    const focused = focusedTipHost();
    const source = focused ?? target;
    if (overlayOpen || !(source instanceof Element)) {
      hideTip();
      return;
    }
    const host = source.closest<HTMLElement>('[data-tactical-tip]');
    if (!host) {
      if (focused) return;
      hideTip();
      return;
    }
    if (tipHostRef.current === host) return;
    if (tipHostRef.current) tipHostRef.current.removeAttribute('aria-describedby');
    host.setAttribute('aria-describedby', 'tactical-tooltip');
    tipHostRef.current = host;
    const rect = host.getBoundingClientRect();
    setTip({
      text: host.getAttribute('data-tactical-tip') ?? '',
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (overlayOpen) hideTip();
  }, [overlayOpen]);

  useLayoutEffect(() => {
    const node = tooltipRef.current;
    if (!node || !tip) return;
    const place = placeCollisionSafeTooltip(
      tip,
      { width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    node.style.top = `${place.top}px`;
    node.style.left = `${place.left}px`;
  }, [tip]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      const focus = classifyTacticalFocus({
        inBoard: target instanceof Element && Boolean(target.closest('.tactical-board')),
        editable: target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]')),
        activation: target instanceof Element && Boolean(target.closest('button, a, summary, [role="button"]')),
      });
      const action = resolveTacticalShortcut(event, { focus, overlayOpen });
      if (!action) return;
      event.preventDefault();
      if (action === 'close-overlay') {
        closeOverlay();
        setStatus('Closed the open tactical surface.');
        return;
      }
      if (action === 'help') {
        openHelp();
        return;
      }
      if (action === 'undo') {
        undo();
        return;
      }
      if (action === 'redo') {
        redo();
        return;
      }
      if (action === 'move-tool') {
        setMode('move');
        setArrowStart(null);
        setStatus('Move tool active.');
        return;
      }
      if (action === 'arrow-tool') {
        setMode('arrow');
        setArrowStart(null);
        setStatus('Arrow tool active. Choose a start point.');
        return;
      }
      if (action === 'nudge-up') nudge(0, -0.02);
      else if (action === 'nudge-down') nudge(0, 0.02);
      else if (action === 'nudge-left') nudge(-0.02, 0);
      else if (action === 'nudge-right') nudge(0.02, 0);
      else if (action === 'player-actions') openActions();
      else if (action === 'delete-drawing') removeSelectedDrawing();
      else if (
        action === 'toggle-playback'
        || action === 'stop-playback'
        || action === 'previous-frame'
        || action === 'next-frame'
        || action === 'previous-keyframe'
        || action === 'next-keyframe'
      ) {
        issueTransport(action);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <div className="workspace-header tactical-workspace-header">
        <div>
          <h2>Tactical Matchboard Studio</h2>
          <p>Open Board setup. Type the length and width of the pitch (the drawn field) in "Pitch length (m)" and "Pitch width (m)", choose a direction in "Direction", and choose a formation (the starting arrangement of your players) in "Formation". Then choose "Build board". In the dialog, choose OK. The board is replaced, undo is cleared, and your squad (your players) appears on the pitch. In that dialog, choose Cancel and the current board and undo stay as they are. Choose a formation (the other team’s starting arrangement) in "Opposition formation". That list is separate from "Formation". Then choose "Place opposition". Your squad fits into one half. The formation you chose fits into the other half in a different kit (shirt color). It does not have to match your squad. Choose "Place opposition" again and the other team updates. A second squad does not appear. Choose "Move", click a player or the ball, then click the pitch. It moves to that spot. Choose "Arrow", click a start point, then an end point. The arrow appears. Choose "Freehand" (a stroke you draw by hand). Drag on the pitch and release, or choose "Add freehand point" and then "Save freehand". The stroke appears. Choose "Zoom in" or "Zoom out". Zoom (how close the pitch looks) changes by 0.25, from 1 to 4, and the view changes. After zoom is above 1, choose "Pan left", "Pan right", "Pan up", or "Pan down". Pan (sliding the view across the pitch) moves the view. Choose "Reset pitch view" and the whole pitch shows again. Choose "Drag to pan", then drag on the pitch. The view slides while zoom is above 1. Players stay on the same spots on the pitch. Choose "Export SVG" (Scalable Vector Graphics). A diagram file downloads. The board stays in this browser. Nothing is uploaded.</p>
        </div>
      </div>
      <div
        className="workspace-body tactical-matchboard-workspace"
        data-inspector-sheet={inspectorSheet ? 'open' : 'closed'}
        data-timeline-sheet={timelineSheet ? 'open' : 'closed'}
        data-reduced-motion={reducedMotion ? 'reduce' : 'no-preference'}
        onFocus={(event) => showTip(event.target)}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Element) || !next.closest('[data-tactical-tip]')) hideTip();
        }}
        onPointerOver={(event) => showTip(event.target)}
        onPointerOut={(event) => {
          if (focusedTipHost()) return;
          const next = event.relatedTarget;
          if (next instanceof Element && next.closest('[data-tactical-tip]')) return;
          hideTip();
        }}
      >
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
              <button className="action-button" type="submit" data-tactical-tip="Choose Build board. The dialog says Build board replaces this board and clears undo. Choose OK. A new board appears from these settings, and undo for the previous board is cleared. Choose Cancel. The board and undo stay unchanged.">Build board</button>
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

        <TacticalStageOnePanel
          project={project}
          sceneId={sceneId}
          layerId={layerId}
          selectedTokenId={selectedTokenId}
          previewTimeMs={Math.min(previewTimeMs, project.timeline.durationMs)}
          snap={snapAssist}
          onionSkin={onionSkin}
          scenarioOverlayId={scenarioOverlayId}
          guides={tacticalPitchGuides(project)}
          onEdit={applyEdit}
          onSnapChange={setSnapAssist}
          onOnionSkinChange={setOnionSkin}
          onScenarioOverlayChange={setScenarioOverlayId}
        />

        <TacticalTimelinePanel
          project={project}
          activeSceneId={sceneId}
          previewTimeMs={Math.min(previewTimeMs, project.timeline.durationMs)}
          onPreviewTimeChange={(timeMs) => { setPreviewTimeMs(timeMs); setCameraDraft(null); }}
          onTransportStatus={setStatus}
          onEdit={applyEdit}
          transportRequest={transportRequest}
          reducedMotion={reducedMotion}
          sheetActive={timelineSheet}
          onSheetDismiss={() => setTimelineSheet(false)}
        />

        <TacticalAnalysisPanel
          project={presentationProject}
          sceneId={sceneId}
          selectedTokenId={selectedTokenId}
          settings={analysisSettings}
          onSettingsChange={setAnalysisSettings}
          onSetOrientation={(degrees) => {
            if (!selectedTokenId) return;
            applyEdit(
              'Set player orientation',
              (current) => ({
                ...current,
                playerTokens: current.playerTokens.map((token) => (
                  token.id === selectedTokenId ? { ...token, rotationDeg: degrees } : token
                )),
              }),
              `Player orientation set to ${degrees}°.`,
            );
          }}
        />

        <TacticalPersistencePanel
          project={project}
          onEdit={applyEdit}
          onReplaceProject={replaceProject}
          onStatus={setStatus}
        />

        <TacticalExportPanel
          project={project}
          sceneId={sceneId}
          onEdit={applyEdit}
          onStatus={setStatus}
        />

        <TacticalVideoPanel project={project} onEdit={applyEdit} onStatus={setStatus} />

        <div className="tactical-command-bar" aria-label="Board commands">
          <label className="tactical-arrow-label tactical-scene-picker">
            Scene view
            <select
              aria-label="Scene view"
              value={sceneId}
              onChange={(event) => {
                const nextSceneId = event.target.value;
                setActiveSceneId(nextSceneId);
                const nextTokenId = project.playerTokens.find((token) => token.sceneId === nextSceneId)?.id;
                setSelectedTokenId(nextTokenId);
                setBoardTarget('player');
                setSelectedAnnotationId(null);
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
            data-tactical-tip="Place the selected player by clicking or tapping the pitch."
            onClick={() => { setMode('move'); setArrowStart(null); setStatus('Move tool active.'); }}
          >
            Move
          </button>
          <button
            className={`action-button ${mode === 'arrow' ? '' : 'secondary'}`}
            type="button"
            aria-pressed={mode === 'arrow'}
            data-tactical-tip="Choose a start point, then an end point, to draw an arrow."
            onClick={() => { setMode('arrow'); setArrowStart(null); setStatus('Arrow tool active. Choose a start point.'); }}
          >
            Arrow
          </button>
          <button
            className={`action-button ${mode === 'freehand' ? '' : 'secondary'}`}
            type="button"
            aria-pressed={mode === 'freehand'}
            data-tactical-tip="Choose Freehand (a stroke you draw by hand). Drag on the pitch (the drawn field) and release. The stroke appears. Or choose Add freehand point at least twice, up to 2,000 points, then choose Save freehand. The stroke appears. That 2 to 2,000 point limit matches a freehand mark on a local match video."
            onClick={() => { setMode('freehand'); setArrowStart(null); setStatus('Freehand (a stroke you draw by hand) is on. Drag on the pitch and release, and the stroke appears. Or choose Add freehand point, then Save freehand.'); }}
          >
            Freehand
          </button>
          {mode === 'freehand' ? (
            <>
              <button type="button" className="action-button secondary" onClick={addFreehandPoint}>Add freehand point</button>
              <p data-testid="tactical-board-freehand-count">{freehandPoints.length} freehand points</p>
              <button type="button" className="action-button" onClick={() => commitFreehand(freehandPoints)} disabled={freehandPoints.length < 2}>Save freehand</button>
            </>
          ) : null}
          <label className="tactical-arrow-label">
            Arrow label
            <input value={arrowLabel} onChange={(event) => setArrowLabel(event.target.value)} />
          </label>
          <button className="action-button secondary" type="button" data-tactical-tip="Undo the last board edit." disabled={!history.past.length} onClick={undo}>Undo</button>
          <button className="action-button secondary" type="button" data-tactical-tip="Redo the next board edit." disabled={!history.future.length} onClick={redo}>Redo</button>
          <label className="tactical-arrow-label">
            Opposition name
            <input
              value={oppositionName}
              aria-label="Opposition name"
              data-tactical-tip="Type the opposition name (the other team) here. Choose Place opposition. That name appears on the formation (the starting arrangement) you chose in Opposition formation."
              onChange={(event) => setOppositionName(event.target.value)}
            />
          </label>
          <label className="tactical-arrow-label">
            Opposition color
            <input
              type="color"
              value={oppositionColor}
              aria-label="Opposition color"
              data-tactical-tip={'Choose the kit color (shirt color) for the opposition (the other team). If it matches your squad, "Place opposition" changes it so the two kits stay different colors.'}
              onChange={(event) => setOppositionColor(event.target.value)}
            />
          </label>
          <label className="tactical-arrow-label">
            Opposition formation
            <select
              aria-label="Opposition formation"
              value={oppositionFormationId}
              onChange={(event) => setOppositionFormationId(event.target.value)}
              data-tactical-tip="Choose a formation (the other team’s starting arrangement) here. This list is separate from Formation in Board setup. Choose Place opposition and this formation appears in the other half."
            >
              {availableFormations.map((formation) => (
                <option key={formation.id} value={formation.id}>{formation.label}</option>
              ))}
            </select>
          </label>
          <button
            className="action-button secondary"
            type="button"
            data-tactical-tip="Choose Place opposition after your squad (your players) is visible on the pitch (the drawn field). Your squad fits into one half. The formation you chose in Opposition formation fits into the other half. It does not have to match your squad. If the kits (shirt colors) match, the other team’s kit changes so the colors stay different. Choose Place opposition again. The other team updates. A second squad does not appear. Choose Undo. The previous board comes back."
            onClick={placeOpposition}
          >
            Place opposition
          </button>
          <button
            className="action-button secondary"
            type="button"
            data-tactical-tip={'Click an arrow or other drawing on the pitch, then click "Remove drawing". That drawing disappears. Players stay on the pitch.'}
            disabled={!selectedAnnotationId}
            onClick={removeSelectedDrawing}
          >
            Remove drawing
          </button>
          <button className="action-button secondary" type="button" data-tactical-tip="Download the current pitch (the drawn field) as an SVG (Scalable Vector Graphics) file." onClick={exportSvg}>Export SVG</button>
          <button className="action-button secondary" type="button" data-tactical-tip="Open the help reference. Tooltips are extra; the labels and help stay available." onClick={openHelp}>Help</button>
          <button className="action-button secondary" type="button" data-tactical-tip="Open the same player actions as a right-click." onClick={() => openActions()}>Player actions</button>
          <button
            className="action-button secondary"
            type="button"
            aria-pressed={inspectorSheet}
            data-tactical-tip="Open player and layer controls in a bottom sheet (a panel that slides up from the bottom)."
            onClick={() => {
              setHelpOpen(false);
              setActionsOpen(false);
              setTimelineSheet(false);
              setInspectorTab('players');
              setInspectorSheet(true);
              setStatus('Players sheet opened.');
            }}
          >
            Players sheet
          </button>
          <button
            className="action-button secondary"
            type="button"
            aria-pressed={timelineSheet}
            data-tactical-tip="Open play, pause, and scrub controls for the motion timeline in a bottom sheet (a panel that slides up from the bottom)."
            onClick={() => {
              setHelpOpen(false);
              setActionsOpen(false);
              setInspectorSheet(false);
              setTimelineSheet(true);
              setStatus('Timeline sheet opened.');
            }}
          >
            Timeline sheet
          </button>
          <button
            className="action-button secondary"
            type="button"
            aria-expanded={show3D}
            aria-controls="tactical-3d-panel"
            data-tactical-tip="Show or hide the local 3D pitch. Nothing is uploaded."
            onClick={() => setShow3D((value) => !value)}
          >
            {show3D ? 'Hide 3D view' : 'Show 3D view'}
          </button>
        </div>

        {show3D ? (
          <section id="tactical-3d-panel" className="tactical-3d-panel" aria-label="3D presentation controls">
            <div className="tactical-3d-controls">
              <label>
                Camera preset
                <select
                  value={cameraPresetId}
                  onChange={(event) => applyCameraPreset(event.target.value as CameraPresetId)}
                >
                  {CAMERA_PRESET_IDS.map((preset) => (
                    <option key={preset} value={preset}>{preset.replace('-', ' ')}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={captureCameraKeyframe}>Capture camera at playhead</button>
              <span aria-live="polite">{project.cameraStates.length} camera keyframe{project.cameraStates.length === 1 ? '' : 's'}</span>
            </div>
            <Suspense fallback={<div className="tactical-3d-loading" role="status">Loading the local 3D view…</div>}>
              <Tactical3DView
                project={presentationProject}
                sceneId={sceneId}
                selectedTokenId={selectedTokenId}
                cameraState={activeCamera}
                onSelectToken={(tokenId) => {
                  selectPlayer(tokenId);
                  setStatus(`Selected ${tokenId} in the 3D view.`);
                }}
                onCameraChange={setCameraDraft}
                onStatus={setStatus}
              />
            </Suspense>
          </section>
        ) : null}

        <div className="tactical-editor-layout">
          <TacticalBoard
            project={presentationProject}
            sceneId={sceneId}
            selectedTokenId={selectedTokenId}
            interactionMode={mode}
            arrowStart={arrowStart}
            freehandPoints={freehandPoints}
            onFreehandGesture={handleFreehandGesture}
            analysisSettings={analysisSettings}
            renderOptions={boardRenderOptions}
            onSelectToken={selectPlayer}
            onSelectBall={selectBall}
            onSelectAnnotation={selectAnnotation}
            onPitchPoint={handlePitchPoint}
            onOpenActions={openActions}
          />

          <TacticalInspector
            project={project}
            sceneId={sceneId}
            sceneTokens={sceneTokens}
            selectedTokenId={selectedTokenId}
            groupedTokenIds={groupedTokenIds}
            tab={inspectorTab}
            sheetOpen={inspectorSheet}
            onTabChange={setInspectorTab}
            onSelectToken={selectPlayer}
            onToggleGrouped={(tokenId) => {
              setGroupedTokenIds((current) => (
                current.includes(tokenId) ? current.filter((id) => id !== tokenId) : [...current, tokenId]
              ));
            }}
            onGroup={(layerName) => {
              const grouped = applyEdit(
                'Group players',
                (current) => groupPlayerTokens(current, sceneId, groupedTokenIds, layerName),
                `Grouped ${groupedTokenIds.length} players on ${layerName.trim()}.`,
              );
              if (!grouped) return;
              setGroupedTokenIds([]);
              setInspectorTab('layers');
            }}
            onToggleTokenLock={(tokenId, locked) => {
              applyEdit(
                locked ? 'Lock player' : 'Unlock player',
                (current) => setPlayerTokenLocked(current, tokenId, locked),
                locked ? 'Selected player locked.' : 'Selected player unlocked.',
              );
            }}
            onLayerVisibility={(layerId, visible) => {
              applyEdit(
                visible ? 'Show layer' : 'Hide layer',
                (current) => setSceneLayerState(current, sceneId, layerId, { visible }),
                visible ? 'Layer shown.' : 'Layer hidden.',
              );
            }}
            onLayerLocked={(layerId, locked) => {
              applyEdit(
                locked ? 'Lock layer' : 'Unlock layer',
                (current) => setSceneLayerState(current, sceneId, layerId, { locked }),
                locked ? 'Layer locked.' : 'Layer unlocked.',
              );
            }}
            onReorderLayer={(layerId, direction) => {
              applyEdit(
                'Reorder layer',
                (current) => reorderSceneLayer(current, sceneId, layerId, direction),
                direction < 0 ? 'Layer moved up.' : 'Layer moved down.',
              );
            }}
            onSoloLayer={(layerId) => {
              const layer = activeScene?.layers.find((candidate) => candidate.id === layerId);
              applyEdit(
                'Solo layer',
                (current) => soloSceneLayer(current, sceneId, layerId),
                `Solo ${layer?.name ?? 'layer'}. Other layers in this scene are hidden.`,
              );
            }}
            onFocusLayer={(layerId) => {
              try {
                const tokenIds = layerPlayerTokenIds(project, sceneId, layerId);
                const layer = activeScene?.layers.find((candidate) => candidate.id === layerId);
                const tokenId = tokenIds[0];
                if (!tokenId) {
                  setStatus(`${layer?.name ?? 'Layer'} has no players to focus.`);
                  return;
                }
                setSelectedTokenId(tokenId);
                setInspectorTab('players');
                setStatus(`Focused layer ${layer?.name ?? layerId}.`);
              } catch (error) {
                setStatus(errorMessage(error));
              }
            }}
            onNudge={nudge}
            onSetPosition={setPrecisePosition}
            onCloseSheet={() => {
              setInspectorSheet(false);
              setStatus('Players sheet closed.');
            }}
          />
        </div>

        <div className="status-line good" role="status" aria-live="polite">{status}</div>
      </div>
      {tip ? (
        <div
          ref={tooltipRef}
          id="tactical-tooltip"
          role="tooltip"
          className="tactical-tooltip"
        >
          {tip.text}
        </div>
      ) : null}
      {helpOpen ? (
        <TacticalDialog title="Tactical Matchboard help" labelledBy="tactical-help-title" closeLabel="Close help" onClose={() => { setHelpOpen(false); setStatus('Help reference closed.'); }}>
          {TACTICAL_HELP_SECTIONS.map((section) => (
            <section key={section.id} aria-labelledby={`tactical-help-${section.id}`}>
              <h3 id={`tactical-help-${section.id}`}>{section.title}</h3>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <section aria-labelledby="tactical-help-shortcuts">
            <h3 id="tactical-help-shortcuts">Shortcuts</h3>
            <ul>
              {TACTICAL_SHORTCUTS.map((shortcut) => (
                <li key={shortcut.id}><strong>{shortcut.display}</strong> — {shortcut.summary}</li>
              ))}
            </ul>
          </section>
        </TacticalDialog>
      ) : null}
      {actionsOpen && selectedToken ? (
        <TacticalDialog title="Player actions" labelledBy="tactical-player-actions-title" closeLabel="Close player actions" onClose={() => { setActionsOpen(false); setStatus('Player actions closed.'); }}>
          <p>These actions match the player buttons. A right-click, Shift+F10, and the Player actions button open this same dialog.</p>
          <div className="tactical-dialog-actions">
            <button
              type="button"
              className="action-button secondary"
              onClick={() => {
                applyEdit(
                  selectedToken.locked ? 'Unlock player' : 'Lock player',
                  (current) => setPlayerTokenLocked(current, selectedToken.id, !selectedToken.locked),
                  selectedToken.locked ? 'Selected player unlocked.' : 'Selected player locked.',
                );
              }}
            >
              {selectedToken.locked ? 'Unlock selected player' : 'Lock selected player'}
            </button>
            <button type="button" className="action-button secondary" onClick={() => { setMode('move'); setArrowStart(null); setStatus('Move tool active.'); }}>Move tool</button>
            <button type="button" className="action-button secondary" onClick={() => { setMode('arrow'); setArrowStart(null); setStatus('Arrow tool active. Choose a start point.'); }}>Arrow tool</button>
            <button type="button" onClick={() => nudge(0, -0.02, 'player')} aria-label="Move player up from actions">Move up</button>
            <button type="button" onClick={() => nudge(-0.02, 0, 'player')} aria-label="Move player left from actions">Move left</button>
            <button type="button" onClick={() => nudge(0.02, 0, 'player')} aria-label="Move player right from actions">Move right</button>
            <button type="button" onClick={() => nudge(0, 0.02, 'player')} aria-label="Move player down from actions">Move down</button>
          </div>
        </TacticalDialog>
      ) : null}
    </>
  );
}
