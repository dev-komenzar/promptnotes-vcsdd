/**
 * loadingState.ts — REQ-020
 *
 * ARIA attribute constants for the Loading state skeleton.
 * Pure constants — no side effects.
 */

/**
 * REQ-020: ARIA attributes for the loading skeleton element.
 */
export const LOADING_ARIA_ATTRIBUTES = {
  role: "status",
  "aria-busy": "true",
  "aria-label": "読み込み中",
} as const;
