/**
 * blockPredicates.prop.test.ts — Tier 2 fast-check property tests
 *
 * Sprint 1 of ui-block-editor (Phase 2a Red).
 *
 * Coverage:
 *   PROP-BE-001 / REQ-BE-017 — bannerMessageFor totality (over all SaveError)
 *   PROP-BE-002 / REQ-BE-017 — bannerMessageFor purity
 *   PROP-BE-003 / REQ-BE-018 — splitOrInsert decision (offset === len ⇔ insert)
 *   PROP-BE-004 / REQ-BE-018 — splitOrInsert purity
 *   PROP-BE-005 / REQ-BE-019 — classifyMarkdownPrefix priority
 *   PROP-BE-007 / REQ-BE-019 — classifyMarkdownPrefix non-prefix safety (random strings)
 *   PROP-BE-008 / REQ-BE-019 — classifyMarkdownPrefix purity
 *   PROP-BE-009 / REQ-BE-020 — classifyBackspaceAtZero totality
 *   PROP-BE-010 / REQ-BE-020 — classifyBackspaceAtZero branch decision rule
 */

import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import type { SaveError } from '$lib/block-editor/types';
import {
  bannerMessageFor,
  splitOrInsert,
  classifyMarkdownPrefix,
  classifyBackspaceAtZero,
} from '$lib/block-editor/blockPredicates';

// ──────────────────────────────────────────────────────────────────────
// SaveError arbitrary
// ──────────────────────────────────────────────────────────────────────

const fsErrorArb = fc.oneof(
  fc.constant({ kind: 'permission' as const }),
  fc.constant({ kind: 'disk-full' as const }),
  fc.constant({ kind: 'lock' as const }),
  fc.constant({ kind: 'not-found' as const }),
  fc.constant({ kind: 'unknown' as const }),
);

const validationErrorArb = fc.oneof(
  fc.constant({ kind: 'empty-body-on-idle' as const }),
  fc.constant({ kind: 'invariant-violated' as const }),
);

const saveErrorArb: fc.Arbitrary<SaveError> = fc.oneof(
  fsErrorArb.map((reason) => ({ kind: 'fs' as const, reason })),
  validationErrorArb.map((reason) => ({ kind: 'validation' as const, reason })),
);

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-001 / REQ-BE-017: totality
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-001 / REQ-BE-017: bannerMessageFor totality', () => {
  test('over all SaveError, returns string|null and never throws', () => {
    fc.assert(
      fc.property(saveErrorArb, (err) => {
        const result = bannerMessageFor(err);
        // fs.* → non-empty string; validation.* → null
        if (err.kind === 'fs') {
          if (typeof result !== 'string') return false;
          if (result.length === 0) return false;
          return true;
        }
        return result === null;
      }),
      { numRuns: 200 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-002 / REQ-BE-017: purity
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-002 / REQ-BE-017: bannerMessageFor purity', () => {
  test('same input → same output (==)', () => {
    fc.assert(
      fc.property(saveErrorArb, (err) => {
        return bannerMessageFor(err) === bannerMessageFor(err);
      }),
      { numRuns: 200 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-003 / REQ-BE-018: splitOrInsert decision
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-003 / REQ-BE-018: splitOrInsert decision rule', () => {
  test('offset === contentLength ⇔ insert; otherwise split', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (offset, len) => {
          const result = splitOrInsert(offset, len);
          if (offset === len) {
            return result === 'insert';
          }
          return result === 'split';
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-004 / REQ-BE-018: purity
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-004 / REQ-BE-018: splitOrInsert purity', () => {
  test('same input → same output', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (offset, len) => splitOrInsert(offset, len) === splitOrInsert(offset, len),
      ),
      { numRuns: 200 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-005 / REQ-BE-019: priority
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-005 / REQ-BE-019: classifyMarkdownPrefix priority order', () => {
  test('"### x" returns heading-3 (not heading-2 or heading-1)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 30 }), (suffix) => {
        const result = classifyMarkdownPrefix('### ' + suffix);
        if (result === null) return false;
        return result.newType === 'heading-3' && result.trimmedContent === suffix;
      }),
      { numRuns: 100 },
    );
  });

  test('"## x" returns heading-2 (not heading-1)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 30 }), (suffix) => {
        const result = classifyMarkdownPrefix('## ' + suffix);
        if (result === null) return false;
        return result.newType === 'heading-2' && result.trimmedContent === suffix;
      }),
      { numRuns: 100 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-007 / REQ-BE-019: non-prefix safety
// ──────────────────────────────────────────────────────────────────────

const KNOWN_PREFIXES = ['### ', '## ', '# ', '- ', '* ', '1. ', '```', '> '];

function startsWithKnownPrefix(s: string): boolean {
  return KNOWN_PREFIXES.some((p) => s.startsWith(p));
}

describe('PROP-BE-007 / REQ-BE-019: classifyMarkdownPrefix — non-prefix safety', () => {
  test('strings not starting with known prefix and not equal to "---" return null', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 30 }), (s) => {
        if (s === '---') return true; // skip — divider exact match
        if (startsWithKnownPrefix(s)) return true; // skip — known prefix
        return classifyMarkdownPrefix(s) === null;
      }),
      { numRuns: 300 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-008 / REQ-BE-019: purity
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-008 / REQ-BE-019: classifyMarkdownPrefix purity', () => {
  test('same input → deep-equal output', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 30 }), (s) => {
        const a = classifyMarkdownPrefix(s);
        const b = classifyMarkdownPrefix(s);
        if (a === null && b === null) return true;
        if (a === null || b === null) return false;
        return a.newType === b.newType && a.trimmedContent === b.trimmedContent;
      }),
      { numRuns: 200 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-009 / REQ-BE-020: totality
// ──────────────────────────────────────────────────────────────────────

const VALID_RESULTS = ['merge', 'remove-empty-noop', 'first-block-noop', 'normal-edit'] as const;

describe('PROP-BE-009 / REQ-BE-020: classifyBackspaceAtZero totality', () => {
  test('always returns one of 4 valid results', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (idx, count) => {
          const result = classifyBackspaceAtZero(idx, count);
          return (VALID_RESULTS as readonly string[]).includes(result);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-010 / REQ-BE-020: branches
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-010 / REQ-BE-020: classifyBackspaceAtZero branch decision', () => {
  test('focusedIndex === 0 ⇒ first-block-noop', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (count) => {
        return classifyBackspaceAtZero(0, count) === 'first-block-noop';
      }),
      { numRuns: 200 },
    );
  });

  test('0 < focusedIndex < blockCount ⇒ merge', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 2, max: 100 }))
          .filter(([idx, count]) => idx > 0 && idx < count),
        ([idx, count]) => {
          return classifyBackspaceAtZero(idx, count) === 'merge';
        },
      ),
      { numRuns: 200 },
    );
  });

  test('focusedIndex >= blockCount ⇒ normal-edit', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 100 }))
          .filter(([idx, count]) => idx >= count),
        ([idx, count]) => {
          return classifyBackspaceAtZero(idx, count) === 'normal-edit';
        },
      ),
      { numRuns: 200 },
    );
  });
});
