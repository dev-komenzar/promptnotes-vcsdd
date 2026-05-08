# Verification Architecture: AppStartup

**Feature**: `app-startup`
**Phase**: 1b
**Revision**: 6 (block-migration: REQ-017 追加と REQ-002/REQ-008 拡張に対応。`parseMarkdownToBlocks` を Pure core として Purity Boundary Map に追加し、`HydrateNote` ACL の純粋性と block-parse → CorruptedFile マッピングを検証する PROP-025/PROP-026 を追加。`HydrationFailureReason` 拡張型 `'block-parse'` の exhaustiveness を PROP-019 のスコープに含める。)
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 1, `docs/domain/aggregates.md §1 衝突回避設計`, `docs/domain/code/ts/src/shared/snapshots.ts`, `docs/domain/code/rust/src/vault/ports.rs`, `docs/domain/code/ts/src/shared/blocks.ts`, `docs/domain/code/ts/src/curate/ports.ts`

---

## 改訂履歴 / Revision Log

| 日付 | 反復 | 対象 finding | 概要 |
|------|------|-------------|------|
| 2026-04-30 | 2 | FIND-003, FIND-010 | FIND-003: purity boundary mapにinter-step (2→3)行を追記し、Clock.now呼び出し回数上限（≤2）を検証するPROP-023を追加（Tier 1, required: true）; FIND-010: statDir Err(disk-full\|lock\|unknown)の5行マッピングを検証するPROP-024を追加（Tier 1, required: false）; statDirポート契約の docstring に collapsed cases を追記 |
| 2026-04-30 | 3 | FIND-014 | FIND-014: REQ-010 NOTE 追記（Option A 採用 — Note aggregate は invariant 強制 + event-emission 用途のみ、retention なし）。PROP-013 の InitialUIState shape 制約に Note aggregate 非保持の明示注記を追加。 |
| 2026-05-08 | block-migration | spec-rev6 (block-based migration) | REQ-017 追加と REQ-002/REQ-008 拡張に対応。`parseMarkdownToBlocks` を Pure core として Purity Boundary Map に追加し、`HydrateNote` ACL の純粋性と block-parse → CorruptedFile マッピングを検証する PROP-025/PROP-026 を追加。`HydrationFailureReason` 拡張型 `'block-parse'` の exhaustiveness を PROP-019 のスコープに含める。 |

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `loadVaultConfig` | **Effectful shell** | Invokes `Settings.load()` and `FileSystem.statDir()` — both are external reads |
| Step 2 | `scanVault` | **Effectful shell** | Invokes `FileSystem.listMarkdown()` and `FileSystem.readFile()` per file; per-file Hydration is delegated to `HydrateNote` (ACL) which composes the pure `FrontmatterParser.parse` and pure `parseMarkdownToBlocks` calls inside an effectful loop. |
| Step 2 (parse, pure) | `parseMarkdownToBlocks` | **Pure core** | Markdown 文字列 → `Block[]` の純粋関数。`HydrateNote` 内で呼ばれるが、本体は副作用ゼロ・決定的・referential transparency を満たす。`Err(BlockParseError)` は `HydrationFailureReason 'block-parse'` に折り畳まれて `CorruptedFile` 行きになる（呼び出し側 ACL の責務）。 |
| Step 2 (ACL, pure) | `HydrateNote` | **Pure core** | `NoteFileSnapshot → Result<Note, HydrationFailureReason>` の純粋 ACL 関数。`FrontmatterParser.parse` と `parseMarkdownToBlocks` を組み合わせるのみで I/O を持たない。Step 2 のエフェクトフルループ内で呼ばれるが、HydrateNote 自体は決定的。 |
| Inter-step (2→3) | `runAppStartupPipeline` orchestrator | **Effectful shell** | Calls `Clock.now()` exactly once after Step 2 completes and before `hydrateFeed` begins, to obtain `occurredOn` for `VaultScanned`, `FeedRestored`, and `TagInventoryBuilt`. This is orchestration-layer I/O explicitly permitted by REQ-015. The resulting `Timestamp` is passed to `emit()` calls only — NOT into `hydrateFeed`. |
| Step 3 | `hydrateFeed` | **Pure core** | No port dependencies; deterministic; `ScannedVault` → `HydratedFeed` is referentially transparent. Accepts only `ScannedVault` — no timestamp argument, no `Clock.now` call. |
| Step 4 (time) | `Clock.now()` | **Effectful shell** | Second and final `Clock.now()` call per pipeline run; returns wall-clock time for `Note.createdAt/updatedAt` and `EditingSessionState` |
| Step 4 (id-effectful) | `vault.allocateNoteId(now)` | **Effectful shell** | Reads Vault Aggregate's internal NoteId set — that read is an effect. Delegates collision-avoidance to the pure helper. |
| Step 4 (id-pure) | `nextAvailableNoteId(preferred, existingIds)` | **Pure core** | Deterministic given `(Timestamp, ReadonlySet<NoteId>)`. No side effects. Property-test target for uniqueness and suffix determinism. |
| Step 4 (compose) | `initializeCaptureSession` | **Mixed** | Calls effectful `Clock.now()` then effectful `vault.allocateNoteId`; only the inner `nextAvailableNoteId` invocation is pure |

