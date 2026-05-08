# Behavioral Specification: AppStartup

**Feature**: `app-startup`
**Phase**: 1a
**Revision**: 7 (FIND-019..026 解消。Q1=A: parseMarkdownToBlocks は Step 2 でのみ実行 (per-file 検証)、Step 3 は HydrateNote 経由で再パースする二重実行モデルを採用。Q2=A: parseMarkdownToBlocks は deterministic positional BlockId (`block-0`..`block-N-1`) を使う pure function（PROP-025 は plain deepEquals）。Q3=A: HydrationFailureReason 'unknown' は防御的フォールバックとして REQ-018 で文書化。Q4=A: parseMarkdownToBlocks の Ok([]) は reason='block-parse' に折り畳む。Note aggregate invariant 6（最低 1 ブロック）と整合。)
**Source of truth**: `docs/domain/workflows.md` Workflow 1, `docs/domain/aggregates.md`, `docs/domain/aggregates.md §1.6`, `docs/domain/domain-events.md`, `docs/domain/glossary.md`, `docs/domain/code/ts/src/shared/snapshots.ts`, `docs/domain/code/ts/src/shared/blocks.ts`, `docs/domain/code/ts/src/curate/ports.ts`
**Scope**: Initialization-only. Workflow terminates after the 4-step pipeline completes or returns an error. ConfigureVault flow and UI reaction to errors are out of scope.

---

## 改訂履歴 / Revision Log

| 日付 | 反復 | 対象 finding | 概要 |
|------|------|-------------|------|
| 2026-04-30 | 2 | FIND-003, FIND-010 | FIND-003: REQ-015にオーケストレーター間ステップClock.now呼び出しの明示的許可を追記（Option A採択）; FIND-010: REQ-004のACにErr(disk-full\|lock\|unknown)→path-not-found折り畳みの明示的根拠を追記 |
| 2026-04-30 | 3 | FIND-014 | Iteration 3: REQ-010 NOTE clarifies that the Note aggregate is constructed for invariant + event-emission semantics, not retention (resolves FIND-014). |
| 2026-05-08 | block-migration | — | 型契約のブロックベース移行に伴い、Step 2 の per-file Hydration が parseMarkdownToBlocks(snapshot.body) を呼ぶことを明示。`block-parse` を HydrationFailureReason の有効値として追加。新 REQ-017 を追加。 |
| 2026-05-08 | spec-rev7 | FIND-019..026 | Phase 1c iteration-5 FAIL fix — FIND-019..026 解消。Q1=A: parseMarkdownToBlocks は Step 2 でのみ実行 (per-file 検証)、Step 3 は HydrateNote 経由で再パースする二重実行モデルを採用。Q2=A: parseMarkdownToBlocks は deterministic positional BlockId (`block-0`..`block-N-1`) を使う pure function（PROP-025 は plain deepEquals）。Q3=A: HydrationFailureReason 'unknown' は防御的フォールバックとして REQ-018 で文書化。Q4=A: parseMarkdownToBlocks の Ok([]) は reason='block-parse' に折り畳む。Note aggregate invariant 6（最低 1 ブロック）と整合。 |

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
- `FileSystem.statDir` returns `Err(FsError{kind:'disk-full'|'lock'|'unknown'})`: maps to `PathNotFound` (collapsed) — see REQ-004 F-005 amendment.

**`FileSystem.statDir` outcome contract** (F-005, amended by FIND-010):
`statDir` returns `Result<boolean, FsError>` with the following distinct outcomes:
- `Ok(true)`: path exists and is a readable directory — workflow proceeds.
- `Ok(false)`: path exists but is not a directory (e.g., it is a file) — maps to `PathNotFound`.
- `Err(FsError{kind:'not-found'})`: path does not exist at all — maps to `PathNotFound`.
- `Err(FsError{kind:'permission'})`: insufficient OS permissions — maps to `PermissionDenied`.
- `Err(FsError{kind:'disk-full'|'lock'|'unknown'})`: transient or indeterminate OS errors — maps to `PathNotFound` (collapsed; user remediation is identical to not-found — see REQ-004 rationale table).
Both `Ok(false)` and `Err(not-found)` are treated as `PathNotFound` because AppStartup requires a readable directory; the distinction between "exists-as-file" and "absent" is not actionable at this level. The `disk-full`, `lock`, and `unknown` FsError kinds are also collapsed to `path-not-found` per the same principle: no distinct user-visible recovery path exists at startup.

