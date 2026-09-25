import type {
  NormalizedPoint,
  TacticalAnnotation,
  TacticalEquipment,
  TacticalProject,
  TacticalScene,
} from './tactics-types';

const BOARD_WIDTH = 1000;

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function number(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(3)).toString();
}

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_.:-]/g, '-').replace(/-+/g, '-');
  return normalized || 'tactical-item';
}

function safeColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : fallback;
}

function requireScene(project: TacticalProject, sceneId: string): TacticalScene {
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Scene "${sceneId}" does not exist.`);
  return scene;
}

function boardHeight(project: TacticalProject): number {
  const { lengthMeters, widthMeters } = project.pitch.dimensions;
  if (
    !Number.isFinite(lengthMeters)
    || lengthMeters <= 0
    || !Number.isFinite(widthMeters)
    || widthMeters <= 0
  ) {
    throw new RangeError('Pitch dimensions must be positive finite metre values.');
  }
  return BOARD_WIDTH * (widthMeters / lengthMeters);
}

function toBoardPoint(point: NormalizedPoint, height: number): { x: number; y: number } {
  return {
    x: point.x * BOARD_WIDTH,
    y: point.y * height,
  };
}

function layerIsVisible(scene: TacticalScene, layerId: string): boolean {
  return scene.layers.find((layer) => layer.id === layerId)?.visible === true;
}

function serializePitch(project: TacticalProject, height: number): string[] {
  const parts: string[] = [
    `<rect x="0" y="0" width="${number(BOARD_WIDTH)}" height="${number(height)}" fill="#2f7d45"/>`,
    `<rect x="10" y="10" width="${number(BOARD_WIDTH - 20)}" height="${number(height - 20)}" fill="none" stroke="#ffffff" stroke-width="4"/>`,
    `<line x1="${number(BOARD_WIDTH / 2)}" y1="10" x2="${number(BOARD_WIDTH / 2)}" y2="${number(height - 10)}" stroke="#ffffff" stroke-width="3"/>`,
    `<circle cx="${number(BOARD_WIDTH / 2)}" cy="${number(height / 2)}" r="4" fill="#ffffff"/>`,
  ];

  for (const overlay of project.pitch.overlays) {
    if (!overlay.points.length) continue;
    const points = overlay.points
      .map((point) => {
        const board = toBoardPoint(point, height);
        return `${number(board.x)},${number(board.y)}`;
      })
      .join(' ');
    const id = escapeAttribute(safeId(overlay.id));
    const label = escapeText(overlay.label);
    if (overlay.kind === 'zone') {
      parts.push(
        `<polygon id="${id}" data-tactical-kind="pitch-zone" points="${points}" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.65" stroke-width="2"><title>${label}</title></polygon>`,
      );
    } else {
      parts.push(
        `<polyline id="${id}" data-tactical-kind="pitch-line" points="${points}" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2"><title>${label}</title></polyline>`,
      );
    }
  }

  return parts;
}

function serializeEquipment(item: TacticalEquipment, height: number): string {
  const point = toBoardPoint(item.position, height);
  const id = escapeAttribute(safeId(item.id));
  const x = number(point.x);
  const y = number(point.y);
  const scale = Math.max(0.2, Math.min(8, item.scale));
  const rotation = number(item.rotationDeg);

  if (item.kind === 'cone') {
    const radius = 8 * scale;
    const topY = point.y - radius;
    const leftX = point.x - radius;
    const rightX = point.x + radius;
    const bottomY = point.y + radius;
    return `<polygon id="${id}" data-tactical-kind="equipment" data-equipment-kind="cone" points="${number(point.x)},${number(topY)} ${number(leftX)},${number(bottomY)} ${number(rightX)},${number(bottomY)}" fill="#f59e0b" stroke="#78350f" stroke-width="1.5" transform="rotate(${rotation} ${x} ${y})"/>`;
  }

  return `<rect id="${id}" data-tactical-kind="equipment" data-equipment-kind="${escapeAttribute(item.kind)}" x="${number(point.x - 7 * scale)}" y="${number(point.y - 7 * scale)}" width="${number(14 * scale)}" height="${number(14 * scale)}" rx="2" fill="#f8fafc" stroke="#334155" stroke-width="1.5" transform="rotate(${rotation} ${x} ${y})"/>`;
}

