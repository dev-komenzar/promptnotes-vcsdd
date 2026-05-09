// Phase 11 — シナリオ 4: 過去ノートを開いて本文を編集 (EditPastNoteStart)
//
// 対応シナリオ: validation.md「シナリオ 4」(Core 体験)
// 対応ワークフロー: workflows.md Workflow 3 (EditPastNoteStart)
// ブロックベース UI 化により入力は BlockFocusRequest{noteId, blockId, snapshot?}
// （aggregates.md L326）。同一 Note 内ブロック移動は same-note 経由で flush skip。
//
// 検証目的:
//   BlockFocusRequest → CurrentSessionDecision → FlushedCurrentSession → NewSession
//   が型表現可能であること。
//   classifyCurrentSession が編集状態を 4 種に分類できること。

import type { Result } from "../util/result.js";
import { ok, err } from "../util/result.js";
import type { SaveError, SwitchError } from "../shared/errors.js";
import type { Note } from "../shared/note.js";
import type { NoteFileSnapshot } from "../shared/snapshots.js";
import type {
  BlockFocusRequest,
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
  mockBlock,
  mockBlockId,
  mockBody,
  mockFrontmatter,
  mockNoteId,
  mockTimestamp,
} from "./_mock.js";

// ──────────────────────────────────────────────────────────────────────
// Given: 新規ノート編集中（"WIP"、isDirty=true）+ 過去ノート N100 の
// 先頭ブロックにフォーカスが移った
// ──────────────────────────────────────────────────────────────────────

const t0 = mockTimestamp(1_700_000_000_000);
const t1 = mockTimestamp(1_700_000_005_000);
const currentId = mockNoteId("2026-04-28-153045-218");
const pastId = mockNoteId("2026-04-25-093000-001");
const currentBlockId = mockBlockId("block-0");
const pastBlockId = mockBlockId("block-0");

const fmCurrent = mockFrontmatter([], t0, t0);
const currentNote: Note = {
  id: currentId,
  blocks: [mockBlock("block-0", "WIP", "paragraph")],
  frontmatter: fmCurrent,
};

const pastNote: Note = {
  id: pastId,
  blocks: [mockBlock("block-0", "過去ノート本文", "paragraph")],
  frontmatter: mockFrontmatter([], t0, t0),
};

const pastSnapshot: NoteFileSnapshot = {
  noteId: pastId,
  // ファイル境界では Markdown 文字列。Hydration で blocks へ変換される。
  body: mockBody("過去ノート本文"),
  frontmatter: pastNote.frontmatter,
  filePath: "/home/user/vault/2026-04-25-093000-001.md",
  fileMtime: t0,
};

/** 別 Note のブロックにフォーカスが移った場合の BlockFocusRequest。 */
const pastFocusRequest: BlockFocusRequest = {
  kind: "BlockFocusRequest",
  noteId: pastId,
  blockId: pastBlockId,
  snapshot: pastSnapshot,
};

/** 同一 Note 内のブロック移動を表す BlockFocusRequest（snapshot=null）。 */
const sameNoteFocusRequest: BlockFocusRequest = {
  kind: "BlockFocusRequest",
  noteId: currentId,
  blockId: mockBlockId("block-1"),
  snapshot: null,
};

