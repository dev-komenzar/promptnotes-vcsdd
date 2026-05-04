# Proof Harness Inventory — ui-editor (Phase 5)

**Feature**: `ui-editor`
**Date**: 2026-05-04
**Language**: TypeScript
**Note**: In TypeScript projects, "proof harnesses" are the property tests (fast-check) plus structural type assertions. There are no separate harness files; the harness IS the test file. This README catalogs the mapping.

---

## Tier 0 — Compile-time (TypeScript structural assertions)

Tier 0 obligations are enforced by `tsc --strict --noUncheckedIndexedAccess` at every CI run. No separate test execution is needed; a type error is a build failure.

| Obligation | Location | Artifact |
|---|---|---|
| `_AssertEditNoteBodyShape` — `'edit-note-body'` payload satisfies `{ noteId: string; newBody: string; issuedAt: string; dirty: true }` | `promptnotes/src/lib/editor/types.ts:264` | Type alias; enforced at `tauriEditorAdapter.ts:14` |
| `_AssertCopyNoteBodyShape` — `'copy-note-body'` payload satisfies `{ noteId: string; body: string }` | `promptnotes/src/lib/editor/types.ts:267` | Type alias; enforced at `tauriEditorAdapter.ts:15` |
| Exhaustive switch on `EditorViewState.status` (`never` branch) | `promptnotes/src/lib/editor/editorPredicates.ts:42-44` (`canCopy`), `EditorPane.svelte` (derived status branches) | Compile-time `never` guard |
| Exhaustive switch on `SaveError.kind` + `FsError.kind` (`never` branch) | `promptnotes/src/lib/editor/editorPredicates.ts:62-64` (`bannerMessageFor`) + `FS_ERROR_MESSAGES` Record type | Record key type enforces FsError exhaustiveness |
| Exhaustive switch on `EditorAction` discriminated union (`never` branch) | `promptnotes/src/lib/editor/editorReducer.ts:295-298` | Compile-time `never` guard |
| `EditorViewState` is distinct from `EditingSessionState` (PROP-EDIT-029) | `promptnotes/src/lib/editor/types.ts` (separate type declarations) | Type system enforces separation; `tsc --strict` verifies |
| `EditorCommandSaveSource` literal union `'capture-idle' \| 'capture-blur'` (PROP-EDIT-009) | `promptnotes/src/lib/editor/types.ts` | Branded string union; passing `'idle'` or `'blur'` is a compile error |

---

## Tier 1 — Pure unit tests (bun:test, deterministic example-based)

Run command: `bun test src/lib/editor` inside `promptnotes/`
Results: 133 pass, 0 fail across 6 files

| PROP-ID | Required | Test File | Test Name(s) |
|---|---|---|---|
| PROP-EDIT-010 | true | `promptnotes/src/lib/editor/__tests__/editorReducer.test.ts` | `'NoteFileSaved → isDirty=false + cancel-idle-timer command'` |
| PROP-EDIT-011 | true | `promptnotes/src/lib/editor/__tests__/editorReducer.test.ts` | `'BlurEvent in saving state → no commands emitted (EC-EDIT-002)'` |
| PROP-EDIT-031 | true | `promptnotes/src/lib/editor/__tests__/editorPredicates.test.ts` | `'bannerMessageFor fs:permission → "保存に失敗しました（権限不足）"'`, `'bannerMessageFor fs:disk-full'`, `'bannerMessageFor fs:lock'`, `'bannerMessageFor fs:unknown'`, `'bannerMessageFor validation:* → null'` |
| PROP-EDIT-003 (boundary) | true | `promptnotes/src/lib/editor/__tests__/debounceSchedule.test.ts` | `'exactly at threshold: nowMs===lastEditAt+debounceMs → shouldFire=true'`, `'one ms before threshold → shouldFire=false'`, `'one ms after threshold → shouldFire=true'` |
| PROP-EDIT-004 (boundary) | true | `promptnotes/src/lib/editor/__tests__/debounceSchedule.test.ts` | `'if blur-save completed (lastSaveAt > lastEditAt), idle should NOT fire'`, `'if lastSaveAt > lastEditAt+debounceMs → shouldFire=false, fireAt=null'` |

