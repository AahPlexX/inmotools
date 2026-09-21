import type { FormationTemplate, SourceProvenance } from './tactics-types';

const US_SOCCER_FORMATION_SOURCE: SourceProvenance = {
  kind: 'recommendation',
  authoritative: false,
  organization: 'U.S. Soccer',
  sourceTitle: 'The U.S. Way — Formations',
  sourceUrl: 'https://www.ussoccer.com/us-way/player-development/game/formations',
  sourceDate: '2026-09-21',
  note: 'U.S. Soccer identifies these as examples; other formations may be used.',
};

const TOOL_DEFAULT_SOURCE: SourceProvenance = {
  kind: 'tool-default',
  authoritative: false,
  sourceTitle: 'InMo Tools editable formation starter',
  sourceDate: '2026-09-21',
  note: 'Editable organizational starter; not a mandatory governing-body formation.',
};

function template(
  id: string,
  label: string,
  teamSize: number,
  goalkeepers: number,
  outfieldLines: number[],
  notation: string,
  notationIncludesGoalkeeper: boolean,
  provenance: SourceProvenance = TOOL_DEFAULT_SOURCE,
): FormationTemplate {
  return {
    id,
    label,
    teamSize,
    goalkeepers,
    outfieldLines,
    notation,
    notationIncludesGoalkeeper,
    provenance,
  };
}

export const FORMATION_TEMPLATES: FormationTemplate[] = [
  template('tool-3v3-1-1-1', '3v3 1-1-1 starter', 3, 0, [1, 1, 1], '1-1-1', false),
  template('ussf-4v4-1-2-1', 'U.S. Soccer U7–U8 4v4 example', 4, 0, [1, 2, 1], '1-2-1', false, US_SOCCER_FORMATION_SOURCE),
  template('tool-5v5-1-2-1-1', '5v5 1-2-1-1 starter', 5, 1, [2, 1, 1], '1-2-1-1', true),
  template('ussf-7v7-1-3-2-1', 'U.S. Soccer U9–U10 7v7 example', 7, 1, [3, 2, 1], '1-3-2-1', true, US_SOCCER_FORMATION_SOURCE),
  template('ussf-9v9-1-3-2-3', 'U.S. Soccer U11–U12 9v9 example', 9, 1, [3, 2, 3], '1-3-2-3', true, US_SOCCER_FORMATION_SOURCE),
  template('ussf-11v11-1-4-3-3', 'U.S. Soccer U13+ 11v11 example', 11, 1, [4, 3, 3], '1-4-3-3', true, US_SOCCER_FORMATION_SOURCE),
  template('tool-11v11-1-4-2-3-1', '11v11 1-4-2-3-1 starter', 11, 1, [4, 2, 3, 1], '1-4-2-3-1', true),
  template('tool-11v11-1-3-5-2', '11v11 1-3-5-2 starter', 11, 1, [3, 5, 2], '1-3-5-2', true),
  template('tool-11v11-1-4-4-2', '11v11 1-4-4-2 starter', 11, 1, [4, 4, 2], '1-4-4-2', true),
  template('tool-11v11-1-5-3-2', '11v11 1-5-3-2 starter', 11, 1, [5, 3, 2], '1-5-3-2', true),
  template('tool-11v11-1-3-4-3', '11v11 1-3-4-3 starter', 11, 1, [3, 4, 3], '1-3-4-3', true),
  template('tool-11v11-1-4-1-4-1', '11v11 1-4-1-4-1 starter', 11, 1, [4, 1, 4, 1], '1-4-1-4-1', true),
];

export function getFormationTemplate(id: string): FormationTemplate | undefined {
  return FORMATION_TEMPLATES.find((item) => item.id === id);
}

export function validateFormationTemplate(templateToValidate: FormationTemplate): string[] {
  const errors: string[] = [];
  const { teamSize, goalkeepers, outfieldLines } = templateToValidate;

  if (!Number.isInteger(teamSize) || teamSize < 1) {
    errors.push('Team size must be a positive integer.');
  }
  if (!Number.isInteger(goalkeepers) || goalkeepers < 0) {
    errors.push('Goalkeeper count must be a non-negative integer.');
  }
  if (outfieldLines.length === 0 || outfieldLines.some((count) => !Number.isInteger(count) || count < 1)) {
    errors.push('Outfield lines must contain positive integer player counts.');
  }

  const outfieldPlayers = outfieldLines.reduce((sum, count) => sum + count, 0);
  if (goalkeepers + outfieldPlayers !== teamSize) {
    errors.push('Formation player total does not match the selected team size.');
  }

  if (goalkeepers > 0 && !templateToValidate.notationIncludesGoalkeeper) {
    errors.push('Formation notation must explicitly include the goalkeeper.');
  }

  const expectedNotation = templateToValidate.notationIncludesGoalkeeper
    ? [goalkeepers, ...outfieldLines].join('-')
    : outfieldLines.join('-');
  if (templateToValidate.notation !== expectedNotation) {
    errors.push(`Formation notation must be ${expectedNotation} for these player counts.`);
  }

  return errors;
}
