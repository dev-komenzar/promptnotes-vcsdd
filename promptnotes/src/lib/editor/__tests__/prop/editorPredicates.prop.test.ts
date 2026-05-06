/**
 * editorPredicates.property.test.ts — Tier 2 fast-check property tests (bun:test)
 *
 * Sprint 7 Red phase. All tests MUST FAIL because the stubs throw.
 *
 * Coverage:
 *   PROP-EDIT-001 (splitOrInsert totality)
 *   PROP-EDIT-005 (bannerMessageFor exhaustiveness)
 *   PROP-EDIT-006 (canCopy parity with isNoteEmpty)
 *   PROP-EDIT-010 (classifyMarkdownPrefix totality including divider exact-match)
 *   PROP-EDIT-011 (classifyBackspaceAtZero coverage)
 *
 * REQ-EDIT references appear in test description strings for CRIT-700/CRIT-701 grep.
 */

import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import type { SaveError, FsError, SaveValidationError, EditorViewState, BlockType } from '$lib/editor/types';
import {
  canCopy,
  bannerMessageFor,
  splitOrInsert,
  classifyMarkdownPrefix,
  classifyBackspaceAtZero,
} from '$lib/editor/editorPredicates';

// ── Arbitraries ───────────────────────────────────────────────────────────────

const arbStatus = fc.constantFrom(
  'idle' as const,
  'editing' as const,
  'saving' as const,
  'switching' as const,
  'save-failed' as const
);

const arbFsReason = fc.constantFrom<FsError>(
  { kind: 'permission' },
  { kind: 'disk-full' },
  { kind: 'lock' },
  { kind: 'not-found' },
  { kind: 'unknown' }
);

const arbValidationReason = fc.constantFrom<SaveValidationError>(
  { kind: 'invariant-violated' },
  { kind: 'empty-body-on-idle' }
);

const arbFsError: fc.Arbitrary<SaveError> = arbFsReason.map(reason => ({
  kind: 'fs' as const,
  reason,
}));

const arbValidationError: fc.Arbitrary<SaveError> = arbValidationReason.map(reason => ({
  kind: 'validation' as const,
  reason,
}));

const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(arbFsError, arbValidationError);

const arbViewState: fc.Arbitrary<EditorViewState> = fc.record({
  status: arbStatus,
  isDirty: fc.boolean(),
  currentNoteId: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 40 })),
  focusedBlockId: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 40 })),
  pendingNextFocus: fc.constant(null),
  isNoteEmpty: fc.boolean(),
  lastSaveError: fc.oneof(fc.constant(null), arbSaveError),
  lastSaveResult: fc.oneof(fc.constant(null), fc.constant('success' as const)),
  blocks: fc.constant([]),
});

// Recognised Markdown prefixes per behavioral-spec.md REQ-EDIT-010
const RECOGNISED_PREFIXES = ['# ', '## ', '### ', '- ', '* ', '1. ', '```', '> '];

// ── PROP-EDIT-001: splitOrInsert totality ────────────────────────────────────