**Acceptance Criteria**:
- Given `Settings.load()` returns a non-null VaultPath and `statDir` returns `Ok(true)`, the workflow advances to `scanVault`.
- The produced `ConfiguredVault` value carries the verified `VaultPath`.
- **`VaultDirectoryConfigured` is NOT emitted on the happy-path Step 1 transition.** This event is the exclusive responsibility of `ConfigureVault` (Workflow 9) and is only emitted when the user explicitly sets a vault path. AppStartup's normal path — where an existing, valid configuration is found — never emits this event. (Source: `workflows.md` Step 1 callout; `domain-events.md §VaultDirectoryConfigured`.)
- No domain event of any kind is emitted during a successful Step 1.

---

### REQ-002: Happy Path — Step 2 scans vault and accumulates per-file results

**EARS**: WHEN a `ConfiguredVault` is available THEN the system SHALL call `FileSystem.listMarkdown(path)` to enumerate all `.md` files, attempt to read each file with `FileSystem.readFile`, attempt to parse each successfully-read file with `FrontmatterParser.parse`, and produce a `ScannedVault` containing `NoteFileSnapshot[]` and `corruptedFiles: CorruptedFile[]`.

**Per-file operation order in Step 2** (FIND-021/FIND-023 resolution — Q1=A):

Within Step 2's per-file loop, the order of operations is: `FileSystem.readFile(filePath)` (effectful) → `FrontmatterParser.parse(raw)` (pure) → conceptually-construct a `NoteFileSnapshot` value with the parsed `Frontmatter` and the residual `Body` (Markdown string) → `parseMarkdownToBlocks(snapshot.body)` (pure, **deterministic positional BlockId**) as a structural-validation step. Failures from any of the four sub-steps fold into the `CorruptedFile.failure` discriminated union per the table below. `HydrateNote` (the Curate Context ACL function) is NOT invoked during Step 2 — it is invoked later in Step 3 to materialize `Note` aggregates from validated snapshots.

**Per-file failure model** (source: `workflows.md` Step 2 error column; `snapshots.ts`; `curate/ports.ts`):

Each `CorruptedFile` carries `{ filePath: string, failure: ScanFileFailure, detail?: string }` where `ScanFileFailure` is a discriminated union:

```typescript
type ScanFileFailure =
  | { kind: 'read';    fsError: FsError }                   // readFile OS failure
  | { kind: 'hydrate'; reason: HydrationFailureReason }     // parse / VO conversion / block-parse failure
```

- A `readFile` OS failure (permission, lock, not-found, disk-full, unknown) produces `failure: { kind: 'read', fsError: { kind: '...' } }`.
- A parse, VO conversion, or block-parse failure produces `failure: { kind: 'hydrate', reason: HydrationFailureReason }`. The `hydrate` failure path covers three distinct failure points:
  1. `FrontmatterParser.parse` failures (`yaml-parse` / `missing-field` / `invalid-value`).
  2. snapshot→VO conversion failures (`invalid-value`).
  3. `parseMarkdownToBlocks(snapshot.body)` failures (`block-parse`) — see REQ-017. `parseMarkdownToBlocks` is called directly within Step 2's per-file loop (NOT via `HydrateNote`). Any `Result.Err` or `Ok([])` from `parseMarkdownToBlocks` propagates as `HydrationFailureReason 'block-parse'` (source: `shared/blocks.ts BlockParseError`; `aggregates.md §1.5` invariant 6).
- The `CorruptedFile.failure` field (not `reason`) carries the `ScanFileFailure` value.
- `HydrationFailureReason` exhaustive producer mapping: `'yaml-parse' | 'missing-field' | 'invalid-value'` come from `FrontmatterParser.parse` / VO conversion; `'block-parse'` comes from `parseMarkdownToBlocks` failure (including `Ok([])`) — see REQ-017; `'unknown'` is the defensive fallback per REQ-018.

