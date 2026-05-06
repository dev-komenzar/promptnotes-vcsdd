// Capture Context — ワークフロー全体の関数型シグネチャ。
//
// 由来:
//   - workflows.md Workflow 2 (CaptureAutoSave) — Capture 側ステップ
//   - workflows.md Workflow 3 (EditPastNoteStart)
//   - workflows.md Workflow 6 (CopyBody)
//   - workflows.md Workflow 8 (HandleSaveFailure)

import type { Result } from "../util/result.js";
import type { SaveError, SwitchError } from "../shared/errors.js";
import type {
  EmptyNoteDiscarded,
  NoteFileSaved,
  NoteSaveFailed,
  SaveNoteRequested,
} from "../shared/events.js";
import type {
  BlockFocusRequest,
  ClipboardText,
  CurrentSessionDecision,
  DirtyEditingSession,
  FlushedCurrentSession,
  NewSession,
  ResolvedState,
  SaveFailedStage,
  UserDecision,
  ValidatedSaveRequest,
} from "./stages.js";
import type {
  EditingSessionState,
  EditingState,
  SaveFailedState,
  SavingState,
} from "./states.js";
import type { CaptureDeps } from "./ports.js";

// ──────────────────────────────────────────────────────────────────────
// Workflow 2 (Capture 側): CaptureAutoSave 前段
// Step 1: prepareSaveRequest
//   入力: DirtyEditingSession
//   出力: Result<ValidatedSaveRequest | EmptyNoteDiscarded, SaveValidationError>
// ──────────────────────────────────────────────────────────────────────

/**
 * 全ブロックが空 paragraph のみ（`note.isEmpty()`）の場合は EmptyNoteDiscarded
 * ルートに分岐する。失敗時の InvariantViolated は SaveError.validation に集約。
 * `ValidatedSaveRequest.blocks` と `body = serializeBlocksToMarkdown(blocks)` を
 * 同時にセットする責務もここに含む。
 */
export type PrepareSaveRequest = (
  deps: CaptureDeps,
) => (
  input: DirtyEditingSession,
) => Result<
  { kind: "validated"; request: ValidatedSaveRequest }
  | { kind: "empty-discarded"; event: EmptyNoteDiscarded },
  SaveError
>;

/**
 * Vault に SaveNoteRequested を渡し、NoteFileSaved | NoteSaveFailed の
 * いずれかを受け取る境界関数。Vault 側 (Rust) との橋渡し。
 * Vault は受け取った `blocks` ではなく `body`（派生 Markdown 文字列）を
 * 直接ファイルに書き込む。
 */
export type DispatchSaveRequest = (
  deps: CaptureDeps,
) => (
  request: ValidatedSaveRequest,
) => Promise<Result<NoteFileSaved, NoteSaveFailed>>;

/** CaptureAutoSave 全体（Capture 側）。
 * 入力 `state` の current note は `Block[]` ベースの最新 snapshot を保持しており、
 * 保存時に `serializeBlocksToMarkdown` で Markdown に直列化される。 */
export type CaptureAutoSave = (
  deps: CaptureDeps,
) => (
  state: EditingState,
  trigger: "idle" | "blur",
) => Promise<Result<NoteFileSaved, SaveError>>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 3: EditPastNoteStart（ブロックベース UI 化、aggregates.md L315 / L326）
// Step 1: classifyCurrentSession (pure) — 同一 Note 内移動 vs 別 Note 移動を区別
// Step 2: flushCurrentSession (CaptureAutoSave 呼び出し、same-note は skip)
// Step 3: startNewSession (in-memory write、focusedBlockId をセット)
// 入力は `BlockFocusRequest{noteId, blockId, snapshot?}`。
// ──────────────────────────────────────────────────────────────────────

export type ClassifyCurrentSession = (
  current: EditingSessionState,
  request: BlockFocusRequest,
) => CurrentSessionDecision;

export type FlushCurrentSession = (
  deps: CaptureDeps,
) => (
  decision: CurrentSessionDecision,
) => Promise<Result<FlushedCurrentSession, SaveError>>;

/** 別 Note の場合は snapshot を Note Aggregate にハイドレートし、
 * EditingSessionState を `editing(noteId, focusedBlockId=blockId)` に。
 * 同一ノート内移動なら `focusedBlockId` のみ更新（既存 note を継続使用）。 */
export type StartNewSession = (
  deps: CaptureDeps,
) => (request: BlockFocusRequest) => NewSession;

export type EditPastNoteStart = (
  deps: CaptureDeps,
) => (
  current: EditingSessionState,
  request: BlockFocusRequest,
) => Promise<Result<NewSession, SwitchError>>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 6: CopyBody（Pure 寄り）
// `bodyForClipboard(note)` が内部で `serializeBlocksToMarkdown(note.blocks)` を呼ぶ。
// ──────────────────────────────────────────────────────────────────────

export type CopyBody = (
  deps: CaptureDeps,
) => (state: EditingState) => Result<ClipboardText, SaveError>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 8: HandleSaveFailure
// ──────────────────────────────────────────────────────────────────────

// REQ-HSF-011: Widened signature — accepts (stage, state, decision).
// `stage` carries the failure event context (for logging/error propagation).
// `state` carries the transition targets (currentNoteId, pendingNextFocus).
// Callers that pass only (stage, decision) produce a TypeScript compilation error.
export type HandleSaveFailure = (
  deps: CaptureDeps,
) => (
  stage: SaveFailedStage,
  state: SaveFailedState,
  decision: UserDecision,
) => Promise<ResolvedState>;

// ──────────────────────────────────────────────────────────────────────
// SaveNoteRequested 発行ヘルパー（型レベル）。
// Capture/Curate が共通発行できる Public Event の構築シグネチャ。
// ──────────────────────────────────────────────────────────────────────

export type BuildSaveNoteRequested = (
  request: ValidatedSaveRequest,
) => SaveNoteRequested;

/** SavingState への遷移と Public Event 発行を行う合成関数。 */
export type EmitSaveAndTransition = (
  deps: CaptureDeps,
) => (
  request: ValidatedSaveRequest,
  state: EditingState,
) => SavingState;
