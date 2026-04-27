# Behavioral Specification: AppStartup

**Feature**: `app-startup`
**Phase**: 1a
**Revision**: 3 (phase-1c-iteration-1-FAIL: F-001 purity boundary, F-002 REQ-013 coverage, F-003 emitter partition, F-004 REQ-015 AC split, F-005 statDir contract clarification)
**Source of truth**: `docs/domain/workflows.md` Workflow 1, `docs/domain/aggregates.md`, `docs/domain/domain-events.md`, `docs/domain/glossary.md`, `docs/domain/code/ts/src/shared/snapshots.ts`
**Scope**: Initialization-only. Workflow terminates after the 4-step pipeline completes or returns an error. ConfigureVault flow and UI reaction to errors are out of scope.

---

## Pipeline Overview

```
RawAppLaunch → ConfiguredVault → ScannedVault → HydratedFeed → InitialUIState
```

Each intermediate type carries stronger guarantees than the previous. Errors terminate the pipeline immediately except per-file scan failures (Step 2), which are accumulated into `corruptedFiles[]` and never abort the workflow.

---

## Requirements

### REQ-001: Happy Path — Step 1 loads VaultPath and verifies directory existence

**EARS**: WHEN the application process starts AND `Settings.load()` returns a non-null `VaultPath` AND `FileSystem.statDir(path)` returns `Ok(true)` THEN the system SHALL produce a `ConfiguredVault` stage value and continue to Step 2.

**Edge Cases**:
- `Settings.load()` returns `null` (first run): maps to `Unconfigured` error — see REQ-003.
- `FileSystem.statDir` returns `Ok(false)` (path exists but is not a directory) or `Err(FsError{kind:'not-found'})` (path does not exist): both map to `PathNotFound` error — see REQ-004 and F-005 clarification below.
- `FileSystem.statDir` returns `Err(FsError{kind:'permission'})`: maps to `PermissionDenied` error — see REQ-005.

**`FileSystem.statDir` outcome contract** (F-005):
`statDir` returns `Result<boolean, FsError>` with three distinct outcomes:
- `Ok(true)`: path exists and is a readable directory — workflow proceeds.
- `Ok(false)`: path exists but is not a directory (e.g., it is a file) — maps to `PathNotFound`.
- `Err(FsError{kind:'not-found'})`: path does not exist at all — maps to `PathNotFound`.
- `Err(FsError{kind:'permission'})`: insufficient OS permissions — maps to `PermissionDenied`.
Both `Ok(false)` and `Err(not-found)` are treated as `PathNotFound` because AppStartup requires a readable directory; the distinction between "exists-as-file" and "absent" is not actionable at this level. The relevant AppStartup error variant `path-not-found` covers both cases.

**Acceptance Criteria**:
- Given `Settings.load()` returns a non-null VaultPath and `statDir` returns `Ok(true)`, the workflow advances to `scanVault`.
- The produced `ConfiguredVault` value carries the verified `VaultPath`.
- **`VaultDirectoryConfigured` is NOT emitted on the happy-path Step 1 transition.** This event is the exclusive responsibility of `ConfigureVault` (Workflow 9) and is only emitted when the user explicitly sets a vault path. AppStartup's normal path — where an existing, valid configuration is found — never emits this event. (Source: `workflows.md` Step 1 callout; `domain-events.md §VaultDirectoryConfigured`.)
- No domain event of any kind is emitted during a successful Step 1.

---

### REQ-002: Happy Path — Step 2 scans vault and accumulates per-file results

**EARS**: WHEN a `ConfiguredVault` is available THEN the system SHALL call `FileSystem.listMarkdown(path)` to enumerate all `.md` files, attempt to read each file with `FileSystem.readFile`, attempt to parse each successfully-read file with `FrontmatterParser.parse`, and produce a `ScannedVault` containing `NoteFileSnapshot[]` and `corruptedFiles: CorruptedFile[]`.

**Per-file failure model** (source: `workflows.md` Step 2 error column; `snapshots.ts`):

Each `CorruptedFile` carries `{ filePath: string, failure: ScanFileFailure, detail?: string }` where `ScanFileFailure` is a discriminated union:

```typescript
type ScanFileFailure =
  | { kind: 'read';    fsError: FsError }                   // readFile OS failure
  | { kind: 'hydrate'; reason: HydrationFailureReason }     // parse / VO conversion failure
```

