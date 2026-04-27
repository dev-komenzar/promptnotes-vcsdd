// Capture Context — 外界依存ポート（DMMF: 関数型シグネチャ）。
//
// 由来: workflows.md §依存（ポート）一覧 のうち Capture が直接使うもの

import type { Result } from "../util/result.js";
import type { FsError } from "../shared/errors.js";
import type { PublicDomainEvent } from "../shared/events.js";
import type { NoteId, Timestamp } from "../shared/value-objects.js";

/** Clock — 時刻取得（purity-violating）。 */
export type ClockNow = () => Timestamp;

/** Vault.allocateNoteId — 新規ノート作成時の ID 衝突回避。 */
export type AllocateNoteId = (preferred: Timestamp) => NoteId;

/** OS clipboard 書き込み。 */
export type ClipboardWrite = (text: string) => Result<void, FsError>;

/** Public Domain Event をバスへ発行。 */
export type EventBusPublish = (event: PublicDomainEvent) => void;

/** Capture 全体の依存集合。 */
export type CaptureDeps = {
  readonly clockNow: ClockNow;
  readonly allocateNoteId: AllocateNoteId;
  readonly clipboardWrite: ClipboardWrite;
  readonly publish: EventBusPublish;
};
