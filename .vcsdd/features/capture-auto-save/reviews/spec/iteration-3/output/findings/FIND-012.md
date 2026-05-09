# FIND-012: `Note.isEmpty` definition contradicts aggregates.md (broader empty-Note rule)

**Dimension**: spec_fidelity
**Severity**: major

## Location
- `behavioral-spec.md` REQ-003 (lines 88-114), Pipeline Overview / Acceptance criteria for REQ-004 (line 124)
- `verification-architecture.md` PROP-025 (line 144), Port Contracts NoteIsEmpty comment (lines 56-61)
- `note.ts` line 173-174 (NoteOps.isEmpty doc comment)
- Source-of-truth: `docs/domain/aggregates.md` L120, L142

## Evidence

The spec narrowly defines `Note.isEmpty(note)` as:

> `behavioral-spec.md` REQ-003 L92:
> "isEmpty(note) returns true iff `note.blocks.length === 1` AND `note.blocks[0].type === "paragraph"` AND `note.blocks[0].content` is the empty/whitespace-only `BlockContent`."

But `docs/domain/aggregates.md` defines it more broadly:

> `aggregates.md` L120:
> "**空 Note は永続化対象外**：全ブロックが空（または `divider` のみ）の Note はファイル化されない（Capture 側ルール）。判定は `note.isEmpty()` が担う"
>
> `aggregates.md` L142:
> "`note.isEmpty(): boolean` | 全ブロックが空（または divider のみ）か判定 | Capture（破棄判断用）"

Under aggregates.md's definition, the following note states are also "empty":
- `[empty paragraph, empty paragraph]` — two empty paragraphs (legitimately created by pressing Enter twice in an empty note)
- `[divider]` — a single divider block (which has empty content by Block invariant 2)
- `[divider, empty paragraph]` — divider followed by empty paragraph

The spec's narrow rule would persist all of these to disk under idle save, which violates the aggregate-level invariant 4 (空 Note は永続化対象外). aggregates.md is the source of truth for Note Aggregate invariants per `behavioral-spec.md` L6.

`note.ts` L172-174 sits in the middle and is itself ambiguous ("blocks.length === 1 かつ blocks[0] が空 content の paragraph") — it agrees with the spec but contradicts aggregates.md.

## Recommended fix

Choose one of:

(a) **Adopt the aggregates.md broader definition** — update REQ-003, PROP-025, and `note.ts` doc comment so `isEmpty` returns true when `blocks.every(b => b.type === "divider" || (b.type === "paragraph" && b.content is empty/whitespace))`. This is the safer, user-data-preserving option (more notes treated as empty).

(b) **Tighten aggregates.md to match the spec** — file a follow-up to update `aggregates.md` L120/L142 to the narrow rule. Risk: legitimate user states like `[empty para, empty para]` then persist as files containing only blank lines.

Option (a) is recommended because it matches the documented business invariant and preserves data-loss prevention semantics. PROP-025 must then enumerate divider-only and multi-empty-paragraph cases as positive `isEmpty=true` examples.
