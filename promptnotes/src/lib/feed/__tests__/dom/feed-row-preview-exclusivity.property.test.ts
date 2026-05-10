/**
 * feed-row-preview-exclusivity.property.test.ts — Sprint 6 fast-check property
 *
 * Coverage:
 *   PROP-FEED-S6-002 — Non-coexistence + non-emptiness property test.
 *
 *   For any combination of:
 *     editingStatus ∈ {idle, editing, saving, switching, save-failed}
 *     × editingNoteId ∈ {self.noteId, 'other-note-id', null}
 *     × editingSessionState (5-arm DTO + null)
 *     × serverBlocksLength ∈ {0..5}
 *     × blockEditorAdapter ∈ {mockAdapter, null}
 *
 *   Stratified across 5 cells (cell1 / ec024 / cell2 / cell3 / cell4):
 *
 *   (a) NON-COEXISTENCE: [data-testid="row-body-preview"] and
 *       [data-testid="block-element"] are never BOTH present simultaneously.
 *       (rbpExists && blockElExists) === false
 *
 *   (b) NON-EMPTINESS: at least one of the two is present — no blank row.
 *       (rbpExists || blockElExists) === true
 *
 * Synchronization: flushSync() called before DOM observation to ensure
 * REQ-FEED-031 fallback $effect has completed (FIND-S6-SPEC-iter2-003).
 *
 * Stratification: 5 cells × ≥50 cases = 250 numRuns, seed 0x56BABE
 * (FIND-S6-SPEC-iter2-004 / FIND-S6-SPEC-iter3-004).
 *
 * RED phase invariant:
 *   Sprint 5 baseline mounts .row-button (containing row-body-preview)
 *   unconditionally.  In cell 1 (effectiveMount=true), block-element is ALSO
 *   mounted.  Therefore rbpExists && blockElExists === true — the non-coexistence
 *   assertion FAILS.  fast-check MUST find counter-examples in cell 1.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import * as fc from 'fast-check';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import FeedRow from '../../FeedRow.svelte';
import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';
import type { FeedViewState } from '../../types.js';
import type { BlockEditorAdapter, DtoBlock } from '$lib/block-editor/types';

// ── Mock factories ─────────────────────────────────────────────────────────────

const SELF_NOTE_ID = 'note-prop-001';

function makeFeedAdapter(): TauriFeedAdapter {
  return {
    dispatchSelectPastNote: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchConfirmNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchCancelNoteDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBlockAdapter(): BlockEditorAdapter & Record<string, ReturnType<typeof vi.fn>> {
  const noop = () => vi.fn().mockResolvedValue(undefined);
  return {
    dispatchFocusBlock: noop(),
    dispatchEditBlockContent: noop(),
    dispatchInsertBlockAfter: noop(),
    dispatchInsertBlockAtBeginning: noop(),
    dispatchRemoveBlock: noop(),
    dispatchMergeBlocks: noop(),
    dispatchSplitBlock: noop(),
    dispatchChangeBlockType: noop(),
    dispatchMoveBlock: noop(),
    dispatchTriggerIdleSave: noop(),
    dispatchTriggerBlurSave: noop(),
    dispatchRetrySave: noop(),
    dispatchDiscardCurrentSession: noop(),
    dispatchCancelSwitch: noop(),
    dispatchCopyNoteBody: noop(),
    dispatchRequestNewNote: noop(),
  } as BlockEditorAdapter & Record<string, ReturnType<typeof vi.fn>>;
}

// Shared mock adapter instance — reset between runs
const sharedMockBlockAdapter = makeBlockAdapter();

function makeViewState(overrides: Partial<FeedViewState> = {}): FeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextFocus: null,
    visibleNoteIds: [SELF_NOTE_ID],
    loadingStatus: 'ready',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    tagAutocompleteVisibleFor: null,
    activeFilterTags: [],
    allNoteIds: [],
    searchQuery: '',
    sortDirection: 'desc',
    ...overrides,
  };
}

function makeDtoBlocks(length: number): DtoBlock[] {
  return Array.from({ length }, (_, i) => ({
    id: `block-${i}`,
    type: 'paragraph',
    content: `Content ${i}`,
  }));
}

/**
 * Build an EditingSessionStateDto for a given status + blocks.
 * Returns null for the 'null' arm (no session).
 */
