// Feature 37 — Audit Metadata & OpenGraph Social Card Studio.
// Renders a 1200×630 PNG summary card (the standard OpenGraph/Twitter-card
// aspect ratio) using an ordinary <canvas>, entirely client-side.

import type { ReportMetadata } from './export-engine';
import type { Scorecard } from './scoring-engine';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const GRADE_COLORS: Record<string, string> = {
  'A+': '#16a34a', 'A': '#16a34a', 'A-': '#22c55e',
  'B+': '#65a30d', 'B': '#84cc16', 'B-': '#ca8a04',
  'C+': '#d97706', 'C': '#ea580c', 'C-': '#ea580c',
  'D': '#dc2626', 'F': '#b91c1c',
};

export function renderSocialCard(url: string, scorecard: Scorecard, metadata: ReportMetadata): Blob | Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable in this browser.');

  const bg = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  bg.addColorStop(0, '#0b1220');
  bg.addColorStop(1, '#101a30');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = '#8fa3c7';
  ctx.font = '600 28px "Segoe UI", sans-serif';
  ctx.fillText('SITE INTELLIGENCE AUDIT', 64, 84);

  ctx.fillStyle = '#f4f7ff';
  ctx.font = '700 52px "Segoe UI", sans-serif';
  const displayUrl = url.length > 38 ? `${url.slice(0, 35)}…` : url;
  ctx.fillText(displayUrl, 64, 160);

  const gradeColor = GRADE_COLORS[scorecard.overallGrade] ?? '#8fa3c7';
  ctx.fillStyle = gradeColor;
  ctx.font = '700 190px "Segoe UI", sans-serif';
  ctx.fillText(scorecard.overallGrade, 64, 400);

  ctx.fillStyle = '#c9d6ee';
  ctx.font = '400 26px "Segoe UI", sans-serif';
  ctx.fillText(`Composite score: ${scorecard.overallScore} / 100`, 64, 448);

  let vx = 64;
  const vy = 520;
  ctx.font = '600 18px "Segoe UI", sans-serif';
  for (const v of scorecard.vectors) {
    ctx.fillStyle = '#1b2740';
    ctx.fillRect(vx, vy, 210, 64, );
    ctx.fillStyle = '#8fa3c7';
    ctx.fillText(v.label, vx + 14, vy + 26);
    ctx.fillStyle = '#f4f7ff';
    ctx.font = '700 22px "Segoe UI", sans-serif';
    ctx.fillText(`${v.grade} · ${v.score}`, vx + 14, vy + 50);
    ctx.font = '600 18px "Segoe UI", sans-serif';
    vx += 222;
  }

  ctx.fillStyle = '#64749a';
  ctx.font = '400 18px "Segoe UI", sans-serif';
  const stamp = `${metadata.auditorName || 'Local audit'}${metadata.organization ? ` · ${metadata.organization}` : ''} · ${new Date(metadata.auditTimestamp).toISOString().slice(0, 10)}`;
  ctx.fillText(stamp, 64, CARD_HEIGHT - 28);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Social card rendering failed'))), 'image/png');
  });
}
