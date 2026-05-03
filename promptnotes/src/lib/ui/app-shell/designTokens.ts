/**
 * designTokens.ts — REQ-010..REQ-015, REQ-017, REQ-019, PROP-006
 *
 * Single source of truth for all DESIGN.md token values used in app-shell
 * components. All color/spacing/shadow values must trace to this module.
 *
 * DESIGN.md §2 Shadows, §3 Typography, §5 Spacing, §10 Token Reference.
 */

// ── Color tokens (DESIGN.md §10 Token Reference) ──────────────────────────

export const DESIGN_TOKENS = {
  // Primary backgrounds
  pureWhite: "#ffffff",
  warmWhite: "#f6f5f4",

  // Text
  nearBlack: "rgba(0,0,0,0.95)",
  softBlack: "rgba(0,0,0,0.9)",

  // Semantic accent
  warnColor: "#dd5b00",

  // Border
  whisperBorder: "1px solid rgba(0,0,0,0.1)",

  // Overlay / scrim
  modalScrim: "rgba(0,0,0,0.5)",

  // Border radius
  cardRadius: "12px",
  largeRadius: "16px",
} as const;

// ── Shadow tokens (DESIGN.md §2 Layered Shadow System) ───────────────────

/**
 * REQ-013: Card Shadow — 4-layer stack (Soft Card Level 2).
 */
export const CARD_SHADOW = [
  "rgba(0,0,0,0.04) 0px 4px 18px",
  "rgba(0,0,0,0.027) 0px 2.025px 7.84688px",
  "rgba(0,0,0,0.02) 0px 0.8px 2.925px",
  "rgba(0,0,0,0.01) 0px 0.175px 1.04062px",
].join(", ");

/**
 * REQ-017: Deep Shadow — 5-layer stack (Deep Card Level 3).
 * Used for modals and elevated surfaces.
 */
export const DEEP_SHADOW = [
  "rgba(0,0,0,0.01) 0px 1px 3px",
  "rgba(0,0,0,0.02) 0px 3px 7px",
  "rgba(0,0,0,0.02) 0px 7px 15px",
  "rgba(0,0,0,0.04) 0px 14px 28px",
  "rgba(0,0,0,0.05) 0px 23px 52px",
].join(", ");

// ── Spacing scale (DESIGN.md §5) ─────────────────────────────────────────

/**
 * REQ-011: Allowed spacing values in pixels. No other px values permitted.
 * Typed as readonly number[] to allow toEqual() comparison with plain arrays.
 */
export const SPACING_SCALE: readonly number[] = [2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32];

// ── Typography (DESIGN.md §3) ────────────────────────────────────────────

/**
 * REQ-015: 4-weight system — only these font-weight values are permitted.
 * Typed as readonly number[] to allow toContain() / toEqual() comparisons.
 */
export const ALLOWED_FONT_WEIGHTS: readonly number[] = [400, 500, 600, 700];

// ── Composite style objects — derived from DESIGN_TOKENS ─────────────────

/**
 * REQ-010: Header style constants.
 * Derived from DESIGN_TOKENS to eliminate duplicate color literals.
 */
export const HEADER_STYLE = {
  backgroundColor: DESIGN_TOKENS.pureWhite,
  borderBottom: DESIGN_TOKENS.whisperBorder,
  titleFontSize: "15px",
  titleFontWeight: 600,
  titleColor: DESIGN_TOKENS.nearBlack,
} as const;

/**
 * REQ-012: Skeleton card style constants.
 * Derived from DESIGN_TOKENS to eliminate duplicate color literals.
 */
export const SKELETON_CARD_STYLE = {
  borderRadius: DESIGN_TOKENS.cardRadius,
  baseColor: DESIGN_TOKENS.warmWhite,
  highlightColor: DESIGN_TOKENS.pureWhite,
  ariaHidden: "true",
} as const;

/**
 * REQ-017: Modal style constants.
 * Derived from DESIGN_TOKENS and DEEP_SHADOW.
 */
export const MODAL_STYLE = {
  borderRadius: DESIGN_TOKENS.largeRadius,
  boxShadow: DEEP_SHADOW,
  scrim: DESIGN_TOKENS.modalScrim,
} as const;