- A `readFile` OS failure (permission, lock, not-found, disk-full, unknown) produces `failure: { kind: 'read', fsError: { kind: '...' } }`.
- A `FrontmatterParser.parse` failure or snapshot→Note VO conversion failure produces `failure: { kind: 'hydrate', reason: HydrationFailureReason }`.
- The `CorruptedFile.failure` field (not `reason`) carries the `ScanFileFailure` value.

**Edge Cases**:
- Empty vault (0 `.md` files): `listMarkdown` returns `[]`; `ScannedVault.snapshots = []`, `corruptedFiles = []`. Workflow continues to Step 3.
- `listMarkdown` fails with `list-failed`: Step 2 terminates the workflow — see REQ-007.
- One of N files has permission denied during `readFile`: that file accumulates a `CorruptedFile` with `failure: { kind: 'read', fsError: { kind: 'permission' } }`; remaining files are processed normally. See REQ-016.
- One of N files fails `readFile` with lock/not-found/unknown: that file accumulates a `CorruptedFile` with `failure: { kind: 'read', fsError: { kind: 'lock' | 'not-found' | 'unknown' } }`.
- Individual `FrontmatterParser.parse` fails with `'yaml-parse'`: file accumulates `failure: { kind: 'hydrate', reason: 'yaml-parse' }`.
- Individual `FrontmatterParser.parse` fails with `'missing-field'`: file accumulates `failure: { kind: 'hydrate', reason: 'missing-field' }`.
- Individual `FrontmatterParser.parse` fails with `'invalid-value'` (e.g., Tag VO Smart Constructor rejection): file accumulates `failure: { kind: 'hydrate', reason: 'invalid-value' }`.
- Zero-byte `.md` file: `readFile` succeeds (returns empty string); `FrontmatterParser.parse` receives `""` and cannot find the required frontmatter fields (`tags`, `createdAt`, `updatedAt`); file accumulates `failure: { kind: 'hydrate', reason: 'missing-field' }`. (The dominant path is a parse failure, not a read failure. Source: `aggregates.md §1 Frontmatter` — `tags`, `createdAt`, `updatedAt` are required fields.)
- Every file in the vault is corrupted: `ScannedVault.snapshots = []`, `corruptedFiles.length === total .md file count`. Workflow continues — see REQ-009.

**Acceptance Criteria**:
- `ScannedVault.snapshots` contains only files where `FrontmatterParser.parse` succeeded and all VO invariants were satisfied.
- `ScannedVault.corruptedFiles` contains one `CorruptedFile` per failed file, with `filePath`, `failure: ScanFileFailure`, and optional `detail`.
- Total files = `snapshots.length + corruptedFiles.length` (no file is silently dropped).
- `ScanFileFailure` is a discriminated union with exactly two variants: `{kind:'read', fsError: FsError}` and `{kind:'hydrate', reason: HydrationFailureReason}` (source: `snapshots.ts`, `snapshots.rs`).
- `HydrationFailureReason` is exhaustively typed as `'yaml-parse' | 'missing-field' | 'invalid-value' | 'unknown'` (source: `glossary.md §3`).
- `FsError.kind` is exhaustively typed as `'permission' | 'disk-full' | 'lock' | 'not-found' | 'unknown'` (source: `workflows.md §エラーカタログ統合`).
- The workflow does NOT fail on per-file errors; only `list-failed` from `listMarkdown` terminates the workflow.

---

### REQ-003: Step 1 Error — Unconfigured

**EARS**: WHEN `Settings.load()` returns `null` THEN the system SHALL terminate with `AppStartupError { kind: 'config', reason: { kind: 'unconfigured' } }` AND emit the `VaultDirectoryNotConfigured` public domain event.

**Acceptance Criteria**:
- `AppStartupError.kind === 'config'` and `AppStartupError.reason.kind === 'unconfigured'`.
- `VaultDirectoryNotConfigured { occurredOn: Timestamp }` is emitted exactly once.
- No further steps (2, 3, 4) are executed.
- `InitialUIState` is NOT produced.

---

### REQ-004: Step 1 Error — PathNotFound

**EARS**: WHEN `Settings.load()` returns a non-null `VaultPath` AND `FileSystem.statDir(path)` returns `Ok(false)` or `Err(FsError{kind:'not-found'})` THEN the system SHALL terminate with `AppStartupError { kind: 'config', reason: { kind: 'path-not-found', path: string } }`.

