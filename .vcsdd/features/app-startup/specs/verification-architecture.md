---
coherence:
  node_id: "design:app-startup-verification"
  type: design
  name: "app-startup 検証アーキテクチャ（純粋性境界・証明義務）"
  depends_on:
    - id: "req:app-startup"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:type-contracts"
      relation: derives_from
  modules:
    - "app-startup"
  source_files:
    - "promptnotes/src/lib/domain/__tests__/app-startup"
    - "promptnotes/src-tauri/src/domain/vault"
---

# Verification Architecture: AppStartup

**Feature**: `app-startup`
**Phase**: 1b
**Revision**: 8 (Phase 3 sprint-5 iteration-1 FAIL (FIND-030/031) 解消。Q5=A: parseMarkdownToBlocks の port 契約を「blank-line `\n\n` セパレータを paragraph('') に展開せず coalesce する」に厳格化（hydrateNote 内のフィルタは spec で許可されない）。Q6=A: REQ-008 AC の 'programming-error invariant violation' を「throw Error('hydrateNote-invariant-violation: ...')」に sharpen。FIND-032/034 (test coverage), FIND-033 (code structure), FIND-035 (naming) は Phase 2 で対応する。)
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 1, `docs/domain/aggregates.md §1 衝突回避設計`, `docs/domain/code/ts/src/shared/snapshots.ts`, `docs/domain/code/rust/src/vault/ports.rs`, `docs/domain/code/ts/src/shared/blocks.ts`, `docs/domain/code/ts/src/curate/ports.ts`, `docs/domain/code/ts/src/shared/value-objects.ts`

---

## 改訂履歴 / Revision Log

| 日付 | 反復 | 対象 finding | 概要 |
|------|------|-------------|------|
| 2026-04-30 | 2 | FIND-003, FIND-010 | FIND-003: purity boundary mapにinter-step (2→3)行を追記し、Clock.now呼び出し回数上限（≤2）を検証するPROP-023を追加（Tier 1, required: true）; FIND-010: statDir Err(disk-full\|lock\|unknown)の5行マッピングを検証するPROP-024を追加（Tier 1, required: false）; statDirポート契約の docstring に collapsed cases を追記 |
| 2026-04-30 | 3 | FIND-014 | FIND-014: REQ-010 NOTE 追記（Option A 採用 — Note aggregate は invariant 強制 + event-emission 用途のみ、retention なし）。PROP-013 の InitialUIState shape 制約に Note aggregate 非保持の明示注記を追加。 |
| 2026-05-08 | block-migration | spec-rev6 (block-based migration) | REQ-017 追加と REQ-002/REQ-008 拡張に対応。`parseMarkdownToBlocks` を Pure core として Purity Boundary Map に追加し、`HydrateNote` ACL の純粋性と block-parse → CorruptedFile マッピングを検証する PROP-025/PROP-026 を追加。`HydrationFailureReason` 拡張型 `'block-parse'` の exhaustiveness を PROP-019 のスコープに含める。 |
| 2026-05-08 | spec-rev7 | FIND-019..026 | Phase 1c iteration-5 FAIL fix — FIND-019..026 解消。Q1=A: parseMarkdownToBlocks は Step 2 でのみ実行 (per-file 検証)、Step 3 は HydrateNote 経由で再パースする二重実行モデルを採用。Q2=A: parseMarkdownToBlocks は deterministic positional BlockId (`block-0`..`block-N-1`) を使う pure function（PROP-025 は plain deepEquals）。Q3=A: HydrationFailureReason 'unknown' は防御的フォールバックとして REQ-018 で文書化。Q4=A: parseMarkdownToBlocks の Ok([]) は reason='block-parse' に折り畳む。Note aggregate invariant 6（最低 1 ブロック）と整合。 |
| 2026-05-08 | spec-rev8 | FIND-030, FIND-031 | Phase 3 sprint-5 iteration-1 FAIL (FIND-030/031) 解消。Q5=A: parseMarkdownToBlocks の port 契約を「blank-line `\n\n` セパレータを paragraph('') に展開せず coalesce する」に厳格化（hydrateNote 内のフィルタは spec で許可されない）。Q6=A: REQ-008 AC の 'programming-error invariant violation' を「throw Error('hydrateNote-invariant-violation: ...')」に sharpen。FIND-032/034 (test coverage), FIND-033 (code structure), FIND-035 (naming) は Phase 2 で対応する。 |

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `loadVaultConfig` | **Effectful shell** | Invokes `Settings.load()` and `FileSystem.statDir()` — both are external reads |
| Step 2 | `scanVault` | **Effectful shell** | Invokes `FileSystem.listMarkdown()` and `FileSystem.readFile()` per file; per-file Hydration sequence is `readFile (effectful) → FrontmatterParser.parse (pure) → parseMarkdownToBlocks (pure, deterministic positional BlockId, validation only — Block[] discarded)`. The pure `parseMarkdownToBlocks` and `FrontmatterParser.parse` calls are colocated within Step 2's effectful loop but are themselves pure. **`HydrateNote` is NOT called in Step 2.** |
| Step 2 (parse, pure) | `parseMarkdownToBlocks` | **Pure core** | Markdown 文字列 → `Block[]` の純粋関数。Deterministic positional BlockId scheme (`block-0..block-N-1`). `BlockIdSmartCtor.generate()` (UUID v4 path) は editor runtime 専用で、parseMarkdownToBlocks では使われない。`Err(BlockParseError)` or `Ok([])` ⇒ `reason='block-parse'`. Tested via PROP-025 with plain `deepEquals`. |
| Step 3 (ACL, pure) | `HydrateNote` | **Pure core** | Pure core. Called per-snapshot inside `hydrateFeed` (Step 3) to materialize `Note` aggregates. Composes `parseMarkdownToBlocks` + `Note.fromSnapshot`. Does NOT call `FrontmatterParser.parse` (frontmatter is already a VO on `NoteFileSnapshot`). |
| Inter-step (2→3) | `runAppStartupPipeline` orchestrator | **Effectful shell** | Calls `Clock.now()` exactly once after Step 2 completes and before `hydrateFeed` begins, to obtain `occurredOn` for `VaultScanned`, `FeedRestored`, and `TagInventoryBuilt`. This is orchestration-layer I/O explicitly permitted by REQ-015. The resulting `Timestamp` is passed to `emit()` calls only — NOT into `hydrateFeed`. |
| Step 3 | `hydrateFeed` | **Pure core** | No port dependencies; deterministic; `ScannedVault` → `HydratedFeed` is referentially transparent. Accepts only `ScannedVault` — no timestamp argument, no `Clock.now` call. Calls `HydrateNote` per snapshot to materialize `Note` aggregates. |
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
 *  choice deferred to Phase 2b.
 *  Called in Step 2's per-file loop BEFORE NoteFileSnapshot construction.
 *  NOT called by HydrateNote (which receives an already-parsed NoteFileSnapshot). */
