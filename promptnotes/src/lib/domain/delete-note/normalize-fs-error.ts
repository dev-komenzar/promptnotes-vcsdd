// delete-note/normalize-fs-error.ts
// Pure FsError → NoteDeletionFailureReason mapping.
//
// REQ-DLN-004: Filesystem Error — permission, lock, disk-full, or unknown
// REQ-DLN-013: disk-full normalization and FsError.unknown.detail propagation
//
// PROP-DLN-006(c): FsError exhaustiveness — explicit disk-full arm required (FIND-SPEC-DLN-002)
// PROP-DLN-017: disk-full → 'unknown' normalization is total
// PROP-DLN-018: FsError.unknown.detail propagation

import type { FsError, NoteDeletionFailureReason } from "promptnotes-domain-types/shared/errors";

// ── NormalizedFsError ─────────────────────────────────────────────────────────
// The result of normalizing an FsError for use in NoteDeletionFailed.
// reason: the mapped NoteDeletionFailureReason
// detail: optional diagnostic string (propagated from FsError.unknown.detail,
//         or set to 'disk-full' as a diagnostic string for the disk-full normalization case)

export type NormalizedFsError = {
  readonly reason: NoteDeletionFailureReason;
  readonly detail: string | undefined;
};

// ── normalizeFsError ──────────────────────────────────────────────────────────
// Pure mapping: FsError → NormalizedFsError.
// Exhaustive switch with explicit disk-full arm (FIND-SPEC-DLN-002 / PROP-DLN-006(c)).
//
// FsError → NoteDeletionFailureReason table:
//   permission → 'permission'  (detail: undefined)
//   lock       → 'lock'        (detail: undefined)
//   not-found  → 'not-found'   (detail: undefined) — graceful path handled in orchestrator
//   disk-full  → 'unknown'     (detail: 'disk-full') — normalization per REQ-DLN-013
//   unknown    → 'unknown'     (detail: FsError.detail) — propagation per PROP-DLN-018

export function normalizeFsError(err: FsError): NormalizedFsError {
  switch (err.kind) {
    case "permission":
      return { reason: "permission", detail: undefined };

    case "lock":
      return { reason: "lock", detail: undefined };

    case "not-found":
      return { reason: "not-found", detail: undefined };

    case "disk-full":
      // Explicit arm required per FIND-SPEC-DLN-002 / PROP-DLN-017.
      // disk-full maps to 'unknown' reason; diagnostic detail set to 'disk-full' string.
      return { reason: "unknown", detail: "disk-full" };

    case "unknown":
      // PROP-DLN-018: propagate the mandatory detail string exactly.
      return { reason: "unknown", detail: err.detail };

    default: {
      // TypeScript exhaustiveness guard — never arm
      const _never: never = err;
      return _never;
    }
  }
}
