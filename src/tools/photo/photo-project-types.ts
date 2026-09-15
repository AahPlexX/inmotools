import type { PhotoHistory, PhotoRecipe, PhotoSnapshot } from './photo-types';

export const PHOTO_PROJECT_SCHEMA_VERSION = 1 as const;

export type PhotoProjectSourceStorage = 'indexeddb' | 'opfs';

export interface PhotoProjectSourceDescriptor {
  key: string;
  storage: PhotoProjectSourceStorage;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  width: number;
  height: number;
}

export interface PhotoProjectRecord {
  schemaVersion: typeof PHOTO_PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  source: PhotoProjectSourceDescriptor;
  history: PhotoHistory;
  snapshots: PhotoSnapshot[];
}

export interface PhotoProjectSourceInput {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  width: number;
  height: number;
}

export interface PhotoProjectSaveInput {
  id: string;
  name: string;
  createdAt: number;
  source: PhotoProjectSourceInput;
  sourceBlob?: Blob;
  history: PhotoHistory;
  snapshots: PhotoSnapshot[];
}

/** A durable, user-editable recipe which can be applied to any source image. */
export interface PhotoUserPresetRecord {
  schemaVersion: typeof PHOTO_PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  recipe: PhotoRecipe;
}

export interface PhotoUserPresetSaveInput {
  id: string;
  name: string;
  /** Used only when creating a preset; edits retain the original creation time. */
  createdAt?: number;
  recipe: PhotoRecipe;
}

export interface PhotoProjectVirtualCopyInput {
  id: string;
  name: string;
  /** Defaults to the store clock when omitted. */
  createdAt?: number;
}

export interface LoadedPhotoProject {
  project: PhotoProjectRecord;
  sourceFile: File;
}

export interface PhotoStorageStatus {
  indexedDbAvailable: boolean;
  opfsAvailable: boolean;
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}
