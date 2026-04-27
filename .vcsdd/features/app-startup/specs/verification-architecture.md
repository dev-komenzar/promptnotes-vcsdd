# Verification Architecture: AppStartup

**Feature**: `app-startup`
**Phase**: 1b
**Revision**: 3 (phase-1c-iteration-1-FAIL: F-001 purity boundary split + PROP-003 retarget + PROP-022 added, F-002 PROP-021 added + matrix fixed, F-003 emitter partition, F-004 REQ-015 AC split, F-005 statDir contract clarification)
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 1, `docs/domain/aggregates.md §1 衝突回避設計`, `docs/domain/code/ts/src/shared/snapshots.ts`, `docs/domain/code/rust/src/vault/ports.rs`

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `loadVaultConfig` | **Effectful shell** | Invokes `Settings.load()` and `FileSystem.statDir()` — both are external reads |
| Step 2 | `scanVault` | **Effectful shell** | Invokes `FileSystem.listMarkdown()` and `FileSystem.readFile()` per file; `FrontmatterParser.parse` is pure but called inside an effectful loop |
| Step 3 | `hydrateFeed` | **Pure core** | No port dependencies; deterministic; `ScannedVault` → `HydratedFeed` is referentially transparent |
| Step 4 (time) | `Clock.now()` | **Effectful shell** | Returns wall-clock time; purity-violating |
| Step 4 (id-effectful) | `vault.allocateNoteId(now)` | **Effectful shell** | Reads Vault Aggregate's internal NoteId set — that read is an effect. Delegates collision-avoidance to the pure helper. |
| Step 4 (id-pure) | `nextAvailableNoteId(preferred, existingIds)` | **Pure core** | Deterministic given `(Timestamp, ReadonlySet<NoteId>)`. No side effects. Property-test target for uniqueness and suffix determinism. |
| Step 4 (compose) | `initializeCaptureSession` | **Mixed** | Calls effectful `Clock.now()` then effectful `vault.allocateNoteId`; only the inner `nextAvailableNoteId` invocation is pure |

**Formally verifiable core**: `hydrateFeed` and `nextAvailableNoteId`.

**Effectful shell**: `loadVaultConfig`, `scanVault`, `Clock.now()`, and `vault.allocateNoteId` (as an Aggregate method — its Vault-state read is an effect; the algorithm it delegates to is pure).

---

## Port Contracts

Port signatures match `docs/domain/workflows.md §依存（ポート）` and `docs/domain/code/rust/src/vault/ports.rs`. All return types use `Result<Ok, Err>` (no exceptions).

```typescript
// ── Settings ──────────────────────────────────────────────────────────────
/** Read the persisted VaultPath configuration. Returns null on first run. */
type SettingsLoad = () => Result<VaultPath | null, never>;

// ── FileSystem ────────────────────────────────────────────────────────────
/** Verify that a path exists and is a readable directory.
 *
 *  Three distinct outcomes (F-005):
 *    Ok(true)                    — path exists and is a readable directory
 *    Ok(false)                   — path exists but is not a directory (e.g., it is a file)
 *    Err(FsError{kind:'not-found'}) — path does not exist at all
 *    Err(FsError{kind:'permission'}) — insufficient OS permissions
 *
 *  AppStartup maps both Ok(false) and Err(not-found) to PathNotFound, because
 *  the workflow requires a readable directory and the distinction is not
 *  actionable at this level. PermissionDenied maps to its own error variant.
 */
type FileSystemStatDir = (path: string) => Result<boolean, FsError>;

/** Enumerate all *.md file paths directly under vaultPath (non-recursive). */
type FileSystemListMarkdown = (vaultPath: VaultPath) => Result<string[], ScanError>;

/** Read the full text content of a file. */
type FileSystemReadFile = (filePath: string) => Result<string, FsError>;

// ── FrontmatterParser ─────────────────────────────────────────────────────
/** Parse raw markdown into body and frontmatter.
 *  Pure function — no I/O. Fails with HydrationFailureReason on any parse
 *  or VO validation error.
 *  Purity is the verifiable property. sync vs async is an implementation
 *  choice deferred to Phase 2b. */
type FrontmatterParserParse = (
  raw: string,
) => Result<{ body: Body; fm: Frontmatter }, HydrationFailureReason>;

// ── ScanFileFailure (discriminated union, canonical definition) ────────────
/** Per-file failure in scanVault. Distinguishes read failures (OS) from
 *  hydration failures (parse/VO). Source: snapshots.ts, snapshots.rs. */
type ScanFileFailure =
  | { readonly kind: 'read';    readonly fsError: FsError }
  | { readonly kind: 'hydrate'; readonly reason: HydrationFailureReason };

type CorruptedFile = {
  readonly filePath: string;
  readonly failure: ScanFileFailure;   // NB: field is 'failure', not 'reason'
  readonly detail?: string;
};

// ── Clock ──────────────────────────────────────────────────────────────────
/** Return the current wall-clock time. Purity-violating. */
type ClockNow = () => Timestamp;

// ── NoteId Allocation — two-layer design (F-001) ──────────────────────────
/** Pure helper: given a preferred timestamp and the set of already-existing
 *  NoteIds, return a collision-free NoteId. Appends -1, -2, ... suffix on
 *  collision. No side effects; same inputs always produce same output.
 *  This is the property-test target for uniqueness (PROP-003) and
 *  suffix determinism (PROP-022).
 *  Source: aggregates.md §1 衝突回避設計; ports.rs next_available_note_id. */
type NextAvailableNoteId = (
  preferred: Timestamp,
  existingIds: ReadonlySet<NoteId>,
) => NoteId;

/** Effectful Aggregate method: reads the Vault Aggregate's internal NoteId
 *  set, then delegates to nextAvailableNoteId. The Vault-state read is the
 *  effectful sub-step; the collision-avoidance algorithm is pure.
 *  In-memory only — no file I/O.
 *  Source: aggregates.md §4 vault.allocateNoteId; ports.rs NoteIdAllocatorPort. */
type VaultAllocateNoteId = (now: Timestamp) => NoteId;  // effectful: reads Vault state
```