const editing: EditingState = {
  status: "editing",
  currentNoteId: currentId,
  focusedBlockId: currentBlockId,
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
// classifyCurrentSession スタブ:
// dirty / empty / no-current / same-note の 4 分類
// ──────────────────────────────────────────────────────────────────────

const classify: ClassifyCurrentSession = (state, request) => {
  if (state.status === "idle") return { kind: "no-current" };
  if (state.status === "editing") {
    if (state.currentNoteId === request.noteId) {
      // 同一 Note 内ブロック移動：flush skip
      return {
        kind: "same-note",
        noteId: state.currentNoteId,
        note: currentNote,
      };
    }
    if (!state.isDirty) return { kind: "empty", noteId: state.currentNoteId };
    return { kind: "dirty", noteId: state.currentNoteId, note: currentNote };
  }
  // saving / switching / save-failed は dirty 扱いで flush（保留中）
  if ("currentNoteId" in state) {
    return { kind: "dirty", noteId: state.currentNoteId, note: currentNote };
  }
  return { kind: "no-current" };
};

const decisionDirty: CurrentSessionDecision = classify(editing, pastFocusRequest);
assertType<CurrentSessionDecision>(decisionDirty);
const decisionIdle: CurrentSessionDecision = classify(idle, pastFocusRequest);
assertType<CurrentSessionDecision>(decisionIdle);
const decisionSameNote: CurrentSessionDecision = classify(
  editing,
  sameNoteFocusRequest,
);
assertType<CurrentSessionDecision>(decisionSameNote);

// 判別ユニオンの網羅性: switch で all-kind を扱えるか
const _exhaustive = (
  d: CurrentSessionDecision,
): "discarded" | "saved" | "no-op" | "same-note-skipped" => {
  switch (d.kind) {
    case "no-current":
      return "no-op";
    case "empty":
      return "discarded";
    case "dirty":
      return "saved";
    case "same-note":
      return "same-note-skipped";
  }
};
void _exhaustive;

// ──────────────────────────────────────────────────────────────────────
// flushCurrentSession スタブ: dirty なら save、empty なら discard、
// same-note は skip
// ──────────────────────────────────────────────────────────────────────

const flush: FlushCurrentSession = (_deps) => async (decision) => {
  switch (decision.kind) {
    case "no-current":
      return ok({ kind: "FlushedCurrentSession", result: "no-op" });
    case "empty":
      return ok({ kind: "FlushedCurrentSession", result: "discarded" });
    case "dirty":
      return ok({ kind: "FlushedCurrentSession", result: "saved" });
    case "same-note":
      return ok({ kind: "FlushedCurrentSession", result: "same-note-skipped" });
  }
};

const flushPromise: Promise<Result<FlushedCurrentSession, SaveError>> = flush(
  captureDeps,
)(decisionDirty);
void flushPromise;

// ──────────────────────────────────────────────────────────────────────
// startNewSession スタブ: snapshot を Note に hydrate して NewSession 構築
// （別 Note の場合）。同一 Note 内移動なら snapshot=null で既存 note を継続。
// ──────────────────────────────────────────────────────────────────────

const startNewSessionStub: StartNewSession = (deps) => (request) => {
  const note: Note =
    request.snapshot === null
      ? currentNote
      : {
          id: request.noteId,
          // 実装側では parseMarkdownToBlocks(snapshot.body) で blocks を導出する。
          // simulation では mockBlock で型契約レベルのスタブを置く。
          blocks: [mockBlock("block-0", "過去ノート本文", "paragraph")],
          frontmatter: request.snapshot.frontmatter,
        };
  return {
    kind: "NewSession",
    noteId: request.noteId,
    note,
    focusedBlockId: request.blockId,
    startedAt: deps.clockNow(),
  };
};

const session: NewSession = startNewSessionStub(captureDeps)(pastFocusRequest);
assertType<NewSession>(session);

// ──────────────────────────────────────────────────────────────────────
// 全体: EditPastNoteStart スタブ
// ──────────────────────────────────────────────────────────────────────

const editPastNoteStartStub: EditPastNoteStart =
  (deps) => async (current, request) => {
    const decision = classify(current, request);
    const flushed = await flush(deps)(decision);
    if (!flushed.ok) {
      // SaveError を SwitchError へ昇格
      const switchErr: SwitchError = {
        kind: "save-failed-during-switch",
        underlying: flushed.error,
        pendingNextFocus: { noteId: request.noteId, blockId: request.blockId },
      };
      return err(switchErr);
    }
    const next = startNewSessionStub(deps)(request);
    return ok(next);
  };

const result: Promise<Result<NewSession, SwitchError>> =
  editPastNoteStartStub(captureDeps)(editing, pastFocusRequest);
assertType<Promise<Result<NewSession, SwitchError>>>(result);

// 任意の現在状態 (Idle / Editing) に対しても呼び出し可能
const _resultFromIdle: Promise<Result<NewSession, SwitchError>> =
  editPastNoteStartStub(captureDeps)(idle, pastFocusRequest);
void _resultFromIdle;

// 状態判別ユニオン全体を引数に取れる
const anyState: EditingSessionState = editing;
const _anyResult: Promise<Result<NewSession, SwitchError>> =
  editPastNoteStartStub(captureDeps)(anyState, pastFocusRequest);
void _anyResult;

// 同一 Note 内ブロック移動シナリオも呼び出し可能（flush skip 経路）
const _resultSameNote: Promise<Result<NewSession, SwitchError>> =
  editPastNoteStartStub(captureDeps)(editing, sameNoteFocusRequest);
void _resultSameNote;
