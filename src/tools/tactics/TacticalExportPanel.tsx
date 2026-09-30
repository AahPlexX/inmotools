import { useEffect, useState, type FormEvent } from 'react';
import { downloadBytes, downloadText } from '../../lib/download';
import {
  applyExportMetadata,
  browserSupportsRasterMime,
  buildAnalyticsReport,
  buildStandalonePlaybackHtml,
  composeSocialCardSvg,
  exportAnalyticsCsv,
  exportAnalyticsJson,
  exportFileStem,
  exportFrameSequenceZip,
  probeRasterFormats,
  rasterizeSvg,
  readExportMetadata,
} from './export-engine';
import { renderCoachingPdfPackage } from './export-pdf';
import { SOCIAL_STILL_PRESETS, type SocialStillPresetId, type VideoExportCandidate } from './export-types';
import { encodeTacticalVideo, probeTacticalVideoExports } from './export-video-runtime';
import { exportTacticalProjectJson, exportTacticalProjectZip } from './project-io';
import type { TacticalProject } from './tactics-types';

export interface TacticalExportPanelProps {
  project: TacticalProject;
  sceneId: string;
  onEdit: (label: string, updater: (current: TacticalProject) => TacticalProject, message: string) => void;
  onStatus: (message: string) => void;
}

const message = (error: unknown) => error instanceof Error ? error.message : 'Export failed.';

function videoLabel(candidate: VideoExportCandidate): string {
  const container = candidate.container.toUpperCase();
  const codec = candidate.codec.toUpperCase();
  return `Download ${container} ${codec} ${candidate.width}×${candidate.height}`;
}