**Acceptance Criteria**:
- `AppStartupError.reason.path` contains the configured path string.
- No `VaultDirectoryNotConfigured` event is emitted (that event is reserved for the unconfigured case — source: `domain-events.md`).
- No further steps are executed.

---

### REQ-005: Step 1 Error — PermissionDenied

**EARS**: WHEN `Settings.load()` returns a non-null `VaultPath` AND `FileSystem.statDir(path)` returns `Err(FsError{kind:'permission'})` THEN the system SHALL terminate with `AppStartupError { kind: 'config', reason: { kind: 'permission-denied', path: string } }`.

**Acceptance Criteria**:
- `AppStartupError.reason.path` contains the configured path string.
- No further steps are executed.

---

### REQ-006: Step 1 — Settings.load null maps to Unconfigured

**EARS**: WHEN `Settings.load()` returns `null` THEN the system SHALL treat the result as `Unconfigured` (not as `PathNotFound`).

**Acceptance Criteria**:
- Null return from `Settings.load()` is the sole trigger for `{ kind: 'unconfigured' }`.
- `PathNotFound` is never produced from a null path; it requires a non-null path where `statDir` returns `Ok(false)` or `Err(not-found)`.

---

### REQ-007: Step 2 Error — list-failed

**EARS**: WHEN `FileSystem.listMarkdown(vaultPath)` fails THEN the system SHALL terminate with `AppStartupError { kind: 'scan', reason: { kind: 'list-failed', detail: string } }`.

**Acceptance Criteria**:
- `AppStartupError.kind === 'scan'` and `AppStartupError.reason.kind === 'list-failed'`.
- `detail` carries the underlying error message.
- Steps 3 and 4 are not executed.

---

### REQ-008: Step 3 — hydrateFeed is a pure function

**EARS**: WHEN a `ScannedVault` is available THEN the system SHALL execute `hydrateFeed` as a pure, deterministic function with no I/O, producing `HydratedFeed = { feed: Feed, tagInventory: TagInventory, corruptedFiles: CorruptedFile[] }`.

**Edge Cases**:
- Empty snapshots: produces `Feed` with empty `noteRefs`, `TagInventory` with empty `entries`, and `corruptedFiles` passed through unchanged.
- All-corrupted vault: as above (snapshots array is already empty; corruptedFiles is already populated from Step 2).

**Acceptance Criteria**:
- `hydrateFeed` takes only `ScannedVault` as input; it calls no ports (no `Settings`, `FileSystem`, `Clock`, `Vault.allocateNoteId`, `nextAvailableNoteId`).
- `Feed.noteRefs` contains exactly the NoteIds from `ScannedVault.snapshots` that were successfully hydrated.
- `corruptedFiles` from `ScannedVault` is passed through to `HydratedFeed` unchanged.
- `TagInventory` is built from the hydrated `Note` snapshots via `TagInventory.buildFromNotes`.
- Feed sort order is `updatedAt` descending (source: `aggregates.md §2 Feed`).
- The function is referentially transparent: same `ScannedVault` input always produces the same `HydratedFeed` output.

---

### REQ-009: Step 3 — Partial-failure vault succeeds

**EARS**: WHEN `ScannedVault.corruptedFiles` is non-empty THEN the system SHALL continue to Step 3 and Step 4, excluding corrupted files from `Feed` and `TagInventory`.

**Acceptance Criteria**:
- `Feed.noteRefs` does NOT contain NoteIds corresponding to any entry in `corruptedFiles`.
- `TagInventory` does NOT include tags from corrupted files.
- `InitialUIState.corruptedFiles` carries the full list for downstream warning UI.

---

### REQ-010: Step 4 — initializeCaptureSession creates new note and editing session

**EARS**: WHEN a `HydratedFeed` is available THEN the system SHALL call `Clock.now()` to obtain a `Timestamp`, call `Vault.allocateNoteId(now)` to obtain a collision-free `NoteId`, create a new `Note` via `Note.create(id, now)` with an empty `Body`, and transition `EditingSessionState` to `editing(newNoteId)`.

**Acceptance Criteria**:
- `EditingSessionState.status === 'editing'`.
- `EditingSessionState.currentNoteId` equals the `NoteId` returned by `Vault.allocateNoteId`.
- The new `Note.body` is empty string (source: `aggregates.md §1 Note.create`).
- `Note.frontmatter.createdAt === Note.frontmatter.updatedAt === now`.
- `InitialUIState` contains `feed`, `tagInventory`, `editingSessionState`, and `corruptedFiles`.

