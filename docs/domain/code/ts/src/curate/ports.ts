// Curate Context — 外界依存ポート.
//
// 由来: workflows.md §依存（ポート）一覧 のうち Curate が直接使うもの

import type { PublicDomainEvent } from "../shared/events.js";
import type { Note } from "../shared/note.js";
import type { NoteFileSnapshot } from "../shared/snapshots.js";
import type { NoteId, Timestamp } from "../shared/value-objects.js";
import type { HydrationFailureReason } from "../shared/snapshots.js";
import type { Result } from "../util/result.js";

/** Clock — 時刻取得。 */
export type ClockNow = () => Timestamp;

/** Vault Snapshot から Note Aggregate へのハイドレート。ACL 責務。
 * 内部で `parseMarkdownToBlocks(snapshot.body)` を呼び、Markdown 文字列を
 * Block[] に変換する（aggregates.md §1.6 / glossary.md §3 Hydration）。 */
export type HydrateNote = (
  snapshot: NoteFileSnapshot,
) => Result<Note, HydrationFailureReason>;

/** Curate が保持する最新 snapshot を NoteId で取得（in-memory read）。 */
export type GetNoteSnapshot = (noteId: NoteId) => NoteFileSnapshot | null;

export type EventBusPublish = (event: PublicDomainEvent) => void;

export type CurateDeps = {
  readonly clockNow: ClockNow;
  readonly hydrateNote: HydrateNote;
  readonly getNoteSnapshot: GetNoteSnapshot;
  readonly publish: EventBusPublish;
};