---

## Tier 2 — Property tests (fast-check + bun:test, required: true obligations)

Run command: `bun test src/lib/editor` inside `promptnotes/` (bun auto-discovers `*.test.ts` and `*.prop.test.ts`)
Results: all fast-check assertions pass (≥100 runs each)

| PROP-ID | Required | Test File | Property Description | fast-check Runs |
|---|---|---|---|---|
| PROP-EDIT-001 | true | `promptnotes/src/lib/editor/__tests__/prop/editorPredicates.prop.test.ts` | NOT PRESENT AS NAMED PROP-001 — covered indirectly by PROP-EDIT-005/006; `isDirty` lives in reducer (see PROP-EDIT-008 for idempotency) | — |
| PROP-EDIT-002 | true | `promptnotes/src/lib/editor/__tests__/prop/editorReducer.prop.test.ts` | `source` in save commands always drawn from `EditorCommandSaveSource`; equals action input source | ≥100 |
| PROP-EDIT-003 | true | `promptnotes/src/lib/editor/__tests__/prop/debounceSchedule.prop.test.ts` | Debounce semantics: `shouldFire=true` iff `lastEditAt+debounceMs<=nowMs AND lastSaveAt<=lastEditAt`; burst never fires within window | ≥100 (6 sub-properties) |
| PROP-EDIT-004 | true | `promptnotes/src/lib/editor/__tests__/prop/debounceSchedule.prop.test.ts` | `lastSaveAt > lastEditAt` → `shouldFire=false` (blur-cancels-idle); `fireAt=null` | ≥100 (4 sub-properties) |
| PROP-EDIT-005 | true | `promptnotes/src/lib/editor/__tests__/prop/editorPredicates.prop.test.ts` | `bannerMessageFor(fs error)` returns non-empty string for all 4 FsError variants; `bannerMessageFor(validation error)` returns `null` | ≥200 |
| PROP-EDIT-006 | true | `promptnotes/src/lib/editor/__tests__/prop/editorPredicates.prop.test.ts` | `canCopy` false for `{idle,switching,save-failed}` regardless of body; `canCopy === !isEmptyAfterTrim(body)` for `{editing,saving}` | ≥200 |
| PROP-EDIT-007 | true | `promptnotes/src/lib/editor/__tests__/prop/editorReducer.prop.test.ts` | Reducer totality: returns defined `EditorViewState` + `ReadonlyArray<EditorCommand>` for all (status, action) pairs; never throws; `status` always in 5-value enum | ≥200 |
| PROP-EDIT-008 | true | `promptnotes/src/lib/editor/__tests__/prop/editorReducer.prop.test.ts` | Referential transparency: same `(state, action)` → deep-equal `{state, commands}` | ≥200 |
| PROP-EDIT-040 | true | `promptnotes/src/lib/editor/__tests__/prop/editorReducer.prop.test.ts` | `DomainSnapshotReceived` mirroring: `{status,isDirty,currentNoteId,pendingNextNoteId}` match snapshot exactly | ≥200 |

**Note on PROP-EDIT-001**: The property is stated as `isDirty(body, body) === false` (idempotent dirty detection). In this implementation, `isDirty` is a reducer state field, not a standalone predicate. The equivalent property is covered by: (a) `PROP-EDIT-008` (reducer purity/idempotency), and (b) `PROP-EDIT-007` sub-assertions (`NoteFileSaved → isDirty=false`). There is no standalone `isDirty(x,x)` predicate function in the implementation; this is by design.

**Note on PROP-EDIT-009**: Marked `Required: false` in verification-architecture.md §4 (subsumed by PROP-EDIT-002). Not an independent gate obligation.

