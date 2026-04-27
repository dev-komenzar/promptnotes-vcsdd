// Phase 11 simulations — Branded VO のテスト用モック生成器。
//
// 真実は Rust 側 Smart Constructor。TS では構築不能（branded type）。
// シナリオ検証のためだけに `as unknown as` で偽装する。
// 本番コードではこのファイルを参照しないこと。

import type {
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
