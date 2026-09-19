# Audio Mastering project and preset schema migration contract

**Research date:** 2026-09-19  
**Scope:** Ledger 18 and 81, autosave/recovery, portable backups, presets, and future project compatibility.  
**Decision target:** Wayfinder ticket “Define project and preset schema migration contract”.

## Standards baseline

JSON Schema's current published specification is **Draft 2020-12**. It separates the core data-description model from the validation vocabulary and defines the current meta-schema at `https://json-schema.org/draft/2020-12/schema`.

IndexedDB's database version is an integer used to coordinate structural database upgrades such as object stores and indexes. Those upgrades occur in a `versionchange` transaction triggered by opening the database with a larger version.

Sources:
- https://json-schema.org/specification
- https://json-schema.org/draft/2020-12
- https://json-schema.org/draft/2020-12/json-schema-validation
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology
- https://developer.mozilla.org/en-US/docs/Web/API/IDBRequest/transaction

## Decision

Use **three independent version domains**:

1. **IndexedDB database version** — storage layout only.
2. **Project document schema version** — semantic shape of the Mastering project.
3. **Preset schema/algorithm version** — portable processor settings and their interpretation.

A change in one domain does not automatically increment the others.

This prevents an IndexedDB object-store migration from masquerading as a project-file migration and prevents an EQ/limiter parameter change from forcing a project format bump when an algorithm-local preset migration is sufficient.

## 1. IndexedDB database version

The IndexedDB version exists only to manage browser storage structure.

Examples that increment the IndexedDB version:
- adding/removing an object store;
- adding/removing an index;
- changing key-path strategy;
- splitting autosave records from cache manifests.

Examples that **do not** require an IndexedDB version bump:
- adding a new serializable project field handled by project migration;
- changing a processor preset format;
- changing a spectral algorithm version;
- changing a backup ZIP manifest while the database stores it as an opaque record.

The database's `onupgradeneeded` path must:
- be idempotent for the requested old→new structural path;
- use the upgrade transaction only for storage-layout work;
- handle `blocked` / `versionchange` scenarios caused by another open tab;
- never perform expensive audio/DSP migration work inside the schema upgrade transaction.

## 2. Project envelope

All serialized projects and autosaves use an explicit envelope, conceptually:

```ts
type MasteringProjectEnvelope = {
  format: 'inmotools-audio-project'
  formatVersion: 1
  schemaVersion: number
  projectId: string
  createdAt: string
  updatedAt: string
  appVersion?: string
  document: MasteringDocument
  sources: SourceDescriptor[]
}
```

### `format`

A stable magic identifier used to reject unrelated JSON before deeper parsing.

### `formatVersion`

Version of the outer interchange container/envelope.

Increment only when the envelope/backup framing itself becomes incompatible.

### `schemaVersion`

Version of the Mastering document semantics.

Increment when existing serialized project data would otherwise be ambiguous or invalid under the current application.

Examples:
- a field changes meaning;
- a field is split into multiple required concepts;
- timeline coordinates change units/ownership;
- track/clip/spectral operation structure changes incompatibly.

Do **not** bump merely because an optional field was added with a safe default and the reader can handle its absence without ambiguity.

### Algorithm versions

DSP operations that may change numerical behavior store their own `algorithmVersion`. A change to spectral-heal, resampling, limiter, pitch, or restoration math does not by itself redefine the entire project schema.

This allows an old project to preserve its intended processing semantics or be deliberately migrated at the processor level.

## 3. Parse → migrate → validate pipeline

Never cast imported JSON directly to `MasteringDocument`.

The restore path is:

1. read bytes/text under explicit size bounds;
2. parse as `unknown`;
3. validate the envelope discriminator and primitive bounds;
4. inspect `formatVersion` and `schemaVersion`;
5. reject unsupported **future** versions without modifying the file;
6. clone the parsed value;
7. apply pure sequential migrations one version at a time:
   - v1 → v2
   - v2 → v3
   - …
8. validate the resulting current document completely;
9. resolve/relink sources;
10. only then replace live project state or persist the migrated copy.

No migration mutates the user's original backup file.

A migration failure returns a diagnostic containing:
- source filename/backup identity;
- detected format/schema version;
- migration step that failed;
- safe recovery guidance.

Do not silently drop unknown fields from a future schema and then save the downgraded result.

## 4. Validation strategy

### Current implementation phase

Do **not** add Ajv/Zod or another runtime validation dependency solely for the initial small project schema.

The repo currently has no shared schema-validation stack. Start with:
- narrow type guards/runtime validators colocated with the project serialization module;
- explicit numeric bounds and finite-number checks;
- discriminated unions for edit/track/clip/operation variants;
- exhaustive switch handling;
- migration fixtures in tests.

This keeps the first persistence layer small and avoids creating a second validation architecture before there is evidence it is needed.

### Interchange schema

Maintain a JSON Schema **2020-12** document as the human/tool-readable interchange contract once the first portable backup format is implemented.

The JSON Schema artifact is documentation/interoperability evidence and can be validated in CI with a validator later if complexity justifies it.

If/when schema complexity makes hand-maintained validation error-prone, select one current stable runtime validator through the normal dependency research/pinning process rather than writing a general-purpose validator.

## 5. Autosave policy

Autosave stores the **current present project document**, not the runtime undo/redo `past` and `future` stacks.

Reason:
- history can multiply storage cost rapidly;
- redo branches are session interaction state, not canonical project content;
- source/audio caches are already separately reconstructable;
- restoring the latest committed present state satisfies crash recovery without serializing an entire editing session.

After reload:
- restore the current project document;
- initialize a fresh bounded runtime history with that restored document as `present`;
- `past=[]`, `future=[]`.

