import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { AcademyCase, AcademyLesson } from './regex-types';

export interface RegexCustomTrack { readonly id: string; readonly title: string; readonly lessons: readonly AcademyLesson[]; }
export interface RegexCustomTrackPackage { readonly schemaVersion: 1; readonly track: RegexCustomTrack; }

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
};
const boundedString = (value: unknown, label: string, max: number, allowEmpty = false) => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) throw new Error(`${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string up to ${max} characters.`);
  return value;
};
const slug = (value: unknown, label: string) => {
  const text = boundedString(value, label, 80);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(text)) throw new Error(`${label} must use lowercase letters, numbers, and hyphens.`);
  return text;
};
const parseCase = (value: unknown, index: number): AcademyCase => {
  const row = asRecord(value, `Case ${index + 1}`);
  if (typeof row.shouldMatch !== 'boolean') throw new Error(`Case ${index + 1} shouldMatch must be boolean.`);
  return { value: boundedString(row.value, `Case ${index + 1} value`, 2000, true), shouldMatch: row.shouldMatch, explanation: row.explanation === undefined ? undefined : boundedString(row.explanation, `Case ${index + 1} explanation`, 500, true) };
};
const parseLesson = (value: unknown, index: number): AcademyLesson => {
  const row = asRecord(value, `Lesson ${index + 1}`);
  if (!Array.isArray(row.cases) || row.cases.length < 1 || row.cases.length > 100) throw new Error(`Lesson ${index + 1} must include 1–100 cases.`);
  const flags = boundedString(row.flags, `Lesson ${index + 1} flags`, 16, true);
  if (!/^[dgimsuvxy]*$/.test(flags)) throw new Error(`Lesson ${index + 1} flags contain unsupported ECMAScript flags.`);
  return {
    id: slug(row.id, `Lesson ${index + 1} id`), title: boundedString(row.title, `Lesson ${index + 1} title`, 120),
    objective: boundedString(row.objective, `Lesson ${index + 1} objective`, 500), guide: boundedString(row.guide, `Lesson ${index + 1} guide`, 2000),
    starter: boundedString(row.starter, `Lesson ${index + 1} starter`, 5000, true), flags, hint: boundedString(row.hint, `Lesson ${index + 1} hint`, 500),
    cases: row.cases.map(parseCase),
  };
};

export const parseCustomTrackPackage = (text: string): RegexCustomTrackPackage => {
  if (text.length > 250_000) throw new Error('Custom track package exceeds the 250 KB local import limit.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('Custom track package must be valid JSON.'); }
  const root = asRecord(raw, 'Custom track package');
  if (root.schemaVersion !== 1) throw new Error('Unsupported custom track schema version.');
  const track = asRecord(root.track, 'Custom track');
  if (!Array.isArray(track.lessons) || track.lessons.length < 1 || track.lessons.length > 100) throw new Error('Custom track must include 1–100 lessons.');
  const lessons = track.lessons.map(parseLesson);
  const ids = lessons.map((lesson) => lesson.id);
  if (new Set(ids).size !== ids.length) throw new Error('Custom track contains duplicate lesson ids.');
  return { schemaVersion:1, track:{ id:slug(track.id, 'Track id'), title:boundedString(track.title, 'Track title', 120), lessons } };
};

export const serializeCustomTrackPackage = (value: RegexCustomTrackPackage) => JSON.stringify(value, null, 2);
export const encodeCustomTrackPackage = (value: RegexCustomTrackPackage) => compressToEncodedURIComponent(serializeCustomTrackPackage(value));
export const decodeCustomTrackPackage = (encoded: string) => {
  const text = decompressFromEncodedURIComponent(encoded);
  if (!text) throw new Error('Custom track share state is invalid.');
  return parseCustomTrackPackage(text);
};
