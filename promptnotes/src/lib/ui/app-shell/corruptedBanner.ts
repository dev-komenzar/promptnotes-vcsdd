/**
 * corruptedBanner.ts — REQ-009, REQ-014, PROP-004
 *
 * Pure functions for corrupted file banner logic and style constants.
 * Purity boundary: PURE CORE — no side effects.
 *
 * DESIGN.md §2 Semantic Accent Colors: Orange #dd5b00 (warn).
 */

import { DESIGN_TOKENS } from "./designTokens.js";

// ── Style token constants (REQ-014) ──────────────────────────────────────

/**
 * REQ-014: Corrupted banner style constants tracing to DESIGN.md tokens.
 * Values sourced from DESIGN_TOKENS to eliminate duplicate literals.
 */
export const CORRUPTED_BANNER_STYLES = {
  warnColor: DESIGN_TOKENS.warnColor,
  borderRadius: "8px",
  fontSize: "16px",
  fontWeight: 500,
  border: DESIGN_TOKENS.whisperBorder,
} as const;

// ── CorruptedFile shape ───────────────────────────────────────────────────

// ── shouldShowCorruptedBanner ─────────────────────────────────────────────

/**
 * REQ-009 / PROP-004: Returns true iff files.length >= 1.
 * null/undefined treated as empty array.
 * Accepts any array type to support fast-check property tests (PROP-004).
 */
export function shouldShowCorruptedBanner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  files: ReadonlyArray<any> | null | undefined
): boolean {
  if (files == null) return false;
  return files.length >= 1;
}

// ── buildCorruptedBannerMessage ───────────────────────────────────────────

/**
 * REQ-009: Returns the count-aware Japanese banner message.
 */
export function buildCorruptedBannerMessage(count: number): string {
  return `${count} 件の破損ファイルがあります`;
}
