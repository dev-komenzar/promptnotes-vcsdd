# Verification Architecture: CaptureAutoSave

**Feature**: `capture-auto-save`
**Phase**: 1b
**Revision**: 4.1 (FIND-020: REQ-004 acceptance variant disambiguation)
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 2, `docs/domain/code/ts/src/shared/note.ts`, `docs/domain/code/ts/src/shared/blocks.ts`, `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/workflows.ts`, `docs/domain/code/ts/src/capture/ports.ts`, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/aggregates.md` §1

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `prepareSaveRequest` | **Mixed** | `Clock.now()` is effectful; body emptiness check, validation logic, and `serializeBlocksToMarkdown(blocks)` (called to derive `body`) are pure |
| Step 1 (derive body) | `serializeBlocksToMarkdown(blocks)` | **Pure core** | Shared Kernel pure function (`blocks.ts`); deterministic Block[] → Markdown body; new property-test target (Revision 3) |
| Step 1 (empty check) | `Note.isEmpty(note)` | **Pure core** | No ports, no I/O; structural check — all blocks are empty paragraph or divider (`aggregates.md` L120/L142, Revision 4); property-test target |
| Step 1 (validation) | Frontmatter/VO invariant checks | **Pure core** | Enforced by aggregate constructors (Frontmatter VO, Block content/type compatibility per `aggregates.md` §1) |
| Step 2 | `serializeNote` | **Pure core** | Composition of `serializeBlocksToMarkdown(blocks)` + internal YAML serializer; no `CaptureDeps` port calls; `ValidatedSaveRequest → SerializedMarkdown` is referentially transparent |
| Step 3 | `writeMarkdown` | **Effectful shell** | `FileSystem.writeFileAtomic` — write I/O boundary |
| Step 3 (events) | `SaveNoteRequested` + `NoteFileSaved`/`NoteSaveFailed` emission | **Effectful shell** | `publish()` — event bus I/O |
| Curate handler | `updateProjections` | **Out of scope** | `Feed.refreshSort` + `TagInventory.applyDelta` — Curate context reaction to `NoteFileSaved`; no `CaptureDeps` port; not part of CaptureAutoSave pipeline (FIND-015 resolution) |
| Curate handler (tag delta) | Tag diff computation | **Pure core (Curate-side)** | `previousFrontmatter.tags` vs `frontmatter.tags` comparison is deterministic; verified by Curate handler, not this feature |

**Formally verifiable core**: `serializeBlocksToMarkdown`, `serializeNote`, `Note.isEmpty`, trigger-to-source mapping.

**Effectful shell**: `Clock.now()` in Step 1, `FileSystem.writeFileAtomic` in Step 3, `publish()` for events.

**Cross-cutting invariant** (Revision 3): `body === serializeBlocksToMarkdown(blocks)` MUST hold at every carrier site (`ValidatedSaveRequest`, `SaveNoteRequested`, `NoteFileSaved`). See PROP-024.

---

## Port Contracts

Port signatures match `docs/domain/workflows.md §依存（ポート）一覧` and `docs/domain/code/ts/src/capture/ports.ts`.

```typescript
// ── Clock ──────────────────────────────────────────────────────────────
/** Return the current wall-clock time. Purity-violating. Called once in Step 1. */
type ClockNow = () => Timestamp;

// ── FileSystem ─────────────────────────────────────────────────────────
/** Atomic file write. Temp file → rename for crash safety.
 *  Write I/O boundary. Used in Step 3 (writeMarkdown).
 *  Source: workflows.md §依存（ポート）一覧. */
type FileSystemWriteFileAtomic = (
  path: string,
  content: string,
) => Result<void, FsError>;

// ── EventBus ───────────────────────────────────────────────────────────
/** Publish a public domain event to the event bus.
 *  Source: capture/ports.ts EventBusPublish. */
type EventBusPublish = (event: PublicDomainEvent) => void;