**Edge Cases**:
- Empty vault (0 `.md` files): `listMarkdown` returns `[]`; `ScannedVault.snapshots = []`, `corruptedFiles = []`. Workflow continues to Step 3.
- `listMarkdown` fails with `list-failed`: Step 2 terminates the workflow — see REQ-007.
- One of N files has permission denied during `readFile`: that file accumulates a `CorruptedFile` with `failure: { kind: 'read', fsError: { kind: 'permission' } }`; remaining files are processed normally. See REQ-016.
- One of N files fails `readFile` with lock/not-found/unknown: that file accumulates a `CorruptedFile` with `failure: { kind: 'read', fsError: { kind: 'lock' | 'not-found' | 'unknown' } }`.
- Individual `FrontmatterParser.parse` fails with `'yaml-parse'`: file accumulates `failure: { kind: 'hydrate', reason: 'yaml-parse' }`.
- Individual `FrontmatterParser.parse` fails with `'missing-field'`: file accumulates `failure: { kind: 'hydrate', reason: 'missing-field' }`.
- Individual `FrontmatterParser.parse` fails with `'invalid-value'` (e.g., Tag VO Smart Constructor rejection): file accumulates `failure: { kind: 'hydrate', reason: 'invalid-value' }`.
- Zero-byte `.md` file: `readFile` succeeds (returns empty string); `FrontmatterParser.parse` receives `""` and cannot find the required frontmatter fields (`tags`, `createdAt`, `updatedAt`); file accumulates `failure: { kind: 'hydrate', reason: 'missing-field' }`. (The dominant path is a parse failure, not a read failure. Source: `aggregates.md §1 Frontmatter` — `tags`, `createdAt`, `updatedAt` are required fields.)
- Individual `parseMarkdownToBlocks(snapshot.body)` fails (e.g., unterminated code fence at EOF, malformed structure not recoverable by paragraph fallback): file accumulates `failure: { kind: 'hydrate', reason: 'block-parse' }`. (Source: `shared/blocks.ts BlockParseError`; `aggregates.md §1.6`.)
- Every file in the vault is corrupted: `ScannedVault.snapshots = []`, `corruptedFiles.length === total .md file count`. Workflow continues — see REQ-009.

**Acceptance Criteria**:
- `ScannedVault.snapshots` contains only files where `FrontmatterParser.parse` succeeded, all VO invariants were satisfied, and `parseMarkdownToBlocks` returned `Ok` with at least one block.
- `ScannedVault.corruptedFiles` contains one `CorruptedFile` per failed file, with `filePath`, `failure: ScanFileFailure`, and optional `detail`.
- Total files = `snapshots.length + corruptedFiles.length` (no file is silently dropped).
- `ScanFileFailure` is a discriminated union with exactly two variants: `{kind:'read', fsError: FsError}` and `{kind:'hydrate', reason: HydrationFailureReason}` (source: `snapshots.ts`, `snapshots.rs`).
- `HydrationFailureReason` is exhaustively typed as `'yaml-parse' | 'missing-field' | 'invalid-value' | 'block-parse' | 'unknown'` (source: `glossary.md §3`, `shared/snapshots.ts`).
- `FsError.kind` is exhaustively typed as `'permission' | 'disk-full' | 'lock' | 'not-found' | 'unknown'` (source: `workflows.md §エラーカタログ統合`).
- The workflow does NOT fail on per-file errors; only `list-failed` from `listMarkdown` terminates the workflow.
- `ScannedVault.snapshots[i]` is a `NoteFileSnapshot` (NOT a `Note` aggregate). The validated `Block[]` produced during Step 2 is discarded; Step 3 will re-parse the body via `HydrateNote`.

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

**EARS**: WHEN `Settings.load()` returns a non-null `VaultPath` AND `FileSystem.statDir(path)` returns `Ok(false)`, `Err(FsError{kind:'not-found'})`, or `Err(FsError{kind:'disk-full'|'lock'|'unknown'})` THEN the system SHALL terminate with `AppStartupError { kind: 'config', reason: { kind: 'path-not-found', path: string } }`.

**`statDir` → reason mapping** (F-005 amendment for FIND-010):

| `statDir` result | reason | rationale |
|---|---|---|
| `Ok(true)` | — (success, proceed) | path exists and is a readable directory |
| `Ok(false)` | `path-not-found` | path exists but is not a directory; cannot be used as vault |
| `Err({ kind: 'not-found' })` | `path-not-found` | path does not exist at all |
| `Err({ kind: 'permission' })` | `permission-denied` | OS permission failure; see REQ-005 |
| `Err({ kind: 'disk-full' \| 'lock' \| 'unknown' })` | `path-not-found` | collapsed: the user-visible remediation ("configure a valid vault path") is identical across these variants; distinguishing them in AppStartup error UX would provide no additional guidance. A `permission-denied` error, by contrast, requires a distinct OS-level remediation (chmod/chown), which justifies its separate variant. |