> Implementation choice (tauri-plugin-fs, tauri-plugin-store, gray-matter, etc.) is deferred to Phase 2b.

---

## Proof Obligations

| ID | Description | Covers REQ | Tier | Required | Tool |
|----|-------------|-----------|------|----------|------|
| PROP-001 | `hydrateFeed` is pure: same `ScannedVault` input always produces identical `HydratedFeed` output | REQ-008, REQ-015 | 1 | **true** | fast-check (property: ∀ input, fn(input) deepEquals fn(input)) |
| PROP-002 | `hydrateFeed` excludes all corrupted-file entries from `Feed.noteRefs` | REQ-009 | 1 | **true** | fast-check (property: corruptedFiles ∩ noteRefs = ∅) |
| PROP-003 | `nextAvailableNoteId(preferred, existingIds)` returns a NoteId not present in `existingIds` | REQ-011 | 1 | **true** | fast-check (property: ∀ ts, ∀ existingIds, nextAvailableNoteId(ts, existingIds) ∉ existingIds) |
| PROP-004 | `AppStartupError` type is exhaustive: only `'config'` or `'scan'` kind values exist | REQ-003, REQ-004, REQ-005, REQ-007 | 0 | **true** | TypeScript type exhaustiveness (never branch in switch) |
| PROP-005 | `Settings.load()` returning `null` maps to `{ kind: 'unconfigured' }` and NOT to `'path-not-found'` | REQ-003, REQ-006 | 2 | false | Example-based test |
| PROP-006 | Step 1 `PathNotFound` requires a non-null path | REQ-004, REQ-006 | 2 | false | Example-based test |
| PROP-007 | Step 1 `PermissionDenied` requires a non-null path | REQ-005 | 2 | false | Example-based test |
| PROP-008 | Step 2 `list-failed` terminates the workflow before Steps 3 and 4 | REQ-007 | 2 | false | Example-based test with stub |
| PROP-009 | Per-file `readFile` failure accumulates `CorruptedFile` with `failure: {kind:'read', fsError}` and workflow continues | REQ-002, REQ-016 | 2 | false | Example-based test with stub |
| PROP-010 | Zero-byte file accumulates `CorruptedFile` with `failure: {kind:'hydrate', reason:'missing-field'}` | REQ-002 | 2 | false | Example-based test |
| PROP-011 | Empty vault (0 `.md` files) produces empty Feed and proceeds to Step 4 | REQ-002, REQ-008 | 2 | false | Example-based test |
| PROP-012 | All-corrupted vault succeeds with empty Feed and `corruptedFiles.length === scanned count` | REQ-009 | 2 | false | Example-based test |
| PROP-013 | `InitialUIState` contains `feed`, `tagInventory`, `editingSessionState`, `corruptedFiles` | REQ-014 | 2 | false | Example-based test |
| PROP-014 | `VaultDirectoryNotConfigured` event is emitted exactly once on `Unconfigured` | REQ-003 | 2 | false | Example-based test with event spy |
| PROP-015 | `hydrateFeed` Feed sort order is `updatedAt` descending | REQ-008 | 1 | false | fast-check (property: ∀ non-empty snapshots, noteRefs sorted desc by updatedAt) |
| PROP-016 | Happy-path Step 1 emits NO domain event (including no `VaultDirectoryConfigured` and no `VaultDirectoryNotConfigured`) | REQ-001 | 2 | false | Example-based test with event spy |
| PROP-017 | Full pipeline integration: happy path → `InitialUIState` with `editing` status | REQ-001, REQ-002, REQ-008, REQ-010, REQ-014 | 3 | false | Integration test with port fakes |
| PROP-018 | `hydrateFeed` total output invariant: snapshots.length + corruptedFiles.length = input count | REQ-002 | 1 | false | fast-check |
| PROP-019 | `ScanFileFailure` discriminated union is exhaustively handled: every consumer switch/match covers both `'read'` and `'hydrate'` variants with no fall-through | REQ-002, REQ-016 | 0 | false | TypeScript type exhaustiveness (never branch in switch over `ScanFileFailure.kind`) |
| PROP-020 | Per-file `readFile` permission-denied failure produces `failure: {kind:'read', fsError:{kind:'permission'}}` (not a hydrate variant) | REQ-016 | 2 | false | Example-based test with FsError stub |
| PROP-021 | Event ordering: `VaultScanned` (Vault, public) is emitted before `FeedRestored` (Curate, internal) which is emitted before `TagInventoryBuilt` (Curate, internal); `VaultScanned` carries `{vaultId, snapshots, corruptedFiles, occurredOn}` with `CorruptedFile.failure: ScanFileFailure`; `FeedRestored` and `TagInventoryBuilt` are NOT in the `PublicDomainEvent` union | REQ-013a, REQ-013b | 2 | false | Example-based test with ordered event spy; verify PublicDomainEvent union membership via TypeScript type assertion |
| PROP-022 | `nextAvailableNoteId` is deterministic: same `(preferred, existingIds)` arguments always produce the same `NoteId` output | REQ-011 | 1 | false | fast-check (property: ∀ ts, ∀ existingIds, nextAvailableNoteId(ts, existingIds) === nextAvailableNoteId(ts, existingIds)) |

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. No runtime test needed; the type system enforces it at compile time.
- **Tier 1**: Property-based test with fast-check. Generated random inputs; checks structural invariants.
- **Tier 2**: Example-based unit test. Concrete inputs and expected outputs; verifies specific behaviors.
- **Tier 3**: Integration test. Exercises the full pipeline with port fakes/stubs; tests cross-step coordination.

