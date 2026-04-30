# Verification Architecture: CaptureAutoSave

**Feature**: `capture-auto-save`
**Phase**: 1b
**Revision**: 1
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 2, `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/workflows.ts`, `docs/domain/code/ts/src/capture/ports.ts`, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/shared/events.ts`

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `prepareSaveRequest` | **Mixed** | `Clock.now()` is effectful; body emptiness check and validation logic are pure |
| Step 1 (empty check) | `Note.isEmpty(note)` | **Pure core** | No ports, no I/O, deterministic; property-test target |
| Step 1 (validation) | Frontmatter/VO invariant checks | **Pure core** | Enforced by aggregate constructors |
| Step 2 | `serializeNote` | **Pure core** | No port dependencies; deterministic YAML serialization; `ValidatedSaveRequest → SerializedMarkdown` is referentially transparent |
| Step 3 | `writeMarkdown` | **Effectful shell** | `FileSystem.writeFileAtomic` — write I/O boundary |
| Step 3 (events) | `SaveNoteRequested` + `NoteFileSaved`/`NoteSaveFailed` emission | **Effectful shell** | `publish()` — event bus I/O |
| Step 4 | `updateProjections` | **In-memory write** | `Feed.refreshSort` + `TagInventory.applyDelta` — no file I/O, but mutates Curate Read Model state |
| Step 4 (tag delta) | Tag diff computation | **Pure core** | `previousFrontmatter.tags` vs `frontmatter.tags` comparison is deterministic |

**Formally verifiable core**: `serializeNote`, `Note.isEmpty`, tag delta computation, trigger-to-source mapping.

**Effectful shell**: `Clock.now()` in Step 1, `FileSystem.writeFileAtomic` in Step 3, `publish()` for events.

---

## Port Contracts

Port signatures match `docs/domain/workflows.md §依存（ポート）一覧` and `docs/domain/code/ts/src/capture/ports.ts`.

```typescript
// ── Clock ──────────────────────────────────────────────────────────────
/** Return the current wall-clock time. Purity-violating. Called once in Step 1. */
type ClockNow = () => Timestamp;

// ── FrontmatterSerializer ──────────────────────────────────────────────
/** Serialize Frontmatter to YAML string.
 *  Pure function — no I/O. Used in Step 2 (serializeNote).
 *  Source: workflows.md §依存（ポート）一覧. */
type FrontmatterSerializerToYaml = (fm: Frontmatter) => string;

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
/** Check if a note body is empty/whitespace-only.
 *  Pure function. Source: note.ts NoteOps.isEmpty. */