---

### REQ-011: Step 4 — NoteId uniqueness invariant

**EARS**: WHEN `Vault.allocateNoteId(now)` is called THEN it SHALL internally call the pure helper `nextAvailableNoteId(now, existingIds)` where `existingIds` is the set of NoteIds already present in the vault, and the helper SHALL append a `-N` suffix (N=1, 2, ...) until a unique NoteId is found.

**Two-layer allocation design** (source: `aggregates.md §1 衝突回避設計`, `docs/domain/code/rust/src/vault/ports.rs`):
- **Pure helper** `nextAvailableNoteId(preferred: Timestamp, existingIds: ReadonlySet<NoteId>): NoteId` — deterministic, no side effects, the uniqueness guarantee is in this function. This is the property-test target.
- **Effectful method** `vault.allocateNoteId(now: Timestamp): NoteId` — reads the Vault Aggregate's internal NoteId set, then delegates to `nextAvailableNoteId`. The only effectful sub-step is the Vault state read; the collision-avoidance algorithm itself is pure.

**Acceptance Criteria**:
- The `NoteId` returned by `Vault.allocateNoteId` is NOT present in `ScannedVault.snapshots[*].noteId`.
- Format: if `2026-04-27-153045-218` collides, `2026-04-27-153045-218-1` is tried next, then `-2`, etc. (source: `aggregates.md §1 NoteId`).
- `nextAvailableNoteId(preferred, existingIds)` is deterministic: calling it twice with the same arguments always returns the same `NoteId`.
- `Vault.allocateNoteId` is an in-memory calculation; it does NOT perform file I/O.

---

### REQ-012: Step 4 — Events emitted on success

**EARS**: WHEN `initializeCaptureSession` completes successfully THEN the system SHALL emit `NewNoteAutoCreated` and `EditorFocusedOnNewNote` internal application events.

**Acceptance Criteria**:
- `NewNoteAutoCreated` is emitted with the new `NoteId` (source: `domain-events.md` Capture Internal Events).
- `EditorFocusedOnNewNote` is emitted after `NewNoteAutoCreated`.
- Both are internal (Capture-scoped) events per `domain-events.md`.

---

### REQ-013a: Step 3 — Vault Context emits VaultScanned (public domain event)

**EARS**: WHEN `hydrateFeed` completes THEN the Vault Context SHALL emit `VaultScanned` as a public domain event.

**Acceptance Criteria**:
- `VaultScanned` is a public domain event (member of `PublicDomainEvent` union — source: `shared/events.ts`).
- `VaultScanned` payload: `{ vaultId: VaultId, snapshots: NoteFileSnapshot[], corruptedFiles: CorruptedFile[], occurredOn: Timestamp }` (source: `domain-events.md §VaultScanned`).
- `VaultScanned.corruptedFiles` uses the `CorruptedFile` type: `{ filePath, failure: ScanFileFailure, detail? }`.
- Emitter: **Vault Aggregate** (not Capture, not Curate).
- `VaultScanned` is emitted after `hydrateFeed` completes, not during it.

---

### REQ-013b: Step 3 — Curate Context emits FeedRestored and TagInventoryBuilt (internal events)

**EARS**: WHEN the Vault Context emits `VaultScanned` THEN the Curate Context SHALL emit `FeedRestored` and then `TagInventoryBuilt` as internal Curate events, in that order.

**Acceptance Criteria**:
- `FeedRestored` is a Curate-internal event — it does NOT cross the bounded-context boundary and is NOT part of the `PublicDomainEvent` union (source: `domain-events.md §Curate 内`; `shared/events.ts`).
- `TagInventoryBuilt` is a Curate-internal event — same boundary constraint as `FeedRestored`.
- Emitter for both: **Curate Context** (not Vault, not Capture).
- `FeedRestored` is emitted before `TagInventoryBuilt`.
- The ordering guarantee is: `VaultScanned` (Vault) → `FeedRestored` (Curate) → `TagInventoryBuilt` (Curate).

---

### REQ-014: Post-condition — InitialUIState shape

**EARS**: WHEN the full 4-step pipeline completes successfully THEN the system SHALL return `Result<InitialUIState, AppStartupError>` where `InitialUIState` contains `feed`, `tagInventory`, `editingSessionState`, and `corruptedFiles`.