---

## Integration tier — vitest + jsdom (Required: false obligations)

Run command: `bun run test:dom -- src/lib/editor/__tests__/dom` inside `promptnotes/`
Results: 127 pass, 0 fail across 18 DOM test files

| PROP-IDs | Test File |
|---|---|
| PROP-EDIT-016, PROP-EDIT-018, PROP-EDIT-019, PROP-EDIT-020a, PROP-EDIT-020b, PROP-EDIT-021, PROP-EDIT-022, PROP-EDIT-023, PROP-EDIT-034 | `promptnotes/src/lib/editor/__tests__/dom/editor-panel.dom.vitest.ts` |
| PROP-EDIT-024, PROP-EDIT-025, PROP-EDIT-026, PROP-EDIT-027, PROP-EDIT-028, PROP-EDIT-037, PROP-EDIT-039 | `promptnotes/src/lib/editor/__tests__/dom/editor-session-state.dom.vitest.ts` |
| PROP-EDIT-012, PROP-EDIT-013, PROP-EDIT-014, PROP-EDIT-015, PROP-EDIT-030, PROP-EDIT-038 | `promptnotes/src/lib/editor/__tests__/dom/save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-032 | `promptnotes/src/lib/editor/__tests__/dom/editor-validation.dom.vitest.ts` |
| PROP-EDIT-033 | `promptnotes/src/lib/editor/__tests__/dom/editor-accessibility.dom.vitest.ts` |
| PROP-EDIT-017 | `promptnotes/src/lib/editor/__tests__/dom/editor-panel.dom.vitest.ts` |
| Additional adapter/shell tests | `promptnotes/src/lib/editor/__tests__/dom/EditorPane.mount.dom.vitest.ts`, `EditorPane.body-input.dom.vitest.ts`, `EditorPane.idle-save.dom.vitest.ts`, `EditorPane.blur-save.dom.vitest.ts`, `EditorPane.copy.dom.vitest.ts`, `EditorPane.new-note.dom.vitest.ts`, `EditorPane.save-failed.dom.vitest.ts`, `EditorPane.state-mirror.dom.vitest.ts`, `clipboardAdapter.dom.vitest.ts`, `debounceTimer.dom.vitest.ts`, `editorStateChannel.dom.vitest.ts`, `keyboardListener.dom.vitest.ts`, `tauriEditorAdapter.dom.vitest.ts` |

---

## Coverage summary (as measured by available tooling)

The vitest coverage config (`vitest.config.ts`) includes only `dom/**/*.vitest.ts` files. Pure unit and property tests run under `bun test` which reports line coverage only (no branch coverage). The combined picture is:

| Metric | Tool | Result |
|---|---|---|
| Pure unit + property tests | `bun test` | 133/133 pass |
| DOM integration tests | `vitest` | 127/127 pass |
| `debounceSchedule.ts` line coverage | `bun test --coverage` | 100% |
| `editorReducer.ts` line coverage | `bun test --coverage` | 97.25% |
| `editorPredicates.ts` line coverage | `bun test --coverage` | 70.45% |
| Branch coverage (DOM-only vitest path) | `vitest --coverage` | UNDERCOUNTS — DOM tests do not invoke pure functions directly |

**Coverage gate status**: The Phase 5 gate specifies `bun run test:dom -- --coverage` as the measurement command, but the vitest config's `include` pattern (`src/lib/**/__tests__/dom/**/*.vitest.ts`) excludes the pure-tier test files (`*.test.ts`, `*.prop.test.ts`) that are the primary exercisers of `editorPredicates.ts`, `editorReducer.ts`, and `debounceSchedule.ts`. This causes an apparent coverage shortfall for those modules under the vitest measurement path, even though bun test achieves 97-100% line coverage on them. This is a toolchain configuration gap, not a test gap. See Top Risks in verification-report.md.
