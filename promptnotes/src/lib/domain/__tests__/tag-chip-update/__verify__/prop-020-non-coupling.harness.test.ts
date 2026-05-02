/**
 * PROP-TCU-020: Non-coupling type assertion.
 *
 * Tier 0 — TypeScript type-level proof.
 * Required: false
 *
 * Proof: `keyof TagChipUpdateDeps` does NOT include any editor-buffer key.
 * Specifically:
 *   - 'getEditorBuffer' is NOT a key of TagChipUpdateDeps
 *   - 'editingState' is NOT a key of TagChipUpdateDeps
 *
 * This is the structural guarantee that the TagChipUpdate workflow cannot
 * access Capture editor state by construction (no editor-buffer port in deps).
 *
 * Covers: REQ-TCU-009
 *
 * Note: This is a pure compile-time test. No imports from implementation files needed.
 */

import { describe, test, expect } from "bun:test";
import type { TagChipUpdateDeps } from "../_deltas";

// ── Tier 0: structural non-coupling proof ─────────────────────────────────

/**
 * Type-level assertion: if 'getEditorBuffer' were a key of TagChipUpdateDeps,
 * this type would be 'never'. If it compiles as 'true', the key is absent.
 */
type GetEditorBufferAbsent = "getEditorBuffer" extends keyof TagChipUpdateDeps
  ? never
  : true;

/**
 * Type-level assertion: if 'editingState' were a key of TagChipUpdateDeps,
 * this type would be 'never'. If it compiles as 'true', the key is absent.
 */
type EditingStateAbsent = "editingState" extends keyof TagChipUpdateDeps
  ? never
  : true;

/**
 * Both assertions must be 'true' (not 'never') for compilation to succeed.
 * This is the formal proof that TagChipUpdateDeps is structurally isolated
 * from Capture editor state.
 */
const _getEditorBufferAbsent: GetEditorBufferAbsent = true;
const _editingStateAbsent: EditingStateAbsent = true;

/**
 * Positive check: the keys that SHOULD be present in TagChipUpdateDeps.
 */
type ClockNowPresent = "clockNow" extends keyof TagChipUpdateDeps ? true : never;
type GetNoteSnapshotPresent = "getNoteSnapshot" extends keyof TagChipUpdateDeps ? true : never;
type HydrateNotePresent = "hydrateNote" extends keyof TagChipUpdateDeps ? true : never;
type PublishPresent = "publish" extends keyof TagChipUpdateDeps ? true : never;
type WriteMarkdownPresent = "writeMarkdown" extends keyof TagChipUpdateDeps ? true : never;
type GetAllSnapshotsPresent = "getAllSnapshots" extends keyof TagChipUpdateDeps ? true : never;
type PublishInternalPresent = "publishInternal" extends keyof TagChipUpdateDeps ? true : never;

const _clockNowPresent: ClockNowPresent = true;
const _getNoteSnapshotPresent: GetNoteSnapshotPresent = true;
const _hydrateNotePresent: HydrateNotePresent = true;
const _publishPresent: PublishPresent = true;
const _writeMarkdownPresent: WriteMarkdownPresent = true;
const _getAllSnapshotsPresent: GetAllSnapshotsPresent = true;
const _publishInternalPresent: PublishInternalPresent = true;

// ── PROP-TCU-020 ─────────────────────────────────────────────────────────

describe("PROP-TCU-020: Non-coupling — TagChipUpdateDeps does not include editor-buffer keys", () => {
  test("Tier-0: 'getEditorBuffer' is NOT a key of TagChipUpdateDeps (compile-time proof)", () => {
    // The type-level assertion above (_getEditorBufferAbsent = true) proves this.
    // If 'getEditorBuffer' were added to TagChipUpdateDeps, the type would become
    // 'never' and this assignment would fail to compile.
    expect(_getEditorBufferAbsent).toBe(true);
  });

  test("Tier-0: 'editingState' is NOT a key of TagChipUpdateDeps (compile-time proof)", () => {
    // Symmetric proof for 'editingState'.
    expect(_editingStateAbsent).toBe(true);
  });

  test("Tier-0: all required port keys ARE present in TagChipUpdateDeps", () => {
    // Positive check: the workflow deps include all expected ports.
    expect(_clockNowPresent).toBe(true);
    expect(_getNoteSnapshotPresent).toBe(true);
    expect(_hydrateNotePresent).toBe(true);
    expect(_publishPresent).toBe(true);
    expect(_writeMarkdownPresent).toBe(true);
    expect(_getAllSnapshotsPresent).toBe(true);
    expect(_publishInternalPresent).toBe(true);
  });

  test("structural isolation: TagChipUpdateDeps runtime shape has no editor keys", () => {
    // Runtime check: construct a minimal deps object and verify no editor keys.
    const minimalDeps: TagChipUpdateDeps = {
      clockNow: () => ({ epochMillis: 0 }) as never,
      getNoteSnapshot: () => null,
      hydrateNote: () => ({ ok: false, error: {} as never }),
      publish: () => {},
      publishInternal: () => {},
      writeMarkdown: async () => ({ ok: false, error: { kind: "unknown", detail: "" } as never }),
      getAllSnapshots: () => [],
    };

    expect("getEditorBuffer" in minimalDeps).toBe(false);
    expect("editingState" in minimalDeps).toBe(false);
  });
});