**Formally verifiable core**: `hydrateFeed`, `nextAvailableNoteId`, `parseMarkdownToBlocks`, and `HydrateNote`.

**Effectful shell**: `loadVaultConfig`, `scanVault`, the inter-step (2→3) orchestrator `Clock.now()` call, `Clock.now()` in Step 4, and `vault.allocateNoteId` (as an Aggregate method — its Vault-state read is an effect; the algorithm it delegates to is pure).

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
 *  Five distinct outcomes (F-005, amended by FIND-010):
 *    Ok(true)                             — path exists and is a readable directory
 *    Ok(false)                            — path exists but is not a directory → PathNotFound
 *    Err(FsError{kind:'not-found'})       — path does not exist at all → PathNotFound
 *    Err(FsError{kind:'permission'})      — insufficient OS permissions → PermissionDenied
 *    Err(FsError{kind:'disk-full'|'lock'|'unknown'}) — transient/indeterminate → PathNotFound (collapsed)
 *
 *  Collapse rationale: disk-full, lock, and unknown have no distinct user-visible
 *  recovery path at AppStartup time; the remediation ("configure a valid vault path")
 *  is identical to the not-found case. PermissionDenied requires OS-level chmod/chown
 *  and is therefore kept as a separate reason. See REQ-004 rationale table.
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

// ── Block parsing — pure core (block-based migration) ────────────────────
/** Parse Markdown body into Block[]. Pure, deterministic.
 *  Source: shared/blocks.ts ParseMarkdownToBlocks.
 *  - Unknown blocks fold to paragraph; not an error.
 *  - Structural breakage (unterminated code fence, malformed-structure)
 *    yields Err(BlockParseError) which the caller folds to
 *    HydrationFailureReason 'block-parse'.
 *  Purity is the verifiable property; sync-only by construction. */
type ParseMarkdownToBlocks = (
  markdown: string,
) => Result<ReadonlyArray<Block>, BlockParseError>;

type BlockParseError =
  | { readonly kind: 'unterminated-code-fence'; readonly line: number }
  | { readonly kind: 'malformed-structure'; readonly line: number; readonly detail: string };

// ── HydrateNote — Curate Context ACL (pure composition) ──────────────────
/** Pure ACL function used inside scanVault's per-file loop.
 *  Internally composes FrontmatterParser.parse and parseMarkdownToBlocks.
 *  Source: curate/ports.ts HydrateNote. */