function buildEditingSessionState(
  armStatus: 'idle' | 'editing' | 'saving' | 'switching' | 'save-failed' | 'null',
  noteId: string,
  blocks: DtoBlock[] | undefined,
): unknown {
  if (armStatus === 'null') return null;
  if (armStatus === 'idle') {
    // Idle arm has no currentNoteId in the 5-arm DTO contract
    return { status: 'idle' };
  }
  const base = {
    status: armStatus,
    currentNoteId: noteId,
    focusedBlockId: blocks?.[0]?.id ?? null,
    isDirty: false,
    isNoteEmpty: blocks === undefined || blocks.length === 0,
    lastSaveResult: armStatus === 'save-failed'
      ? { kind: 'failure', reason: 'permission' }
      : null,
    blocks,
  };
  if (armStatus === 'switching') {
    return { ...base, pendingNextFocus: null };
  }
  return base;
}

type CellLabel = 'cell1' | 'ec024' | 'cell2' | 'cell3' | 'cell4';

/**
 * Build the (viewState, editingSessionState, blockEditorAdapter) triple for a
 * given cell label and per-run arbitrary inputs.
 */
function buildPropsForCell(
  cellLabel: CellLabel,
  armStatus: 'idle' | 'editing' | 'saving' | 'switching' | 'save-failed' | 'null',
  blocks: DtoBlock[] | undefined,
  mockAdapter: BlockEditorAdapter | null,
): {
  viewState: FeedViewState;
  editingSessionState: unknown;
  blockEditorAdapter: BlockEditorAdapter | null;
} {
  switch (cellLabel) {
    case 'cell1':
      // effectiveMount=true: active status, self.noteId, adapter!=null
      return {
        viewState: makeViewState({
          editingStatus: 'editing',
          editingNoteId: SELF_NOTE_ID,
        }),
        editingSessionState: buildEditingSessionState('editing', SELF_NOTE_ID, blocks),
        blockEditorAdapter: sharedMockBlockAdapter, // always non-null for cell1
      };

    case 'ec024':
      // effectiveMount=false: active status, self.noteId, adapter=null
      return {
        viewState: makeViewState({
          editingStatus: 'editing',
          editingNoteId: SELF_NOTE_ID,
        }),
        editingSessionState: buildEditingSessionState('editing', SELF_NOTE_ID, blocks),
        blockEditorAdapter: null,
      };

    case 'cell2':
      // Architecturally unreachable: idle + self.noteId
      return {
        viewState: makeViewState({
          editingStatus: 'idle',
          editingNoteId: SELF_NOTE_ID,
        }),
        editingSessionState: buildEditingSessionState('null', SELF_NOTE_ID, blocks),
        blockEditorAdapter: mockAdapter,
      };

    case 'cell3': {
      // Active status, other.noteId
      const activeStatus = ['editing', 'saving', 'switching', 'save-failed'][
        Math.abs(blocks?.length ?? 0) % 4
      ] as 'editing' | 'saving' | 'switching' | 'save-failed';
      return {
        viewState: makeViewState({
          editingStatus: activeStatus,
          editingNoteId: 'note-other-999',
        }),
        editingSessionState: buildEditingSessionState(activeStatus, 'note-other-999', blocks),
        blockEditorAdapter: mockAdapter,
      };
    }

    case 'cell4':
      // idle, other.noteId
      return {
        viewState: makeViewState({
          editingStatus: 'idle',
          editingNoteId: null,
        }),
        editingSessionState: buildEditingSessionState('null', SELF_NOTE_ID, undefined),
        blockEditorAdapter: mockAdapter,
      };
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const BASE_PROPS = {
  noteId: SELF_NOTE_ID,
  body: 'Hello\nWorld',
  createdAt: 1746352800000,
  updatedAt: 1746352800000,
  tags: [] as string[],
  tagInventory: [] as never[],
};

let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  target.remove();
  vi.clearAllMocks();
});

// ── PROP-FEED-S6-002: non-coexistence + non-emptiness ─────────────────────────

