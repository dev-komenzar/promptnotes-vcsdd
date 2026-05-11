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
  NoteFocusRequest,
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
import type { Note } from "../shared/note.js";
import type { CaptureDeps } from "./ports.js";

// ──────────────────────────────────────────────────────────────────────
// Workflow 2 (Capture 側): CaptureAutoSave 前段
// Step 1: prepareSaveRequest
//   入力: DirtyEditingSession
//   出力: Result<ValidatedSaveRequest | EmptyNoteDiscarded, SaveValidationError>
// ──────────────────────────────────────────────────────────────────────

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

export type CaptureAutoSave = (
  deps: CaptureDeps,
) => (
  state: EditingState,
  trigger: "idle" | "blur",
) => Promise<Result<NoteFileSaved, SaveError>>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 3: EditPastNoteStart（単一 Markdown 本文モデル）
// Step 1: classifyCurrentSession (pure)
// Step 2: flushCurrentSession (CaptureAutoSave 呼び出し)
// Step 3: startNewSession (in-memory write)
// ──────────────────────────────────────────────────────────────────────

export type ClassifyCurrentSession = (
  current: EditingSessionState,
  request: NoteFocusRequest,
  currentNote: Note | null,
) => CurrentSessionDecision;

export type FlushCurrentSession = (
  deps: CaptureDeps,
) => (
  decision: CurrentSessionDecision,
) => Promise<Result<FlushedCurrentSession, SaveError>>;

/** 別 Note の場合は snapshot を Note Aggregate にハイドレートし、
 * EditingSessionState を `editing(noteId)` に。 */
export type StartNewSession = (
  deps: CaptureDeps,
) => (request: NoteFocusRequest) => NewSession;

export type EditPastNoteStart = (
  deps: CaptureDeps,
) => (
  current: EditingSessionState,
  request: NoteFocusRequest,
) => Promise<Result<NewSession, SwitchError>>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 6: CopyBody
// ──────────────────────────────────────────────────────────────────────

export type CopyBody = (
  deps: CaptureDeps,
) => (state: EditingState) => Result<ClipboardText, SaveError>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 8: HandleSaveFailure
// ──────────────────────────────────────────────────────────────────────

export type HandleSaveFailure = (
  deps: CaptureDeps,
) => (
  stage: SaveFailedStage,
  state: SaveFailedState,
  decision: UserDecision,
) => Promise<ResolvedState>;

// ──────────────────────────────────────────────────────────────────────
// SaveNoteRequested 発行ヘルパー（型レベル）。
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