**Rejected alternative (FIND-010)**: introduce a third reason `unavailable` for `Err(disk-full|lock|unknown)`. Rejected because: (1) it would require a new error variant type, (2) the AppStartup UI has no separate recovery path for transient fs errors at startup, and (3) it would create downstream churn in Phase 2a/2b tests without user-observable benefit.

**Acceptance Criteria**:
- `AppStartupError.reason.path` contains the configured path string.
- `statDir` returning `Ok(false)` produces `reason: { kind: 'path-not-found' }` (not `permission-denied`).
- `statDir` returning `Err({ kind: 'not-found' })` produces `reason: { kind: 'path-not-found' }`.
- `statDir` returning `Err({ kind: 'disk-full' })` produces `reason: { kind: 'path-not-found' }` (collapsed — see table above).
- `statDir` returning `Err({ kind: 'lock' })` produces `reason: { kind: 'path-not-found' }` (collapsed — see table above).
- `statDir` returning `Err({ kind: 'unknown' })` produces `reason: { kind: 'path-not-found' }` (collapsed — see table above).
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
- `hydrateFeed` MUST NOT receive a `BlockIdAllocator`, `Clock`, or any side-effecting port; the only sub-call it makes is `HydrateNote` (pure).
- `Feed.noteRefs` contains exactly the NoteIds from `ScannedVault.snapshots` that were successfully hydrated.
- `corruptedFiles` from `ScannedVault` is passed through to `HydratedFeed` unchanged.
- `TagInventory` is built from the hydrated `Note` snapshots via `TagInventory.buildFromNotes`.
- Feed sort order is `updatedAt` descending (source: `aggregates.md §2 Feed`).
- The function is referentially transparent: same `ScannedVault` input always produces the same `HydratedFeed` output.
- Step 3 receives a `ScannedVault` whose `snapshots: NoteFileSnapshot[]` are read- and structurally-validated (each `body` is known to parse via `parseMarkdownToBlocks` because Step 2 already executed it as a validation step). `hydrateFeed` calls `HydrateNote(snapshot)` for each snapshot to materialize a `Note` aggregate; because `HydrateNote` is pure, this preserves Step 3's purity. The double `parseMarkdownToBlocks` call (Step 2 validation + Step 3 hydration) is the deliberate cost of keeping `ScannedVault` shape unchanged in the Shared Kernel; both calls are deterministic and produce equal `Block[]` per Q2.
- If a snapshot's `HydrateNote` call returns `Err(HydrationFailureReason)` during Step 3 (e.g., due to a downstream code change that diverged from Step 2), the workflow MUST treat this as a programming-error invariant violation. (Step 2's pre-validation makes this branch unreachable in normal operation.)

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

**NOTE — Note aggregate retention semantics (resolves FIND-014, Option A)**:

The `Note` aggregate constructed by `noteCreate(noteId, now)` (the Step 4 port call) serves two purposes at the moment of allocation:

1. **Invariant enforcement**: `Note.create` validates that `Body` is empty, that `createdAt === updatedAt === now`, and that the frontmatter shape is valid per `aggregates.md §1 Note.create`. These invariants are enforced by the aggregate constructor itself; the constructed value is the proof that construction succeeded.
2. **Event-emission semantics**: the call site's contract is satisfied by the act of construction — `NewNoteAutoCreated` signals that a valid Note has been allocated at `noteId`. The event payload carries `{ noteId, occurredOn }` only, matching the canonical type contract in `docs/domain/code/ts/src/capture/internal-events.ts` lines 24–28: `NewNoteAutoCreated = { kind, noteId, occurredOn }`.

The `Note` aggregate is **not retained** by Step 4 after construction. It is not attached to `EditingSessionState`, not included in the `NewNoteAutoCreated` payload, and not passed to any persistence step within the AppStartup pipeline. Downstream consumers (the editor UI, any future persistence step) address the new note exclusively via `NoteId`; `editingSessionState.editing(newNoteId)` carries the only downstream handle.

Attaching the full `Note` aggregate to `NewNoteAutoCreated.payload` (Option B) would require a backwards-incompatible change to `docs/domain/code/ts/src/capture/internal-events.ts`, which is the pinned type-contract source of truth. Option B is rejected.