If a future product requirement explicitly adds persistent editing history, version that as a separate feature rather than silently expanding the autosave payload.

Autosave records include:
- project envelope;
- recovery timestamp;
- source availability state;
- optional OPFS manifest references;
- checksum/fingerprint for corruption detection where practical.

Do not include:
- decoded PCM;
- waveform peak pyramids;
- spectrogram tiles;
- complex STFT caches;
- transient meter logs unless explicitly exported;
- live AudioNodes/handles that are not serializable.

## 6. Recovery generations

Keep a small bounded set of recovery generations, not a single overwrite-only record.

Recommended initial policy:
- current autosave;
- previous known-good autosave;
- last explicit manual save/backup metadata where applicable.

Write a new recovery generation, validate/read it back sufficiently to confirm structure, then age out the oldest generation.

Never delete the last known-good recovery record before the replacement write succeeds.

The exact generation count may be tuned after storage profiling without a project-schema change because it is storage policy, not document semantics.

## 7. Portable backup types

Use two explicit user-facing backup modes.

### Lightweight project backup

Contains:
- project envelope/document;
- source descriptors/relink hints;
- metadata/artwork edits;
- presets used by the project;
- optional diagnostics manifest.

Does **not** duplicate source audio.

Restore result may legitimately enter **Needs relink** state.

### Self-contained project backup

Use the repo's existing exact-pinned `jszip@3.10.1`; do not add another ZIP library.

Suggested archive:

```
manifest.json
project.json
sources/
  <stable-source-id>.<ext>
artwork/
  ...
```

The manifest records:
- backup format/version;
- project schema version;
- file entries;
- byte sizes;
- content hashes when produced;
- source IDs;
- media roles.

Source filenames inside the archive derive from stable IDs, not untrusted original paths.

Restore must defend against malformed archives:
- reject absolute/traversal paths;
- cap total uncompressed size;
- cap individual entry size;
- cap entry count;
- reject duplicate/conflicting logical IDs;
- verify declared sizes/hashes where present before committing live state.

The archive is an interchange container; its `formatVersion` is separate from `project.schemaVersion`.

## 8. Preset contract

Presets are independently versioned:

```ts
type MasteringPresetEnvelope = {
  format: 'inmotools-audio-preset'
  formatVersion: 1
  schemaVersion: number
  processorKind: string
  algorithmVersion: string
  name: string
  parameters: Record<string, unknown>
}
```

Each processor owns:
- its parameter schema;
- safe numeric/enumerated bounds;
- migrations for old preset versions;
- compatibility rules for algorithm versions.

A project schema bump is not required merely because a compressor preset gains a new parameter with a deterministic default.

Unknown future preset versions:
- are rejected as unsupported;
- remain untouched;
- never silently discard unknown fields and resave.

A preset may be imported without importing a whole project.

## 9. Source/relink compatibility

The source policy already defines stable `sourceId` descriptors.

Project migration may transform descriptor structure but must not pretend filename equality proves source identity.

Restore order:
1. embedded self-contained source, when present and valid;
2. retained allowed local handle when supported;
3. opt-in OPFS source copy;
4. explicit relink.

Relinking is a runtime/source-resolution step after schema validation, not a project migration step.

## 10. Deterministic migrations

Each migration is:
- pure;
- synchronous unless an explicitly documented data lookup is unavoidable;
- version-to-version;
- tested independently;
- free of network access;
- free of UI state;
- free of source PCM/DSP work.

Example registry:

```ts
const PROJECT_MIGRATIONS = {
  1: migrateProjectV1ToV2,
  2: migrateProjectV2ToV3,
} satisfies Record<number, ProjectMigration>
```

A migration returns a new value and increments exactly one schema version.

Never write a single “best effort migrate anything to current” function whose behavior becomes impossible to audit.

## 11. Compatibility tests

For every historical project schema retained by the app:

1. valid historical fixture parses;
2. each individual migration step passes;
3. historical → current validates;
4. migrated current serializes and reloads;
5. current → current is stable and does not invoke migration;
6. future schema is rejected without mutation;
7. corrupt/oversized data is rejected before project replacement;
8. missing source becomes deterministic Needs relink, not schema failure;
9. autosave restore creates a fresh runtime history;
10. lightweight backup round-trips;
11. self-contained ZIP round-trips with source bytes intact;
12. malformed/traversal ZIP fixtures are rejected;
13. old presets migrate independently of project version;
14. unknown future preset versions are rejected without field loss.

Keep at least one golden fixture per released schema version permanently. Do not rewrite old fixtures to current form; they are evidence that migration still works.

## 12. Version retirement

Do not support infinite migration chains automatically.

When a very old schema is intentionally retired:
- document the oldest supported version;
- preserve a clear “unsupported old project” diagnostic;
- preferably provide a last compatible app/release path or documented conversion route;
- never import partially and then overwrite the original.

Retirement is a deliberate compatibility decision and must not happen as incidental refactoring.

## Consequences for Phase 3 and ledger 81

### Phase 3 Task 5

Implement:
- project envelope/version constants;
- current runtime validator;
- migration registry;
- IndexedDB version kept separately;
- autosave of current `present` document only;
- bounded recovery generations;
- lightweight JSON backup/restore;
- deterministic Needs relink handling.

### Ledger 81

Later add:
- self-contained ZIP backup using existing JSZip;
- processor preset envelopes/migrations;
- diagnostics export;
- schema/algorithm version reporting;
- keyboard-accessible backup/restore surface.

This research resolves the versioning/migration architecture only. It does **not** advance the current 13/81 implementation count.
