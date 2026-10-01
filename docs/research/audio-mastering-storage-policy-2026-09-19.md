# Audio Mastering durable project storage policy

**Research date:** 2026-09-19  
**Scope:** Local-first browser Audio Mastering Workstation; no account or server project store.  
**Decision target:** Wayfinder ticket “Choose the durable project source-media policy”.

## Decision

Use a **hybrid, user-controlled local persistence model**:

1. **Project document/autosave:** persist the small versioned project document and recovery metadata in IndexedDB.
2. **Source audio by default:** do **not** silently duplicate imported source audio. Store source identity/relink metadata and, where supported, a serializable file handle as a convenience only.
3. **Optional offline media cache:** offer an explicit “Keep source media available offline on this device” action that copies selected source media into OPFS. This is opt-in because audio can be large and consumes the origin’s quota.
4. **Persistence request:** after the user creates meaningful recoverable state (or enables offline media), check `navigator.storage.persisted()` and request `navigator.storage.persist()` with user-facing context. Do not promise that the request will be granted.
5. **Quota guard:** use `navigator.storage.estimate()` before large OPFS copies and handle `QuotaExceededError` deterministically.
6. **Portable backup remains authoritative:** provide an explicit versioned project backup/export. Browser-managed storage is a recovery convenience, not the only copy of user work.
7. **Relink must always exist:** reopening a project must support relinking missing source files even when a prior file handle was stored.

## Why this policy

### Browser storage is origin-scoped and starts best-effort

The WHATWG Storage Standard defines local storage buckets as initially **best-effort**. A bucket becomes persistent only when persistent-storage permission is granted. Persistent storage protects data from user-agent clearing policies, but the user or origin can still clear it.

Source: https://storage.spec.whatwg.org/ (Storage Standard, current living standard; last updated 2026-03-15).

### OPFS is appropriate for large local media, but not a portable source of truth

The Origin Private File System is private to the web origin, optimized for local file I/O, supports in-place access, and can be used from workers. It is still subject to the origin’s storage quota, and clearing site data deletes it. OPFS is therefore suitable for an optional offline source cache and recovery assets, not as the sole durable copy.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API

### Quota is implementation-dependent and must be measured, not assumed

The Storage Standard intentionally exposes estimates rather than a guaranteed fixed capacity. `navigator.storage.estimate()` reports approximate usage/quota. IndexedDB, Cache storage, and OPFS share browser-managed origin storage constraints. Writes beyond quota can fail with `QuotaExceededError`.

Sources:
- https://storage.spec.whatwg.org/
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

### Persistent storage is a request, not a guarantee

`navigator.storage.persist()` resolves to whether persistent storage was granted. The browser can deny the request according to its own policy, so recovery UX cannot depend on persistence being granted.

Sources:
- https://storage.spec.whatwg.org/
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persisted

### User-visible file handles are a convenience, not the cross-browser foundation

File-system handles can be serialized into IndexedDB, but picker methods such as `showOpenFilePicker()` and `showDirectoryPicker()` remain limited-availability rather than Baseline. Permissions on stored handles also need to be rechecked and may return `prompt`. A project therefore must not require a retained file handle to reopen successfully.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
- https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
- https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission

## Project storage shape

### IndexedDB

Persist:
- project schema version;
- document/revision state;
- tracks, clips, markers, regions, metadata edits and processing parameters;
- autosave/recovery index;
- source descriptors;
- optional serialized `FileSystemFileHandle` values when the browser supplies them;
- OPFS cache manifest and integrity metadata.

Do not persist raw decoded PCM here as the default project representation.

### OPFS

Persist only after explicit user choice or when a clearly disclosed bounded cache policy is later approved:
- original compressed/uncompressed source media copied byte-for-byte;
- derived cache artifacts that are expensive to rebuild, if they remain bounded and invalidatable;
- temporary crash-recovery render data where useful.

Do not treat OPFS filenames as user-visible filesystem paths.

### Portable project backup

The versioned backup format should contain:
- project document;
- schema version and migration metadata;
- source identities and integrity hints;
- optional embedded source media only when the user explicitly selects a self-contained backup mode.

A lightweight backup that does not embed source media must reopen into a deterministic **Needs relink** state instead of failing.

## Source identity and relink

Each imported source should receive a stable project `sourceId` and a descriptor sufficient to assist relinking without pretending to prove identity from a filename alone. Recommended descriptor fields:

- original filename;
- byte length;
- media type;
- duration/sample rate/channel count when known;
- last-modified timestamp when supplied by the File API;
- a content fingerprint/hash when practical and already computed for another product need.

On reopen:
1. try the optional retained file handle if supported and permission is still granted;
2. otherwise try the opt-in OPFS copy if present;
3. otherwise present a relink action;
4. validate the chosen replacement against the stored descriptor before accepting it.

## UX requirements

- Never silently copy a large source into OPFS.
- Show approximate local storage usage before/after enabling offline media when estimates are available.
- Clearly distinguish **Autosaved on this device** from **Portable backup saved by you**.
- Expose a way to remove offline media/cache without deleting the project document when technically possible.
- A denied persistence request is not an error; show the project as recoverable but potentially evictable and recommend a portable backup.
- If quota is insufficient, keep the project usable with reference/relink semantics rather than failing import.

## Consequences for the Phase 3 implementation

Task 5 should use:
- IndexedDB for the versioned document + recovery index;
- `navigator.storage.estimate/persisted/persist` for storage-state UX;
- OPFS behind an explicit optional source-media persistence control;
- schema validation/migration for all stored documents;
- manual project backup/restore independent of OPFS availability;
- a relink state machine as part of project restore.

This resolves the source-media persistence policy without requiring a server, user account, or non-local project database.
