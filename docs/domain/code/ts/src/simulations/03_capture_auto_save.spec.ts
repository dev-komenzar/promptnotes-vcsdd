// Phase 11 — シナリオ 3: プロンプト下書きを書いてコピー（CaptureAutoSave）
//
// 対応シナリオ: validation.md「シナリオ 3」(Core 体験)
// 対応ワークフロー: workflows.md Workflow 2 (CaptureAutoSave) + Workflow 6 (CopyBody)
// 自動生成: 2026-04-28
//
// 検証目的:
//   1. DirtyEditingSession → ValidatedSaveRequest → NoteFileSaved の段階遷移を型表現可能
//   2. Empty body の場合に EmptyNoteDiscarded ルートに分岐する判別ユニオンが成立
//   3. 状態機械 EditingState → SavingState → EditingState の遷移関数シグネチャが満たせる

import type { Result } from "../util/result.js";
import { ok, err } from "../util/result.js";
import type { SaveError } from "../shared/errors.js";
import type {
  EmptyNoteDiscarded,
  NoteFileSaved,
  SaveNoteRequested,
} from "../shared/events.js";
import type { Note } from "../shared/note.js";
import type {
  DirtyEditingSession,
  ValidatedSaveRequest,
  ClipboardText,
} from "../capture/stages.js";
import type {
  EditingSessionTransitions,
  EditingState,
  IdleState,
  IdleTimerHandle,
  SavingState,
} from "../capture/states.js";
import type {
  BuildSaveNoteRequested,
  CaptureAutoSave,
  CopyBody,
  DispatchSaveRequest,
  EmitSaveAndTransition,
  PrepareSaveRequest,
} from "../capture/workflows.js";
import type { CaptureDeps } from "../capture/ports.js";
import { assertType, assertKind } from "./_assert.js";
import {
  mockBody,
  mockFrontmatter,
  mockNoteId,
  mockTimestamp,
} from "./_mock.js";

// ──────────────────────────────────────────────────────────────────────
// Given: 新規ノートに Refactor... と入力済み (isDirty=true)
// ──────────────────────────────────────────────────────────────────────

const t1 = mockTimestamp(1_700_000_000_000);
const t2 = mockTimestamp(1_700_000_002_000); // +2s（idle save 発火）
const noteId = mockNoteId("2026-04-28-153045-218");
const idleHandle: IdleTimerHandle = {
  __opaque: "IdleTimerHandle",
} as IdleTimerHandle;

const fm1 = mockFrontmatter([], t1, t1);
const fm2 = mockFrontmatter([], t1, t2);

const note: Note = {
  id: noteId,
  body: mockBody("Refactor the auth middleware to..."),
  frontmatter: fm2,
};

const editingState: EditingState = {
  status: "editing",
  currentNoteId: noteId,
  isDirty: true,
  lastInputAt: t1,
  idleTimerHandle: idleHandle,
  lastSaveResult: null,
};

const dirty: DirtyEditingSession = {
  kind: "DirtyEditingSession",
  noteId,
  note,
  previousFrontmatter: fm1,
  trigger: "idle",
};

const captureDeps: CaptureDeps = {
  clockNow: () => t2,
  allocateNoteId: () => noteId,
  clipboardWrite: () => ok(undefined),
  publish: () => {
    /* noop */
  },
};

// ──────────────────────────────────────────────────────────────────────
// PrepareSaveRequest スタブ: 通常パス（valid → ValidatedSaveRequest）
// ──────────────────────────────────────────────────────────────────────

const prepareValid: PrepareSaveRequest = (deps) => (input) => {
  const request: ValidatedSaveRequest = {
    kind: "ValidatedSaveRequest",
    noteId: input.noteId,
    body: input.note.body,
    frontmatter: input.note.frontmatter,
    previousFrontmatter: input.previousFrontmatter,
    trigger: input.trigger,
    requestedAt: deps.clockNow(),
  };
  return ok({ kind: "validated" as const, request });
};

const prepResult = prepareValid(captureDeps)(dirty);
if (!prepResult.ok) {
  throw new Error("simulation: prepare must succeed in scenario 3");
}
const validated = assertKind("validated")(prepResult.value);
assertType<ValidatedSaveRequest>(validated.request);

// ──────────────────────────────────────────────────────────────────────
// PrepareSaveRequest スタブ: Empty body 分岐（シナリオ 3 では発火しないが
// 型レベルで EmptyNoteDiscarded ルートが取り出せることを確認）
// ──────────────────────────────────────────────────────────────────────

