import { createNormalizedPoint, trainingFormatProfiles } from './pitch-engine';
import type {
  PitchRuleProfile,
  SourceProvenance,
  TacticalPitch,
  TacticalProject,
} from './tactics-types';

const IFAB_2026_27: SourceProvenance = {
  kind: 'governing-source',
  authoritative: true,
  organization: 'The IFAB',
  sourceTitle: 'Laws of the Game 2026/27 — Law 1: The Field of Play',
  sourceUrl: 'https://www.theifab.com/laws/latest/the-field-of-play/',
  sourceVersion: '2026/27',
  sourceDate: '2026-09-22',
};

const FIFA_FUTSAL_2021: SourceProvenance = {
  kind: 'governing-source',
  authoritative: true,
  organization: 'FIFA',
  sourceTitle: 'Futsal Laws of the Game 2021 and FIFA rules summary',
  sourceUrl: 'https://inside.fifa.com/news/a-crash-course-in-futsal-rules',
  sourceVersion: '2021',
  sourceDate: '2026-09-22',
  note: 'Version is shown explicitly; verify the applicable competition edition before match use.',
};

const ifabInternationalProfile: PitchRuleProfile = {
  id: 'ifab-11v11-international-2026-27',
  label: 'IFAB international 11v11 (2026/27)',
  format: '11v11',
  teamSize: 11,
  editable: false,
  dimensions: { lengthMeters: 105, widthMeters: 68 },
  dimensionRange: {
    minLengthMeters: 100,
    maxLengthMeters: 110,
    minWidthMeters: 64,
    maxWidthMeters: 75,
  },
  goalDimensions: { widthMeters: 7.32, heightMeters: 2.44 },
  goalkeeperStatus: 'included',
  specialLines: ['Halfway line', 'Goal areas', 'Penalty areas', 'Penalty marks', 'Corner areas'],
  restartNotes: ['Competition rules may select dimensions inside the stated international ranges.'],
  provenance: IFAB_2026_27,
};

const futsalProfile: PitchRuleProfile = {
  id: 'fifa-futsal-reference-2021',
  label: 'FIFA futsal reference (2021)',
  format: 'futsal',
  teamSize: 5,
  editable: false,
  dimensions: { lengthMeters: 40, widthMeters: 20 },
  goalDimensions: { widthMeters: 3, heightMeters: 2 },
  goalkeeperStatus: 'included',
  specialLines: ['Halfway line', 'Six-metre penalty areas', 'Substitution zones', 'Second penalty marks'],
  restartNotes: ['Kick-ins replace throw-ins.', 'No offside.', 'Competition-specific modifications may apply.'],
  provenance: FIFA_FUTSAL_2021,
};

export const PITCH_RULE_PROFILES: PitchRuleProfile[] = [
  ...trainingFormatProfiles,
  ifabInternationalProfile,
  futsalProfile,
];

function cloneProfile(profile: PitchRuleProfile): PitchRuleProfile {
  return {
    ...profile,
    dimensions: profile.dimensions ? { ...profile.dimensions } : undefined,
    dimensionRange: profile.dimensionRange ? { ...profile.dimensionRange } : undefined,
    goalDimensions: profile.goalDimensions ? { ...profile.goalDimensions } : undefined,
    specialLines: profile.specialLines ? [...profile.specialLines] : undefined,
    restartNotes: profile.restartNotes ? [...profile.restartNotes] : undefined,
    provenance: { ...profile.provenance },
  };
}

function uniqueTrimmed(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const result = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return result.length ? result : undefined;
}

function requirePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive.`);
  return value;
}

export function getPitchRuleProfile(id: string): PitchRuleProfile | undefined {
  const profile = PITCH_RULE_PROFILES.find((candidate) => candidate.id === id);
  return profile ? cloneProfile(profile) : undefined;
}

export interface CustomPitchRuleProfileInput {
  id: string;
  label: string;
  format: string;
  teamSize: number;
  dimensions: { lengthMeters: number; widthMeters: number };
  goalkeeperStatus?: PitchRuleProfile['goalkeeperStatus'];
  specialLines?: string[];
  restartNotes?: string[];
}

export function createCustomPitchRuleProfile(input: CustomPitchRuleProfileInput): PitchRuleProfile {
  const id = input.id.trim();
  const label = input.label.trim();
  const format = input.format.trim();
  if (!id) throw new Error('Rules profile id is required.');
  if (!label) throw new Error('Rules profile label is required.');
  if (!format) throw new Error('Rules profile format is required.');
  if (!Number.isInteger(input.teamSize) || input.teamSize < 1) {
    throw new RangeError('Team size must be a positive integer.');
  }
  const dimensions = {
    lengthMeters: requirePositive(input.dimensions.lengthMeters, 'Pitch length'),
    widthMeters: requirePositive(input.dimensions.widthMeters, 'Pitch width'),
  };
  return {
    id,
    label,
    format,
    teamSize: input.teamSize,
    editable: true,
    dimensions,
    goalkeeperStatus: input.goalkeeperStatus ?? 'optional',
    specialLines: uniqueTrimmed(input.specialLines),
    restartNotes: uniqueTrimmed(input.restartNotes),
    provenance: {
      kind: 'custom',
      authoritative: false,
      sourceTitle: 'User-authored rules profile',
      note: 'Local editable profile; not a governing-body ruleset.',
    },
  };
}

function line(
  id: string,
  label: string,
  points: Array<[number, number]>,
  provenance: SourceProvenance,
): TacticalPitch['overlays'][number] {
  return {
    id,
    kind: 'line',
    label,
    points: points.map(([x, y]) => createNormalizedPoint(x, y)),
    provenance: { ...provenance },
  };
}

function profileOverlays(profile: PitchRuleProfile): TacticalPitch['overlays'] {
  if (profile.id === 'ifab-11v11-international-2026-27') {
    const length = profile.dimensions!.lengthMeters;
    const width = profile.dimensions!.widthMeters;
    const depth = 16.5 / length;
    const halfAreaWidth = (7.32 + 33) / 2 / width;
    const top = 0.5 - halfAreaWidth;
    const bottom = 0.5 + halfAreaWidth;
    return [
      line('ifab-halfway-line', 'IFAB halfway line', [[0.5, 0], [0.5, 1]], profile.provenance),
      line('ifab-left-penalty-area', 'IFAB left penalty area', [[0, top], [depth, top], [depth, bottom], [0, bottom]], profile.provenance),
      line('ifab-right-penalty-area', 'IFAB right penalty area', [[1, top], [1 - depth, top], [1 - depth, bottom], [1, bottom]], profile.provenance),
    ];
  }
  if (profile.id === 'fifa-futsal-reference-2021') {
    return [
      line('futsal-halfway-line', 'Futsal halfway line', [[0.5, 0], [0.5, 1]], profile.provenance),
      line('futsal-left-second-penalty-mark', 'Left second penalty mark', [[0.25, 0.48], [0.25, 0.52]], profile.provenance),
      line('futsal-right-second-penalty-mark', 'Right second penalty mark', [[0.75, 0.48], [0.75, 0.52]], profile.provenance),
    ];
  }
  const hasBuildOutLine = profile.specialLines?.some((item) => /build[- ]out/i.test(item));
  return hasBuildOutLine
    ? [
      line('custom-left-build-out-line', 'Left build-out line', [[1 / 3, 0], [1 / 3, 1]], profile.provenance),
      line('custom-right-build-out-line', 'Right build-out line', [[2 / 3, 0], [2 / 3, 1]], profile.provenance),
    ]
    : [];
}

export function applyPitchRuleProfile(
  project: TacticalProject,
  profileOrId: PitchRuleProfile | string,
): TacticalProject {
  const profile = typeof profileOrId === 'string'
    ? getPitchRuleProfile(profileOrId)
    : cloneProfile(profileOrId);
  if (!profile) throw new Error(`Pitch rules profile "${profileOrId}" does not exist.`);
  return {
    ...project,
    ruleset: profile,
    pitch: {
      ...project.pitch,
      profileId: profile.id,
      dimensions: profile.dimensions ? { ...profile.dimensions } : { ...project.pitch.dimensions },
      overlays: profileOverlays(profile),
    },
  };
}