type FrontmatterParserParse = (
  raw: string,
) => Result<{ body: Body; fm: Frontmatter }, HydrationFailureReason>;

// ── Block parsing — pure core (block-based migration) ────────────────────
/** Parse Markdown body into Block[]. Pure, deterministic.
 *  Source: shared/blocks.ts ParseMarkdownToBlocks; spec rev8 contract.
 *  - Uses positional BlockId (`block-0`, `block-1`, ... in document order).
 *  - Unknown blocks fold to paragraph; not an error.
 *  - **Blank-line `\n\n+` separators between content blocks DO NOT produce
 *    `paragraph('')` artifacts** (rev8, FIND-031). Block boundaries are
 *    inferred from blank-line separators; the blank lines themselves are
 *    structural and discarded.
 *  - **Whitespace-only body MUST return `Ok([])`** (no content, no artifacts).
 *    The Step 2 caller folds Ok([]) to `reason='block-parse'` per Q4=A.
 *  - Structural breakage (`unterminated-code-fence`, `malformed-structure`)
 *    yields `Err(BlockParseError)`.
 *  - The `BlockIdSmartCtor.generate()` allocator (which may use UUID v4) is
 *    NOT invoked here — it is reserved for editor runtime block creation. */
type ParseMarkdownToBlocks = (
  markdown: string,
) => Result<ReadonlyArray<Block>, BlockParseError>;

type BlockParseError =
  | { readonly kind: 'unterminated-code-fence'; readonly line: number }
  | { readonly kind: 'malformed-structure'; readonly line: number; readonly detail: string };