type NoteIsEmpty = (note: Note) => boolean;
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
| PROP-001 | `serializeNote` is pure: same `ValidatedSaveRequest` input always produces identical `SerializedMarkdown` output | REQ-006, REQ-016 | 1 | **true** | fast-check (property: `∀ input, fn(input) === fn(input)`) |
| PROP-002 | `serializeNote` output matches Obsidian format: starts with `---\n`, contains YAML, then `---\n`, then body | REQ-006 | 1 | **true** | fast-check (property: output matches `/^---\n[\s\S]*\n---\n[\s\S]*$/`) |
| PROP-003 | Empty body on idle trigger returns EmptyNoteDiscarded, NOT a SaveError | REQ-003, REQ-004 | 1 | **true** | fast-check (property: `∀ note where isEmpty(note), trigger="idle" → result.kind === "empty-discarded"`) |
| PROP-004 | Empty body on blur trigger proceeds to ValidatedSaveRequest (does NOT discard) | REQ-004 | 1 | **true** | fast-check (property: `∀ note where isEmpty(note), trigger="blur" → result.kind === "validated"`) |
| PROP-005 | `SaveError` type is exhaustive: only `'validation'` or `'fs'` kind values exist | REQ-013 | 0 | **true** | TypeScript type exhaustiveness (never branch in switch) |
| PROP-006 | `SaveValidationError` type is exhaustive: only `'empty-body-on-idle'` or `'invariant-violated'` | REQ-013 | 0 | false | TypeScript type exhaustiveness |
| PROP-007 | Trigger-to-source mapping: `"idle"` → `"capture-idle"`, `"blur"` → `"capture-blur"`, exhaustive | REQ-014 | 1 | false | fast-check (property: mapping is total over `{"idle","blur"}`) |
| PROP-008 | `FsError` → `NoteSaveFailureReason` mapping: `permission` → `"permission"`, `disk-full` → `"disk-full"`, `lock` → `"lock"`, `not-found` → `"unknown"`, `unknown` → `"unknown"` | REQ-010 | 1 | false | fast-check with finite generator over all 5 FsError variants |
| PROP-009 | `NoteFileSaved` is emitted exactly once on write success; `NoteSaveFailed` is NOT emitted | REQ-009 | 2 | false | Example-based test with event spy |
| PROP-010 | `NoteSaveFailed` is emitted exactly once on write failure; `NoteFileSaved` is NOT emitted | REQ-010 | 2 | false | Example-based test with event spy |
| PROP-011 | `SaveNoteRequested` is emitted BEFORE `NoteFileSaved` (event ordering) | REQ-008, REQ-009 | 2 | false | Example-based test with ordered event spy |
| PROP-012 | `TagInventoryUpdated` is emitted iff tag delta exists between `previousFrontmatter` and `frontmatter` | REQ-012 | 1 | false | fast-check (property: emit iff `prevTags ≠ newTags`) |
| PROP-013 | `TagInventoryUpdated` NOT emitted when `previousFrontmatter` is null and new note has no tags | REQ-012 | 2 | false | Example-based test |
| PROP-014 | `Clock.now()` is called exactly once per pipeline run (in Step 1 `prepareSaveRequest`) | REQ-016 | 1 | **true** | Spy wrapper: instrument `clockNow` with counter; run pipeline → counter === 1 |
| PROP-015 | `FileSystem.writeFileAtomic` is called exactly once per pipeline run (in Step 3) | REQ-016 | 2 | false | Spy wrapper with counter |
| PROP-016 | `serializeNote` calls no ports — it has zero dependencies beyond its input | REQ-006, REQ-016 | 1 | false | TypeScript type assertion: `serializeNote` parameter list has no `Deps` argument |
| PROP-017 | Full pipeline integration: happy path → `NoteFileSaved` with correct fields | REQ-001, REQ-009 | 3 | false | Integration test with port fakes |
| PROP-018 | Full pipeline integration: write failure → `SaveError { kind: 'fs' }` + `NoteSaveFailed` | REQ-010 | 3 | false | Integration test with failing write stub |
| PROP-019 | `EditingSessionState` transitions: `editing → saving → editing` on success | REQ-015 | 2 | false | Example-based test with state assertions |
| PROP-020 | `EditingSessionState` transitions: `editing → saving → save-failed` on failure | REQ-015 | 2 | false | Example-based test with state assertions |
| PROP-021 | `ValidatedSaveRequest.frontmatter.updatedAt === requestedAt` (timestamp propagation) | REQ-002 | 2 | false | Example-based test |

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. No runtime test needed; the type system enforces it at compile time.
- **Tier 1**: Property-based test with fast-check. Generated random inputs; checks structural invariants.
- **Tier 2**: Example-based unit test. Concrete inputs and expected outputs; verifies specific behaviors.
- **Tier 3**: Integration test. Exercises the full pipeline with port fakes/stubs; tests cross-step coordination.

In lean mode, `required: true` is reserved for the highest-risk invariants:
- **PROP-001** (serializeNote purity) — core correctness claim; if violated, non-deterministic file content.
- **PROP-002** (Obsidian format compliance) — external compatibility guarantee; broken format corrupts user data.
- **PROP-003** (empty-idle discard) — safety property; empty notes must not persist to disk on idle.
- **PROP-004** (empty-blur save) — dual of PROP-003; blur save must NOT discard user data.
- **PROP-005** (SaveError exhaustiveness) — type safety boundary; ensures no unhandled error variant.
- **PROP-014** (Clock.now budget) — purity boundary invariant; more than one call would leak time into pure steps.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-001 | PROP-017 |
| REQ-002 | PROP-021 |
| REQ-003 | PROP-003 |
| REQ-004 | PROP-003, PROP-004 |
| REQ-005 | PROP-005, PROP-006 |
| REQ-006 | PROP-001, PROP-002, PROP-016 |
| REQ-007 | PROP-015, PROP-017, PROP-018 |
| REQ-008 | PROP-011 |
| REQ-009 | PROP-009, PROP-011, PROP-017 |
| REQ-010 | PROP-008, PROP-010, PROP-018 |
| REQ-011 | PROP-012, PROP-013 |
| REQ-012 | PROP-012, PROP-013 |
| REQ-013 | PROP-005, PROP-006 |
| REQ-014 | PROP-007 |
| REQ-015 | PROP-019, PROP-020 |
| REQ-016 | PROP-001, PROP-014, PROP-015, PROP-016 |
| REQ-017 | PROP-017 |

Every requirement has at least one proof obligation. Six `required: true` obligations (PROP-001 through PROP-005, PROP-014) cover the highest-risk invariants and span Tiers 0–1. Total proof obligations: 21 (PROP-001 through PROP-021).
