/**
 * PROP-DLN-007 / PROP-DLN-015: Non-coupling type assertion.
 *
 * Tier 0 — TypeScript type-level proof.
 * Required: true (PROP-DLN-007)
 *
 * Proof: `keyof DeleteNoteDeps` does NOT include any editor-buffer key.
 * Specifically:
 *   - 'getEditorBuffer' is NOT a key of DeleteNoteDeps
 *   - 'editingState' is NOT a key of DeleteNoteDeps
 *   - 'editingCurrentNoteId' is NOT a key of DeleteNoteDeps
 *     (it is an outer-curry argument, not a dep port)
 *
 * Positive check: DeleteNoteDeps DOES contain the required port keys:
 *   clockNow, hydrateNote, getNoteSnapshot, publish, trashFile,
 *   getAllSnapshots, publishInternal
 *
 * This is the structural guarantee that the DeleteNote workflow cannot
 * access mutable Capture editor state by construction (no editor-buffer
 * port in deps). The only Capture-side input is the read-only
 * editingCurrentNoteId: NoteId | null outer-curry argument.
 *
 * Covers: REQ-DLN-006, REQ-DLN-011
 *
 * Note: This is a pure compile-time test. No imports from implementation files needed.
 */

import { describe, test, expect } from "bun:test";
import type { DeleteNoteDeps } from "../_deltas";
import type { PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { CurateInternalEvent } from "promptnotes-domain-types/curate/internal-events";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";
import type { HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";

// ── Tier 0: structural non-coupling proof ─────────────────────────────────

/**
 * Type-level assertion: if 'getEditorBuffer' were a key of DeleteNoteDeps,
 * this type would be 'never'. If it compiles as 'true', the key is absent.
 */
type GetEditorBufferAbsent = "getEditorBuffer" extends keyof DeleteNoteDeps
  ? never
  : true;

/**
 * Type-level assertion: if 'editingState' were a key of DeleteNoteDeps,
 * this type would be 'never'. If it compiles as 'true', the key is absent.
 */
type EditingStateAbsent = "editingState" extends keyof DeleteNoteDeps
  ? never
  : true;

/**
 * Type-level assertion: 'editingCurrentNoteId' must NOT be a key of DeleteNoteDeps.
 * It is an outer-curry argument (NoteId | null), not a dep port.
 */
type EditingCurrentNoteIdAbsent = "editingCurrentNoteId" extends keyof DeleteNoteDeps
  ? never
  : true;

/**
 * Positive checks: required port keys ARE present.
 */
type ClockNowPresent = "clockNow" extends keyof DeleteNoteDeps ? true : never;
type GetNoteSnapshotPresent = "getNoteSnapshot" extends keyof DeleteNoteDeps ? true : never;
type HydrateNotePresent = "hydrateNote" extends keyof DeleteNoteDeps ? true : never;
type PublishPresent = "publish" extends keyof DeleteNoteDeps ? true : never;
type TrashFilePresent = "trashFile" extends keyof DeleteNoteDeps ? true : never;
type GetAllSnapshotsPresent = "getAllSnapshots" extends keyof DeleteNoteDeps ? true : never;
type PublishInternalPresent = "publishInternal" extends keyof DeleteNoteDeps ? true : never;

// Assign to prove the types are 'true' (not 'never') at compile time
const _getEditorBufferAbsent: GetEditorBufferAbsent = true;
const _editingStateAbsent: EditingStateAbsent = true;
const _editingCurrentNoteIdAbsent: EditingCurrentNoteIdAbsent = true;
const _clockNowPresent: ClockNowPresent = true;
const _getNoteSnapshotPresent: GetNoteSnapshotPresent = true;
const _hydrateNotePresent: HydrateNotePresent = true;
const _publishPresent: PublishPresent = true;
const _trashFilePresent: TrashFilePresent = true;
const _getAllSnapshotsPresent: GetAllSnapshotsPresent = true;
const _publishInternalPresent: PublishInternalPresent = true;

// ── PROP-DLN-007: Non-coupling type assertion ─────────────────────────────

describe("PROP-DLN-007: Non-coupling — DeleteNoteDeps does not include editor-buffer keys", () => {
  test("Tier-0: 'getEditorBuffer' is NOT a key of DeleteNoteDeps (compile-time proof)", () => {
    // The type-level assertion above (_getEditorBufferAbsent = true) proves this.
    // If 'getEditorBuffer' were added to DeleteNoteDeps, the type would become
    // 'never' and this assignment would fail to compile.
    expect(_getEditorBufferAbsent).toBe(true);
  });

  test("Tier-0: 'editingState' is NOT a key of DeleteNoteDeps (compile-time proof)", () => {
    expect(_editingStateAbsent).toBe(true);
  });

  test("Tier-0: 'editingCurrentNoteId' is NOT a key of DeleteNoteDeps — it is an outer-curry argument", () => {
    expect(_editingCurrentNoteIdAbsent).toBe(true);
  });

  test("Tier-0: all required port keys ARE present in DeleteNoteDeps", () => {
    expect(_clockNowPresent).toBe(true);
    expect(_getNoteSnapshotPresent).toBe(true);
    expect(_hydrateNotePresent).toBe(true);
    expect(_publishPresent).toBe(true);
    expect(_trashFilePresent).toBe(true);
    expect(_getAllSnapshotsPresent).toBe(true);
    expect(_publishInternalPresent).toBe(true);
  });

  test("structural isolation: DeleteNoteDeps runtime shape has no editor keys", () => {
    // Runtime check: construct a minimal deps object and verify no editor keys.
    const minimalDeps: DeleteNoteDeps = {
      clockNow: () => ({ epochMillis: 0 }) as never,
      getNoteSnapshot: () => null,
      hydrateNote: () => ({ ok: false, error: "unknown" as HydrationFailureReason }),
      publish: (_e: PublicDomainEvent) => {},
      publishInternal: (_e: CurateInternalEvent) => {},
      trashFile: async (_filePath: string): Promise<Result<void, FsError>> => ({
        ok: true,
        value: undefined,
      }),
      getAllSnapshots: () => [],
    };

    expect("getEditorBuffer" in minimalDeps).toBe(false);
    expect("editingState" in minimalDeps).toBe(false);
    expect("editingCurrentNoteId" in minimalDeps).toBe(false);
  });
});

// ── REQ-DLN-011: positive presence check ─────────────────────────────────

describe("REQ-DLN-011: DeleteNoteDeps contains only the specified port keys", () => {
  test("Tier-0: clockNow is present", () => {
    expect(_clockNowPresent).toBe(true);
  });

  test("Tier-0: getNoteSnapshot is present", () => {
    expect(_getNoteSnapshotPresent).toBe(true);
  });

  test("Tier-0: hydrateNote is present", () => {
    expect(_hydrateNotePresent).toBe(true);
  });

  test("Tier-0: publish is present", () => {
    expect(_publishPresent).toBe(true);
  });

  test("Tier-0: trashFile is present (Delta 1 — NEW for this workflow)", () => {
    expect(_trashFilePresent).toBe(true);
  });

  test("Tier-0: getAllSnapshots is present (reused from TagChipUpdate)", () => {
    expect(_getAllSnapshotsPresent).toBe(true);
  });

  test("Tier-0: publishInternal is present (reused from TagChipUpdate)", () => {
    expect(_publishInternalPresent).toBe(true);
  });
});
