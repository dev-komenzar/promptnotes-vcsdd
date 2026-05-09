// Phase 11 simulations — Branded VO のテスト用モック生成器。
//
// 真実は Rust 側 Smart Constructor。TS では構築不能（branded type）。
// シナリオ検証のためだけに `as unknown as` で偽装する。
// 本番コードではこのファイルを参照しないこと。

import type { Block } from "../shared/note.js";
import type {
  BlockContent,
  BlockId,
  BlockType,
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
  VaultId,
  VaultPath,
} from "../shared/value-objects.js";

export const mockNoteId = (raw: string): NoteId =>
  raw as unknown as NoteId;

export const mockTimestamp = (epochMillis: number): Timestamp =>
  ({ epochMillis }) as unknown as Timestamp;

export const mockTag = (raw: string): Tag =>
  raw as unknown as Tag;

export const mockBody = (raw: string): Body =>
  raw as unknown as Body;

export const mockVaultPath = (raw: string): VaultPath =>
  raw as unknown as VaultPath;

export const mockVaultId = (raw: string): VaultId =>
  raw as unknown as VaultId;

export const mockFrontmatter = (
  tags: readonly Tag[],
  createdAt: Timestamp,
  updatedAt: Timestamp,
): Frontmatter =>
  ({ tags, createdAt, updatedAt }) as unknown as Frontmatter;

// ──────────────────────────────────────────────────────────────────────
// Block 系（ブロックベース UI 化、aggregates.md §1 Block）
// ──────────────────────────────────────────────────────────────────────

export const mockBlockId = (raw: string): BlockId =>
  raw as unknown as BlockId;

export const mockBlockContent = (raw: string): BlockContent =>
  raw as unknown as BlockContent;

/** 単一ブロックを生成するヘルパ。type 省略時は paragraph。 */
export const mockBlock = (
  id: string,
  content: string,
  type: BlockType = "paragraph",
): Block => ({
  id: mockBlockId(id),
  type,
  content: mockBlockContent(content),
});

/** 文字列から `[paragraph]` 1 ブロックの Block 列を作るショートカット。
 * `body: "..." as Body` と書いていた箇所の最小置換用。 */
export const mockBlocksFromText = (text: string): ReadonlyArray<Block> => [
  mockBlock("block-0", text, "paragraph"),
];

/** 空ノート相当（`[empty paragraph]` 1 ブロック）。 */
export const mockEmptyBlocks = (): ReadonlyArray<Block> => [
  mockBlock("block-0", "", "paragraph"),
];