function serializeAnnotation(
  annotation: TacticalAnnotation,
  height: number,
  markerId: string,
): string {
  if (!annotation.points.length) return '';
  const points = annotation.points
    .map((point) => {
      const board = toBoardPoint(point, height);
      return `${number(board.x)},${number(board.y)}`;
    })
    .join(' ');
  const id = escapeAttribute(safeId(annotation.id));
  const isArrow = annotation.kind === 'arrow';
  const marker = isArrow ? ` marker-end="url(#${escapeAttribute(markerId)})"` : '';
  const label = annotation.label?.trim();
  const title = label ? `<title>${escapeText(label)}</title>` : '';
  const line = `<polyline id="${id}" data-tactical-kind="annotation" data-annotation-kind="${escapeAttribute(annotation.kind)}" points="${points}" fill="none" stroke="#fef08a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"${marker}>${title}</polyline>`;

  if (!label) return line;
  const last = toBoardPoint(annotation.points[annotation.points.length - 1]!, height);
  return `${line}<text x="${number(last.x + 10)}" y="${number(last.y - 10)}" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#ffffff">${escapeText(label)}</text>`;
}

export function serializeTacticalBoardSvg(project: TacticalProject, sceneId: string): string {
  const scene = requireScene(project, sceneId);
  const height = boardHeight(project);
  const markerId = `tactical-arrowhead-${safeId(project.id)}-${safeId(scene.id)}`;
  const titleId = `tactical-title-${safeId(project.id)}-${safeId(scene.id)}`;
  const descId = `tactical-desc-${safeId(project.id)}-${safeId(scene.id)}`;
  const title = project.metadata.title.trim() || 'Untitled tactical project';
  const description = project.metadata.description.trim() || scene.name;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${number(BOARD_WIDTH)} ${number(height)}" role="img" aria-labelledby="${escapeAttribute(titleId)} ${escapeAttribute(descId)}">`,
    `<title id="${escapeAttribute(titleId)}">${escapeText(title)}</title>`,
    `<desc id="${escapeAttribute(descId)}">${escapeText(description)}</desc>`,
    '<defs>',
    `<marker id="${escapeAttribute(markerId)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fef08a"/></marker>`,
    '</defs>',
    ...serializePitch(project, height),
  ];

  for (const item of project.equipment) {
    if (
      item.sceneId !== scene.id
      || !item.visible
      || !layerIsVisible(scene, item.layerId)
    ) continue;
    parts.push(serializeEquipment(item, height));
  }

  for (const annotation of project.annotations) {
    if (
      annotation.sceneId !== scene.id
      || annotation.visible === false
      || !layerIsVisible(scene, annotation.layerId)
    ) continue;
    parts.push(serializeAnnotation(annotation, height, markerId));
  }

  for (const token of project.playerTokens) {
    if (
      token.sceneId !== scene.id
      || !token.visible
      || !layerIsVisible(scene, token.layerId)
    ) continue;

    const team = project.teams.find((candidate) => candidate.id === token.teamId);
    const player = team?.roster.find((candidate) => candidate.id === token.playerId);
    const point = toBoardPoint(token.position, height);
    const id = escapeAttribute(safeId(token.id));
    const fill = safeColor(team?.primaryColor ?? '', '#1d4ed8');
    const textFill = safeColor(team?.secondaryColor ?? '', '#ffffff');
    const displayName = player?.displayName?.trim() || player?.jerseyNumber?.trim() || 'Player';
    const jersey = player?.jerseyNumber?.trim();

    parts.push(
      `<g id="${id}" data-tactical-kind="player" transform="translate(${number(point.x)} ${number(point.y)}) rotate(${number(token.rotationDeg)})"><circle cx="0" cy="0" r="24" fill="${escapeAttribute(fill)}" stroke="#ffffff" stroke-width="3"/><title>${escapeText(displayName)}</title>${jersey ? `<text x="0" y="7" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="800" fill="${escapeAttribute(textFill)}">${escapeText(jersey)}</text>` : ''}</g>`,
    );
    parts.push(
      `<text x="${number(point.x)}" y="${number(point.y + 42)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#ffffff">${escapeText(displayName)}</text>`,
    );
  }

  const ballPoint = toBoardPoint(project.ball.position, height);
  parts.push(
    `<g id="tactical-ball" data-tactical-kind="ball" transform="translate(${number(ballPoint.x)} ${number(ballPoint.y)})"><circle cx="0" cy="0" r="11" fill="#ffffff" stroke="#111827" stroke-width="2"/><title>Ball</title></g>`,
  );

  parts.push('</svg>');
  return `${parts.join('')}\n`;
}
