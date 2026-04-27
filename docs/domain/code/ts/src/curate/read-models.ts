// Curate Context — Read Models.
//
// 由来: aggregates.md §3 TagInventory（Read Model：Curate Context）

import type { NoteFileSnapshot } from "../shared/snapshots.js";
import type {
  Frontmatter,
  Tag,
  Timestamp,
} from "../shared/value-objects.js";

// ──────────────────────────────────────────────────────────────────────
// TagInventory — Note 群からの投影。永続化しない。
// ──────────────────────────────────────────────────────────────────────

export type TagEntry = {
  readonly name: Tag;
  /** 不変条件 1: usageCount > 0（使用ゼロのタグは含まれない）。 */
  readonly usageCount: number;
};

export type TagInventory = {
  /** name で一意（不変条件 2）。 */
  readonly entries: readonly TagEntry[];
  readonly lastBuiltAt: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// 操作（aggregates.md §3 操作）
// すべて Pure。新インスタンスを返す。
// ──────────────────────────────────────────────────────────────────────

export interface TagInventoryOps {
  buildFromNotes(
    snapshots: readonly NoteFileSnapshot[],
    now: Timestamp,
  ): TagInventory;

  applyNoteCreated(
    inventory: TagInventory,
    frontmatter: Frontmatter,
    now: Timestamp,
  ): TagInventory;

  /** 旧 frontmatter と新 frontmatter からタグ増減を計算。 */
  applyNoteFrontmatterEdited(
    inventory: TagInventory,
    before: Frontmatter,
    after: Frontmatter,
    now: Timestamp,
  ): TagInventory;

  applyNoteDeleted(
    inventory: TagInventory,
    frontmatter: Frontmatter,
    now: Timestamp,
  ): TagInventory;
}
