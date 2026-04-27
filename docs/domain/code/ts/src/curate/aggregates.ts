// Curate Context — Feed Aggregate.
//
// 由来: aggregates.md §2 Feed Aggregate

import type { Result } from "../util/result.js";
import type { NoteFileSnapshot } from "../shared/snapshots.js";
import type { NoteId, Tag } from "../shared/value-objects.js";

// ──────────────────────────────────────────────────────────────────────
// Value Objects
// ──────────────────────────────────────────────────────────────────────

/** タグ + frontmatter フィールドの絞り込み条件。 */
export type FilterCriteria = {
  /** 同タグ間 OR、異種条件間 AND（aggregates.md §2 不変条件 3）。 */
  readonly tags: readonly Tag[];
  /** field → value のマップ。Map ではなく { [key]: value } 形式で表現。 */
  readonly frontmatterFields: ReadonlyMap<string, string>;
};

export type SearchScope = "body+frontmatter" | "body" | "frontmatter";

export type SearchQuery = {
  readonly text: string;
  /** MVP は "body+frontmatter" のみ採用。 */
  readonly scope: SearchScope;
};

export type SortOrder = {
  readonly field: "timestamp";
  readonly direction: "desc" | "asc";
};

// ──────────────────────────────────────────────────────────────────────
// Feed Aggregate
// ID 不要（Curate Context 内シングルトン）
// ──────────────────────────────────────────────────────────────────────

export type Feed = {
  /** 表示候補の NoteId 集合。同一 NoteId は 1 度だけ（不変条件 1）。 */
  readonly noteRefs: readonly NoteId[];
  readonly filterCriteria: FilterCriteria;
  readonly searchQuery: SearchQuery | null;
  readonly sortOrder: SortOrder;
};

// ──────────────────────────────────────────────────────────────────────
// Feed の不変条件違反の表現
// ──────────────────────────────────────────────────────────────────────

export type FeedError =
  | { kind: "duplicate-note-ref"; noteId: NoteId }
  | { kind: "unknown-note-ref"; noteId: NoteId };

// ──────────────────────────────────────────────────────────────────────
// 公開操作（aggregates.md §2 公開操作）
// すべて Pure。新インスタンスを返す。
// ──────────────────────────────────────────────────────────────────────

export interface FeedOps {
  applyTagFilter(feed: Feed, tag: Tag): Feed;
  removeTagFilter(feed: Feed, tag: Tag): Feed;
  applyFrontmatterFilter(feed: Feed, field: string, value: string): Feed;
  clearFilter(feed: Feed): Feed;
  applySearch(feed: Feed, query: SearchQuery): Feed;
  clearSearch(feed: Feed): Feed;
  sortBy(feed: Feed, order: SortOrder): Feed;
  addNoteRef(feed: Feed, id: NoteId): Result<Feed, FeedError>;
  removeNoteRef(feed: Feed, id: NoteId): Feed;
  /** updatedAt 変更を受けて noteRefs をソートし直す（保存後の最上部移動など）。 */
  refreshSort(feed: Feed, snapshots: readonly NoteFileSnapshot[]): Feed;
  /** フィルタ＋検索＋ソートを適用した可視 ID 列を返す Pure Function。 */
  computeVisible(
    feed: Feed,
    snapshots: readonly NoteFileSnapshot[],
  ): readonly NoteId[];
  hasNote(feed: Feed, id: NoteId): boolean;
}