**Acceptance Criteria**:
- `EditingSessionState.status === 'editing'`.
- `EditingSessionState.currentNoteId` equals the `NoteId` returned by `Vault.allocateNoteId`.
- The new `Note.body` is empty string at the time of construction (source: `aggregates.md §1 Note.create`). This is a property of the Note value returned by the `noteCreate` port call — it is an invariant enforced at allocation time, not a property of any persisted aggregate.
- `Note.frontmatter.createdAt === Note.frontmatter.updatedAt === now`. This is a property of the Note value returned by `noteCreate` at construction time; the aggregate is subsequently discarded.
- The `Note` aggregate constructed by `noteCreate` is **not retained** beyond Step 4; downstream code receives only `NoteId` via `editingSessionState`. No downstream caller within AppStartup holds a reference to the constructed `Note`.
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

**EARS**: WHEN the AppStartup pipeline executes THEN the system SHALL perform I/O only in: Step 1 (`Settings.load`, `FileSystem.statDir`), Step 2 (`FileSystem.listMarkdown`, `FileSystem.readFile`), the inter-step orchestration phase between Step 2 and Step 3 (`Clock.now` — exactly once, for event timestamps), and Step 4 (`Clock.now`, `Vault.allocateNoteId` effectful Vault-state read). Step 3 (`hydrateFeed`) itself SHALL perform zero I/O and receive the timestamp as an argument from the orchestrator.

**Clock.now call-site budget** (FIND-003 resolution — Option A adopted):

The pipeline orchestrator MAY call `Clock.now()` exactly once after Step 2 completes and before Step 3 (`hydrateFeed`) begins. The resulting `Timestamp` is:
- Shared across the three inter-step domain events: `VaultScanned`, `FeedRestored`, `TagInventoryBuilt`.
- NOT passed into `hydrateFeed` (Step 3 remains a pure function over `ScannedVault` only).
- Distinct from the `Clock.now()` call inside Step 4, which obtains a fresh timestamp for `EditingSessionState.now` and `Note.frontmatter.createdAt/updatedAt`.

**Rejected alternatives (FIND-003)**:
- Option B (lift timestamp to Step 1): rejected because Step 1 produces `ConfiguredVault` — threading a timestamp through all intermediate stages would add unnecessary coupling with no functional benefit.
- Option C (drop `occurredOn` from Step 3 events): rejected because `occurredOn` is part of the canonical `VaultScanned` / `FeedRestored` / `TagInventoryBuilt` event contracts in `domain-events.md`; removing it would require a domain-model change.

**Total `Clock.now` call budget per pipeline run**: exactly two calls maximum —
- Call 1: between Step 2 and Step 3 (inter-step orchestration, for `VaultScanned.occurredOn`, `FeedRestored.occurredOn`, `TagInventoryBuilt.occurredOn`).
- Call 2: inside Step 4 `initializeCaptureSession` (for `Note.createdAt/updatedAt` and `EditingSessionState`).

**Acceptance Criteria** (F-004: split into two distinct ACs, amended for FIND-003):
- AC-1 (purity): `hydrateFeed` (Step 3) has no port dependencies and is a pure function — no side effects, no I/O, deterministic given its input (source: `workflows.md Step 3 依存: なし（純粋）`). This is the property-verifiable claim. `hydrateFeed` does NOT receive a timestamp argument and does NOT call `Clock.now`.
- AC-2 (sync vs async, deferred): The synchronous vs asynchronous execution model for port calls (`Settings.load`, `FileSystem.statDir`, etc.) is an implementation choice deferred to Phase 2b per the manifest. This AC is not property-testable at Phase 1b.
- AC-3 (Clock.now budget): `Clock.now()` is called at most twice per pipeline run — once in the orchestrator between Step 2 and Step 3 (inter-step, for event `occurredOn`), and once inside Step 4. Any implementation calling `Clock.now()` more than twice, or calling it inside Step 3, violates this requirement.
- AC-4 (Step 3 receives no timestamp): `hydrateFeed` accepts only `ScannedVault` as its parameter. The `occurredOn` timestamp used for `VaultScanned`, `FeedRestored`, and `TagInventoryBuilt` is captured in the orchestrator scope and passed to `emit()` calls — not into `hydrateFeed`.
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
- (Note: previously, readFile failures were mis-classified as `reason: 'unknown'` HydrationFailureReason — that classification is incorrect. Source: `snapshots.ts ScanFileFailure` docstring; `glossary.md §Hydration Failure`.) Cross-reference REQ-018 for the correct producer of `'unknown'` HydrationFailureReason.

