// Phase 11 — シナリオ 4: 過去ノートを開いて本文を編集 (EditPastNoteStart)
//
// 対応シナリオ: validation.md「シナリオ 4」(Core 体験)
// 対応ワークフロー: workflows.md Workflow 3 (EditPastNoteStart)
// 自動生成: 2026-04-28
//
// 検証目的:
//   PastNoteSelected → CurrentSessionDecision → FlushedCurrentSession → NewSession
//   が型表現可能であること。
//   classifyCurrentSession が編集状態を 3 種に分類できること。

import type { Result } from "../util/result.js";
import { ok, err } from "../util/result.js";
import type { SaveError, SwitchError } from "../shared/errors.js";
import type { PastNoteSelected } from "../shared/events.js";
import type { Note } from "../shared/note.js";
import type { NoteFileSnapshot } from "../shared/snapshots.js";
import type {
  CurrentSessionDecision,
  FlushedCurrentSession,
  NewSession,
} from "../capture/stages.js";
import type {
  EditingSessionState,
  EditingState,
  IdleState,
} from "../capture/states.js";
import type {
  ClassifyCurrentSession,
  EditPastNoteStart,
  FlushCurrentSession,
  StartNewSession,
} from "../capture/workflows.js";
import type { CaptureDeps } from "../capture/ports.js";
import { assertType } from "./_assert.js";
import {
  mockBody,
  mockFrontmatter,
  mockNoteId,
  mockTimestamp,
} from "./_mock.js";

// ──────────────────────────────────────────────────────────────────────
// Given: 新規ノート編集中（"WIP"、isDirty=true）+ 過去ノート N100 を選択
// ──────────────────────────────────────────────────────────────────────

const t0 = mockTimestamp(1_700_000_000_000);
const t1 = mockTimestamp(1_700_000_005_000);
const currentId = mockNoteId("2026-04-28-153045-218");
const pastId = mockNoteId("2026-04-25-093000-001");

const fmCurrent = mockFrontmatter([], t0, t0);
const currentNote: Note = {
  id: currentId,
  body: mockBody("WIP"),
  frontmatter: fmCurrent,
};

const pastNote: Note = {
  id: pastId,
  body: mockBody("過去ノート本文"),
  frontmatter: mockFrontmatter([], t0, t0),
};

const pastSnapshot: NoteFileSnapshot = {
  noteId: pastId,
  body: pastNote.body,
  frontmatter: pastNote.frontmatter,
  filePath: "/home/user/vault/2026-04-25-093000-001.md",
  fileMtime: t0,
};

const pastSelected: PastNoteSelected = {
  kind: "past-note-selected",
  noteId: pastId,
  snapshot: pastSnapshot,
  occurredOn: t1,
};

const editing: EditingState = {
  status: "editing",
  currentNoteId: currentId,
  isDirty: true,
  lastInputAt: t0,
  idleTimerHandle: null,
  lastSaveResult: null,
};

const idle: IdleState = { status: "idle" };

const captureDeps: CaptureDeps = {
  clockNow: () => t1,
  allocateNoteId: () => currentId,
  clipboardWrite: () => ok(undefined),
  publish: () => {
    /* noop */
  },
};

// ──────────────────────────────────────────────────────────────────────
// classifyCurrentSession スタブ: dirty / empty / no-current の 3 分類
// ──────────────────────────────────────────────────────────────────────

const classify: ClassifyCurrentSession = (state) => {
  if (state.status === "idle") return { kind: "no-current" };
  if (state.status === "editing") {
    if (!state.isDirty) return { kind: "empty", noteId: state.currentNoteId };
    return { kind: "dirty", noteId: state.currentNoteId, note: currentNote };
  }
  // saving / switching / save-failed は dirty 扱いで flush（保留中）
  if ("currentNoteId" in state) {
    return { kind: "dirty", noteId: state.currentNoteId, note: currentNote };
  }
  return { kind: "no-current" };
};

const decisionDirty: CurrentSessionDecision = classify(editing);
assertType<CurrentSessionDecision>(decisionDirty);
const decisionIdle: CurrentSessionDecision = classify(idle);
assertType<CurrentSessionDecision>(decisionIdle);

// 判別ユニオンの網羅性: switch で all-kind を扱えるか
const _exhaustive = (d: CurrentSessionDecision): "discarded" | "saved" | "no-op" => {
  switch (d.kind) {
    case "no-current":
      return "no-op";
    case "empty":
      return "discarded";
    case "dirty":
      return "saved";
  }
};
void _exhaustive;

// ──────────────────────────────────────────────────────────────────────
// flushCurrentSession スタブ: dirty なら save、empty なら discard
// ──────────────────────────────────────────────────────────────────────

const flush: FlushCurrentSession = (_deps) => async (decision) => {
  switch (decision.kind) {
    case "no-current":
      return ok({ kind: "FlushedCurrentSession", result: "no-op" });
    case "empty":
      return ok({ kind: "FlushedCurrentSession", result: "discarded" });
    case "dirty":
      return ok({ kind: "FlushedCurrentSession", result: "saved" });
  }
};

const flushPromise: Promise<Result<FlushedCurrentSession, SaveError>> = flush(
  captureDeps,
)(decisionDirty);
void flushPromise;

// ──────────────────────────────────────────────────────────────────────
// startNewSession スタブ: snapshot を Note に hydrate して NewSession 構築
// ──────────────────────────────────────────────────────────────────────

const startNewSessionStub: StartNewSession = (deps) => (input) => ({
  kind: "NewSession",
  noteId: input.noteId,
  note: {
    id: input.noteId,
    body: input.snapshot.body,
    frontmatter: input.snapshot.frontmatter,
  },
  startedAt: deps.clockNow(),
});

const session: NewSession = startNewSessionStub(captureDeps)(pastSelected);
assertType<NewSession>(session);

// ──────────────────────────────────────────────────────────────────────
// 全体: EditPastNoteStart スタブ
// ──────────────────────────────────────────────────────────────────────

const editPastNoteStartStub: EditPastNoteStart =
  (deps) => async (current, selection) => {
    const decision = classify(current);
    const flushed = await flush(deps)(decision);
    if (!flushed.ok) {
      // SaveError を SwitchError へ昇格
      const switchErr: SwitchError = {
        kind: "save-failed-during-switch",
        underlying: flushed.error,
        pendingNextNoteId: selection.noteId,
      };
      return err(switchErr);
    }
    const next = startNewSessionStub(deps)(selection);
    return ok(next);
  };

const result: Promise<Result<NewSession, SwitchError>> =
  editPastNoteStartStub(captureDeps)(editing, pastSelected);
assertType<Promise<Result<NewSession, SwitchError>>>(result);

// 任意の現在状態 (Idle / Editing) に対しても呼び出し可能
const _resultFromIdle: Promise<Result<NewSession, SwitchError>> =
  editPastNoteStartStub(captureDeps)(idle, pastSelected);
void _resultFromIdle;

// 状態判別ユニオン全体を引数に取れる
const anyState: EditingSessionState = editing;
const _anyResult: Promise<Result<NewSession, SwitchError>> =
  editPastNoteStartStub(captureDeps)(anyState, pastSelected);
void _anyResult;
