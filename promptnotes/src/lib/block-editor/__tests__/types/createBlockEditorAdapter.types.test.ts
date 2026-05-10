/**
 * createBlockEditorAdapter.types.test.ts — Sprint 5 PROP-FEED-S5-016
 *
 * Tier 0 type-level assertion: createBlockEditorAdapter() return type is
 * assignable to BlockEditorAdapter.
 *
 * RED PHASE: createBlockEditorAdapter does not exist; the import will fail at
 * tsc --noEmit. The runtime test stub below also throws because the module
 * cannot be resolved.
 */

import { describe, test, expect } from 'bun:test';
import type { BlockEditorAdapter } from '$lib/block-editor/types';

describe('PROP-FEED-S5-016: createBlockEditorAdapter return type is assignable to BlockEditorAdapter', () => {
  test('type-level assertion (validated by tsc --noEmit during Phase 5 gate; runtime here just confirms module exists)', async () => {
    const module = (await import('$lib/block-editor/createBlockEditorAdapter')) as {
      createBlockEditorAdapter: () => BlockEditorAdapter;
    };
    const adapter: BlockEditorAdapter = module.createBlockEditorAdapter();
    // Spot-check: the adapter has all 16 methods (functions).
    const methods: (keyof BlockEditorAdapter)[] = [
      'dispatchFocusBlock',
      'dispatchEditBlockContent',
      'dispatchInsertBlockAfter',
      'dispatchInsertBlockAtBeginning',
      'dispatchRemoveBlock',
      'dispatchMergeBlocks',
      'dispatchSplitBlock',
      'dispatchChangeBlockType',
      'dispatchMoveBlock',
      'dispatchTriggerIdleSave',
      'dispatchTriggerBlurSave',
      'dispatchRetrySave',
      'dispatchDiscardCurrentSession',
      'dispatchCancelSwitch',
      'dispatchCopyNoteBody',
      'dispatchRequestNewNote',
    ];
    for (const m of methods) {
      expect(typeof adapter[m]).toBe('function');
    }
  });
});
