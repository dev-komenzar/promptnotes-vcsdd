/**
 * feedRowEditMode.prop.test.ts — Property tests for feed-row inline body editor pure functions.
 *
 * Phase 2a (RED phase):
 *   PROP-009: Frontend control-character pre-filter (validate_no_control_chars)
 *
 * These tests import from a module that does NOT exist yet.
 * Expected outcome: ALL tests FAIL (module resolution error at runtime,
 * or compilation error at type-check time).
 *
 * REQ coverage: REQ-003
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';

// RED PHASE: This import will FAIL because the module does not exist yet.
// When Phase 2b creates $lib/feed/feedRowEditMode.ts, this import resolves.
import { validate_no_control_chars } from '$lib/feed/feedRowEditMode';

// ── Helper: disallowed control characters (U+0000–U+001F except U+0009, + U+007F) ──

/** Code points that must be rejected by validate_no_control_chars. */
const DISALLOWED_CONTROL_CHARS: readonly number[] = [
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  // 0x09 (TAB) is ALLOWED
  0x0a, // ... wait, 0x0A is LF — ALLOWED per spec
  0x0b, 0x0c,
  // 0x0D is CR — ALLOWED per spec
  0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
  0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
  0x7f, // DELETE
];

// Corrected: U+000A (LF) and U+000D (CR) are ALLOWED per spec REQ-003.
const DISALLOWED_FILTERED = DISALLOWED_CONTROL_CHARS.filter(
  (c) => c !== 0x0a && c !== 0x0d
);

/** Code points that MUST be accepted: TAB, LF, CR */
const ALLOWED_CONTROL_CHARS = [0x09, 0x0a, 0x0d];

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** Generates strings that contain NO disallowed control characters. */
const arbCleanString = fc.string({
  minLength: 0,
  maxLength: 200,
  // Exclude characters that would make the test non-deterministic
});

/** Generates a clean string with exactly one disallowed control char injected. */
const arbDirtyString = fc
  .tuple(
    fc.string({ minLength: 0, maxLength: 100 }),
    fc.constantFrom(...DISALLOWED_FILTERED.map((c) => String.fromCodePoint(c))),
    fc.string({ minLength: 0, maxLength: 100 }),
  )
  .map(([prefix, badChar, suffix]) => prefix + badChar + suffix);

// ── PROP-009: validate_no_control_chars correctness ───────────────────────────

describe('PROP-009: validate_no_control_chars — frontend control-char pre-filter', () => {
  test('valid clean strings pass validation (example)', () => {
    // Verify the function exists (will fail because module doesn't exist).
    const result = validate_no_control_chars('hello world');
    expect(result.ok).toBe(true);
  });

  test('valid strings with emoji pass validation (example)', () => {
    const result = validate_no_control_chars('🌍 hello こんにちは 🎉');
    expect(result.ok).toBe(true);
  });

  test('valid strings with tab pass validation (example)', () => {
    const result = validate_no_control_chars('col1\tcol2\tcol3');
    expect(result.ok).toBe(true);
  });

  test('valid strings with newline and CR pass validation (example)', () => {
    const result = validate_no_control_chars('line1\nline2\r\nline3');
    expect(result.ok).toBe(true);
  });

  test('empty string passes validation', () => {
    const result = validate_no_control_chars('');
    expect(result.ok).toBe(true);
  });

  test('whitespace-only string passes validation', () => {
    const result = validate_no_control_chars('  \n\t  \r\n');
    expect(result.ok).toBe(true);
  });

  test('null byte (U+0000) is rejected (example)', () => {
    const body = 'text before\0text after';
    const result = validate_no_control_chars(body);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('DELETE (U+007F) is rejected (example)', () => {
    const body = 'text\x7F';
    const result = validate_no_control_chars(body);
    expect(result.ok).toBe(false);
  });

  test('various control characters are rejected (example)', () => {
    const badBodies = [
      'text\x01suffix',   // SOH
      'text\x1bsuffix',   // ESC
      'text\x00suffix',   // NULL
      'text\x1fsuffix',   // US
    ];
    for (const body of badBodies) {
      const result = validate_no_control_chars(body);
      expect(result.ok).toBe(false);
    }
  });

  // ── fast-check property: clean strings always pass ──────────────────────

  test('fast-check: all clean strings pass validation (≥1000 runs)', () => {
    fc.assert(
      fc.property(arbCleanString, (s) => {
        const result = validate_no_control_chars(s);
        if (!result.ok) {
          return false;
        }
        return true;
      }),
      { numRuns: 1000 },
    );
  });

  // ── fast-check property: dirty strings always fail ──────────────────────

  test('fast-check: any string with a disallowed control char is rejected (≥500 runs)', () => {
    fc.assert(
      fc.property(arbDirtyString, (s) => {
        const result = validate_no_control_chars(s);
        if (result.ok) {
          // Allowed when it shouldn't be → property violation
          return false;
        }
        return true;
      }),
      { numRuns: 500 },
    );
  });

  // ── fast-check property: tab/newline/CR are always accepted ─────────────

  test('fast-check: strings composed of only tab, LF, CR pass (≥200 runs)', () => {
    const arbAllowedOnly = fc.stringOf(
      fc.constantFrom('\t', '\n', '\r'),
      { minLength: 0, maxLength: 50 },
    );
    fc.assert(
      fc.property(arbAllowedOnly, (s) => {
        const result = validate_no_control_chars(s);
        return result.ok === true;
      }),
      { numRuns: 200 },
    );
  });

  test('fast-check: strings with interspersed tabs, LF, CR pass (≥500 runs)', () => {
    // Generate strings from the full character set but force-inject allowed control chars
    const arbWithAllowed = fc
      .tuple(
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.constantFrom('\t', '\n', '\r'),
        fc.string({ minLength: 0, maxLength: 100 }),
      )
      .map(([prefix, allowed, suffix]) => prefix + allowed + suffix);

    fc.assert(
      fc.property(arbWithAllowed, (s) => {
        // If the string contains no disallowed chars, it must pass
        const hasDisallowed = DISALLOWED_FILTERED.some(
          (c) => s.includes(String.fromCodePoint(c)),
        );
        const result = validate_no_control_chars(s);
        if (hasDisallowed) {
          return result.ok === false;
        }
        return result.ok === true;
      }),
      { numRuns: 500 },
    );
  });

  // ── Edge cases from spec ────────────────────────────────────────────────

  test('pasted text with embedded null byte is rejected', () => {
    // Simulating paste of text containing U+0000
    const pasted = 'visible text\x00hidden text';
    const result = validate_no_control_chars(pasted);
    expect(result.ok).toBe(false);
  });

  test('large valid body passes validation', () => {
    // PROP-009: Large bodies (representative of 1MB) pass if clean.
    const largePattern = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n';
    const largeBody = largePattern.repeat(1000); // ~37KB, representative
    const result = validate_no_control_chars(largeBody);
    expect(result.ok).toBe(true);
  });

  test('body with only allowed chars passes validation', () => {
    // All printable ASCII (0x20-0x7E) plus tab, LF, CR
    const body = 'Hello, World! 123 ~`!@#$%^&*()_+-=[]{}|;:\'",.<>?/\n\t\r\n';
    const result = validate_no_control_chars(body);
    expect(result.ok).toBe(true);
  });
});