export default function TacticalExportPanel({ project, sceneId, onEdit, onStatus }: TacticalExportPanelProps) {
  const metadata = readExportMetadata(project);
  const [presetId, setPresetId] = useState<SocialStillPresetId>('landscape');
  const [rasterFormats, setRasterFormats] = useState<Awaited<ReturnType<typeof probeRasterFormats>> | null>(null);
  const [videoFormats, setVideoFormats] = useState<VideoExportCandidate[] | null>(null);
  const preset = SOCIAL_STILL_PRESETS[presetId];

  useEffect(() => {
    let active = true;
    void probeRasterFormats(browserSupportsRasterMime)
      .then((formats) => { if (active) setRasterFormats(formats); })
      .catch(() => { if (active) setRasterFormats([]); });
    void probeTacticalVideoExports()
      .then((formats) => { if (active) setVideoFormats(formats); })
      .catch(() => { if (active) setVideoFormats([]); });
    return () => { active = false; };
  }, []);

  function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      onEdit('Update export metadata', (current) => applyExportMetadata(current, {
        title: String(data.get('title') ?? ''),
        description: String(data.get('description') ?? ''),
        creator: String(data.get('creator') ?? ''),
        club: String(data.get('club') ?? ''),
        ageGroup: String(data.get('ageGroup') ?? ''),
        sessionType: String(data.get('sessionType') ?? ''),
        tacticalTheme: String(data.get('tacticalTheme') ?? ''),
        tagsText: String(data.get('tags') ?? ''),
        rights: String(data.get('rights') ?? ''),
        license: String(data.get('license') ?? ''),
        language: String(data.get('language') ?? ''),
        notes: String(data.get('notes') ?? ''),
      }, new Date().toISOString()), 'Export metadata saved.');
    } catch (error) {
      onStatus(message(error));
    }
  }

  async function downloadSocialCard() {
    try {
      const svg = composeSocialCardSvg(project, sceneId, presetId);
      downloadText(svg, `${exportFileStem(project.metadata.title)}-${presetId}.svg`, 'image/svg+xml;charset=utf-8');
      onStatus('Social card SVG exported locally.');
    } catch (error) {
      onStatus(message(error));
    }
  }

  async function downloadRaster(mime: 'image/png' | 'image/jpeg' | 'image/webp', extension: string) {
    try {
      const svg = composeSocialCardSvg(project, sceneId, presetId);
      const blob = await rasterizeSvg(svg, {
        mime,
        width: preset.width,
        height: preset.height,
        quality: project.exportPreferences.quality || 0.92,
      });
      downloadBytes(new Uint8Array(await blob.arrayBuffer()), `${exportFileStem(project.metadata.title)}-${presetId}.${extension}`, mime);
      onStatus(`${extension.toUpperCase()} still exported locally.`);
    } catch (error) {
      onStatus(message(error));
    }
  }

  async function downloadHtml() {
    try {
      const html = buildStandalonePlaybackHtml(project, sceneId);
      downloadText(html, `${exportFileStem(project.metadata.title)}-playback.html`, 'text/html;charset=utf-8');
      onStatus('Standalone HTML playback exported locally.');
    } catch (error) {
      onStatus(message(error));
    }
  }

  async function downloadPdf() {
    try {
      const bytes = await renderCoachingPdfPackage(project, sceneId);
      downloadBytes(bytes, `${exportFileStem(project.metadata.title)}-coaching.zip`, 'application/zip');
      onStatus('PDF package exported locally with a metadata sidecar.');
    } catch (error) {
      onStatus(message(error));
    }
  }

  function downloadAnalytics(kind: 'csv' | 'json') {
    try {
      const report = buildAnalyticsReport(project, sceneId);
      if (kind === 'csv') {
        downloadText(exportAnalyticsCsv(report), `${exportFileStem(project.metadata.title)}-analytics.csv`, 'text/csv;charset=utf-8');
        onStatus('Analytics CSV exported locally.');
        return;
      }
      downloadText(exportAnalyticsJson(report), `${exportFileStem(project.metadata.title)}-analytics.json`, 'application/json;charset=utf-8');
      onStatus('Analytics JSON exported locally.');
    } catch (error) {
      onStatus(message(error));
    }
  }

  async function downloadFrames() {
    try {
      const bytes = await exportFrameSequenceZip(project, sceneId);
      downloadBytes(bytes, `${exportFileStem(project.metadata.title)}-frames.zip`, 'application/zip');
      onStatus('Frame-sequence ZIP exported locally. It is not a video file.');
    } catch (error) {
      onStatus(message(error));
    }
  }

  async function downloadVideo(candidate: VideoExportCandidate) {
    try {
      const bytes = await encodeTacticalVideo(project, sceneId, candidate, videoFormats ?? []);
      const extension = candidate.container === 'mp4' ? 'mp4' : 'webm';
      const mime = candidate.container === 'mp4' ? 'video/mp4' : 'video/webm';
      downloadBytes(bytes, `${exportFileStem(project.metadata.title)}.${extension}`, mime);
      onStatus(`${extension.toUpperCase()} video exported with the confirmed encoder settings.`);
    } catch (error) {
      onStatus(message(error));
    }
  }

  return (
    <details className="tactical-setup tactical-authoring tactical-export">
      <summary>Professional export</summary>
      <div className="tactical-authoring-grid">
        <form key={JSON.stringify(metadata)} onSubmit={saveMetadata}>
          <h3>Export metadata</h3>
          <label>Export title<input name="title" defaultValue={metadata.title} maxLength={120} required /></label>
          <label>Export description<textarea name="description" defaultValue={metadata.description} maxLength={500} /></label>
          <label>Creator<input name="creator" defaultValue={metadata.creator} maxLength={120} /></label>
          <label>Club or team<input name="club" defaultValue={metadata.club} maxLength={120} /></label>
          <label>Age group<input name="ageGroup" defaultValue={metadata.ageGroup} maxLength={40} /></label>
          <label>Session or drill type<input name="sessionType" defaultValue={metadata.sessionType} maxLength={80} /></label>
          <label>Tactical theme<input name="tacticalTheme" defaultValue={metadata.tacticalTheme} maxLength={80} /></label>
          <label>Tags<input name="tags" defaultValue={metadata.tags.join(', ')} /></label>
          <label>Rights<input name="rights" defaultValue={metadata.rights} maxLength={200} /></label>
          <label>License<input name="license" defaultValue={metadata.license} maxLength={120} /></label>
          <label>Language<input name="language" defaultValue={metadata.language} maxLength={32} /></label>
          <label>Export notes<textarea name="notes" defaultValue={metadata.notes} maxLength={4000} /></label>
          <button type="submit">Save export metadata</button>
        </form>

        <section aria-labelledby="tactical-still-export-heading">
          <h3 id="tactical-still-export-heading">Stills and playback</h3>
          <label>
            Social card shape
            <select value={presetId} onChange={(event) => setPresetId(event.target.value as SocialStillPresetId)}>
              {Object.values(SOCIAL_STILL_PRESETS).map((presetOption) => (
                <option key={presetOption.id} value={presetOption.id}>{presetOption.label}</option>
              ))}
            </select>
          </label>
          <div className="tactical-inline-actions">
            <button type="button" onClick={() => void downloadSocialCard()}>Download social card</button>
            <button type="button" onClick={() => void downloadHtml()}>Download standalone HTML</button>
            <button type="button" onClick={() => void downloadPdf()}>Download PDF package</button>
          </div>
          <p className="tactical-export-note" data-testid="tactical-raster-capability">
            {rasterFormats === null
              ? 'Checking which still-image formats this browser can write.'
              : rasterFormats.length
                ? 'Still-image buttons match formats this browser just wrote successfully.'
                : 'This browser did not confirm a PNG, JPEG, or WebP write. The SVG social card remains available.'}
          </p>
          <div className="tactical-inline-actions">
            {rasterFormats?.map((format) => (
              <button key={format.id} type="button" onClick={() => void downloadRaster(format.mime, format.id === 'jpeg' ? 'jpg' : format.id)}>
                {`Download ${format.label}`}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="tactical-report-export-heading">
          <h3 id="tactical-report-export-heading">Analytics and project</h3>
          <p className="tactical-export-note">Analytics rows are geometric measurements from authored or imported samples. They are not GPS, probability, intent, or officiating results.</p>
          <div className="tactical-inline-actions">
            <button type="button" onClick={() => downloadAnalytics('csv')}>Download analytics CSV</button>
            <button type="button" onClick={() => downloadAnalytics('json')}>Download analytics JSON</button>
            <button type="button" onClick={() => { downloadText(exportTacticalProjectJson(project), `${exportFileStem(project.metadata.title)}.tactical.json`, 'application/json;charset=utf-8'); onStatus('Project JSON exported locally.'); }}>Download project JSON</button>
            <button type="button" onClick={() => void exportTacticalProjectZip(project).then((bytes) => { downloadBytes(bytes, `${exportFileStem(project.metadata.title)}.tactical.zip`, 'application/zip'); onStatus('Project ZIP exported locally.'); }).catch((error) => onStatus(message(error)))}>Download project ZIP</button>
          </div>
        </section>

        <section aria-labelledby="tactical-video-export-heading">
          <h3 id="tactical-video-export-heading">Video</h3>
          <p className="tactical-export-note" data-testid="tactical-video-capability">
            {videoFormats === null
              ? 'Checking video encoder support.'
              : videoFormats.length
                ? 'Video buttons list only combinations Mediabunny confirmed with this browser encoder.'
                : 'This browser did not confirm a video encoder configuration. The frame-sequence ZIP remains available.'}
          </p>
          <div className="tactical-inline-actions">
            {videoFormats?.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                data-testid="negotiated-video-export"
                data-candidate-id={candidate.id}
                onClick={() => void downloadVideo(candidate)}
              >
                {videoLabel(candidate)}
              </button>
            ))}
            <button type="button" onClick={() => void downloadFrames()}>Download frame-sequence ZIP</button>
          </div>
        </section>
      </div>
    </details>
  );
}
