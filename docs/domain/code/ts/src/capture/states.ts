// Capture Context — EditingSessionState 状態機械（OR 型）。
//
// 由来: aggregates.md §CaptureSession §EditingSessionState の遷移
//
// DMMF 原則: 状態ごとに保持データが異なるため、判別可能ユニオンで
// 「保存中なのに次ノートが未指定」のような不正状態を型で禁止する。

import type { SaveError } from "../shared/errors.js";
import type { NoteId, Timestamp } from "../shared/value-objects.js";

/** ブラウザの setTimeout 戻り値などを保持するための不透明ハンドル。 */
export type IdleTimerHandle = { readonly __opaque: "IdleTimerHandle" };

// ──────────────────────────────────────────────────────────────────────
// 各状態の型
// ──────────────────────────────────────────────────────────────────────

/** どのノートも編集していない初期状態。 */
export type IdleState = {
  readonly status: "idle";
};

/** ノート編集中。`isDirty` で未保存判定。 */
export type EditingState = {
  readonly status: "editing";
  readonly currentNoteId: NoteId;
  readonly isDirty: boolean;
  readonly lastInputAt: Timestamp | null;
  readonly idleTimerHandle: IdleTimerHandle | null;
  /** 直近保存結果（F14）。 */
  readonly lastSaveResult: "success" | "failed" | null;
};

/** 保存処理待機。SaveNoteRequested 発行済み。 */
export type SavingState = {
  readonly status: "saving";
  readonly currentNoteId: NoteId;
  readonly savingStartedAt: Timestamp;
};

/**
 * 別ノート切替待機。blur save を強制発火し、完了後に next を編集開始する。
 * `pendingNextNoteId` を非 null で必ず持つ。
 */
export type SwitchingState = {
  readonly status: "switching";
  readonly currentNoteId: NoteId;
  readonly pendingNextNoteId: NoteId;
  readonly savingStartedAt: Timestamp;
};

/**
 * 保存失敗。ユーザーが Discard / Retry / Cancel を選ぶまで滞留。
 * 切替途中に失敗した場合のみ `pendingNextNoteId` を持つ。
 */
export type SaveFailedState = {
  readonly status: "save-failed";
  readonly currentNoteId: NoteId;
  readonly pendingNextNoteId: NoteId | null;
  readonly lastSaveError: SaveError;
};

// ──────────────────────────────────────────────────────────────────────
// 全状態の判別可能ユニオン
// ──────────────────────────────────────────────────────────────────────

export type EditingSessionState =
  | IdleState
  | EditingState
  | SavingState
  | SwitchingState
  | SaveFailedState;

// ──────────────────────────────────────────────────────────────────────
// 遷移関数の型シグネチャ（aggregates.md EditingSessionState の遷移表）
// 純粋関数として表現。実装は本ファイルに含めない。
// ──────────────────────────────────────────────────────────────────────

export interface EditingSessionTransitions {
  /** idle → editing。新規/過去ノートのフォーカスで起きる。 */
  focusOnNote(state: IdleState, noteId: NoteId, now: Timestamp): EditingState;

  /** editing → editing。`isDirty=true`、idle timer 起動。 */
  applyBodyEdit(
    state: EditingState,
    handle: IdleTimerHandle,
    now: Timestamp,
  ): EditingState;

  /** editing → saving。`SaveNoteRequested` の発行と同時。 */
  beginAutoSave(state: EditingState, now: Timestamp): SavingState;

  /** saving → editing（or idle if blur 完結）。 */
  onSaveSucceeded(state: SavingState, now: Timestamp): EditingState;

  /** saving → editing。isDirty=true 保持、UI 警告。 */
  onSaveFailed(state: SavingState, error: SaveError): SaveFailedState;

  /** editing → switching。別ノート選択時、blur save を強制発火。 */
  beginSwitch(
    state: EditingState,
    nextNoteId: NoteId,
    now: Timestamp,
  ): SwitchingState;

  /** switching → editing(next)。 */
  onSwitchSaveSucceeded(state: SwitchingState, now: Timestamp): EditingState;

  /** switching → save-failed。切替を中止し、選択肢モーダル表示へ。 */
  onSwitchSaveFailed(state: SwitchingState, error: SaveError): SaveFailedState;

  /** save-failed → saving。RetrySave 選択。 */
  retry(state: SaveFailedState, now: Timestamp): SavingState;

  /** save-failed → editing(pendingNextNoteId) or idle。DiscardCurrentSession。 */
  discard(state: SaveFailedState, now: Timestamp): EditingState | IdleState;

  /** save-failed → editing(currentNoteId)。CancelSwitch。 */
  cancelSwitch(state: SaveFailedState, now: Timestamp): EditingState;
}