type HydrateNote = (
  snapshot: NoteFileSnapshot,
) => Result<Note, HydrationFailureReason>;

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
| PROP-013 | `InitialUIState` contains exactly `{ feed, tagInventory, editingSessionState, corruptedFiles }` — the type explicitly excludes a Note aggregate field, encoding REQ-010 Note non-retention as a TypeScript shape constraint | REQ-010, REQ-014 | 2 | false | Example-based test |
| PROP-014 | `VaultDirectoryNotConfigured` event is emitted exactly once on `Unconfigured` | REQ-003 | 2 | false | Example-based test with event spy |
| PROP-015 | `hydrateFeed` Feed sort order is `updatedAt` descending | REQ-008 | 1 | false | fast-check (property: ∀ non-empty snapshots, noteRefs sorted desc by updatedAt) |
| PROP-016 | Happy-path Step 1 emits NO domain event (including no `VaultDirectoryConfigured` and no `VaultDirectoryNotConfigured`) | REQ-001 | 2 | false | Example-based test with event spy |
| PROP-017 | Full pipeline integration: happy path → `InitialUIState` with `editing` status | REQ-001, REQ-002, REQ-008, REQ-010, REQ-014 | 3 | false | Integration test with port fakes |
| PROP-018 | `hydrateFeed` total output invariant: snapshots.length + corruptedFiles.length = input count | REQ-002 | 1 | false | fast-check |
| PROP-019 | `ScanFileFailure` discriminated union is exhaustively handled: every consumer switch/match covers both `'read'` and `'hydrate'` variants with no fall-through. Within the `'hydrate'` branch, the `HydrationFailureReason` switch covers all five values (`'yaml-parse' | 'missing-field' | 'invalid-value' | 'block-parse' | 'unknown'`) with no fall-through. | REQ-002, REQ-016 | 0 | false | TypeScript type exhaustiveness (never branch in switch over `ScanFileFailure.kind`) |
| PROP-020 | Per-file `readFile` permission-denied failure produces `failure: {kind:'read', fsError:{kind:'permission'}}` (not a hydrate variant) | REQ-016 | 2 | false | Example-based test with FsError stub |
| PROP-021 | Event ordering: `VaultScanned` (Vault, public) is emitted before `FeedRestored` (Curate, internal) which is emitted before `TagInventoryBuilt` (Curate, internal); `VaultScanned` carries `{vaultId, snapshots, corruptedFiles, occurredOn}` with `CorruptedFile.failure: ScanFileFailure`; `FeedRestored` and `TagInventoryBuilt` are NOT in the `PublicDomainEvent` union | REQ-013a, REQ-013b | 2 | false | Example-based test with ordered event spy; verify PublicDomainEvent union membership via TypeScript type assertion |
| PROP-022 | `nextAvailableNoteId` is deterministic: same `(preferred, existingIds)` arguments always produce the same `NoteId` output | REQ-011 | 1 | false | fast-check (property: ∀ ts, ∀ existingIds, nextAvailableNoteId(ts, existingIds) === nextAvailableNoteId(ts, existingIds)) |
| PROP-023 | `Clock.now()` is called at most twice per pipeline run: once in the inter-step orchestrator (between Step 2 and Step 3) and once inside Step 4. `hydrateFeed` (Step 3) contains no `Clock.now` call and accepts no timestamp argument. | REQ-015 | 1 | **true** | fast-check / spy wrapper (property: instrument `Clock.now` with a counter; run full pipeline → counter ≤ 2; verify `hydrateFeed` call signature has no `Timestamp` parameter via TypeScript type assertion) |
| PROP-024 | For each `statDir` result kind, `loadVaultConfig` maps to the spec-defined `reason`: `Ok(true)` → success; `Ok(false)` → `path-not-found`; `Err('not-found')` → `path-not-found`; `Err('permission')` → `permission-denied`; `Err('disk-full')` → `path-not-found`; `Err('lock')` → `path-not-found`; `Err('unknown')` → `path-not-found` | REQ-004 | 1 | false | fast-check with small finite generator over all 5 `statDir` result variants; assert `reason` matches the table in REQ-004 for each case |
| PROP-025 | `parseMarkdownToBlocks` is pure: same Markdown input always produces identical `Result<ReadonlyArray<Block>, BlockParseError>` output (deep-equal Block tree, ignoring fresh-allocated BlockId values). | REQ-002, REQ-017 | 1 | **true** | fast-check (property: ∀ markdown, deepEqualsModuloBlockId(parseMarkdownToBlocks(markdown), parseMarkdownToBlocks(markdown))) |
| PROP-026 | Per-file `parseMarkdownToBlocks` failure during `scanVault` produces `failure: { kind: 'hydrate', reason: 'block-parse' }` (NOT `'unknown'`, NOT `'invalid-value'`, NOT `'yaml-parse'`); the surrounding `scanVault` workflow continues processing remaining files. | REQ-002, REQ-017 | 2 | **true** | Example-based test using a `parseMarkdownToBlocks` stub that returns Err(BlockParseError) for one specific file |
| PROP-027 | `HydrateNote` ACL is pure: `(NoteFileSnapshot) → Result<Note, HydrationFailureReason>` is referentially transparent — same snapshot always produces the same Result, no I/O, no clock, no Vault state read. Failure-mode determinism: a snapshot with valid frontmatter but body that triggers `parseMarkdownToBlocks` Err always returns `Err('block-parse')`. | REQ-002, REQ-008, REQ-017 | 1 | false | fast-check (property: ∀ snapshot, hydrateNote(snapshot) deepEquals hydrateNote(snapshot); for crafted block-parse-triggering snapshot, Err.reason === 'block-parse') |

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
- **PROP-023** (Clock.now call budget) — load-bearing purity boundary invariant: the "Step 3 is a pure function" guarantee depends on `Clock.now` being absent from `hydrateFeed` and bounded to ≤ 2 calls per run. Violation silently introduces a hidden effectful dependency inside the nominally-pure core.
- **PROP-025** (parseMarkdownToBlocks purity) — Pure-core purity claim for `parseMarkdownToBlocks`; if violated, the entire Vault Hydration purity boundary collapses and `block-parse` failures become non-deterministic.
- **PROP-026** (block-parse failure mapping) — Failure-mode mapping is load-bearing for REQ-017; misclassification (e.g., as `'unknown'` or `'yaml-parse'`) would silently drop diagnostic fidelity for users with structurally-broken vault files.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-001 | PROP-005 (indirectly), PROP-016, PROP-017 |
| REQ-002 | PROP-009, PROP-010, PROP-011, PROP-018, PROP-019, PROP-025, PROP-026, PROP-027 |
| REQ-003 | PROP-004, PROP-005, PROP-014 |
| REQ-004 | PROP-004, PROP-006, PROP-024 |
| REQ-005 | PROP-004, PROP-007 |
| REQ-006 | PROP-005, PROP-006 |
| REQ-007 | PROP-004, PROP-008 |
| REQ-008 | PROP-001, PROP-011, PROP-015, PROP-017, PROP-027 |
| REQ-009 | PROP-002, PROP-012 |
| REQ-010 | PROP-013, PROP-017 |
| REQ-011 | PROP-003, PROP-022 |
| REQ-012 | PROP-013 (indirectly via InitialUIState) |
| REQ-013a | PROP-021 |
| REQ-013b | PROP-021 |
| REQ-014 | PROP-013, PROP-017 |
| REQ-015 | PROP-001, PROP-018, PROP-023 |
| REQ-016 | PROP-009, PROP-019, PROP-020 |
| REQ-017 | PROP-025, PROP-026, PROP-027, PROP-019 |

Every requirement has at least one proof obligation. Seven `required: true` obligations (PROP-001, PROP-002, PROP-003, PROP-004, PROP-023, PROP-025, PROP-026) cover the highest-risk invariants and span Tiers 0–2. Total proof obligations: 27 (PROP-001 through PROP-027).

**Note on PROP-003 retarget (F-001)**: In revision 2, PROP-003 was written as `allocateNoteId(ts) ∉ set` where `set` was never an argument to the function — making the property untestable as a pure fast-check test. In revision 3, PROP-003 targets `nextAvailableNoteId(ts, existingIds) ∉ existingIds`, which is a pure function with `existingIds` as an explicit parameter and is fully property-testable. The `externalId` link (BEAD-018 → PROP-003) is unchanged; only the spec content is updated.

**Note on REQ-013 split (F-002, F-003)**: REQ-013 was split into REQ-013a (VaultScanned, Vault-emitted public event) and REQ-013b (FeedRestored + TagInventoryBuilt, Curate-internal events). The coverage matrix entry previously mapped REQ-013 to PROP-014 (which covers VaultDirectoryNotConfigured, a REQ-003 concern). That mapping is removed. REQ-013a and REQ-013b are now both covered by PROP-021, which was added in this revision.
