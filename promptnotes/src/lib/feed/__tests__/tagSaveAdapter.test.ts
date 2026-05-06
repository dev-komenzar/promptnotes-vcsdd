/**
 * tagSaveAdapter.test.ts — RED→GREEN: verify tag chip writes actually save.
 *
 * Bug: dispatchAddTagViaChip called edit_note_body (no-op), so tags were never saved.
 * Fix: adapter serializes frontmatter + body to markdown, calls write_file_atomic Rust command.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { createTauriFeedAdapter } from '../tauriFeedAdapter.js';

const mockedInvoke = invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tagSaveAdapter: dispatchAddTagViaChip writes tag via write_file_atomic', () => {
  test('dispatchAddTagViaChip calls invoke with serialized markdown containing the new tag', async () => {
    const adapter = createTauriFeedAdapter();

    await adapter.dispatchAddTagViaChip?.(
      '/vault/note-001.md',
      'typescript',
      'this is the body',
      ['draft'],
      1746000000000,
      1746100000000,
      '2026-05-05T00:00:00Z',
    );

    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith('write_file_atomic', expect.objectContaining({
      path: '/vault/note-001.md',
    }));

    const callArgs = mockedInvoke.mock.calls[0];
    const contents = callArgs[1].contents as string;
    expect(contents).toContain('typescript');
    expect(contents).toContain('draft');
    expect(contents).toContain('this is the body');
    expect(contents).toContain('---');
    expect(contents).toContain('createdAt:');
    expect(contents).toContain('updatedAt:');
  });

  test('dispatchRemoveTagViaChip removes tag from markdown', async () => {
    const adapter = createTauriFeedAdapter();

    await adapter.dispatchRemoveTagViaChip?.(
      '/vault/note-001.md',
      'draft',
      'the body content',
      ['draft', 'typescript'],
      1746000000000,
      1746100000000,
      '2026-05-05T00:00:00Z',
    );

    const callArgs = mockedInvoke.mock.calls[0];
    const contents = callArgs[1].contents as string;
    expect(contents).toContain('typescript');
    expect(contents).not.toContain('  - draft');
  });

  test('dispatchAddTagViaChip with empty existing tags writes tag list correctly', async () => {
    const adapter = createTauriFeedAdapter();

    await adapter.dispatchAddTagViaChip?.(
      '/vault/note-002.md',
      'new-tag',
      'body',
      [],
      1746000000000,
      1746000000000,
      '2026-05-05T00:00:00Z',
    );

    const callArgs = mockedInvoke.mock.calls[0];
    const contents = callArgs[1].contents as string;
    expect(contents).toContain('new-tag');
    expect(contents).toContain('body');
  });

  test('dispatchAddTagViaChip with duplicate existing tag deduplicates in markdown', async () => {
    const adapter = createTauriFeedAdapter();

    await adapter.dispatchAddTagViaChip?.(
      '/vault/note-001.md',
      'draft',
      'body text',
      ['draft', 'typescript'],
      1746000000000,
      1746100000000,
      '2026-05-05T00:00:00Z',
    );

    const callArgs = mockedInvoke.mock.calls[0];
    const contents = callArgs[1].contents as string;
    // Should contain 'draft' and 'typescript' but NOT duplicate 'draft'
    const draftMatches = [...contents.matchAll(/draft/g)];
    expect(draftMatches.length).toBe(1);
    expect(contents).toContain('  - typescript');
  });
});
