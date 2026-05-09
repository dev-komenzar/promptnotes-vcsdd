// handle-save-failure/pipeline.ts
// HandleSaveFailure workflow orchestrator.
//
// REQ-HSF-001: Precondition — input must be SaveFailedState
// REQ-HSF-002: Branch — RetrySave
// REQ-HSF-003: Branch — DiscardCurrentSession without pendingNextFocus
// REQ-HSF-004: Branch — DiscardCurrentSession with pendingNextFocus
// REQ-HSF-005: Branch — CancelSwitch (valid: pendingNextFocus present)
// REQ-HSF-006: Branch — CancelSwitch invalid when no pendingNextFocus
// REQ-HSF-007: UserDecision exhaustiveness
// REQ-HSF-008: At most one event per invocation
// REQ-HSF-009: Clock.now() budget — exactly once on valid branches; 0 on cancel-switch-invalid
// REQ-HSF-010: ResolvedState shape
// REQ-HSF-011: Workflow type signature — widened input contract (stage, state, decision)
// REQ-HSF-012: SaveFailedStage.error is for logging only — not emitted in events
//
// PROP-HSF-009: Exactly-one event constraint — retry branch
// PROP-HSF-010: Exactly-one event constraint — discard branch
// PROP-HSF-011: Zero events — cancel-switch valid branch
// PROP-HSF-012: Cancel-switch invalid guard
// PROP-HSF-013: Clock.now() call count — valid branches
// PROP-HSF-016: Event type classification
// PROP-HSF-022: Widened signature

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  SaveFailedState,
  EditingState,
  IdleState,
  SavingState,
} from "promptnotes-domain-types/capture/states";
import type {
  SaveFailedStage,
  UserDecision,
  ResolvedState,
} from "promptnotes-domain-types/capture/stages";
import type { CaptureInternalEvent } from "promptnotes-domain-types/capture/internal-events";

import { retry } from "./retry.js";
import { discard } from "./discard.js";
import { cancelSwitch } from "./cancel-switch.js";

// ── Port definitions ────────────────────────────────────────────────────────

/**
 * I/O ports required by the HandleSaveFailure workflow.
 *
 * - clockNow: called exactly once per valid-branch invocation; 0 times on cancel-switch-invalid.
 * - emit: called at most once per invocation; accepts only CaptureInternalEvent (REQ-HSF-008).
 *   The error from SaveFailedStage is NOT propagated into emitted events (REQ-HSF-012).
 *
 * PROP-HSF-016: emit only accepts CaptureInternalEvent, not PublicDomainEvent.
 */
export type HandleSaveFailurePorts = {
  readonly clockNow: () => Timestamp;
  readonly emit: (event: CaptureInternalEvent) => void;
};

// ── Result type ─────────────────────────────────────────────────────────────

export type HandleSaveFailureResult = {
  readonly resolvedState: ResolvedState;
  readonly nextSessionState: SavingState | EditingState | IdleState;
};

// ── assertNever helper ───────────────────────────────────────────────────────

/**
 * Exhaustiveness check helper.
 * REQ-HSF-007: ensures all UserDecision variants are handled.
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled UserDecision variant: ${JSON.stringify(value)}`);
}

// ── Invariant error builders ─────────────────────────────────────────────────

function makeInvariantViolatedError(detail: string): SaveError {
  return {
    kind: "validation",
    reason: { kind: "invariant-violated", detail },
  };
}

// ── Pipeline orchestrator ────────────────────────────────────────────────────

/**
 * HandleSaveFailure pipeline.
 *
 * Widened signature per REQ-HSF-011: accepts (stage, state, decision) as distinct
 * parameters. `stage` carries the failure context (error for logging); `state`
 * carries the transition targets (currentNoteId, pendingNextFocus).
 *
 * Clock.now() is called exactly once on valid branches, before the pure transition,
 * and the same timestamp is used for both the state-transition parameter and the
 * emitted event's occurredOn field (REQ-HSF-009).
 *
 * @param stage  - SaveFailedStage with kind/noteId/error (error is for logging only)
 * @param state  - SaveFailedState carrying currentNoteId and pendingNextNoteId
 * @param decision - UserDecision: retry-save | discard-current-session | cancel-switch
 * @param ports  - HandleSaveFailurePorts: clockNow and emit
 * @returns Promise resolving to { resolvedState, nextSessionState }
 * @throws (via Promise.reject) SaveError when precondition or invariant is violated
 */
export function runHandleSaveFailurePipeline(
  _stage: SaveFailedStage,
  state: SaveFailedState,
  decision: UserDecision,
  ports: HandleSaveFailurePorts,
): Promise<HandleSaveFailureResult> {
  // REQ-HSF-001: Precondition — state must be SaveFailedState at runtime.
  // TypeScript enforces this at compile time; this runtime guard is defense-in-depth.
  if ((state as { status: string }).status !== "save-failed") {
    return Promise.reject(makeInvariantViolatedError("state.status must be save-failed"));
  }

  switch (decision.kind) {
    case "retry-save": {
      // REQ-HSF-002: retry-save branch
      // Clock.now() called exactly once; same `now` used for state transition and event.
      const now = ports.clockNow();
      const nextState = retry(state, now);

      // REQ-HSF-002 AC: emit RetrySaveRequested with no error field (REQ-HSF-012)
      ports.emit({
        kind: "retry-save-requested",
        noteId: state.currentNoteId,
        occurredOn: now,
      });

      return Promise.resolve({
        resolvedState: { kind: "ResolvedState", resolution: "retried" },
        nextSessionState: nextState,
      });
    }

    case "discard-current-session": {
      // REQ-HSF-003 / REQ-HSF-004: discard branch
      // Clock.now() called exactly once; same `now` passed to discard() and used in event.
      const now = ports.clockNow();
      const nextState = discard(state, now);

      // REQ-HSF-003/004 AC: emit EditingSessionDiscarded with currentNoteId (not pending),
      // and no error field (REQ-HSF-012).
      ports.emit({
        kind: "editing-session-discarded",
        noteId: state.currentNoteId,
        occurredOn: now,
      });

      return Promise.resolve({
        resolvedState: { kind: "ResolvedState", resolution: "discarded" },
        nextSessionState: nextState,
      });
    }

    case "cancel-switch": {
      // REQ-HSF-006: guard — cancel-switch requires pendingNextFocus !== null.
      // This guard fires BEFORE Clock.now() is called (REQ-HSF-009, PROP-HSF-020).
      if (state.pendingNextFocus === null) {
        return Promise.reject(
          makeInvariantViolatedError("cancel-switch requires pendingNextFocus"),
        );
      }

      // REQ-HSF-005: cancel-switch valid branch
      // Clock.now() called exactly once; passed to cancelSwitch().
      // No event emitted (REQ-HSF-008, PROP-HSF-011).
      const now = ports.clockNow();
      const nextState = cancelSwitch(state, now);

      return Promise.resolve({
        resolvedState: { kind: "ResolvedState", resolution: "cancelled" },
        nextSessionState: nextState,
      });
    }

    default:
      // REQ-HSF-007: exhaustiveness — never branch fires on unknown UserDecision variants.
      return assertNever(decision);
  }
}