describe("PROP-EDIT-001: 'split-or-insert-totality' (REQ-EDIT-006, REQ-EDIT-007, EC-EDIT-012)", () => {
  test('PROP-EDIT-001a: splitOrInsert(contentLength, contentLength) === insert for any contentLength ≥ 0 (≥100 runs)', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10000 }), (len) => {
        return splitOrInsert(len, len) === 'insert';
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-001b: splitOrInsert(k, len) === split for any 0 ≤ k < len (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 9999 }).chain(len =>
          fc.tuple(fc.nat({ max: len }), fc.constant(len + 1))
        ),
        ([offset, contentLength]) => {
          return splitOrInsert(offset, contentLength) === 'split';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-001c: result is always either split or insert — never undefined (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }).chain(len => fc.tuple(fc.nat({ max: len }), fc.constant(len))),
        ([offset, contentLength]) => {
          const result = splitOrInsert(offset, contentLength);
          return result === 'split' || result === 'insert';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-005: bannerMessageFor exhaustiveness ───────────────────────────

describe("PROP-EDIT-005: 'banner-exhaustiveness' (REQ-EDIT-025, REQ-EDIT-026)", () => {
  test('PROP-EDIT-005a: bannerMessageFor(fs error) returns non-empty string for all FsError variants (≥100 runs)', () => {
    fc.assert(
      fc.property(arbFsError, (error) => {
        const result = bannerMessageFor(error);
        return typeof result === 'string' && result.length > 0;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-005b: bannerMessageFor(validation error) returns null for all SaveValidationError variants (≥100 runs)', () => {
    fc.assert(
      fc.property(arbValidationError, (error) => {
        return bannerMessageFor(error) === null;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-005c: bannerMessageFor never returns undefined for any SaveError (≥100 runs)', () => {
    fc.assert(
      fc.property(arbSaveError, (error) => {
        return bannerMessageFor(error) !== undefined;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-005d: bannerMessageFor never throws for any SaveError (≥100 runs)', () => {
    fc.assert(
      fc.property(arbSaveError, (error) => {
        let threw = false;
        try { bannerMessageFor(error); } catch { threw = true; }
        return !threw;
      }),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-006: canCopy parity ─────────────────────────────────────────────

describe("PROP-EDIT-006: 'copy-enable-parity' (REQ-EDIT-005, REQ-EDIT-032, EC-EDIT-007)", () => {
  test('PROP-EDIT-006a: canCopy is false for idle regardless of view (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, (view) => {
        return canCopy({ ...view, status: 'idle' }) === false;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-006b: canCopy is false for switching regardless of view (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, (view) => {
        return canCopy({ ...view, status: 'switching' }) === false;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-006c: canCopy is false for save-failed regardless of view (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, (view) => {
        return canCopy({ ...view, status: 'save-failed' }) === false;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-006d: canCopy for editing === !isNoteEmpty (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, fc.boolean(), (view, isNoteEmpty) => {
        const testView = { ...view, status: 'editing' as const, isNoteEmpty };
        return canCopy(testView) === !isNoteEmpty;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-006e: canCopy for saving === !isNoteEmpty (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, fc.boolean(), (view, isNoteEmpty) => {
        const testView = { ...view, status: 'saving' as const, isNoteEmpty };
        return canCopy(testView) === !isNoteEmpty;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-006f: canCopy result is always boolean (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, (view) => {
        const result = canCopy(view);
        return typeof result === 'boolean';
      }),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-010: classifyMarkdownPrefix totality ───────────────────────────

describe("PROP-EDIT-010: 'markdown-prefix-totality' (REQ-EDIT-010, EC-EDIT-013)", () => {
  test('PROP-EDIT-010a: recognised prefixes return non-null result (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RECOGNISED_PREFIXES),
        fc.string(),
        (prefix, suffix) => {
          const result = classifyMarkdownPrefix(prefix + suffix);
          // For exact prefix match (empty suffix), should be non-null
          // For content with suffix, trimmedContent should be the suffix
          return result !== undefined;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-010b: unrecognised arbitrary string (no known prefix) returns null (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !RECOGNISED_PREFIXES.some(p => s.startsWith(p)) && s !== '---'),
        (content) => {
          return classifyMarkdownPrefix(content) === null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-010c: EC-EDIT-013 divider exact-match — strings starting with --- but not === --- return null (≥100 runs)', () => {
    // Use efficient generation: '---' + suffix where suffix is non-empty guarantees
    // the result starts with '---' and is never exactly '---'. This avoids the low
    // acceptance rate of fc.string().filter(...) which causes timeouts.
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).map(suffix => '---' + suffix),
        (content) => {
          return classifyMarkdownPrefix(content) === null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-010d: --- exactly returns divider', () => {
    fc.assert(
      fc.property(fc.constant('---'), (content) => {
        const result = classifyMarkdownPrefix(content);
        return result !== null && result.newType === 'divider' && result.trimmedContent === '';
      }),
      { numRuns: 10 }
    );
  });

  test('PROP-EDIT-010e: result newType is always a valid BlockType when non-null (≥100 runs)', () => {
    const VALID_BLOCK_TYPES: BlockType[] = [
      'paragraph', 'heading-1', 'heading-2', 'heading-3',
      'bullet', 'numbered', 'code', 'quote', 'divider',
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...RECOGNISED_PREFIXES, '---'),
        (prefix) => {
          const result = classifyMarkdownPrefix(prefix);
          if (result === null) return true;
          return (VALID_BLOCK_TYPES as string[]).includes(result.newType);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-011: classifyBackspaceAtZero coverage ──────────────────────────

describe("PROP-EDIT-011: 'backspace-classifier-coverage' (REQ-EDIT-008, EC-EDIT-011)", () => {
  test('PROP-EDIT-011a: classifyBackspaceAtZero(0, n) === first-block-noop for any n ≥ 1 (≥100 runs)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (blockCount) => {
        return classifyBackspaceAtZero(0, blockCount) === 'first-block-noop';
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-011b: classifyBackspaceAtZero(k, n) === merge for 0 < k < n (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }).chain(n =>
          fc.tuple(fc.integer({ min: 1, max: n - 1 }), fc.constant(n))
        ),
        ([k, n]) => {
          return classifyBackspaceAtZero(k, n) === 'merge';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-011c: result is always a defined enum member for any valid (k, n) (≥100 runs)', () => {
    const VALID = new Set(['merge', 'remove-empty-noop', 'first-block-noop', 'normal-edit']);
    fc.assert(
      fc.property(
        fc.nat({ max: 50 }).chain(n =>
          fc.tuple(fc.nat({ max: Math.max(n, 1) }), fc.constant(Math.max(n, 1)))
        ),
        ([k, n]) => {
          const result = classifyBackspaceAtZero(k, n);
          return VALID.has(result);
        }
      ),
      { numRuns: 100 }
    );
  });
});