In lean mode, `required: true` is reserved for the highest-risk invariants:
- **PROP-001** (Step 3 purity) — core correctness claim; if violated, the entire pure/effectful boundary contract collapses.
- **PROP-002** (corrupted files excluded) — safety property; corrupted data must never enter Feed.
- **PROP-003** (NoteId uniqueness via pure helper) — uniqueness invariant on `nextAvailableNoteId`; collision would corrupt the file-system state. Retargeted from `vault.allocateNoteId` (which is effectful and cannot accept an arbitrary `existingIds` set in a property test) to `nextAvailableNoteId(ts, existingIds)` which is pure and fully fast-check-testable.
- **PROP-004** (error type exhaustiveness) — ensures no unhandled error variant reaches the caller.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-001 | PROP-005 (indirectly), PROP-016, PROP-017 |
| REQ-002 | PROP-009, PROP-010, PROP-011, PROP-018, PROP-019 |
| REQ-003 | PROP-004, PROP-005, PROP-014 |
| REQ-004 | PROP-004, PROP-006 |
| REQ-005 | PROP-004, PROP-007 |
| REQ-006 | PROP-005, PROP-006 |
| REQ-007 | PROP-004, PROP-008 |
| REQ-008 | PROP-001, PROP-011, PROP-015, PROP-017 |
| REQ-009 | PROP-002, PROP-012 |
| REQ-010 | PROP-013, PROP-017 |
| REQ-011 | PROP-003, PROP-022 |
| REQ-012 | PROP-013 (indirectly via InitialUIState) |
| REQ-013a | PROP-021 |
| REQ-013b | PROP-021 |
| REQ-014 | PROP-013, PROP-017 |
| REQ-015 | PROP-001, PROP-018 |
| REQ-016 | PROP-009, PROP-019, PROP-020 |

Every requirement has at least one proof obligation. All four `required: true` obligations (PROP-001, PROP-002, PROP-003, PROP-004) cover the highest-risk invariants and span Tiers 0–1.

**Note on PROP-003 retarget (F-001)**: In revision 2, PROP-003 was written as `allocateNoteId(ts) ∉ set` where `set` was never an argument to the function — making the property untestable as a pure fast-check test. In revision 3, PROP-003 targets `nextAvailableNoteId(ts, existingIds) ∉ existingIds`, which is a pure function with `existingIds` as an explicit parameter and is fully property-testable. The `externalId` link (BEAD-018 → PROP-003) is unchanged; only the spec content is updated.

**Note on REQ-013 split (F-002, F-003)**: REQ-013 was split into REQ-013a (VaultScanned, Vault-emitted public event) and REQ-013b (FeedRestored + TagInventoryBuilt, Curate-internal events). The coverage matrix entry previously mapped REQ-013 to PROP-014 (which covers VaultDirectoryNotConfigured, a REQ-003 concern). That mapping is removed. REQ-013a and REQ-013b are now both covered by PROP-021, which was added in this revision.