describe('PROP-FEED-S6-002: non-coexistence + non-emptiness (fast-check stratified)', () => {

  /**
   * 5 representative examples, one per cell — required by spec
   * (FIND-S6-SPEC-iter3-004: 5 examples symmetric with 5 strata).
   *
   * Each example is: [cellLabel, armStatus, serverBlocksLength, adapterNull]
   */
  const FIVE_EXAMPLES: Array<[CellLabel, 'editing' | 'saving' | 'switching' | 'save-failed' | 'idle' | 'null', number, boolean]> = [
    ['cell1', 'editing', 2, false],   // cell1 representative
    ['ec024', 'editing', 2, true],    // EC-FEED-024 row representative
    ['cell2', 'idle',    0, false],   // cell2 representative
    ['cell3', 'saving',  1, false],   // cell3 representative
    ['cell4', 'idle',    0, false],   // cell4 representative
  ];

  test('non-coexistence: row-body-preview and block-element never coexist', async () => {
    const cellArb = fc.constantFrom<CellLabel>('cell1', 'ec024', 'cell2', 'cell3', 'cell4');
    const armStatusArb = fc.constantFrom<'idle' | 'editing' | 'saving' | 'switching' | 'save-failed' | 'null'>(
      'idle', 'editing', 'saving', 'switching', 'save-failed', 'null',
    );
    const serverBlocksLengthArb = fc.integer({ min: 0, max: 5 });
    const adapterNullArb = fc.boolean();

    const prop = fc.asyncProperty(
      cellArb,
      armStatusArb,
      serverBlocksLengthArb,
      adapterNullArb,
      async (cellLabel, armStatus, serverBlocksLength, adapterIsNull) => {
        // Reset shared adapter mocks between runs
        vi.clearAllMocks();

        const blocks = serverBlocksLength === 0 ? undefined : makeDtoBlocks(serverBlocksLength);
        const mockAdapter = adapterIsNull ? null : sharedMockBlockAdapter;

        const { viewState, editingSessionState, blockEditorAdapter } = buildPropsForCell(
          cellLabel, armStatus, blocks, mockAdapter,
        );

        const feedAdapter = makeFeedAdapter();

        const component = mount(FeedRow as never, {
          target,
          props: {
            ...BASE_PROPS,
            viewState,
            adapter: feedAdapter,
            editingSessionState,
            blockEditorAdapter,
          } as never,
        });

        // Synchronize: ensure $effect fallback dispatch chain completes
        flushSync();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        flushSync();

        const rbpEl = target.querySelector('[data-testid="row-body-preview"]');
        const blockEl = target.querySelector('[data-testid="block-element"]');
        const rbpExists = rbpEl !== null;
        const blockElExists = blockEl !== null;

        unmount(component);
        // Clear target for next run
        target.innerHTML = '';

        // (a) NON-COEXISTENCE: not both present simultaneously
        // RED phase: Sprint 5 baseline fails for cell1 (both are mounted)
        return (rbpExists && blockElExists) === false;
      },
    );

    await fc.assert(prop, {
      seed: 0x56babe,
      numRuns: 250,
      examples: FIVE_EXAMPLES.map(([cellLabel, armStatus, serverBlocksLength, adapterIsNull]) =>
        [cellLabel, armStatus, serverBlocksLength, adapterIsNull] as [CellLabel, typeof armStatus, number, boolean]
      ),
    });
  });

  test('non-emptiness: at least one of row-body-preview or block-element is present', async () => {
    const cellArb = fc.constantFrom<CellLabel>('cell1', 'ec024', 'cell2', 'cell3', 'cell4');
    const armStatusArb = fc.constantFrom<'idle' | 'editing' | 'saving' | 'switching' | 'save-failed' | 'null'>(
      'idle', 'editing', 'saving', 'switching', 'save-failed', 'null',
    );
    const serverBlocksLengthArb = fc.integer({ min: 0, max: 5 });
    const adapterNullArb = fc.boolean();

    const prop = fc.asyncProperty(
      cellArb,
      armStatusArb,
      serverBlocksLengthArb,
      adapterNullArb,
      async (cellLabel, armStatus, serverBlocksLength, adapterIsNull) => {
        vi.clearAllMocks();

        const blocks = serverBlocksLength === 0 ? undefined : makeDtoBlocks(serverBlocksLength);
        const mockAdapter = adapterIsNull ? null : sharedMockBlockAdapter;

        const { viewState, editingSessionState, blockEditorAdapter } = buildPropsForCell(
          cellLabel, armStatus, blocks, mockAdapter,
        );

        const feedAdapter = makeFeedAdapter();

        const component = mount(FeedRow as never, {
          target,
          props: {
            ...BASE_PROPS,
            viewState,
            adapter: feedAdapter,
            editingSessionState,
            blockEditorAdapter,
          } as never,
        });

        flushSync();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        flushSync();

        const rbpExists = target.querySelector('[data-testid="row-body-preview"]') !== null;
        const blockElExists = target.querySelector('[data-testid="block-element"]') !== null;

        unmount(component);
        target.innerHTML = '';

        // (b) NON-EMPTINESS: at least one present (no blank row)
        return (rbpExists || blockElExists) === true;
      },
    );

    await fc.assert(prop, {
      seed: 0x56babe,
      numRuns: 250,
      examples: FIVE_EXAMPLES.map(([cellLabel, armStatus, serverBlocksLength, adapterIsNull]) =>
        [cellLabel, armStatus, serverBlocksLength, adapterIsNull] as [CellLabel, typeof armStatus, number, boolean]
      ),
    });
  });
});
