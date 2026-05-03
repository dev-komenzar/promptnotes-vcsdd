/**
 * design-tokens.audit.test.ts — REQ-010..REQ-015, REQ-017, REQ-019, PROP-006
 *
 * REQ-010: グローバルレイアウトフレーム — ヘッダー
 *   - 背景色: Pure White (#ffffff)
 *   - ボーダー下辺: Whisper Border (1px solid rgba(0,0,0,0.1))
 *   - フォント: 15px weight 600
 *   - テキスト色: Near-Black (rgba(0,0,0,0.95))
 *
 * REQ-011: グローバルレイアウトフレーム — メインエリア
 *   - <main> element, spacing from DESIGN.md §5 scale only
 *   - Allowed spacing: [2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32] px
 *
 * REQ-012: 空フィードスケルトン
 *   - skeleton bg: #f6f5f4 / #ffffff pulse
 *   - border-radius: 12px
 *   - aria-hidden="true"
 *
 * REQ-013: カードシャドウ — 4-layer stack
 * REQ-014: 破損ファイルバナースタイル
 * REQ-015: タイポグラフィ — 4-weight system (400, 500, 600, 700 only)
 * REQ-017: モーダル Deep Shadow — 5-layer stack
 * REQ-019: カラートークン規約 — hex/rgba 許可リスト
 *
 * PROP-006: 全可視カラー・スペーシングトークンが DESIGN.md §10 Token Reference 由来
 *   Tier 3: static analysis audit over source files
 *   Scope: *.svelte <style> blocks, inline style={}, *.ts hex/rgba literals
 *
 * RED PHASE: Source files do not exist yet. The audit itself will fail because
 *   (a) the import of token constants fails (module missing)
 *   (b) the file-scan finds the source dir absent and throws
 * Both are valid RED signals.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// RED PHASE: This import MUST FAIL — module does not exist yet.
import {
  DESIGN_TOKENS,
  CARD_SHADOW,
  DEEP_SHADOW,
  SPACING_SCALE,
  ALLOWED_FONT_WEIGHTS,
} from "$lib/ui/app-shell/designTokens";

// ── DESIGN.md Token Reference (normative source for PROP-006) ────────────────

const ALLOWED_HEX_COLORS = new Set([
  "#ffffff", "#000000f2", "#0075de", "#213183", "#005bab", "#f6f5f4", "#31302e",
  "#615d59", "#a39e98", "#2a9d99", "#1aae39", "#dd5b00", "#ff64c8", "#391c57",
  "#523410", "#097fe8", "#62aef0", "#f2f9ff", "#dddddd",
]);

const ALLOWED_RGBA_ALPHAS = new Set([
  0.95, 0.9, 0.1, 0.05, 0.5, 0.04, 0.027, 0.02, 0.01,
]);

const ALLOWED_SPACING_PX = new Set([
  2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32,
]);

const ALLOWED_FONT_WEIGHTS_SET = new Set([400, 500, 600, 700]);

// ── PROP-006: designTokens module exports correct values ─────────────────────

describe("PROP-006: DESIGN_TOKENS module exports correct token values", () => {
  test("DESIGN_TOKENS.pureWhite === '#ffffff'", () => {
    expect(DESIGN_TOKENS.pureWhite).toBe("#ffffff");
  });

  test("DESIGN_TOKENS.warmWhite === '#f6f5f4'", () => {
    expect(DESIGN_TOKENS.warmWhite).toBe("#f6f5f4");
  });

  test("DESIGN_TOKENS.whisperBorder === '1px solid rgba(0,0,0,0.1)'", () => {
    expect(DESIGN_TOKENS.whisperBorder).toBe("1px solid rgba(0,0,0,0.1)");
  });

  test("DESIGN_TOKENS.nearBlack === 'rgba(0,0,0,0.95)'", () => {
    expect(DESIGN_TOKENS.nearBlack).toBe("rgba(0,0,0,0.95)");
  });

  test("DESIGN_TOKENS.warnColor === '#dd5b00'", () => {
    expect(DESIGN_TOKENS.warnColor).toBe("#dd5b00");
  });

  test("DESIGN_TOKENS.modalScrim === 'rgba(0,0,0,0.5)'", () => {
    expect(DESIGN_TOKENS.modalScrim).toBe("rgba(0,0,0,0.5)");
  });
});

// ── REQ-013: CARD_SHADOW 4-layer stack ───────────────────────────────────────

describe("REQ-013: CARD_SHADOW matches DESIGN.md §2 4-layer stack exactly", () => {
  const expectedCardShadow = [
    "rgba(0,0,0,0.04) 0px 4px 18px",
    "rgba(0,0,0,0.027) 0px 2.025px 7.84688px",
    "rgba(0,0,0,0.02) 0px 0.8px 2.925px",
    "rgba(0,0,0,0.01) 0px 0.175px 1.04062px",
  ].join(", ");

  test("CARD_SHADOW is a string matching the exact 4-layer definition", () => {
    expect(CARD_SHADOW).toBe(expectedCardShadow);
  });

  test("CARD_SHADOW has no layer with opacity > 0.04 (REQ-013 AC)", () => {
    // Extract alpha values from rgba(...) patterns
    const rgbaPattern = /rgba\(0,0,0,([\d.]+)\)/g;
    let match;
    while ((match = rgbaPattern.exec(CARD_SHADOW)) !== null) {
      const alpha = parseFloat(match[1]);
      expect(alpha).toBeLessThanOrEqual(0.04);
    }
  });
});

// ── REQ-017: DEEP_SHADOW 5-layer stack ───────────────────────────────────────

describe("REQ-017: DEEP_SHADOW matches DESIGN.md §2 5-layer stack exactly", () => {
  const expectedDeepShadow = [
    "rgba(0,0,0,0.01) 0px 1px 3px",
    "rgba(0,0,0,0.02) 0px 3px 7px",
    "rgba(0,0,0,0.02) 0px 7px 15px",
    "rgba(0,0,0,0.04) 0px 14px 28px",
    "rgba(0,0,0,0.05) 0px 23px 52px",
  ].join(", ");

  test("DEEP_SHADOW is a string matching the exact 5-layer definition", () => {
    expect(DEEP_SHADOW).toBe(expectedDeepShadow);
  });
});

// ── REQ-011: SPACING_SCALE ────────────────────────────────────────────────────

describe("REQ-011: SPACING_SCALE matches DESIGN.md §5 allowed values", () => {
  const expectedSpacingScale = [2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32];

  test("SPACING_SCALE array contains exactly the 15 DESIGN.md §5 values", () => {
    expect(SPACING_SCALE).toEqual(expectedSpacingScale);
  });

  test("SPACING_SCALE does NOT include 48, 64, 80, or 120 (NFR-07 exclusion)", () => {
    expect(SPACING_SCALE).not.toContain(48);
    expect(SPACING_SCALE).not.toContain(64);
    expect(SPACING_SCALE).not.toContain(80);
    expect(SPACING_SCALE).not.toContain(120);
  });
});

// ── REQ-015: ALLOWED_FONT_WEIGHTS ────────────────────────────────────────────

describe("REQ-015: ALLOWED_FONT_WEIGHTS is [400, 500, 600, 700] only", () => {
  test("ALLOWED_FONT_WEIGHTS contains exactly 4 values: 400, 500, 600, 700", () => {
    expect(ALLOWED_FONT_WEIGHTS).toEqual([400, 500, 600, 700]);
  });
});

// ── PROP-006: Source file static analysis ────────────────────────────────────

describe("PROP-006: Static analysis — no disallowed hex/rgba/px values in source files", () => {
  const UI_APP_SHELL_SRC = path.resolve(process.cwd(), "src/lib/ui/app-shell");
  const TESTS_DIR = path.resolve(UI_APP_SHELL_SRC, "__tests__");
  const ASSETS_DIR = path.resolve(UI_APP_SHELL_SRC, "assets");

  function collectSourceFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
      throw new Error(
        `PROP-006 audit: source directory ${dir} does not exist yet. ` +
        "This is the expected RED state — create the production modules to proceed."
      );
    }
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (fullPath.startsWith(TESTS_DIR) || fullPath.startsWith(ASSETS_DIR)) continue;
        files.push(...collectSourceFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith(".svelte") || entry.name.endsWith(".ts"))) {
        files.push(fullPath);
      }
    }
    return files;
  }

  test("PROP-006: all hex literals in source files are in the allowed list", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC);
    const hexPattern = /#([0-9a-fA-F]{3,8})\b/g;
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      let match;
      while ((match = hexPattern.exec(content)) !== null) {
        const hex = `#${match[1]}`.toLowerCase();
        if (!ALLOWED_HEX_COLORS.has(hex)) {
          violations.push(`${filePath}: disallowed hex color ${hex}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("PROP-006: all rgba(0,0,0,X) alpha values are in the allowed list", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC);
    const rgbaPattern = /rgba\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)/g;
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      let match;
      while ((match = rgbaPattern.exec(content)) !== null) {
        const alpha = parseFloat(match[1]);
        if (!ALLOWED_RGBA_ALPHAS.has(alpha)) {
          violations.push(`${filePath}: disallowed rgba alpha ${alpha}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("PROP-006 / REQ-015: no disallowed font-weight values in source files", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC);
    const fontWeightPattern = /font-weight\s*:\s*(\d+)/g;
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      let match;
      while ((match = fontWeightPattern.exec(content)) !== null) {
        const weight = parseInt(match[1], 10);
        if (!ALLOWED_FONT_WEIGHTS_SET.has(weight)) {
          violations.push(`${filePath}: disallowed font-weight ${weight}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("PROP-006 / REQ-011: no disallowed px spacing values in source files", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC);
    // Only check explicit px values in style contexts (padding, margin, gap, etc.)
    const spacingPattern = /(?:padding|margin|gap|top|left|right|bottom|width|height)\s*:\s*[\d.]+px/g;
    const pxValuePattern = /([\d.]+)px/;
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      let match;
      while ((match = spacingPattern.exec(content)) !== null) {
        const pxMatch = pxValuePattern.exec(match[0]);
        if (pxMatch) {
          const px = parseFloat(pxMatch[1]);
          if (!ALLOWED_SPACING_PX.has(px)) {
            violations.push(`${filePath}: disallowed spacing ${px}px in "${match[0]}"`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ── REQ-019: Specific token constant tests ───────────────────────────────────

describe("REQ-019: DESIGN.md §10 Token Reference — all required tokens are present in designTokens module", () => {
  test("Pure White token #ffffff exists", () => {
    expect(DESIGN_TOKENS.pureWhite).toBe("#ffffff");
  });

  test("Warm White token #f6f5f4 exists", () => {
    expect(DESIGN_TOKENS.warmWhite).toBe("#f6f5f4");
  });

  test("Orange (warn) token #dd5b00 exists", () => {
    expect(DESIGN_TOKENS.warnColor).toBe("#dd5b00");
  });

  test("Whisper Border rgba(0,0,0,0.1) exists", () => {
    expect(DESIGN_TOKENS.whisperBorder).toContain("rgba(0,0,0,0.1)");
  });

  test("Near-Black rgba(0,0,0,0.95) exists", () => {
    expect(DESIGN_TOKENS.nearBlack).toBe("rgba(0,0,0,0.95)");
  });

  test("Modal scrim rgba(0,0,0,0.5) exists", () => {
    expect(DESIGN_TOKENS.modalScrim).toBe("rgba(0,0,0,0.5)");
  });

  test("Card radius 12px (Standard) exported", () => {
    expect(DESIGN_TOKENS.cardRadius).toBe("12px");
  });

  test("Large radius 16px (Modal) exported", () => {
    expect(DESIGN_TOKENS.largeRadius).toBe("16px");
  });
});
