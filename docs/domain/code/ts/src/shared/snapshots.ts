// Shared Kernel — DTO crossing the Vault boundary.
// 真実は Rust 側 (rust/src/snapshots.rs)。
//
// 由来:
//   - glossary.md §3 NoteFileSnapshot, Hydration, ScanFileFailure
//   - aggregates.md §4 Vault Aggregate
//   - domain-events.md `VaultScanned`

import type { FsError } from "./errors.js";
import type { Body, Frontmatter, NoteId, Timestamp } from "./value-objects.js";

/**
 * Vault 境界を渡る DTO。
 * `body` は Markdown 文字列のまま保持する（ファイル境界では Markdown 文字列が一次データ）。
 * Aggregate 境界内では `parseMarkdownToBlocks(body)` で Block[] に変換してから扱う
 * （Hydration の責務、aggregates.md §1.6 / workflows.md Workflow 1）。
 */
export type NoteFileSnapshot = {
  readonly noteId: NoteId;
  readonly body: Body;
  readonly frontmatter: Frontmatter;
  readonly filePath: string;
  readonly fileMtime: Timestamp;
};

/**
 * snapshot → Note Aggregate の変換失敗のみを表す。
 * 由来: glossary.md §3 / domain-events.md `NoteHydrationFailed`
 *
 * read I/O 失敗（permission 等）はここに含めない。
 * scanVault でのファイル単位 read 失敗は `ScanFileFailure.kind = 'read'` を使う。
 */
export type HydrationFailureReason =
  | "yaml-parse"
  | "missing-field"
  | "invalid-value"
  | "block-parse"
  | "unknown";

/**
 * scanVault で個別ファイルが失敗した原因を出所別に表す判別ユニオン。
 * `read` は OS read 失敗（FsError）、`hydrate` は parse / 変換失敗。
 *
 * 由来: workflows.md Workflow 1 Step 2 / domain-events.md `VaultScanned.corruptedFiles`
 */
export type ScanFileFailure =
  | { readonly kind: "read"; readonly fsError: FsError }
  | { readonly kind: "hydrate"; readonly reason: HydrationFailureReason };

export type CorruptedFile = {
  readonly filePath: string;
  readonly failure: ScanFileFailure;
  readonly detail?: string;
};
