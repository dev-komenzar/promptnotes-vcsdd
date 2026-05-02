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
  PastNoteSelected,
  SaveNoteRequested,
} from "../shared/events.js";
import type {
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
 * 空 body の場合は EmptyNoteDiscarded ルートに分岐する。
 * 失敗時の InvariantViolated は SaveError.validation に集約。
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
 */
export type DispatchSaveRequest = (
  deps: CaptureDeps,
) => (
  request: ValidatedSaveRequest,
) => Promise<Result<NoteFileSaved, NoteSaveFailed>>;

/** CaptureAutoSave 全体（Capture 側）。 */
export type CaptureAutoSave = (
  deps: CaptureDeps,
) => (
  state: EditingState,
  trigger: "idle" | "blur",
) => Promise<Result<NoteFileSaved, SaveError>>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 3: EditPastNoteStart
// Step 1: classifyCurrentSession (pure)
// Step 2: flushCurrentSession (CaptureAutoSave 呼び出し)
// Step 3: startNewSession (in-memory write)
// ──────────────────────────────────────────────────────────────────────

export type ClassifyCurrentSession = (
  current: EditingSessionState,
) => CurrentSessionDecision;

export type FlushCurrentSession = (
  deps: CaptureDeps,
) => (
  decision: CurrentSessionDecision,
) => Promise<Result<FlushedCurrentSession, SaveError>>;

export type StartNewSession = (
  deps: CaptureDeps,
) => (input: PastNoteSelected) => NewSession;

export type EditPastNoteStart = (
  deps: CaptureDeps,
) => (
  current: EditingSessionState,
  selection: PastNoteSelected,
) => Promise<Result<NewSession, SwitchError>>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 6: CopyBody（Pure 寄り）
// ──────────────────────────────────────────────────────────────────────

export type CopyBody = (
  deps: CaptureDeps,
) => (state: EditingState) => Result<ClipboardText, SaveError>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 8: HandleSaveFailure
// ──────────────────────────────────────────────────────────────────────

// REQ-HSF-011: Widened signature — accepts (stage, state, decision).
// `stage` carries the failure event context (for logging/error propagation).
// `state` carries the transition targets (currentNoteId, pendingNextNoteId).
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