// ── HydrateNote — Curate Context ACL (pure composition) ──────────────────
/** Pure ACL function called per-snapshot inside Step 3's hydrateFeed.
 *  Internally composes parseMarkdownToBlocks(snapshot.body) and aggregate
 *  reconstruction. Does NOT parse YAML — the snapshot's frontmatter is already
 *  a VO. By Q2 (deterministic positional BlockId),
 *  HydrateNote(snapshot) === HydrateNote(snapshot) for any pinned snapshot.
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
| PROP-019 | `ScanFileFailure` discriminated union is exhaustively handled: every consumer switch/match covers both `'read'` and `'hydrate'` variants with no fall-through. Within the `'hydrate'` branch, the `HydrationFailureReason` switch covers all five values (`'yaml-parse' \| 'missing-field' \| 'invalid-value' \| 'block-parse' \| 'unknown'`) with no fall-through. After REQ-018, the producer of each `HydrationFailureReason` value is fully specified: `'yaml-parse' \| 'missing-field' \| 'invalid-value'` ← `FrontmatterParser.parse` / VO conversion (REQ-002, REQ-016 NOTE); `'block-parse'` ← `parseMarkdownToBlocks` failure or `Ok([])` (REQ-017); `'unknown'` ← non-categorisable defensive fallback (REQ-018). | REQ-002, REQ-016, REQ-018 | 0 | false | TypeScript type exhaustiveness (never branch in switch over `ScanFileFailure.kind`) |
| PROP-020 | Per-file `readFile` permission-denied failure produces `failure: {kind:'read', fsError:{kind:'permission'}}` (not a hydrate variant) | REQ-016 | 2 | false | Example-based test with FsError stub |
| PROP-021 | Event ordering: `VaultScanned` (Vault, public) is emitted before `FeedRestored` (Curate, internal) which is emitted before `TagInventoryBuilt` (Curate, internal); `VaultScanned` carries `{vaultId, snapshots, corruptedFiles, occurredOn}` with `CorruptedFile.failure: ScanFileFailure`; `FeedRestored` and `TagInventoryBuilt` are NOT in the `PublicDomainEvent` union | REQ-013a, REQ-013b | 2 | false | Example-based test with ordered event spy; verify PublicDomainEvent union membership via TypeScript type assertion |
| PROP-022 | `nextAvailableNoteId` is deterministic: same `(preferred, existingIds)` arguments always produce the same `NoteId` output | REQ-011 | 1 | false | fast-check (property: ∀ ts, ∀ existingIds, nextAvailableNoteId(ts, existingIds) === nextAvailableNoteId(ts, existingIds)) |
| PROP-023 | `Clock.now()` is called at most twice per pipeline run: once in the inter-step orchestrator (between Step 2 and Step 3) and once inside Step 4. `hydrateFeed` (Step 3) contains no `Clock.now` call and accepts no timestamp argument. | REQ-015 | 1 | **true** | fast-check / spy wrapper (property: instrument `Clock.now` with a counter; run full pipeline → counter ≤ 2; verify `hydrateFeed` call signature has no `Timestamp` parameter via TypeScript type assertion) |
| PROP-024 | For each `statDir` result kind, `loadVaultConfig` maps to the spec-defined `reason`: `Ok(true)` → success; `Ok(false)` → `path-not-found`; `Err('not-found')` → `path-not-found`; `Err('permission')` → `permission-denied`; `Err('disk-full')` → `path-not-found`; `Err('lock')` → `path-not-found`; `Err('unknown')` → `path-not-found` | REQ-004 | 1 | false | fast-check with small finite generator over all 5 `statDir` result variants; assert `reason` matches the table in REQ-004 for each case |
| PROP-025 | `parseMarkdownToBlocks` is pure: same Markdown input always produces identical `Result<ReadonlyArray<Block>, BlockParseError>` output (deep-equal Block tree including BlockId values, because Q2 pins parseMarkdownToBlocks to deterministic positional BlockId). | REQ-002, REQ-017 | 1 | **true** | fast-check (property: ∀ markdown, parseMarkdownToBlocks(markdown) deepEquals parseMarkdownToBlocks(markdown)) |
| PROP-026 | Per-file `parseMarkdownToBlocks` failure during `scanVault` produces `failure: { kind: 'hydrate', reason: 'block-parse' }` (NOT `'unknown'`, NOT `'invalid-value'`, NOT `'yaml-parse'`); the surrounding `scanVault` workflow continues processing remaining files. | REQ-002, REQ-017 | 2 | **true** | Example-based test using a `parseMarkdownToBlocks` stub that returns Err(BlockParseError) for one specific file |
| PROP-027 | `HydrateNote` ACL is pure: `(NoteFileSnapshot) → Result<Note, HydrationFailureReason>` is referentially transparent — same snapshot always produces the same Result, no I/O, no clock, no Vault state read. By Q2 determinism + Q5=A (no filter inside hydrateNote), the resulting `Note.blocks` is bit-identical to `parseMarkdownToBlocks(snapshot.body).value`, including BlockId values. `hydrateNote` does NOT filter, transform, or re-number blocks; it composes parser output with snapshot frontmatter only. Failure-mode determinism: a snapshot whose body triggers `parseMarkdownToBlocks` Err always returns `Err('block-parse')`; a snapshot whose body produces `Ok([])` also returns `Err('block-parse')`. | REQ-002, REQ-008, REQ-017 | 1 | **true** | fast-check (property: ∀ snapshot, hydrateNote(snapshot) deepEquals hydrateNote(snapshot); for crafted block-parse-triggering snapshot, Err.reason === 'block-parse'; for Ok([]) body, Err.reason === 'block-parse') |
| PROP-028 | REQ-018 — `'unknown'` HydrationFailureReason is produced ONLY by the defensive fallback path; no static REQ-002/REQ-017 producer ever yields `'unknown'`. The fallback path is reachable only via uncategorisable parser/VO errors and exceptions; remaining files in the vault still process and the workflow continues to Step 3. | REQ-018 | 2 | false | Example-based test with a parser stub that throws an unexpected error and a parser stub that returns `Err({ kind: 'unrecognized-future-variant' })` cast to `HydrationFailureReason` |
| PROP-029 | Q4 — `parseMarkdownToBlocks(snapshot.body)` returning `Ok([])` (e.g., whitespace-only body) is folded by the Step 2 caller to `CorruptedFile.failure: { kind: 'hydrate', reason: 'block-parse' }` (NOT `'invalid-value'`, NOT auto-padded, NOT silently dropped). The downstream invariant `Note.blocks.length >= 1` is preserved by NEVER constructing a Note from an empty Block[]. Per Q5=A (rev8), `Ok([])` from `parseMarkdownToBlocks` corresponds to whitespace-only body input (no content blocks); the parser does NOT emit `paragraph('')` artifacts for blank-line separators. | REQ-017, REQ-018 | 2 | **true** | Example-based test with `parseMarkdownToBlocks` stub returning `Ok([])` for one specific file; assert resulting `CorruptedFile.failure.reason === 'block-parse'` |
| PROP-030 | Q1=A two-call invariant: `parseMarkdownToBlocks` is invoked exactly twice per non-corrupt file per pipeline run — once in Step 2 (validation, result discarded) and once in Step 3 (via `HydrateNote`, result retained on the materialized `Note`). Both invocations produce deep-equal `Block[]` per Q2 determinism. Files that fail the Step 2 invocation never reach Step 3. | REQ-002, REQ-008, REQ-017, REQ-015 | 1 | false | fast-check with parseMarkdownToBlocks call counter; for each non-corrupt input file, counter increment is exactly 2 |
| PROP-031 | REQ-017 rev8 — parser blank-line behavior: `parseMarkdownToBlocks(s)` does NOT emit `paragraph('')` blocks for blank-line `\n\n+` separators between content blocks. For each input string s, the returned `Block[]` contains zero `paragraph('')` blocks. (Whitespace-only body returns `Ok([])`.) | REQ-002, REQ-017 | 2 | **true** | Example-based test with inputs `'a\n\n\nb'` (two non-empty paragraphs, no empty paragraph in between), `'\n\n\n'` (whitespace-only → `Ok([])`), `'   '` (all spaces → `Ok([])`), and a fast-check property for "no paragraph('') in any output" |
| PROP-032 | REQ-008 rev8 — Step 3 throw on Err: If `hydrateNote(snapshot)` returns `Err(HydrationFailureReason)` during Step 3, `hydrateFeed` MUST throw `Error` whose `.message` matches the regex `/^hydrateNote-invariant-violation: .+: .+$/` (filePath, reason). The thrown Error MUST propagate out of `hydrateFeed`; `corruptedFiles[]` MUST NOT contain Step-3 entries. | REQ-008 | 2 | **true** | Example-based test with a divergent `hydrateNote` stub that returns `Err('block-parse')` for one snapshot; assert `hydrateFeed` throws and the message matches |

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
- **PROP-027** (HydrateNote purity) — FIND-025: `HydrateNote` purity is the load-bearing claim that lets `hydrateFeed` (Step 3) remain pure even though it calls `HydrateNote` per snapshot. Asymmetry with PROP-025 is removed; both pure-core purity claims are now required:true.
- **PROP-029** (Ok([]) → block-parse classification) — Q4: empty-body classification is the boundary between aggregate-shape errors and VO errors; misclassification would leak into either the `'invalid-value'` reason (wrong producer) or the auto-pad rejected alternative (silent data loss).
- **PROP-031** (parser blank-line coalesce contract) — FIND-031: load-bearing parser contract: blank-line artifacts would break Step 2/Step 3 symmetry and create a reachable Step 3 throw path. The contract IS the invariant.
- **PROP-032** (Step 3 fail-fast throw) — FIND-030: load-bearing fail-fast guard: silent corruptedFiles routing of Step 3 errors masks divergence between Step 2 and Step 3 in future code changes. Throw is the invariant.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-001 | PROP-005 (indirectly), PROP-016, PROP-017 |
| REQ-002 | PROP-009, PROP-010, PROP-011, PROP-018, PROP-019, PROP-025, PROP-026, PROP-027, PROP-030, PROP-031 |
| REQ-003 | PROP-004, PROP-005, PROP-014 |
| REQ-004 | PROP-004, PROP-006, PROP-024 |
| REQ-005 | PROP-004, PROP-007 |
| REQ-006 | PROP-005, PROP-006 |
| REQ-007 | PROP-004, PROP-008 |
| REQ-008 | PROP-001, PROP-011, PROP-015, PROP-017, PROP-027, PROP-030, PROP-032 [^req008-prop027] |
| REQ-009 | PROP-002, PROP-012 |
| REQ-010 | PROP-013, PROP-017 |
| REQ-011 | PROP-003, PROP-022 |
| REQ-012 | PROP-013 (indirectly via InitialUIState) |
| REQ-013a | PROP-021 |
| REQ-013b | PROP-021 |
| REQ-014 | PROP-013, PROP-017 |
| REQ-015 | PROP-001, PROP-018, PROP-023, PROP-030 |
| REQ-016 | PROP-009, PROP-019, PROP-020 |
| REQ-017 | PROP-025, PROP-026, PROP-027, PROP-019, PROP-029, PROP-030, PROP-031 |
| REQ-018 | PROP-019, PROP-028, PROP-029 |

[^req008-prop027]: REQ-008 depends on `HydrateNote` purity because Step 3 (`hydrateFeed`) calls `HydrateNote` per snapshot. PROP-027 verifies this purity. FIND-026 was conditional on FIND-022 resolution; with Q1=A adopted (hydrateFeed calls HydrateNote per snapshot in Step 3), PROP-027 IS directly relevant to REQ-008 and is retained in this row.

Every requirement has at least one proof obligation. Eleven `required: true` obligations (PROP-001, PROP-002, PROP-003, PROP-004, PROP-023, PROP-025, PROP-026, PROP-027, PROP-029, PROP-031, PROP-032) cover the highest-risk invariants and span Tiers 0–2. Total proof obligations: 32 (PROP-001 through PROP-032).

**Note on PROP-003 retarget (F-001)**: In revision 2, PROP-003 was written as `allocateNoteId(ts) ∉ set` where `set` was never an argument to the function — making the property untestable as a pure fast-check test. In revision 3, PROP-003 targets `nextAvailableNoteId(ts, existingIds) ∉ existingIds`, which is a pure function with `existingIds` as an explicit parameter and is fully property-testable. The `externalId` link (BEAD-018 → PROP-003) is unchanged; only the spec content is updated.

**Note on REQ-013 split (F-002, F-003)**: REQ-013 was split into REQ-013a (VaultScanned, Vault-emitted public event) and REQ-013b (FeedRestored + TagInventoryBuilt, Curate-internal events). The coverage matrix entry previously mapped REQ-013 to PROP-014 (which covers VaultDirectoryNotConfigured, a REQ-003 concern). That mapping is removed. REQ-013a and REQ-013b are now both covered by PROP-021, which was added in this revision.