**Acceptance Criteria**:
- `InitialUIState.feed` is a valid `Feed` aggregate (potentially with empty `noteRefs`).
- `InitialUIState.tagInventory` reflects all successfully hydrated notes.
- `InitialUIState.editingSessionState.status === 'editing'`.
- `InitialUIState.corruptedFiles` is a (possibly empty) `CorruptedFile[]`.

---

### REQ-015: Non-functional — No I/O outside designated steps

**EARS**: WHEN the AppStartup pipeline executes THEN the system SHALL perform I/O only in Step 1 (`Settings.load`, `FileSystem.statDir`), Step 2 (`FileSystem.listMarkdown`, `FileSystem.readFile`), and Step 4 (`Clock.now`, `Vault.allocateNoteId` effectful Vault-state read). Step 3 SHALL perform zero I/O.

**Acceptance Criteria** (F-004: split into two distinct ACs):
- AC-1 (purity): `hydrateFeed` (Step 3) has no port dependencies and is a pure function — no side effects, no I/O, deterministic given its input (source: `workflows.md Step 3 依存: なし（純粋）`). This is the property-verifiable claim.
- AC-2 (sync vs async, deferred): The synchronous vs asynchronous execution model for port calls (`Settings.load`, `FileSystem.statDir`, etc.) is an implementation choice deferred to Phase 2b per the manifest. This AC is not property-testable at Phase 1b.
- `nextAvailableNoteId` (the pure helper) has no side effects and no port dependencies; the Vault-state read is encapsulated in `vault.allocateNoteId` (effectful, Step 4 only).
- `FrontmatterParser.parse` is a pure function with no side effects (source: `workflows.md 依存（ポート）表 sync (pure)`). Purity is the verifiable property; sync/async is deferred to Phase 2b.

---

### REQ-016: Step 2 — Per-file readFile failure produces read-kind ScanFileFailure

**EARS**: WHEN `FileSystem.readFile(filePath)` fails for an individual file during `scanVault` THEN the system SHALL accumulate a `CorruptedFile` with `failure: { kind: 'read', fsError: FsError }` for that file AND continue processing the remaining files in the vault.

**Edge Cases**:
- Permission denied on one file: `failure: { kind: 'read', fsError: { kind: 'permission' } }`.
- File locked by another process: `failure: { kind: 'read', fsError: { kind: 'lock' } }`.
- File disappeared between `listMarkdown` and `readFile`: `failure: { kind: 'read', fsError: { kind: 'not-found' } }`.
- Unknown OS error: `failure: { kind: 'read', fsError: { kind: 'unknown', detail: string } }`.

**Acceptance Criteria**:
- `CorruptedFile.failure.kind === 'read'` for all OS-level `readFile` failures.
- `CorruptedFile.failure.fsError` carries the specific `FsError` variant.
- The remaining files in the vault are not affected; the workflow continues.
- This is distinct from `{kind:'hydrate'}` failures: read failures never reach the parser stage.
- (Note: previously, readFile failures were mis-classified as `reason: 'unknown'` HydrationFailureReason — that classification is incorrect. Source: `snapshots.ts ScanFileFailure` docstring; `glossary.md §Hydration Failure`.)

---

## Purity Boundary Candidates (Preview for Phase 1b)

| Step | Classification | Rationale |
|------|---------------|-----------|
| Step 1: `loadVaultConfig` | Effectful read | Calls `Settings.load` and `FileSystem.statDir` |
| Step 2: `scanVault` | Effectful read | Calls `FileSystem.listMarkdown`, `FileSystem.readFile`; `FrontmatterParser.parse` is pure but called within an effectful context |
| Step 3: `hydrateFeed` | Pure core | No ports; deterministic; referentially transparent |
| Step 4 (time) | `Clock.now()` | Effectful shell — returns wall-clock time; purity-violating |
| Step 4 (id-effectful) | `vault.allocateNoteId(now)` | Effectful — reads Vault Aggregate's internal NoteId set |
| Step 4 (id-pure) | `nextAvailableNoteId(preferred, existingIds)` | Pure core — collision-avoidance algorithm; deterministic given inputs; property-test target |
| Step 4 (compose) | `initializeCaptureSession` | Mixed — calls effectful `Clock.now()` and effectful `vault.allocateNoteId`; only the inner `nextAvailableNoteId` call is pure |

The pure core targets are `hydrateFeed` and `nextAvailableNoteId`. The effectful steps are tested via integration tests with port fakes/stubs.
