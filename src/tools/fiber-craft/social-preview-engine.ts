import { fiberCraftFilenameStem } from './project-bundle-engine';
import type { FiberCraftDocument } from './fiber-craft-types';

export const FIBER_CRAFT_SOCIAL_PREVIEW_WIDTH = 1200;
export const FIBER_CRAFT_SOCIAL_PREVIEW_HEIGHT = 630;

export const fiberCraftSocialPreviewFilename = (title: string): string =>
  `${fiberCraftFilenameStem(title)}-social-preview.png`;

const ellipsizeToWidth = (
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string => {
  if (context.measureText(value).width <= maxWidth) return value;
  let trimmed = value;
  while (trimmed.length > 1 && context.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed.trimEnd()}…`;
};

const wrapText = (
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
): readonly string[] => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['Untitled pattern'];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) lines[maxLines - 1] = `${lines[maxLines - 1]} ${words.slice(consumed).join(' ')}`;
    lines[maxLines - 1] = ellipsizeToWidth(context, lines[maxLines - 1], maxWidth);
  }
  return lines;
};

const safeLabel = (value: string): string => value.trim() || 'Not specified';

export function renderFiberCraftSocialPreview(
  context: CanvasRenderingContext2D,
  chartImage: CanvasImageSource,
  document: FiberCraftDocument,
): void {
  const width = FIBER_CRAFT_SOCIAL_PREVIEW_WIDTH;
  const height = FIBER_CRAFT_SOCIAL_PREVIEW_HEIGHT;
  const accent = document.palette[0]?.hex ?? '#205bd6';

  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f4f7fb';
  context.fillRect(0, 0, width, height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 18, height);

  context.fillStyle = '#ffffff';
  context.fillRect(590, 72, 570, 486);
  context.strokeStyle = '#d7dde3';
  context.lineWidth = 2;
  context.strokeRect(590, 72, 570, 486);
  context.drawImage(chartImage, 595, 105, 560, 420);

  context.fillStyle = '#101820';
  context.font = '700 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText('CROCHET', 64, 84);
  const badgeWidth = Math.max(122, context.measureText('CROCHET').width + 34);
  context.strokeStyle = accent;
  context.lineWidth = 3;
  context.strokeRect(54, 52, badgeWidth, 48);

  context.font = '800 58px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const titleLines = wrapText(context, document.metadata.title, 475, 3);
  let titleY = 178;
  for (const line of titleLines) {
    context.fillText(line, 54, titleY);
    titleY += 68;
  }

  const author = document.metadata.author.trim();
  context.fillStyle = '#52606d';
  context.font = '500 23px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  if (author) {
    context.fillText(ellipsizeToWidth(context, `by ${author}`, 475), 56, Math.min(394, titleY + 2));
  }

  const detailY = author ? Math.min(448, titleY + 56) : Math.min(420, titleY + 26);
  context.fillStyle = '#101820';
  context.font = '700 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText(`Project level · ${safeLabel(document.metadata.difficulty)}`, 56, detailY);

  context.fillStyle = '#52606d';
  context.font = '500 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const techniques = document.metadata.techniqueTags.length > 0
    ? document.metadata.techniqueTags.join(' · ')
    : 'Charted crochet pattern';
  context.fillText(ellipsizeToWidth(context, techniques, 475), 56, detailY + 38);

  context.fillStyle = '#6b7785';
  context.font = '600 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText('InMo Tools · Fiber Craft Workstation', 56, 574);
  context.restore();
}
