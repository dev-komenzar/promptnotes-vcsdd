/**
 * handle-save-failure.type-test.ts — Tier 0 type-level proofs
 *
 * PROP-HSF-005: UserDecision exhaustiveness
 *   The switch in handleSaveFailure has a never-branch — adding an unhandled
 *   UserDecision variant must cause a TypeScript compilation error.
 *
 * PROP-HSF-016: Event type classification
 *   All events emitted by handleSaveFailure are CaptureInternalEvent members.
 *   Passing a PublicDomainEvent to HandleSaveFailurePorts.emit is a compile error.
 *
 * PROP-HSF-022: Widened signature (REQ-HSF-011)
 *   The HandleSaveFailure workflow type accepts (stage, state, decision) — callers
 *   that omit `state` produce a TypeScript compilation error.
 *
 * `tsc --noEmit` enforces these in CI. Each `@ts-expect-error` must suppress a real
 * type error — if the annotation becomes stale (no error underneath), tsc will fail.
 */

import type { UserDecision } from "promptnotes-domain-types/capture/stages";
import type {
  CaptureInternalEvent,
  RetrySaveRequested,
  EditingSessionDiscarded,
} from "promptnotes-domain-types/capture/internal-events";
import type { PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { HandleSaveFailurePorts } from "../../src/lib/domain/handle-save-failure/pipeline.js";

// ── PROP-HSF-005: UserDecision exhaustiveness ─────────────────────────────
//
// The implementation uses a switch over decision.kind with an assertNever default.
// This type-level check verifies that the union is closed: any value with a
// `kind` that is not a member of UserDecision is a compile error when used where
// a UserDecision is expected.

// Positive check: all known variants are valid UserDecision values
const _retrySave: UserDecision = { kind: "retry-save" };
const _discard: UserDecision = { kind: "discard-current-session" };
const _cancelSwitch: UserDecision = { kind: "cancel-switch" };
void _retrySave;
void _discard;
void _cancelSwitch;

// Negative check: an unknown variant must NOT be assignable to UserDecision
// @ts-expect-error — 'unknown-variant' is not a valid UserDecision.kind
const _unknownVariant: UserDecision = { kind: "unknown-variant" };
void _unknownVariant;

// Negative check: a hypothetical future variant not yet added to the union
// must not compile as a UserDecision
// @ts-expect-error — 'defer-save' is not a valid UserDecision.kind
const _futureVariant: UserDecision = { kind: "defer-save" };
void _futureVariant;

// Exhaustiveness in switch: verify exhaustiveness function accepts never branch
function assertNeverUserDecision(d: UserDecision): string {
  switch (d.kind) {
    case "retry-save":
      return "retry";
    case "discard-current-session":
      return "discard";
    case "cancel-switch":
      return "cancel";
    default: {
      // This branch must be unreachable; the never type check fires at compile time
      // if a new UserDecision variant is added without being handled above.
      const _exhaustive: never = d;
      return _exhaustive;
    }
  }
}
void assertNeverUserDecision;

// ── PROP-HSF-016: Event type classification ───────────────────────────────
//
// HandleSaveFailurePorts.emit accepts CaptureInternalEvent, NOT PublicDomainEvent.
// Passing a function typed as (e: PublicDomainEvent) => void to the emit port
// is a type error because PublicDomainEvent is not assignable to CaptureInternalEvent.

// Positive check: CaptureInternalEvent members are valid emit arguments
const _emitValid: HandleSaveFailurePorts["emit"] = (e: CaptureInternalEvent) => {
  void e;
};
void _emitValid;

// Positive check: RetrySaveRequested and EditingSessionDiscarded are CaptureInternalEvents
type _RetrySaveIsInternal = Extract<CaptureInternalEvent, { kind: "retry-save-requested" }>;
const _r: _RetrySaveIsInternal = null as unknown as RetrySaveRequested;
void _r;

type _DiscardedIsInternal = Extract<CaptureInternalEvent, { kind: "editing-session-discarded" }>;
const _d: _DiscardedIsInternal = null as unknown as EditingSessionDiscarded;
void _d;

// Negative check: emit port must NOT accept PublicDomainEvent
// @ts-expect-error — (e: PublicDomainEvent) => void is not assignable to emit: (e: CaptureInternalEvent) => void
const _emitPublic: HandleSaveFailurePorts["emit"] = (e: PublicDomainEvent) => {
  void e;
};
void _emitPublic;

// Negative check: RetrySaveRequested must NOT be a PublicDomainEvent
type _RetrySaveNotPublic = Extract<PublicDomainEvent, { kind: "retry-save-requested" }>;
// _RetrySaveNotPublic should be 'never' — RetrySaveRequested is internal only
type _IsNever<T> = [T] extends [never] ? true : false;
const _retrySaveNotPublicCheck: _IsNever<_RetrySaveNotPublic> = true;
void _retrySaveNotPublicCheck;

// Negative check: EditingSessionDiscarded must NOT be a PublicDomainEvent
type _DiscardedNotPublic = Extract<PublicDomainEvent, { kind: "editing-session-discarded" }>;
const _discardedNotPublicCheck: _IsNever<_DiscardedNotPublic> = true;
void _discardedNotPublicCheck;

// ── PROP-HSF-022: Widened signature (REQ-HSF-011) ─────────────────────────
//
// runHandleSaveFailurePipeline accepts (stage, state, decision, ports).
// The `state` parameter is required. Callers that omit it receive a compile error.
// This is encoded below by importing the function signature type and verifying
// parameter count.

import type { runHandleSaveFailurePipeline } from "../../src/lib/domain/handle-save-failure/pipeline.js";

// Verify the function has 4 parameters (stage, state, decision, ports)
type _PipelineParams = Parameters<typeof runHandleSaveFailurePipeline>;
// Must have length 4: [stage, state, decision, ports]
type _HasFourParams = _PipelineParams["length"] extends 4 ? true : false;
const _fourParamsCheck: _HasFourParams = true;
void _fourParamsCheck;

// Negative: a 3-parameter call (missing state) must be a compile error.
// We can't directly call with wrong arity at type level, but we verify the
// function type is not compatible with a 3-param version.
type _ThreeParamFn = (
  a: _PipelineParams[0],
  b: _PipelineParams[2],  // skip state — use decision as second arg
  c: _PipelineParams[3],
) => ReturnType<typeof runHandleSaveFailurePipeline>;

// @ts-expect-error — a 3-param function is not assignable to the 4-param pipeline
const _threeParam: typeof runHandleSaveFailurePipeline = null as unknown as _ThreeParamFn;
void _threeParam;
