import { describe, expect, it } from 'vitest';
import { setSceneTransition, sampleChapterFrame } from '../../src/tools/tactics/transition-engine';
import { splitTacticalScene, joinTacticalScenes, reorderTacticalScene, cloneTacticalScene } from '../../src/tools/tactics/scene-engine';
import { PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import JSZip from 'jszip';
import { renderCoachingPdfPackage } from '../../src/tools/tactics/export-pdf';
import { buildBeginnerTacticalProject } from '../../src/tools/tactics/workspace-engine';
import { buildExportFrames } from '../../src/tools/tactics/export-engine';
import { exportTacticalProjectJson, importTacticalProjectJson } from '../../src/tools/tactics/project-io';
import { validateTacticalProject } from '../../src/tools/tactics/tactics-engine';

function chapters() {
  const project = buildBeginnerTacticalProject({ title: 'Chapters', teamName: 'Home', primaryColor: '#154c79', secondaryColor: '#ffffff', formationId: 'ussf-7v7-1-3-2-1', pitchDimensions: { lengthMeters: 60, widthMeters: 40 }, direction: 'left-to-right' });
  project.timeline.durationMs = 2000;
  project.scenes[0]!.durationMs = 2000;
  const result = splitTacticalScene(project, project.scenes[0]!.id, { rightId: 'arrival', rightName: 'Arrival', splitMs: 1000 });
  const left = result.playerTokens.find(token => token.sceneId !== 'arrival')!;
  const right = result.playerTokens.find(token => token.sceneId === 'arrival' && token.playerId === left.playerId)!;
  left.position = { x: 0.2, y: 0.5 }; left.rotationDeg = 350;
  right.position = { x: 0.8, y: 0.5 }; right.rotationDeg = 10;
  return result;
}

const options = { width: 1280, height: 720, frameRate: 30, maxFrames: 16, showCaption: false };

describe('Chapter transitions', () => {
  it('samples a 500 ms fade identically for chapter preview and exported frames', () => {
    const project = chapters();
    const snapshot = structuredClone(project);
    const sceneId = project.scenes[0]!.id;
    const authored = setSceneTransition(project, sceneId, { kind: 'fade', durationMs: 500 });
    expect(project).toEqual(snapshot);
    expect(sampleChapterFrame(authored, 499, sceneId)).toMatchObject({ sceneId, opacity: 1 });
    expect(sampleChapterFrame(authored, 625, sceneId)).toMatchObject({ sceneId, opacity: 0.5 });
    expect(sampleChapterFrame(authored, 750, sceneId)).toMatchObject({ sceneId: 'arrival', opacity: 0 });
    expect(sampleChapterFrame(authored, 875, sceneId)).toMatchObject({ sceneId: 'arrival', opacity: 0.5 });
    expect(sampleChapterFrame(authored, 1000, sceneId)).toMatchObject({ sceneId: 'arrival', opacity: 1 });
    const frames = buildExportFrames(authored, sceneId, options);
    expect(frames).toHaveLength(16);
    expect(frames.find(frame => frame.timeMs === 625)?.svg).toContain('opacity="0.5"');
    expect(frames.find(frame => frame.timeMs === 750)?.svg).toContain('opacity="0"');
    expect(frames.find(frame => frame.timeMs === 875)?.svg).toContain('opacity="0.5"');
    expect(() => buildExportFrames(authored, sceneId, { ...options, maxFrames: 2 })).toThrow(/transition|frame cap/i);
    expect(validateTacticalProject(authored)).toEqual([]);
  });

  it('morphs matching roster players with shortest rotation and leaves canonical data untouched', () => {
    const project = chapters();
    const sceneId = project.scenes[0]!.id;
    const authored = setSceneTransition(project, sceneId, { kind: 'morph', durationMs: 500 });
    const snapshot = structuredClone(authored);
    const frame = sampleChapterFrame(authored, 750, sceneId);
    const player = frame.project.playerTokens.find(token => token.sceneId === frame.sceneId)!;
    expect(player.position).toEqual({ x: 0.5, y: 0.5 });
    expect(player.rotationDeg % 360).toBeCloseTo(0);
    expect(frame.opacity).toBe(1);
    expect(authored).toEqual(snapshot);
    const exported = buildExportFrames(authored, sceneId, options).find(frame => frame.timeMs === 750)!;
    expect(exported.svg).toContain('translate(500 ');
  });

  it('preserves legacy scene selection and makes an explicit cut change chapters at the boundary', () => {
    const project = chapters(); const sceneId = project.scenes[0]!.id;
    expect(sampleChapterFrame(project, 0, 'arrival').sceneId).toBe('arrival');
    const authored = setSceneTransition(project, sceneId, { kind: 'cut', durationMs: 0 });
    expect(sampleChapterFrame(authored, 999, sceneId).sceneId).toBe(sceneId);
    expect(sampleChapterFrame(authored, 1000, sceneId).sceneId).toBe('arrival');
    expect(sampleChapterFrame(authored, 2000, sceneId).sceneId).toBe('arrival');
    expect(sampleChapterFrame(setSceneTransition(authored, sceneId, undefined), 0, 'arrival').sceneId).toBe('arrival');
  });

  it('validates transitions on authoring and JSON import and preserves valid settings across scene edits', () => {
    const project = chapters(); const sceneId = project.scenes[0]!.id;
    for (const transition of [{ kind: 'fade' as const, durationMs: 0 }, { kind: 'fade' as const, durationMs: 1001 }, { kind: 'fade' as const, durationMs: 0.5 }, { kind: 'cut' as const, durationMs: 1 }, { kind: 'invalid' as 'fade', durationMs: 500 }]) {
      expect(() => setSceneTransition(project, sceneId, transition)).toThrow(/transition/i);
    }
    expect(() => setSceneTransition(project, 'arrival', { kind: 'fade', durationMs: 500 })).toThrow(/next|transition/i);
    const authored = setSceneTransition(project, sceneId, { kind: 'fade', durationMs: 500 });
    const imported = importTacticalProjectJson(exportTacticalProjectJson(authored), 'chapters.json');
    expect(imported.scenes[0]!.transition).toEqual({ kind: 'fade', durationMs: 500 });
    const invalid = JSON.parse(exportTacticalProjectJson(authored)) as { scenes: Array<{ transition?: unknown }> };
    invalid.scenes[0]!.transition = { kind: 'fade', durationMs: 'bad' };
    expect(() => importTacticalProjectJson(JSON.stringify(invalid), 'bad.json')).toThrow(/transition/i);
    const split = splitTacticalScene(authored, sceneId, { rightId: 'middle', rightName: 'Middle', splitMs: 600 });
    expect(split.scenes.find(scene => scene.id === sceneId)?.transition).toBeUndefined();
    expect(split.scenes.find(scene => scene.id === 'middle')?.transition).toEqual({ kind: 'fade', durationMs: 400 });
    expect(validateTacticalProject(split)).toEqual([]);
    expect(validateTacticalProject(reorderTacticalScene(authored, sceneId, 1))).toEqual([]);
    expect(joinTacticalScenes(authored, sceneId, 'arrival').scenes[0]!.transition).toBeUndefined();
    expect(() => cloneTacticalScene(authored, sceneId, { id: 'overlap', name: 'Overlap', startMs: 500, durationMs: 500 })).toThrow(/transition/i);
  });

  it('renders chapter fade opacity in vector PDF contact sheets', async () => {
    const project = chapters();
    const authored = setSceneTransition(project, project.scenes[0]!.id, { kind: 'fade', durationMs: 500 });
    const zip = await JSZip.loadAsync(await renderCoachingPdfPackage(authored, project.scenes[0]!.id, { contactFrames: 9 }));
    const pdf = await PDFDocument.load(await zip.file('coaching.pdf')!.async('uint8array'));
    const opacities = pdf.getPages().flatMap(page => {
      const states = page.node.Resources()?.lookup(PDFName.of('ExtGState'), PDFDict);
      return states ? states.entries().flatMap(([, reference]) => {
        const value = pdf.context.lookup(reference, PDFDict).lookupMaybe(PDFName.of('ca'), PDFNumber);
        return value ? [value.asNumber()] : [];
      }) : [];
    });
    expect(opacities).toContain(0);
    expect(opacities).toContain(1);
  });

  it('freezes temporal presentation marks consistently in chapter preview and export', () => {
    const project = chapters(); const scene = project.scenes[0]!;
    project.annotations.push({ id: 'timed-cue', kind: 'presentation-label', sceneId: scene.id, layerId: scene.layers[0]!.id, label: 'Frozen cue', points: [{ x: 0.5, y: 0.5 }], startMs: 0, endMs: 550 });
    const authored = setSceneTransition(project, scene.id, { kind: 'fade', durationMs: 500 });
    expect(sampleChapterFrame(authored, 625, scene.id).project.annotations.find(annotation => annotation.id === 'timed-cue')?.visible).toBe(true);
    expect(buildExportFrames(authored, scene.id, options).find(frame => frame.timeMs === 625)?.svg).toContain('Frozen cue');
  });

  it('keeps later implicit chapter cuts in bounded timed exports', () => {
    const project = chapters(); project.timeline.durationMs = 3000;
    const extended = cloneTacticalScene(project, 'arrival', { id: 'third', name: 'Third', startMs: 2000, durationMs: 1000 });
    const authored = setSceneTransition(extended, project.scenes[0]!.id, { kind: 'fade', durationMs: 500 });
    const times = buildExportFrames(authored, project.scenes[0]!.id, options).map(frame => frame.timeMs);
    expect(times).toContain(1999); expect(times).toContain(2000);
    expect(times.length).toBeLessThanOrEqual(options.maxFrames);
    expect(sampleChapterFrame(authored, 2000, 'arrival').sceneId).toBe('third');
  });

  it('embeds the PDF page font when a later drawn chapter contains Unicode labels', async () => {
    const project = chapters(); const arrival = project.scenes.find(scene => scene.id === 'arrival')!;
    project.annotations.push({ id: 'arrival-label', kind: 'label', sceneId: arrival.id, layerId: arrival.layers[0]!.id, label: 'Αφιξη', points: [{ x: 0.5, y: 0.5 }], visible: true });
    const authored = setSceneTransition(project, project.scenes[0]!.id, { kind: 'cut', durationMs: 0 });
    const zip = await JSZip.loadAsync(await renderCoachingPdfPackage(authored, project.scenes[0]!.id, { contactFrames: 3 }));
    const pdf = await PDFDocument.load(await zip.file('coaching.pdf')!.async('uint8array'));
    const names = pdf.getPages().flatMap(page => {
      const fonts = page.node.Resources()?.lookup(PDFName.of('Font'), PDFDict);
      return fonts ? fonts.entries().map(([, reference]) => pdf.context.lookup(reference, PDFDict).lookupMaybe(PDFName.of('BaseFont'), PDFName)?.asString() ?? '') : [];
    });
    expect(names.join(' ')).toContain('NotoSans');
  });
});
