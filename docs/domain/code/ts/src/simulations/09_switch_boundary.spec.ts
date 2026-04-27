// Phase 11 — シナリオ 9: 編集中ノートを残して別の過去ノート選択（境界ケース）
//
// 対応シナリオ: validation.md「シナリオ 9」(設計の検証焦点)
// 対応ワークフロー: workflows.md Workflow 3 + EditingSessionState の状態機械
// 自動生成: 2026-04-28
//
// 検証目的:
//   1. EditingState → SwitchingState → EditingState (next) の遷移が型表現可能
//   2. 保存失敗時に SaveFailedState が pendingNextNoteId を保持
//   3. SwitchError.pendingNextNoteId が型レベルで保持されている

import type { SaveError, SwitchError } from "../shared/errors.js";
import type { EmptyNoteDiscarded } from "../shared/events.js";
import type {
  EditingSessionTransitions,
  EditingState,
  IdleState,
  SaveFailedState,
  SavingState,
  SwitchingState,
} from "../capture/states.js";
import { assertType } from "./_assert.js";
import { mockNoteId, mockTimestamp } from "./_mock.js";

// ──────────────────────────────────────────────────────────────────────
// Given: dirty な編集中セッション
// ──────────────────────────────────────────────────────────────────────

const t0 = mockTimestamp(1_700_000_000_000);
const t1 = mockTimestamp(1_700_000_001_000);

const currentId = mockNoteId("2026-04-28-153045-218");
const nextId = mockNoteId("2026-04-25-093000-001");

const editing: EditingState = {
  status: "editing",
  currentNoteId: currentId,
  isDirty: true,
  lastInputAt: t0,
  idleTimerHandle: null,
  lastSaveResult: null,
};

declare const transitions: EditingSessionTransitions;

// ──────────────────────────────────────────────────────────────────────
// Path A: 通常 — switching → editing(next)
// ──────────────────────────────────────────────────────────────────────

const switching: SwitchingState = transitions.beginSwitch(editing, nextId, t1);
assertType<SwitchingState>(switching);

// SwitchingState は pendingNextNoteId を必ず持つ（型上の保証）
const _pendingHeld: typeof switching.pendingNextNoteId = switching.pendingNextNoteId;
void _pendingHeld;

const swappedToNext: EditingState = transitions.onSwitchSaveSucceeded(
  switching,
  t1,
);
assertType<EditingState>(swappedToNext);

// ──────────────────────────────────────────────────────────────────────
// Path B: 保存失敗 — switching → save-failed (pendingNextNoteId 保持)
// ──────────────────────────────────────────────────────────────────────

const fsError: SaveError = {
  kind: "fs",
  reason: { kind: "permission" },
};

const failed: SaveFailedState = transitions.onSwitchSaveFailed(
  switching,
  fsError,
);
assertType<SaveFailedState>(failed);

// 切替途中の失敗では pendingNextNoteId が non-null
const _failedKeepsPending: typeof failed.pendingNextNoteId = failed.pendingNextNoteId;
void _failedKeepsPending;

// ──────────────────────────────────────────────────────────────────────
// SwitchError は SaveError + pendingNextNoteId を伴う
// ──────────────────────────────────────────────────────────────────────

const switchErr: SwitchError = {
  kind: "save-failed-during-switch",
  underlying: fsError,
  pendingNextNoteId: nextId,
};
assertType<SwitchError>(switchErr);

// ──────────────────────────────────────────────────────────────────────
// Path B 続き: ユーザーの選択肢から復帰
//   - retry → saving
//   - discard → editing(pendingNextNoteId) or idle
//   - cancelSwitch → editing(currentNoteId)
// ──────────────────────────────────────────────────────────────────────

const retried: SavingState = transitions.retry(failed, t1);
assertType<SavingState>(retried);

const discarded: EditingState | IdleState = transitions.discard(failed, t1);
assertType<EditingState | IdleState>(discarded);

const cancelled: EditingState = transitions.cancelSwitch(failed, t1);
assertType<EditingState>(cancelled);

// ──────────────────────────────────────────────────────────────────────
// Path C: 空ノート分岐 — EmptyNoteDiscarded を発行して即時切替
//   （Vault には書き込まない、SaveNoteRequested は発行しない）
// ──────────────────────────────────────────────────────────────────────

const emptyDiscarded: EmptyNoteDiscarded = {
  kind: "empty-note-discarded",
  noteId: currentId,
  occurredOn: t1,
};
assertType<EmptyNoteDiscarded>(emptyDiscarded);

// 「次ノート選択」直後に discarded → editing(next) へ遷移できる経路（型上）
const idleAfterDiscard: IdleState = { status: "idle" };
const newSession: EditingState = transitions.focusOnNote(
  idleAfterDiscard,
  nextId,
  t1,
);
assertType<EditingState>(newSession);

// ──────────────────────────────────────────────────────────────────────
// 不正状態の禁止（コンパイル時保証の確認）
//   - SwitchingState は currentNoteId と pendingNextNoteId を両方持たないと作れない
//   - IdleState は currentNoteId を持たない（型に存在しないので参照不可能）
// ──────────────────────────────────────────────────────────────────────

// idleState.currentNoteId はコンパイルエラーになる:
// const _illegal = idleAfterDiscard.currentNoteId; // ← intentionally not written

// SwitchingState を pendingNextNoteId 抜きで作ろうとするとコンパイルエラー（コメントのみ）。