// ── Note Operations ────────────────────────────────────────────────────
/** Check if a note is empty (Revision 4 broader rule — aggregates.md L120/L142).
 *  Returns true iff ALL blocks are either:
 *    (a) a paragraph with empty/whitespace-only content, OR
 *    (b) a divider (which has empty content by Block invariant 2).
 *  Returns false for any block of type heading-1, heading-2, heading-3,
 *  bullet, numbered, code, or quote, regardless of content
 *  (structural-distinctiveness rule).
 *  Pure function. Source: note.ts NoteOps.isEmpty. */
type NoteIsEmpty = (note: Note) => boolean;
```

### Internal pure functions (NOT ports — not injected via CaptureDeps)

```typescript
// ── FrontmatterSerializer (resolves FIND-003, FIND-006) ────────────────
/** Serialize Frontmatter to YAML string.
 *  Pure function — no I/O. Used internally by serializeNote (Step 2).
 *  Listed in workflows.md §依存（ポート）一覧 as a dependency,
 *  but classified here as a module-internal pure function, NOT an
 *  injected port. CaptureDeps (ports.ts) does not include it.
 *  This means serializeNote has ZERO CaptureDeps port calls. */
type FrontmatterSerializerToYaml = (fm: Frontmatter) => string;

// ── SerializeBlocksToMarkdown (Revision 3 — Shared Kernel pure fn) ─────
/** Serialize a Block[] sequence to a Markdown body string.
 *  Shared Kernel pure function (blocks.ts SerializeBlocksToMarkdown).
 *  Used in Step 1 to derive ValidatedSaveRequest.body, and in Step 2
 *  inside serializeNote. Also called by Capture (bodyForClipboard) and
 *  Curate (search index). NOT injected via CaptureDeps — imported as a
 *  module-level pure function. Roundtrip property w.r.t. parseMarkdownToBlocks
 *  is documented in blocks.ts (structural equivalence, BlockId 除外). */
type SerializeBlocksToMarkdown = (blocks: ReadonlyArray<Block>) => string;

// ── isEmptyOrWhitespaceContent (Revision 4 — FIND-014 resolution) ─────
/** Precise emptiness predicate for paragraph BlockContent.
 *  An empty paragraph is a paragraph block whose content satisfies this
 *  function returning true.
 *
 *  Definition:
 *    function isEmptyOrWhitespaceContent(c: BlockContent): boolean {
 *      const s = c as unknown as string; // BlockContent is a branded string
 *      return /^\s*$/.test(s); // Unicode whitespace: space, tab, NBSP, full-width space, etc.
 *    }
 *
 *  Positive cases (isEmpty === true for a sole paragraph with this content):
 *    ""         — empty string
 *    " "        — single ASCII space
 *    "\t"       — tab
 *    "   "      — multiple spaces
 *    " "   — non-breaking space (U+00A0)
 *    "　"   — ideographic space (U+3000, full-width)
 *
 *  Negative cases (isEmpty === false):
 *    "a"        — non-whitespace character
 *    " a "      — whitespace-padded non-whitespace
 *    "a "       — trailing non-whitespace
 *
 *  Note: BlockContent Smart Constructor strips newlines per aggregates.md L82.
 *  Tabs and non-breaking spaces are NOT stripped — they ARE matched by /^\s*$/.
 *
 *  Source: aggregates.md L82 (BlockContent semantics), FIND-014 resolution. */