const prepareEmpty: PrepareSaveRequest = (deps) => (input) =>
  ok({
    kind: "empty-discarded" as const,
    event: {
      kind: "empty-note-discarded",
      noteId: input.noteId,
      occurredOn: deps.clockNow(),
    } satisfies EmptyNoteDiscarded,
  });

const emptyResult = prepareEmpty(captureDeps)(dirty);
if (emptyResult.ok && emptyResult.value.kind === "empty-discarded") {
  assertType<EmptyNoteDiscarded>(emptyResult.value.event);
}

// PrepareSaveRequest スタブ: SaveError 戻し（不変条件違反想定）
const prepareInvariantFail: PrepareSaveRequest = (_deps) => (_input) =>
  err({
    kind: "validation",
    reason: { kind: "invariant-violated", detail: "stub" },
  });
void prepareInvariantFail;

// ──────────────────────────────────────────────────────────────────────
// BuildSaveNoteRequested + EmitSaveAndTransition (純粋ステップ)
// ──────────────────────────────────────────────────────────────────────

const buildSaveNoteRequested: BuildSaveNoteRequested = (request) => ({
  kind: "save-note-requested",
  noteId: request.noteId,
  body: request.body,
  frontmatter: request.frontmatter,
  previousFrontmatter: request.previousFrontmatter,
  source: request.trigger === "idle" ? "capture-idle" : "capture-blur",
  occurredOn: request.requestedAt,
});

const saveRequested: SaveNoteRequested = buildSaveNoteRequested(
  validated.request,
);
assertType<SaveNoteRequested>(saveRequested);

const emitSaveAndTransition: EmitSaveAndTransition =
  (deps) => (_request, state) => ({
    status: "saving",
    currentNoteId: state.currentNoteId,
    savingStartedAt: deps.clockNow(),
  });

const savingState: SavingState = emitSaveAndTransition(captureDeps)(
  validated.request,
  editingState,
);
assertType<SavingState>(savingState);

// ──────────────────────────────────────────────────────────────────────
// DispatchSaveRequest → NoteFileSaved (成功) / NoteSaveFailed (失敗)
// ──────────────────────────────────────────────────────────────────────

const dispatchOk: DispatchSaveRequest = (_deps) => async (request) =>
  ok({
    kind: "note-file-saved",
    noteId: request.noteId,
    body: request.body,
    frontmatter: request.frontmatter,
    previousFrontmatter: request.previousFrontmatter,
    occurredOn: request.requestedAt,
  });

const dispatchFail: DispatchSaveRequest = (_deps) => async (req) =>
  err({
    kind: "note-save-failed",
    noteId: req.noteId,
    reason: "permission",
    occurredOn: req.requestedAt,
  });

void dispatchOk;
void dispatchFail;

// ──────────────────────────────────────────────────────────────────────
// 全体: CaptureAutoSave（型シグネチャを通る最小実装）
// ──────────────────────────────────────────────────────────────────────

const captureAutoSaveStub: CaptureAutoSave = (deps) =>
  async (state, _trigger) =>
    ok({
      kind: "note-file-saved",
      noteId: state.currentNoteId,
      body: mockBody(""),
      frontmatter: mockFrontmatter([], deps.clockNow(), deps.clockNow()),
      previousFrontmatter: null,
      occurredOn: deps.clockNow(),
    });

const _autoSavePromise: Promise<Result<NoteFileSaved, SaveError>> =
  captureAutoSaveStub(captureDeps)(editingState, "idle");
void _autoSavePromise;

// ──────────────────────────────────────────────────────────────────────
// EditingSessionTransitions: editing → saving → editing
// ──────────────────────────────────────────────────────────────────────

declare const transitions: EditingSessionTransitions;

const beforeSave: SavingState = transitions.beginAutoSave(editingState, t2);
assertType<SavingState>(beforeSave);

const afterSave: EditingState = transitions.onSaveSucceeded(beforeSave, t2);
assertType<EditingState>(afterSave);

// ──────────────────────────────────────────────────────────────────────
// CopyBody（Workflow 6）: シナリオ 3 末尾、コピー操作
// ──────────────────────────────────────────────────────────────────────

const copyBodyStub: CopyBody = (_deps) => (state) =>
  ok({
    kind: "ClipboardText",
    text: "Refactor the auth middleware to...",
    noteId: state.currentNoteId,
  } satisfies ClipboardText);

const copyResult: Result<ClipboardText, SaveError> =
  copyBodyStub(captureDeps)(editingState);
assertType<Result<ClipboardText, SaveError>>(copyResult);

// IdleState 起点の遷移も検証
const idleState: IdleState = { status: "idle" };
const next: EditingState = transitions.focusOnNote(idleState, noteId, t2);
assertType<EditingState>(next);
