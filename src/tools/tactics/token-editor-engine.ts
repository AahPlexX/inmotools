import { setRosterPlayerStatus, type RosterPlayerStatus } from './squad-engine';
import type { TacticalProject } from './tactics-types';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface TokenEditorPatch {
  displayName?: string;
  jerseyNumber?: string;
  role?: string;
  status?: RosterPlayerStatus;
  ageOrDevelopmentTag?: string;
  avatarAssetId?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

function requireHex(value: string, label: string): string {
  const color = value.trim();
  if (!HEX_COLOR.test(color)) throw new Error(`${label} color must be a hex color.`);
  return color;
}

export function editRosterToken(
  project: TacticalProject,
  teamId: string,
  playerId: string,
  patch: TokenEditorPatch,
): TacticalProject {
  const team = project.teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error(`Team "${teamId}" does not exist.`);
  const player = team.roster.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Roster player "${playerId}" does not exist on team "${teamId}".`);

  let displayName = player.displayName;
  if (patch.displayName !== undefined) {
    displayName = patch.displayName.trim();
    if (!displayName || displayName.length > 80) throw new Error('Player name must be 1 to 80 characters.');
  }

  let jerseyNumber = player.jerseyNumber;
  if (patch.jerseyNumber !== undefined) {
    const jersey = patch.jerseyNumber.trim();
    if (jersey.length > 3) throw new Error('Jersey number must be 3 characters or fewer.');
    jerseyNumber = jersey || undefined;
  }

  let role = player.role;
  if (patch.role !== undefined) {
    const nextRole = patch.role.trim();
    if (nextRole.length > 40) throw new Error('Role must be 40 characters or fewer.');
    role = nextRole || undefined;
  }

  let ageOrDevelopmentTag = player.ageOrDevelopmentTag;
  if (patch.ageOrDevelopmentTag !== undefined) {
    const tag = patch.ageOrDevelopmentTag.trim();
    if (tag.length > 60) throw new Error('Developmental token must be 60 characters or fewer.');
    ageOrDevelopmentTag = tag || undefined;
  }

  let avatarAssetId = player.avatarAssetId;
  if (patch.avatarAssetId !== undefined) {
    const assetId = patch.avatarAssetId.trim();
    if (assetId && !project.media.some((item) => item.id === assetId)) {
      throw new Error('Avatar must reference a local project asset.');
    }
    avatarAssetId = assetId || undefined;
  }

  const primaryColor = patch.primaryColor !== undefined
    ? requireHex(patch.primaryColor, 'Primary kit')
    : team.primaryColor;
  const secondaryColor = patch.secondaryColor !== undefined
    ? requireHex(patch.secondaryColor, 'Secondary kit')
    : team.secondaryColor;

  const edited: TacticalProject = {
    ...project,
    teams: project.teams.map((candidate) => (
      candidate.id !== teamId
        ? candidate
        : {
            ...candidate,
            primaryColor,
            secondaryColor,
            roster: candidate.roster.map((item) => (
              item.id === playerId
                ? { ...item, displayName, jerseyNumber, role, ageOrDevelopmentTag, avatarAssetId }
                : item
            )),
          }
    )),
  };

  if (patch.status === undefined) return edited;
  return setRosterPlayerStatus(edited, teamId, playerId, patch.status);
}