---

### REQ-017: Step 2 — parseMarkdownToBlocks failure produces hydrate-kind ScanFileFailure with reason 'block-parse'

**EARS**: WHEN `parseMarkdownToBlocks(snapshot.body)` returns `Err(BlockParseError)` for an individual file during `scanVault` (called directly within Step 2's per-file loop, NOT via `HydrateNote`) THEN the system SHALL accumulate a `CorruptedFile` with `failure: { kind: 'hydrate', reason: 'block-parse' }` for that file AND continue processing remaining files in the vault.

**Edge Cases**:
- `BlockParseError { kind: 'unterminated-code-fence' }`: code fence opened but not closed before end of file; folds to `reason: 'block-parse'`. The `app-startup` error layer does not distinguish `unterminated-code-fence` from `malformed-structure`; both BlockParseError variants fold to `reason: 'block-parse'` at this layer (source: `shared/blocks.ts BlockParseError`).
- `BlockParseError { kind: 'malformed-structure' }`: structural breakage not recoverable by paragraph fallback; folds to `reason: 'block-parse'`.
- Per `aggregates.md §1.5`, "unknown blocks" are NOT BlockParseErrors — they are recovered by the paragraph fallback and parsing succeeds. Therefore `block-parse` only fires on structural breakage or empty-output, never on merely unrecognised block types.
- A file whose frontmatter parses fine but whose body is structurally broken reaches `parseMarkdownToBlocks` only after `FrontmatterParser.parse` has succeeded; the failure is `block-parse`, not `yaml-parse`.
- `parseMarkdownToBlocks(snapshot.body)` returns `Ok([])` (e.g., body containing only whitespace or only YAML-frontmatter delimiters): folds to `failure: { kind: 'hydrate', reason: 'block-parse' }`. Rationale: `aggregates.md §1.5` invariant 6 requires `blocks: Block[]` with length ≥ 1; an empty result cannot become a valid `Note` aggregate. Rejected alternatives: (1) classify as `'invalid-value'` — rejected because the failure is an aggregate-shape problem, not a VO-validation problem; (2) auto-pad to a single empty paragraph in `parseMarkdownToBlocks` — rejected because that would mask user-data issues and silently change file semantics.

**Acceptance Criteria**:
- `CorruptedFile.failure.kind === 'hydrate'` and `CorruptedFile.failure.reason === 'block-parse'` for all `parseMarkdownToBlocks` failures.
- The remaining files in the vault are not affected; the workflow continues to Step 3 with those files that parsed successfully.
- This is distinct from `'yaml-parse' | 'missing-field' | 'invalid-value'`: a file whose frontmatter parses fine but whose body is structurally broken yields `'block-parse'`, not `'yaml-parse'`.
- `'block-parse'` is a member of the `HydrationFailureReason` union (source: `shared/snapshots.ts`; `shared/blocks.ts`).
- `parseMarkdownToBlocks(snapshot.body)` returning `Ok([])` produces `CorruptedFile.failure.reason === 'block-parse'`.
- `parseMarkdownToBlocks` is deterministic: same Markdown input always produces the same `Block[]`, including BlockId values (`block-0`, `block-1`, ... in document order). PROP-025 is verifiable with plain `deepEquals` (no equivalence-modulo-BlockId predicate).
- `parseMarkdownToBlocks` is a pure function (no I/O); the only effectful step in per-file scan is `FileSystem.readFile`. The `parseMarkdownToBlocks` call within Step 2's per-file loop is a pure sub-computation colocated with the effectful loop, not a separate effectful step.

---

### REQ-018: HydrationFailureReason 'unknown' is a defensive fallback for non-categorisable hydration failures

**EARS**: WHEN per-file Hydration in Step 2 (`FrontmatterParser.parse`, snapshot-VO conversion, or `parseMarkdownToBlocks`) raises an exception or returns a `Result.Err` whose variant is not statically reachable (e.g., a future parser variant added after this REQ was written, or a runtime exception from the parser library), THEN the system SHALL accumulate a `CorruptedFile` with `failure: { kind: 'hydrate', reason: 'unknown' }` and `detail: <message>`, AND continue processing remaining files.

**Edge Cases**:
- `FrontmatterParser.parse` throws synchronously (library bug): the exception is caught, the file accumulates `failure: { kind: 'hydrate', reason: 'unknown', detail: <error.message> }`.
- `parseMarkdownToBlocks` throws (impossible per its pure contract, but defended): caught and folded to `'unknown'`.
- A future `HydrationFailureReason` variant added to `shared/snapshots.ts` without spec update: falls into the `'unknown'` path until the spec catches up.

**Acceptance Criteria**:
- `'unknown'` is NEVER produced by a `FileSystem.readFile` failure (REQ-016 NOTE — read failures use `failure: { kind: 'read', fsError: {...} }` instead).
- `'unknown'` is the only non-static `HydrationFailureReason`; the other four (`'yaml-parse'`, `'missing-field'`, `'invalid-value'`, `'block-parse'`) have specific REQ-defined producers.
- `CorruptedFile.detail` is set to a human-readable summary of the unexpected error.
- The total file count invariant (snapshots + corruptedFiles = total `.md` files) is preserved.
- Workflow continues to Step 3 unchanged.

---

## Purity Boundary Candidates (Preview for Phase 1b)

| Step | Classification | Rationale |
|------|---------------|-----------|
| Step 1: `loadVaultConfig` | Effectful read | Calls `Settings.load` and `FileSystem.statDir` |
| Step 2: `scanVault` | Effectful read | Calls `FileSystem.listMarkdown`, `FileSystem.readFile`; per-file sequence is `readFile (effectful) → FrontmatterParser.parse (pure) → parseMarkdownToBlocks (pure, deterministic positional BlockId, validation only — Block[] discarded)`. The pure `parseMarkdownToBlocks` and `FrontmatterParser.parse` calls are colocated within Step 2's effectful loop but are themselves pure. **`HydrateNote` is NOT called in Step 2.** |
| Step 2 (block-parse, pure): `parseMarkdownToBlocks` | Pure core | Markdown 文字列 → `Block[]` の決定的純粋関数。**deterministic positional BlockId allocation (`block-0..block-N-1`)** により referential transparency を満たす。`BlockIdSmartCtor.generate()` (UUID v4 path) は editor runtime 専用で、parseMarkdownToBlocks では使われない。`Err(BlockParseError)` または `Ok([])` のいずれも `reason='block-parse'` の `CorruptedFile` に折り畳む（呼び出し側 ACL の責務）。Step 2 内で呼ばれるが本体は副作用ゼロ。 |
| Inter-step (2→3): orchestrator `Clock.now()` | Effectful shell | `runAppStartupPipeline` calls `Clock.now()` exactly once after Step 2 to obtain `occurredOn` for `VaultScanned`, `FeedRestored`, `TagInventoryBuilt`. This is orchestration-layer I/O, NOT Step 3 I/O. REQ-015 explicitly permits it. |
| Step 3: `hydrateFeed` | Pure core | No ports; deterministic; referentially transparent. Receives `ScannedVault` only — no timestamp argument. Calls `HydrateNote` per snapshot to materialize `Note` aggregates. |
| Step 3 (ACL, pure): `HydrateNote` | Pure core | Pure core. `(NoteFileSnapshot) → Result<Note, HydrationFailureReason>` の純粋 ACL 関数。`parseMarkdownToBlocks` を呼んで Markdown → Block[] 変換し、`Note.fromSnapshot(snapshot, blocks)` で aggregate を再構成する（`FrontmatterParser.parse` は呼ばない — frontmatter は既に snapshot.frontmatter として VO 化済み）。Step 3 (`hydrateFeed`) 内で per-snapshot に呼ばれる。 |
| Step 4 (time) | `Clock.now()` | Effectful shell — second and final `Clock.now()` call per pipeline run; returns wall-clock time for `Note` and `EditingSessionState` |
| Step 4 (id-effectful) | `vault.allocateNoteId(now)` | Effectful — reads Vault Aggregate's internal NoteId set |
| Step 4 (id-pure) | `nextAvailableNoteId(preferred, existingIds)` | Pure core — collision-avoidance algorithm; deterministic given inputs; property-test target |
| Step 4 (compose) | `initializeCaptureSession` | Mixed — calls effectful `Clock.now()` and effectful `vault.allocateNoteId`; only the inner `nextAvailableNoteId` call is pure |

The pure core targets are `hydrateFeed`, `nextAvailableNoteId`, `parseMarkdownToBlocks`, and `HydrateNote`. The effectful steps are tested via integration tests with port fakes/stubs.
