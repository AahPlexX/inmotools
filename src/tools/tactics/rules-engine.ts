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
  sourceTitle: 'Laws of the Game 2026/27 â€” Law 1: The Field of Play',
  sourceUrl: 'https://www.theifab.com/laws/latest/the-field-of-play/',
  sourceVersion: '2026/27',
  sourceDate: '2026-09-22',
};

const FIFA_FUTSAL_2025_26: SourceProvenance = {
  kind: 'governing-source',
  authoritative: true,
  organization: 'FIFA',
  sourceTitle: 'Futsal Laws of the Game 2025-26',
  sourceUrl: 'https://cdn.sanity.io/files/oyf3dba6/production/ef303b9de23b797d2c74e1902b9f8ee2d07a6da4.pdf',
  sourceVersion: '2025-26',
  sourceDate: '2026-09-22',
  note: 'Current FIFA lawbook linked by U.S. Soccer Refereeing; competition-specific modifications may apply.',
};

const US_SOCCER_PDI_2017: SourceProvenance = {
  kind: 'governing-source',
  authoritative: true,
  organization: 'U.S. Soccer',
  sourceTitle: 'How Small-Sided Standards Will Change Youth Soccer',
  sourceUrl: 'https://www.ussoccer.com/stories/2017/08/five-things-to-know-how-smallsided-standards-will-change-youth-soccer',
  sourceVersion: '2017 PDI',
  sourceDate: '2026-09-22',
  note: 'U.S.-specific youth standard; verify the implementing competition rules before match use.',
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
  id: 'fifa-futsal-2025-26',
  label: 'FIFA futsal (2025-26)',
  format: 'futsal',
  teamSize: 5,
  editable: false,
  dimensions: { lengthMeters: 40, widthMeters: 20 },
  dimensionRange: { minLengthMeters: 38, maxLengthMeters: 42, minWidthMeters: 20, maxWidthMeters: 25 },
  goalDimensions: { widthMeters: 3, heightMeters: 2 },
  goalkeeperStatus: 'included',
  specialLines: ['Halfway line', 'Six-metre penalty areas', 'Substitution zones', 'Second penalty marks'],
  restartNotes: ['Kick-ins replace throw-ins.', 'No offside.', 'Competition-specific modifications may apply.'],
  provenance: FIFA_FUTSAL_2025_26,
};

const usSoccerPdi7v7Profile: PitchRuleProfile = {
  id: 'ussf-pdi-7v7-2017',
  label: 'U.S. Soccer PDI 7v7 (2017)',
  format: '7v7',
  teamSize: 7,
  editable: false,
  ageGroup: 'U-9 to U-10',
  goalkeeperStatus: 'included',
  specialLines: ['Two build-out lines, each 14 yards in front of goal'],
  restartNotes: [
    'At a goal kick or while the goalkeeper holds the ball, opponents remain behind the build-out line until the ball is put into play.',
    'Offside is not called between the halfway line and the build-out line.',
  ],
  provenance: US_SOCCER_PDI_2017,
};

export const PITCH_RULE_PROFILES: PitchRuleProfile[] = [
  ...trainingFormatProfiles,
  ifabInternationalProfile,
  futsalProfile,
  usSoccerPdi7v7Profile,
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

export function createEditablePitchRuleProfileCopy(
  source: PitchRuleProfile,
  identity: { id: string; label: string },
  changes: Partial<PitchRuleProfile> = {},
): PitchRuleProfile {
  const id = identity.id.trim();
  const label = identity.label.trim();
  if (!id) throw new Error('Rules profile copy id is required.');
  if (!label) throw new Error('Rules profile copy label is required.');
  const sourceCopy = cloneProfile(source);
  const copy = cloneProfile({ ...sourceCopy, ...changes, id, label });
  return {
    ...copy,
    id,
    label,
    editable: true,
    provenance: {
      ...sourceCopy.provenance,
      kind: 'custom',
      authoritative: false,
      note: `Editable local copy derived from ${source.provenance.sourceTitle}. Verify changes against the applicable competition rules.`,
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

function profileOverlays(
  profile: PitchRuleProfile,
  pitchDimensions: TacticalPitch['dimensions'],
): TacticalPitch['overlays'] {
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
  if (profile.id === 'fifa-futsal-2025-26') {
    return [
      line('futsal-halfway-line', 'Futsal halfway line', [[0.5, 0], [0.5, 1]], profile.provenance),
      line('futsal-left-second-penalty-mark', 'Left second penalty mark', [[0.25, 0.48], [0.25, 0.52]], profile.provenance),
      line('futsal-right-second-penalty-mark', 'Right second penalty mark', [[0.75, 0.48], [0.75, 0.52]], profile.provenance),
    ];
  }
  if (profile.id === 'ussf-pdi-7v7-2017') {
    const buildOutDistanceMeters = 14 * 0.9144;
    const offset = buildOutDistanceMeters / pitchDimensions.lengthMeters;
    return [
      line('ussf-left-build-out-line', 'U.S. Soccer left build-out line', [[offset, 0], [offset, 1]], profile.provenance),
      line('ussf-right-build-out-line', 'U.S. Soccer right build-out line', [[1 - offset, 0], [1 - offset, 1]], profile.provenance),
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
  const dimensions = profile.dimensions ? { ...profile.dimensions } : { ...project.pitch.dimensions };
  return {
    ...project,
    ruleset: profile,
    pitch: {
      ...project.pitch,
      profileId: profile.id,
      dimensions,
      overlays: profileOverlays(profile, dimensions),
    },
  };
}