type IsEmptyOrWhitespaceContent = (c: BlockContent) => boolean;
```

### Trigger → SaveNoteSource mapping contract

```typescript
// Pure mapping, no I/O. Exhaustive over DirtyEditingSession.trigger.
function mapTriggerToSource(trigger: "idle" | "blur"): SaveNoteSource {
  switch (trigger) {
    case "idle": return "capture-idle";
    case "blur": return "capture-blur";
  }
}
```

### FsError → NoteSaveFailureReason mapping contract

```typescript
// Pure mapping. Used to construct NoteSaveFailed event payload.
function mapFsErrorToReason(err: FsError): NoteSaveFailureReason {
  switch (err.kind) {
    case "permission": return "permission";
    case "disk-full": return "disk-full";
    case "lock": return "lock";
    case "not-found": return "unknown";
    case "unknown": return "unknown";
  }
}
```

---

## Proof Obligations

| ID | Description | Covers REQ | Tier | Required | Tool |
|----|-------------|-----------|------|----------|------|
| PROP-001 | `serializeNote` is pure: same `ValidatedSaveRequest` (with `blocks` + derived `body`) input always produces identical `SerializedMarkdown` output. Equivalently, `serializeBlocksToMarkdown` (the inner pure-core helper) is pure: `∀ blocks, serializeBlocksToMarkdown(blocks) === serializeBlocksToMarkdown(blocks)`. | REQ-006, REQ-016 | 1 | **true** | fast-check (property: `∀ input, fn(input) === fn(input)`); generator produces `Block[]` sequences via `aggregates.md` §1 invariants (length ≥ 1, content/type compatible) |
| PROP-002 | `serializeNote` output matches Obsidian format: starts with `---\n`, contains YAML, then `---\n`, then `serializeBlocksToMarkdown(request.blocks)` body | REQ-006 | 1 | **true** | fast-check (property: output matches `/^---\n[\s\S]*\n---\n[\s\S]*$/` AND `output.split("---\n")[2] === serializeBlocksToMarkdown(request.blocks)`) |
| PROP-003 | Empty body on idle trigger returns EmptyNoteDiscarded, NOT a SaveError — for ALL isEmpty=true variants (single-empty-para, multi-empty-para, whitespace-para, divider-only, divider-and-empty) | REQ-003, REQ-004 | 1 | **true** | fast-check (property: `∀ note where isEmpty(note), trigger="idle" → result.kind === "empty-discarded"`) |
| PROP-004 | Empty body on blur trigger proceeds to ValidatedSaveRequest (does NOT discard) — for ALL isEmpty=true variants. (Note: this PROP asserts pipeline routing only — `result.kind === 'validated'`; body bytes vary by variant — see REQ-004 acceptance and PROP-024 for body coherence.) | REQ-004 | 1 | **true** | fast-check (property: `∀ note where isEmpty(note), trigger="blur" → result.kind === "validated"`) |
| PROP-005 | `SaveError` type is exhaustive: only `'validation'` or `'fs'` kind values exist | REQ-013 | 0 | **true** | TypeScript type exhaustiveness (never branch in switch) |
| PROP-006 | `SaveValidationError` type is exhaustive: only `'empty-body-on-idle'` or `'invariant-violated'` | REQ-013 | 0 | false | TypeScript type exhaustiveness |
| PROP-007 | Trigger-to-source mapping: `"idle"` → `"capture-idle"`, `"blur"` → `"capture-blur"`, exhaustive | REQ-014 | 1 | false | fast-check (property: mapping is total over `{"idle","blur"}`) |
| PROP-008 | `FsError` → `NoteSaveFailureReason` mapping: `permission` → `"permission"`, `disk-full` → `"disk-full"`, `lock` → `"lock"`, `not-found` → `"unknown"`, `unknown` → `"unknown"` | REQ-010 | 1 | false | fast-check with finite generator over all 5 FsError variants |
| PROP-009 | `NoteFileSaved` is emitted exactly once on write success; `NoteSaveFailed` is NOT emitted | REQ-009 | 2 | false | Example-based test with event spy |
| PROP-010 | `NoteSaveFailed` is emitted exactly once on write failure; `NoteFileSaved` is NOT emitted | REQ-010 | 2 | false | Example-based test with event spy |
| PROP-011 | `SaveNoteRequested` is emitted BEFORE `NoteFileSaved` (event ordering) | REQ-008, REQ-009 | 2 | false | Example-based test with ordered event spy |
| PROP-012 | `TagInventoryUpdated` is emitted iff tag delta exists between `previousFrontmatter` and `frontmatter` (Curate handler property — traced here for REQ-012 coverage, verified in Curate context) | REQ-012 | 1 | false | fast-check (property: emit iff `prevTags ≠ newTags`); Curate handler test |
| PROP-013 | `TagInventoryUpdated` NOT emitted when `previousFrontmatter` is null and new note has no tags (Curate handler, traced here for REQ-012) | REQ-012 | 2 | false | Example-based test; Curate handler context |
| PROP-014 | `Clock.now()` is called exactly once per pipeline run (in Step 1 `prepareSaveRequest`) | REQ-016 | 1 | **true** | Spy wrapper: instrument `clockNow` with counter; run pipeline → counter === 1 |
| PROP-015 | `FileSystem.writeFileAtomic` is called exactly once per pipeline run (in Step 3) | REQ-016 | 2 | false | Spy wrapper with counter |
| PROP-016 | `serializeNote` calls no `CaptureDeps` ports — its function signature has no `deps` parameter. `FrontmatterSerializerToYaml` and `SerializeBlocksToMarkdown` are internal/Shared Kernel pure functions, not injected ports (resolves FIND-006; Revision 3 — adds `serializeBlocksToMarkdown` to the same classification) | REQ-006, REQ-016 | 1 | false | TypeScript type assertion: `serializeNote` parameter list has no `Deps`/`CaptureDeps` argument |
| PROP-017 | Full pipeline integration: happy path → `NoteFileSaved` with correct fields | REQ-001, REQ-009 | 3 | false | Integration test with port fakes |
| PROP-018 | Full pipeline integration: write failure → `SaveError { kind: 'fs' }` + `NoteSaveFailed` | REQ-010 | 3 | false | Integration test with failing write stub |
| PROP-019 | `EditingSessionState` transitions: `editing → saving → editing` on success | REQ-015 | 2 | false | Example-based test with state assertions |
| PROP-020 | `EditingSessionState` transitions: `editing → saving → save-failed` on failure | REQ-015 | 2 | false | Example-based test with state assertions |
| PROP-021 | `ValidatedSaveRequest.frontmatter.updatedAt === requestedAt` (timestamp propagation) | REQ-002 | 2 | false | Example-based test |
| PROP-022 | `prepareSaveRequest` returns `SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } }` when invariant check fails (e.g., mocked clock returning timestamp before `createdAt`) — runtime verification of the InvariantViolated code path (resolves FIND-005) | REQ-005 | 2 | false | Example-based test with clock stub returning past timestamp |
| PROP-023 | On the EmptyNoteDiscarded path (idle trigger + empty body), `EditingSessionState` does NOT transition to `saving` — the state remains `editing` (resolves FIND-007) | REQ-003, REQ-015 | 2 | false | Example-based test: invoke `prepareSaveRequest` with empty body + idle trigger, assert state is still `editing` (not `saving`) |
| PROP-024 | Body/blocks coherence: at every emission/construction site, `body === serializeBlocksToMarkdown(blocks)` for `ValidatedSaveRequest`, `SaveNoteRequested`, and `NoteFileSaved` (Revision 3). Covers TS-side construction (`buildValidatedSaveRequest` factory, `BuildSaveNoteRequested`) and Rust echo pass-through (verified via PROP-017/PROP-018 integration test). Cross-language (Rust→TS) coherence is asserted via integration test, not fast-check. | REQ-018 | 1 | **true** | fast-check (property: build a `ValidatedSaveRequest` via factory from arbitrary `Block[]`, assert `request.body === serializeBlocksToMarkdown(request.blocks)`; example-based: pipeline run → emitted `SaveNoteRequested.body === serializeBlocksToMarkdown(emitted.blocks)` AND `NoteFileSaved.body === serializeBlocksToMarkdown(NoteFileSaved.blocks)`) |
| PROP-025 | `Note.isEmpty(note)` Revision 4 broader definition: returns `true` iff ALL blocks satisfy `b.type === "divider" \|\| (b.type === "paragraph" && isEmptyOrWhitespaceContent(b.content))`; returns `false` if any block has a non-paragraph/non-divider type or non-empty/non-whitespace paragraph content. Generator MUST exercise all 8 variants from the empty-Note table: (1) `[paragraph("")]` → true; (2) `[paragraph(""), paragraph("")]` → true; (3) `[paragraph(" \t")]` → true; (4) `[divider]` → true; (5) `[divider, paragraph("")]` → true; (6) `[heading-1("")]` → false; (7) `[bullet("")]` → false; (8) `[paragraph("hi")]` → false. `isEmptyOrWhitespaceContent` matches `/^\s*$/` (Unicode whitespace). Source: `aggregates.md` L120/L142 (broader rule), FIND-012/FIND-014 resolution. | REQ-003 | 1 | false | fast-check: generator produces all 8 variants (plus random non-empty blocks) and asserts the boolean output |
| PROP-026 | `serializeBlocksToMarkdown` ↔ `parseMarkdownToBlocks` structural roundtrip: `parseMarkdownToBlocks(serializeBlocksToMarkdown(blocks))` returns `Ok(blocks')` where `blocks'` is structurally equivalent to `blocks` modulo new `BlockId` values (per `blocks.ts` L13). Justifies treating `body` as a faithful derived view of `blocks` for downstream Hydration. | REQ-006, REQ-018 | 1 | false | fast-check (property: roundtrip on arbitrary `Block[]` produced by aggregate-respecting generator; equality up to `BlockId` substitution) |
| PROP-027 | **Cross-context traceability** — REQ-011 (`Feed.refreshSort` + `TagInventory.applyDelta`) is the Curate handler's responsibility, not CaptureAutoSave's. No PROP in this verification architecture directly verifies REQ-011. The `apply-filter-or-search` feature spec does not currently cover this; a dedicated Curate projection-refresh feature spec is the correct future home. This bead is a placeholder to ensure REQ-011 is not orphaned. Tier: 3, required: false. When the Curate projection-refresh feature is specced, it SHOULD add a PROP asserting that upon observing `NoteFileSaved`, `Feed.refreshSort` and `TagInventory.applyDelta` are called within the same handler tick. | REQ-011 | 3 | false | Cross-context integration test (future Curate projection-refresh feature) |
| PROP-028 | `CaptureAutoSave` type signature compile-time assertion (Tier 0). TypeScript type-level test: `type _checkCaptureAutoSave = Equals<CaptureAutoSave, (deps: CaptureDeps) => (state: EditingState, trigger: "idle" \| "blur") => Promise<Result<NoteFileSaved, SaveError>>>` with an `Assert<_checkCaptureAutoSave>` helper. If the signature drifts (e.g., wrong parameter order, wrong state type), compilation fails. Required: true — signature drift is a silent contract-break that PROP-017 (Tier 3 integration test) cannot catch because it tests whatever signature the implementation happens to have. | REQ-017 | 0 | **true** | TypeScript type-level test (`expectType` or `Equal<A,B>` + `Assert` helper) |

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. No runtime test needed; the type system enforces it at compile time.
- **Tier 1**: Property-based test with fast-check. Generated random inputs; checks structural invariants.
- **Tier 2**: Example-based unit test. Concrete inputs and expected outputs; verifies specific behaviors.
- **Tier 3**: Integration test. Exercises the full pipeline with port fakes/stubs; tests cross-step coordination.

In lean mode, `required: true` is reserved for the highest-risk invariants:
- **PROP-001** (serializeNote / serializeBlocksToMarkdown purity) — core correctness claim; if violated, non-deterministic file content.
- **PROP-002** (Obsidian format compliance) — external compatibility guarantee; broken format corrupts user data.
- **PROP-003** (empty-idle discard) — safety property; empty notes must not persist to disk on idle.
- **PROP-004** (empty-blur save) — dual of PROP-003; blur save must NOT discard user data.
- **PROP-005** (SaveError exhaustiveness) — type safety boundary; ensures no unhandled error variant.
- **PROP-014** (Clock.now budget) — purity boundary invariant; more than one call would leak time into pure steps.
- **PROP-024** (body/blocks coherence) — Revision 3 cross-cutting invariant; if violated, file content drifts from in-memory state and downstream Hydration/search become inconsistent.
- **PROP-028** (CaptureAutoSave type signature) — Revision 4; signature drift is a silent contract-break (FIND-019 resolution).

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-001 | PROP-017 |
| REQ-002 | PROP-021, PROP-024 |
| REQ-003 | PROP-003, PROP-023, PROP-025 |
| REQ-004 | PROP-003, PROP-004 |
| REQ-005 | PROP-005, PROP-006, PROP-022 |
| REQ-006 | PROP-001, PROP-002, PROP-016, PROP-026 |
| REQ-007 | PROP-015, PROP-017, PROP-018 |
| REQ-008 | PROP-011, PROP-024 |
| REQ-009 | PROP-009, PROP-011, PROP-017, PROP-024 |
| REQ-010 | PROP-008, PROP-010, PROP-018 |
| REQ-011 | PROP-027 |
| REQ-012 | PROP-012, PROP-013 |
| REQ-013 | PROP-005, PROP-006 |
| REQ-014 | PROP-007 |
| REQ-015 | PROP-019, PROP-020, PROP-023 |
| REQ-016 | PROP-001, PROP-014, PROP-015, PROP-016 |
| REQ-017 | PROP-017, PROP-028 |
| REQ-018 | PROP-024, PROP-026 |

Every requirement has at least one proof obligation. Eight `required: true` obligations (PROP-001 through PROP-005, PROP-014, PROP-024, PROP-028) cover the highest-risk invariants and span Tiers 0–1. Total proof obligations: 28 (PROP-001 through PROP-028).

### 改訂履歴 / Revision Log

| 日付 | 反復 | 対象 finding | 概要 |
|------|------|-------------|------|
| 2026-04-30 | 2 | FIND-003, FIND-006 | `FrontmatterSerializerToYaml` をポート契約セクションから内部純粋関数セクションへ移動。PROP-016 の description を更新し「`CaptureDeps` ポート」を明示して矛盾を解消 |
| 2026-04-30 | 2 | FIND-005 | PROP-022 を追加: `InvariantViolated` コードパスのランタイム検証（Tier 2, example-based） |
| 2026-04-30 | 2 | FIND-007 | PROP-023 を追加: EmptyNoteDiscarded パスで `EditingSessionState` が `saving` に遷移しないことの検証（Tier 2, example-based） |
| 2026-05-07 | 3 | block-migration | 型契約のブロックベース化対応：(1) Purity Boundary Map に `serializeBlocksToMarkdown(blocks)` を pure core ターゲットとして追加。(2) Internal pure functions セクションに `SerializeBlocksToMarkdown` を追加（CaptureDeps ポートではない Shared Kernel 純粋関数）。(3) PROP-001 / PROP-002 を Block 入力ベースに再定式化。(4) PROP-016 description に `serializeBlocksToMarkdown` を加筆。(5) 新規 PROP-024（body/blocks coherence、Tier 1, required: true）、PROP-025（block-based isEmpty 定義、Tier 1）、PROP-026（serialize↔parse roundtrip、Tier 1）を追加。(6) Coverage Matrix を REQ-018 含めて更新。(7) Required-true 義務を 6 → 7 に増加 |
| 2026-05-07 | 4 | FIND-014 | `isEmptyOrWhitespaceContent` ヘルパーを Internal pure functions セクションに追加。定義: `/^\s*$/.test(s)` (Unicode whitespace)。正例・負例を明示。PROP-025 description を更新し広義 isEmpty ルール（全 8 バリアント列挙）に対応 |
| 2026-05-07 | 4 | FIND-015 | Purity Boundary Map から `updateProjections` を "Out of scope" に変更。PROP-012/PROP-013 の description に "Curate handler" コンテキストを明記 |
| 2026-05-07 | 4 | FIND-017 | PROP-027 を追加（cross-context traceability プレースホルダー、Tier 3, required: false）。Coverage Matrix REQ-011 行を PROP-012/PROP-013 から PROP-027 に更新 |
| 2026-05-07 | 4 | FIND-019 | PROP-028 を追加（CaptureAutoSave 型シグネチャ Tier 0 compile-time assertion, required: true）。Coverage Matrix REQ-017 行に PROP-028 を追加。Required-true 義務を 7 → 8 に増加 |
| 2026-05-07 | 4.1 | FIND-020 | PROP-004 description に注記を追加: このPROPはパイプラインルーティング（`result.kind === 'validated'`）のみを検証する。body の値は variant によって異なる（REQ-004 acceptance 参照）。body の不変条件は REQ-018 / PROP-024 がカバーする |
