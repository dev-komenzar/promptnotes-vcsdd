/**
 * corrupted-banner.unit.test.ts — REQ-009, REQ-014, PROP-004
 *
 * REQ-009: 破損ファイル警告バナー
 *   - corruptedFiles.length >= 1 → バナー表示
 *   - corruptedFiles.length === 0 → バナー非表示
 *   - undefined/null → 空配列扱い、バナー非表示
 *   - length === 1 → 「1 件の破損ファイルがあります」
 *   - length >= 2 → 「N 件の破損ファイルがあります」
 *
 * REQ-014: 破損ファイルバナー — スタイル規約
 *   - 背景色: #dd5b00 (warn / Orange, DESIGN.md §2 Semantic Accent Colors)
 *   - border-radius: 8px (Standard card radius)
 *   - テキスト: 16px weight 500
 *   - ボーダー: Whisper Border 1px solid rgba(0,0,0,0.1)
 *
 * PROP-004: shouldShowCorruptedBanner(files) === (files.length >= 1)
 *   Unit tests here; fast-check property in prop/corrupted-banner.prop.test.ts
 *
 * RED PHASE: imports below MUST fail — module does not exist yet.
 */

import { describe, test, expect } from "bun:test";

// RED PHASE: This import MUST FAIL — module does not exist yet.
import {
  shouldShowCorruptedBanner,
  buildCorruptedBannerMessage,
} from "$lib/ui/app-shell/corruptedBanner";

// ── REQ-009 / PROP-004: shouldShowCorruptedBanner ────────────────────────────

describe("REQ-009 / PROP-004: shouldShowCorruptedBanner", () => {
  // EC-09: corruptedFiles.length === 0 → no banner
  test("EC-09: empty array → banner NOT shown", () => {
    expect(shouldShowCorruptedBanner([])).toBe(false);
  });

  // EC-10: corruptedFiles.length === 1 → banner shown
  test("EC-10: single corrupted file → banner shown", () => {
    expect(shouldShowCorruptedBanner([{ filePath: "/vault/bad.md" }])).toBe(true);
  });

  // EC-11: corruptedFiles.length > 1 → banner shown
  test("EC-11: multiple corrupted files → banner shown with count", () => {
    const files = [
      { filePath: "/vault/a.md" },
      { filePath: "/vault/b.md" },
      { filePath: "/vault/c.md" },
    ];
    expect(shouldShowCorruptedBanner(files)).toBe(true);
  });

  test("null/undefined treated as empty → banner NOT shown", () => {
    // The spec says: undefined/null treated as empty array
    expect(shouldShowCorruptedBanner(null as any)).toBe(false);
    expect(shouldShowCorruptedBanner(undefined as any)).toBe(false);
  });

  test("single item: length === 1 boundary", () => {
    expect(shouldShowCorruptedBanner([{ filePath: "/x" }])).toBe(true);
  });

  test("zero items: length === 0 boundary", () => {
    expect(shouldShowCorruptedBanner([])).toBe(false);
  });

  test("large array: still returns true", () => {
    const files = Array.from({ length: 100 }, (_, i) => ({ filePath: `/vault/${i}.md` }));
    expect(shouldShowCorruptedBanner(files)).toBe(true);
  });
});

// ── REQ-009: buildCorruptedBannerMessage ─────────────────────────────────────

describe("REQ-009: buildCorruptedBannerMessage returns count-aware text", () => {
  test("count === 1 → 「1 件の破損ファイルがあります」", () => {
    const msg = buildCorruptedBannerMessage(1);
    expect(msg).toBe("1 件の破損ファイルがあります");
  });

  test("count === 2 → 「2 件の破損ファイルがあります」", () => {
    const msg = buildCorruptedBannerMessage(2);
    expect(msg).toBe("2 件の破損ファイルがあります");
  });

  test("count === 42 → 「42 件の破損ファイルがあります」", () => {
    const msg = buildCorruptedBannerMessage(42);
    expect(msg).toBe("42 件の破損ファイルがあります");
  });

  test("count === 0 → does not produce an error (though banner should not be shown)", () => {
    // buildCorruptedBannerMessage(0) should return a string (not throw)
    const msg = buildCorruptedBannerMessage(0);
    expect(typeof msg).toBe("string");
  });
});

// ── REQ-014: Banner style token constants ────────────────────────────────────

describe("REQ-014: CORRUPTED_BANNER_STYLES exports the correct DESIGN.md-compliant tokens", () => {
  // RED PHASE: This import MUST FAIL — module does not exist yet.
  // We also import style token constants to verify they match DESIGN.md values
  let CORRUPTED_BANNER_STYLES: {
    warnColor: string;
    borderRadius: string;
    fontSize: string;
    fontWeight: number;
    border: string;
  };

  test("warn color token is #dd5b00 (Orange, DESIGN.md §2 Semantic Accent Colors)", async () => {
    // This will fail because the module doesn't exist; that's the RED signal
    const mod = await import("$lib/ui/app-shell/corruptedBanner");
    CORRUPTED_BANNER_STYLES = mod.CORRUPTED_BANNER_STYLES;
    expect(CORRUPTED_BANNER_STYLES.warnColor).toBe("#dd5b00");
  });

  test("border-radius is 8px (Standard card radius, REQ-014)", async () => {
    const mod = await import("$lib/ui/app-shell/corruptedBanner");
    expect(mod.CORRUPTED_BANNER_STYLES.borderRadius).toBe("8px");
  });

  test("font-size is 16px and font-weight is 500 (Body Medium, DESIGN.md §3)", async () => {
    const mod = await import("$lib/ui/app-shell/corruptedBanner");
    expect(mod.CORRUPTED_BANNER_STYLES.fontSize).toBe("16px");
    expect(mod.CORRUPTED_BANNER_STYLES.fontWeight).toBe(500);
  });

  test("border is Whisper Border: 1px solid rgba(0,0,0,0.1)", async () => {
    const mod = await import("$lib/ui/app-shell/corruptedBanner");
    expect(mod.CORRUPTED_BANNER_STYLES.border).toBe("1px solid rgba(0,0,0,0.1)");
  });
});
