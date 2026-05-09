// edit-past-note-start/pipeline.ts
// Full EditPastNoteStart pipeline — orchestrates the 3-step workflow.
//
// REQ-EPNS-001..013: Complete workflow
// PROP-EPNS-005: SwitchError exhaustiveness
// PROP-EPNS-013: Clock.now() budget ≤ 2 per workflow invocation
//
// Sprint 2 (block-based migration):
// - Input: { request: BlockFocusRequest, currentState, currentNote, previousFrontmatter }
// - Same-note detection moved to classifyCurrentSession (no pre-pipeline guard)
// - Pipeline always returns Ok(NewSession) on success (SameNoteNoOp removed)
// - SwitchError.pendingNextFocus replaces pendingNextNoteId
// - BlockFocused replaces EditorFocusedOnPastNote
// - PC-001: cross-note + snapshot=null → throw before any side effect
// - PC-004: editing/save-failed + currentNote=null → throw before any side effect
// - PC-004: idle + currentNote!=null → throw before any side effect (FIND-EPNS-S2-P3-001)
//
// FIND-EPNS-S2-P3-005: pipeline is async to match type contract workflows.ts:114-119.
// FIND-EPNS-S2-P3-007: isCrossNoteRequest removed; classification is sole decision point
//   for same-note detection. PC-001 cross-note check uses classifyCurrentSession.kind.

import type { Result } from "promptnotes-domain-types/util/result";
import type {
  NoteId,
  Timestamp,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { SaveError, SwitchError } from "promptnotes-domain-types/shared/errors";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";
import type { EditingSessionState } from "promptnotes-domain-types/capture/states";
import type {
  BlockFocusRequest,
  NewSession,
} from "promptnotes-domain-types/capture/stages";

import { classifyCurrentSession } from "./classify-current-session.js";
import { flushCurrentSession } from "./flush-current-session.js";
import { startNewSession } from "./start-new-session.js";

// ── Port definitions ────────────────────────────────────────────────────

/** Structural type for parse errors — avoids importing the unexported shared/blocks module. */
type BlockParseError = { kind: string; [k: string]: unknown };

export type EditPastNoteStartPorts = {
  readonly clockNow: () => Timestamp;
  /** FIND-EPNS-S2-P3-005: blurSave is async to match the published BlurSave port contract
   *  (workflows.ts BlurSave = Promise<Result<NoteFileSaved, SaveError>>).
   *  Real CaptureAutoSave implementations perform file I/O and must be async. */
  readonly blurSave: (
    noteId: NoteId,
    note: Note,
    previousFrontmatter: Frontmatter | null,
  ) => Promise<Result<NoteFileSaved, SaveError>>;
  readonly parseMarkdownToBlocks: (markdown: string) => Result<ReadonlyArray<Block>, BlockParseError>;
  readonly emit: (event: { kind: string; [k: string]: unknown }) => void;
};

// ── Pipeline input (Revision 5 explicit input struct) ──────────────────

export type EditPastNoteStartInput = {
  readonly request: BlockFocusRequest;
  readonly currentState: EditingSessionState;
  /** The in-memory Note currently loaded in the editing buffer.
   *  null when currentState.status === 'idle' (no active note). */
  readonly currentNote: Note | null;
  /** The frontmatter of the current note BEFORE any edits in the current session.
   *  Forwarded to blurSave on the dirty path for TagInventory delta computation. */
  readonly previousFrontmatter: Frontmatter | null;
};

// ── Pipeline implementation ─────────────────────────────────────────────

/**
 * Orchestrates the EditPastNoteStart workflow:
 *
 * 0. Precondition checks (PC-001, PC-004) — throw before any side effect
 * 1. classifyCurrentSession (pure) → CurrentSessionDecision
 * 2. flushCurrentSession → FlushedCurrentSession or SwitchError (early return on fail)
 * 3. startNewSession → NewSession + emit BlockFocused
 *
 * Returns Ok(NewSession) on all successful paths (including same-note).
 *
 * Same-note path note (REQ-EPNS-008):
 *   For EditingState: caller is responsible for updating EditingSessionState.focusedBlockId.
 *   For SaveFailedState: SaveFailedState has no focusedBlockId field; state is unchanged.
 *   In both cases, NewSession is returned as informational output.
 *
 * FIND-EPNS-S2-P3-005: async to match EditPastNoteStart type contract in workflows.ts:114-119.
 * FIND-EPNS-S2-P3-007: no isCrossNoteRequest helper — classifyCurrentSession is sole decision point.
 */
export async function runEditPastNoteStartPipeline(
  input: EditPastNoteStartInput,
  ports: EditPastNoteStartPorts,
): Promise<Result<NewSession, SwitchError>> {
  const { request, currentState, currentNote, previousFrontmatter } = input;

  // ── PC-004: idle + currentNote !== null → throw (FIND-EPNS-S2-P3-001) ──
  // Must come first so idle state with non-null note is caught before PC-001 check.
  if (currentState.status === "idle" && currentNote !== null) {
    throw new Error(
      "EditPastNoteStart: currentNote must be null when state.status is 'idle'"
    );
  }

  // ── PC-004: editing/save-failed + currentNote=null → throw (REQ-EPNS-013) ──
  if (
    (currentState.status === "editing" || currentState.status === "save-failed") &&
    currentNote === null
  ) {
    throw new Error(
      "EditPastNoteStart: currentNote must not be null when state.status is 'editing' or 'save-failed'"
    );
  }

  // ── Step 1: classify current session (pure) ───────────────────────────
  // Classification is the SOLE decision point for same-note detection (FIND-EPNS-S2-P3-007).
  const decision = classifyCurrentSession(currentState, request, currentNote);

  // ── PC-001: cross-note + snapshot=null → throw (REQ-EPNS-013) ─────────
  // Cross-note means decision is not 'same-note'. Idle is always cross-note (no-current).
  // Check AFTER classification so classifyCurrentSession is the sole same-note authority.
  const isCrossNote = decision.kind !== "same-note";
  if (isCrossNote && request.snapshot === null) {
    throw new Error(
      "EditPastNoteStart: cross-note request requires non-null snapshot"
    );
  }

  // ── Step 2: flush current session ─────────────────────────────────────
  const flushResult = await flushCurrentSession(
    decision,
    request,
    {
      clockNow: ports.clockNow,
      blurSave: ports.blurSave,
      emit: ports.emit,
    },
    previousFrontmatter,
  );

  if (!flushResult.ok) {
    // dirty-fail path: return SwitchError early; startNewSession is NOT reached
    return flushResult;
  }

  // ── Step 3: start new session ─────────────────────────────────────────
  const newSession = startNewSession(request, decision, {
    clockNow: ports.clockNow,
    parseMarkdownToBlocks: ports.parseMarkdownToBlocks,
    emit: ports.emit,
  });

  return { ok: true, value: newSession };
}
