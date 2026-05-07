/**
 * PROP-012: Pipeline shape — type-level assertions.
 *
 * Tier 0 — compile-time only (`tsc --noEmit`). No runtime behavior required.
 *
 * Assertions:
 *   1. `makeCopyBodyPipeline` accepts `CopyBodyInfra` and returns a function
 *      that accepts `CopyBodyDeps` (or full `CaptureDeps`) and returns
 *      `(state: EditingState) => Result<ClipboardText, SaveError>`.
 *   2. `copyBody` (flat-ports) returns `(state: EditingState) => Result<ClipboardText, SaveError>`.
 *   3. The pipeline rejects `IdleState` at the type level: passing an `IdleState`
 *      where `EditingState` is expected is a compile-time error.
 *   4. `CopyBodyPorts` includes both `CopyBodyDeps` ports and `CopyBodyInfra` callbacks.
 *
 * All type assertions are inside `it.skip` bodies so they are never executed at runtime.
 * They are still type-checked by `tsc --noEmit`.
 *
 * REQ: REQ-008
 */

import { it, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type { ClipboardText } from "promptnotes-domain-types/capture/stages";
import type { EditingState, IdleState } from "promptnotes-domain-types/capture/states";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { CaptureDeps } from "promptnotes-domain-types/capture/ports";

import {
  makeCopyBodyPipeline,
  copyBody,
  type CopyBodyInfra,
  type CopyBodyDeps,
  type CopyBodyPorts,
} from "$lib/domain/copy-body/pipeline";

// ── Type aliases for readability ───────────────────────────────────────────

type InnerFn = (state: EditingState) => Result<ClipboardText, SaveError>;
type MiddleFn = (deps: CopyBodyDeps) => InnerFn;

// ── Assertion 1: makeCopyBodyPipeline return type ──────────────────────────

it.skip("PROP-012 (1): makeCopyBodyPipeline return type is assignable to MiddleFn", () => {
  // All declarations here are type-only; the body is never executed.
  const infra = null as unknown as CopyBodyInfra;
  const pipeline: MiddleFn = makeCopyBodyPipeline(infra);

  // CaptureDeps is wider than CopyBodyDeps but structurally assignable:
  const captureDeps = null as unknown as CaptureDeps;
  const inner: InnerFn = pipeline(captureDeps);

  expect(typeof pipeline).toBe("function");
  expect(typeof inner).toBe("function");
});

// ── Assertion 2: copyBody return type ─────────────────────────────────────

it.skip("PROP-012 (2): copyBody return type is InnerFn", () => {
  const ports = null as unknown as CopyBodyPorts;
  const fn: InnerFn = copyBody(ports);
  expect(typeof fn).toBe("function");
});

// ── Assertion 3: EditingState narrowing — IdleState rejected ──────────────

it.skip("PROP-012 (3): EditingState narrowing — IdleState is rejected at compile time", () => {
  const infra = null as unknown as CopyBodyInfra;
  const deps = null as unknown as CopyBodyDeps;
  const inner: InnerFn = makeCopyBodyPipeline(infra)(deps);

  const editingState = null as unknown as EditingState;
  const idleState = null as unknown as IdleState;

  // Valid: passing EditingState is accepted.
  const _okResult: Result<ClipboardText, SaveError> = inner(editingState);

  // Invalid: passing IdleState should be a compile-time error.
  // @ts-expect-error IdleState is not assignable to EditingState
  const _badResult: Result<ClipboardText, SaveError> = inner(idleState);

  expect(true).toBe(true); // never executed
});

// ── Assertion 4: CopyBodyPorts structure ───────────────────────────────────

it.skip("PROP-012 (4): CopyBodyPorts has clipboardWrite, clockNow, getCurrentNote, bodyForClipboard, emitInternal", () => {
  const ports = null as unknown as CopyBodyPorts;

  // CopyBodyDeps ports:
  const _cw: CopyBodyPorts["clipboardWrite"] = ports.clipboardWrite;
  const _cn: CopyBodyPorts["clockNow"] = ports.clockNow;

  // CopyBodyInfra callbacks:
  const _gcn: CopyBodyPorts["getCurrentNote"] = ports.getCurrentNote;
  const _bfc: CopyBodyPorts["bodyForClipboard"] = ports.bodyForClipboard;
  const _ei: CopyBodyPorts["emitInternal"] = ports.emitInternal;

  expect(true).toBe(true); // never executed
});
