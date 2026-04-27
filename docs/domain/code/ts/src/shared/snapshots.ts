// Shared Kernel — DTO crossing the Vault boundary.
// 真実は Rust 側 (rust/src/snapshots.rs)。
//
// 由来:
//   - glossary.md §3 NoteFileSnapshot, Hydration
//   - aggregates.md §4 Vault Aggregate
//   - domain-events.md `VaultScanned`

import type { Body, Frontmatter, NoteId, Timestamp } from "./value-objects.js";

export type NoteFileSnapshot = {
  readonly noteId: NoteId;
  readonly body: Body;
  readonly frontmatter: Frontmatter;
  readonly filePath: string;
  readonly fileMtime: Timestamp;
};

export type HydrationFailureReason =
  | "yaml-parse"
  | "missing-field"
  | "invalid-value"
  | "unknown";

export type CorruptedFile = {
  readonly filePath: string;
  readonly reason: HydrationFailureReason;
  readonly detail?: string;
};
