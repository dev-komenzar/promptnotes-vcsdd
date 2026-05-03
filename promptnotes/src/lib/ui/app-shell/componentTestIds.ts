/**
 * componentTestIds.ts — REQ-008, REQ-010
 *
 * Constants for component data-testid and role attributes.
 * Centralizes test selectors so tests and components stay in sync.
 */

/** REQ-008: Error banner data-testid. */
export const ERROR_BANNER_TESTID = "startup-error-banner" as const;

/** REQ-008: Error banner ARIA role. */
export const ERROR_BANNER_ROLE = "alert" as const;

/** REQ-008: Startup error message data-testid. */
export const STARTUP_ERROR_MESSAGE_TESTID = "startup-error-message" as const;

/** REQ-003: Vault setup modal data-testid. */
export const VAULT_SETUP_MODAL_TESTID = "vault-setup-modal" as const;
