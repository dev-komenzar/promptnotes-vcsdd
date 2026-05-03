/**
 * startup-error-routing.test.ts — REQ-008, REQ-009, REQ-010, PROP-007, PROP-009, REQ-020
 *
 * REQ-008: Unexpected エラー状態 — インラインバナー表示
 *   - AppStartupError.kind === 'scan' → UnexpectedError → バナー表示, モーダル非表示
 *   - Tauri IPC クラッシュ → UnexpectedError → バナー表示, モーダル非表示
 *   - IPC タイムアウト (REQ-022) → UnexpectedError
 *   - バナーは role="alert"
 *   - バナーは data-testid="startup-error-banner"
 *   - バナーはフォーカスを奪わない (autofocus なし)
 *
 * REQ-009: 破損ファイル警告バナー (cross-reference corrupted-banner.unit.test.ts)
 *
 * REQ-010: グローバルレイアウトフレーム — ヘッダー
 *   - data-testid assertions for header structure
 *
 * REQ-020: Loading 状態の条件付きレンダリング (CRIT-003, CRIT-018)
 *   - <header> は Loading state と Configured state の両方でレンダリングされる
 *   - Loading branch に <main> は含まれない（"main feed area SHALL be empty"）
 *   - Unconfigured / StartupError には <header> は含まれない
 *   - UnexpectedError には <header> は含まれない
 *   - aria-hidden toggle は構造要素に使用しない
 *
 * PROP-007: PathNotFound / PermissionDenied → StartupError routing (all 5 paths)
 * PROP-009: scan エラー / IPC クラッシュ時はバナーのみ (no modal)
 *
 * RED PHASE: imports below MUST fail — modules do not exist yet.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import type { AppStartupError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultPath, VaultId } from "promptnotes-domain-types/shared/value-objects";

// RED PHASE: These imports MUST FAIL — modules do not exist yet.
import {
  routeStartupResult,
  type AppShellState,
  type AppShellRouteResult,
} from "$lib/ui/app-shell/routeStartupResult";

import {
  ERROR_BANNER_TESTID,
  ERROR_BANNER_ROLE,
  STARTUP_ERROR_MESSAGE_TESTID,
  VAULT_SETUP_MODAL_TESTID,
} from "$lib/ui/app-shell/componentTestIds";

import {
  bootOrchestrator,
} from "$lib/ui/app-shell/bootOrchestrator";

// @vcsdd-allow-brand-construction
const vaultPath = (s: string): VaultPath => s as unknown as VaultPath;
const vaultId = (s: string): VaultId => s as unknown as VaultId;

// ── REQ-008 / PROP-009: UnexpectedError routing ───────────────────────────────

describe("REQ-008 / PROP-009: scan error → UnexpectedError (banner, not modal)", () => {
  test("routeStartupResult for scan error returns state=UnexpectedError", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail: "I/O error" } },
    };
    const routed = routeStartupResult(result);
    expect(routed.state).toBe("UnexpectedError");
  });

  test("PROP-009: scan error state does NOT include modal-open flag", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail: "disk error" } },
    };
    const routed = routeStartupResult(result);
    expect(routed.state).toBe("UnexpectedError");
    // In UnexpectedError, modal should not be shown
    // The routeResult should indicate isModalOpen=false or equivalent
    expect(routed.isModalOpen).toBe(false);
  });
});

// ── REQ-008: Error banner testId and role ────────────────────────────────────

describe("REQ-008: Error banner component IDs match spec", () => {
  test("ERROR_BANNER_TESTID is 'startup-error-banner'", () => {
    expect(ERROR_BANNER_TESTID).toBe("startup-error-banner");
  });

  test("ERROR_BANNER_ROLE is 'alert'", () => {
    expect(ERROR_BANNER_ROLE).toBe("alert");
  });

  test("STARTUP_ERROR_MESSAGE_TESTID is 'startup-error-message'", () => {
    expect(STARTUP_ERROR_MESSAGE_TESTID).toBe("startup-error-message");
  });

  test("VAULT_SETUP_MODAL_TESTID is 'vault-setup-modal'", () => {
    expect(VAULT_SETUP_MODAL_TESTID).toBe("vault-setup-modal");
  });
});

// ── PROP-007: All 5 routeStartupResult paths ─────────────────────────────────

describe("PROP-007: All 5 AppStartupError paths route to correct AppShellState", () => {
  test("PROP-007: Ok(InitialUIState) → Configured", () => {
    const result: Result<any, AppStartupError> = { ok: true, value: {} };
    expect(routeStartupResult(result).state).toBe("Configured");
  });

  test("PROP-007: unconfigured → Unconfigured", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "unconfigured" } },
    };
    expect(routeStartupResult(result).state).toBe("Unconfigured");
  });

  test("PROP-007: path-not-found → StartupError", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "path-not-found", path: "/x" } },
    };
    expect(routeStartupResult(result).state).toBe("StartupError");
  });

  test("PROP-007: permission-denied → StartupError", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "permission-denied", path: "/x" } },
    };
    expect(routeStartupResult(result).state).toBe("StartupError");
  });

  test("PROP-007: list-failed → UnexpectedError", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail: "" } },
    };
    expect(routeStartupResult(result).state).toBe("UnexpectedError");
  });
});

// ── REQ-008: IPC crash → UnexpectedError ─────────────────────────────────────

describe("REQ-008: IPC crash transitions to UnexpectedError", () => {
  test("IPC crash (exception) → UnexpectedError via bootOrchestrator", async () => {
    const adapter = {
      invokeAppStartup: async () => { throw new Error("Tauri IPC unavailable"); },
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };
    const routeResult = await bootOrchestrator({ adapter, isBootAttempted: false });
    expect(routeResult.state).toBe("UnexpectedError");
  });
});

// ── REQ-009 / PROP-004: corruptedFiles routing ───────────────────────────────

describe("REQ-009: Configured state with corruptedFiles routes banner correctly", () => {
  test("routeStartupResult for Ok with corruptedFiles.length >= 1 returns showCorruptedBanner=true", () => {
    const result: Result<any, AppStartupError> = {
      ok: true,
      value: {
        corruptedFiles: [{ filePath: "/vault/broken.md" }],
      },
    };
    const routed = routeStartupResult(result);
    expect(routed.state).toBe("Configured");
    expect(routed.showCorruptedBanner).toBe(true);
  });

  test("routeStartupResult for Ok with corruptedFiles.length === 0 returns showCorruptedBanner=false", () => {
    const result: Result<any, AppStartupError> = {
      ok: true,
      value: {
        corruptedFiles: [],
      },
    };
    const routed = routeStartupResult(result);
    expect(routed.state).toBe("Configured");
    expect(routed.showCorruptedBanner).toBe(false);
  });
});

// ── FIND-604 / CRIT-003 / CRIT-018: AppShell.svelte conditional-rendering static scan ──

const APPSHELL_SVELTE = path.resolve(process.cwd(), "src/lib/ui/app-shell/AppShell.svelte");
const appShellSrc = fs.readFileSync(APPSHELL_SVELTE, "utf-8");

describe("FIND-604 / CRIT-003: <header> rendered in Loading state (REQ-020)", () => {
  /**
   * REQ-020: "WHILE AppShellState === 'Loading' THE SYSTEM SHALL render only the
   * global header shell (without full nav content) and a centered loading affordance."
   *
   * The header element must appear inside (or above) a conditional block that
   * includes the Loading state.  Accepted patterns:
   *   (A) {#if state === "Loading" || state === "Configured"}<header>
   *   (B) {#if state === "Loading"} ... <header>
   *
   * The current FAILING condition: the only <header> in the file lives inside
   * {#if state === "Configured"} with no Loading || guard.
   */
  test("CRIT-003: <header> element appears in a conditional block that includes 'Loading' state", () => {
    // Strategy: find every {#if ...} block in source order, record which block
    // each <header> tag belongs to.  Assert that at least one <header> is in a
    // block whose condition text contains 'Loading'.
    //
    // We use a simple linear scan: walk the source, track the innermost active
    // {#if} condition text when we encounter <header>.
    const lines = appShellSrc.split("\n");
    const ifStack: string[] = [];
    let headerFoundInLoadingBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();
      // Detect {#if <condition>}
      const ifMatch = trimmed.match(/^\{#if\s+(.+?)\}/);
      if (ifMatch) {
        ifStack.push(ifMatch[1]);
      }
      // Detect {:else if <condition>} — replace top of stack
      const elseIfMatch = trimmed.match(/^\{:else if\s+(.+?)\}/);
      if (elseIfMatch) {
        if (ifStack.length > 0) {
          ifStack[ifStack.length - 1] = elseIfMatch[1];
        }
      }
      // Detect {/if} — pop stack
      if (trimmed === "{/if}") {
        ifStack.pop();
      }
      // Check for <header when inside a Loading-containing block
      if (trimmed.startsWith("<header")) {
        // The outermost active condition must include 'Loading'
        const activeCondition = ifStack[ifStack.length - 1] ?? "";
        if (activeCondition.includes("Loading")) {
          headerFoundInLoadingBlock = true;
        }
      }
    }

    expect(headerFoundInLoadingBlock).toBe(true);
  });

  test("CRIT-003: <header> element also appears in a conditional block that includes 'Configured' state", () => {
    const lines = appShellSrc.split("\n");
    const ifStack: string[] = [];
    let headerFoundInConfiguredBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const ifMatch = trimmed.match(/^\{#if\s+(.+?)\}/);
      if (ifMatch) {
        ifStack.push(ifMatch[1]);
      }
      const elseIfMatch = trimmed.match(/^\{:else if\s+(.+?)\}/);
      if (elseIfMatch) {
        if (ifStack.length > 0) {
          ifStack[ifStack.length - 1] = elseIfMatch[1];
        }
      }
      if (trimmed === "{/if}") {
        ifStack.pop();
      }
      if (trimmed.startsWith("<header")) {
        const activeCondition = ifStack[ifStack.length - 1] ?? "";
        if (activeCondition.includes("Configured")) {
          headerFoundInConfiguredBlock = true;
        }
      }
    }

    expect(headerFoundInConfiguredBlock).toBe(true);
  });

  test("CRIT-003: <header> is NOT rendered when state === 'Unconfigured' (modal-only state)", () => {
    // In Unconfigured state only VaultSetupModal renders. No <header> may be
    // wrapped in a condition whose sole branch is Unconfigured.
    // We assert: the file does NOT contain '{#if state === "Unconfigured"}' followed
    // by a <header> element before the matching {/if}.
    const unconfiguredOnlyHeaderPattern = /\{#if\s+state\s*===\s*["']Unconfigured["']\s*\}[\s\S]*?<header/;
    expect(unconfiguredOnlyHeaderPattern.test(appShellSrc)).toBe(false);
  });

  test("CRIT-003: <header> is NOT rendered when state === 'StartupError' (modal-only state)", () => {
    const startupErrorOnlyHeaderPattern = /\{#if\s+state\s*===\s*["']StartupError["']\s*\}[\s\S]*?<header/;
    expect(startupErrorOnlyHeaderPattern.test(appShellSrc)).toBe(false);
  });
});

describe("FIND-604 / CRIT-018: Loading branch must NOT contain <main> with skeleton content (REQ-020)", () => {
  /**
   * REQ-020: "The main feed area SHALL be empty" in Loading state.
   * The Loading branch must not render <main> with skeleton-card content.
   *
   * Current FAILING condition: AppShell.svelte has
   *   {#if state === "Loading"}<main><div class="skeleton-card">...
   * which violates REQ-020.
   */
  test("CRIT-018: Loading state {#if} block does NOT contain a <main> element", () => {
    // Extract the content of the {#if state === "Loading"} block.
    // We find the opening, then walk forward counting nested {#if}/{/if} to
    // find the matching {/if}, and assert no <main> appears in that slice.
    const loadingBlockStart = /\{#if\s+state\s*===\s*["']Loading["']\s*\}/;
    const startMatch = loadingBlockStart.exec(appShellSrc);
    expect(startMatch).not.toBeNull();

    if (startMatch) {
      let pos = startMatch.index + startMatch[0].length;
      let depth = 1;
      let blockContent = "";

      // Simple scan: find matching {/if}
      while (pos < appShellSrc.length && depth > 0) {
        if (appShellSrc.startsWith("{#if", pos) || appShellSrc.startsWith("{#each", pos)) {
          depth++;
        } else if (appShellSrc.startsWith("{/if}", pos) || appShellSrc.startsWith("{/each}", pos)) {
          depth--;
          if (depth === 0) break;
        }
        blockContent += appShellSrc[pos];
        pos++;
      }

      // The Loading block must not contain <main>
      expect(blockContent).not.toMatch(/<main/);
    }
  });

  test("CRIT-018: AppShell.svelte does NOT use aria-hidden toggle on structural <header> or <main>", () => {
    // REQ-020 specifies conditional DOM rendering, not aria-hidden toggling.
    // Check that neither <header> nor <main> have an aria-hidden attribute.
    const headerAriaHidden = /<header[^>]*aria-hidden/;
    const mainAriaHidden = /<main[^>]*aria-hidden/;
    expect(headerAriaHidden.test(appShellSrc)).toBe(false);
    expect(mainAriaHidden.test(appShellSrc)).toBe(false);
  });

  test("CRIT-018: full Configured main content block is inside {#if state === 'Configured'} guard", () => {
    // The <slot /> (main notes list) must only appear inside the Configured block.
    // We assert: <slot /> appears in the source AND is preceded (in source order)
    // by {#if state === "Configured"} without an intervening {/if}.
    const configuredBlockStart = /\{#if\s+state\s*===\s*["']Configured["']\}/;
    const slotPresent = appShellSrc.includes("<slot");
    expect(slotPresent).toBe(true);

    // Find the last {#if state === "Configured"} before the first <slot
    const slotIndex = appShellSrc.indexOf("<slot");
    const beforeSlot = appShellSrc.slice(0, slotIndex);
    const configuredMatches = [...beforeSlot.matchAll(new RegExp(configuredBlockStart.source, "g"))];
    expect(configuredMatches.length).toBeGreaterThan(0);
  });
});
