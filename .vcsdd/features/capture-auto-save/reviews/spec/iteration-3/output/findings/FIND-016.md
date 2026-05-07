# FIND-016: Edge cases for "empty note" variants are not enumerated

**Dimension**: edge_case_coverage
**Severity**: major

## Location
- `behavioral-spec.md` REQ-003 Edge Cases (none enumerated under REQ-003 directly), REQ-004 (line 117-127), Event Catalog L433
- `verification-architecture.md` PROP-025 (line 144)

## Evidence

REQ-003 currently treats only ONE shape as the empty-idle-discard trigger: `blocks.length === 1 && blocks[0].type === "paragraph" && blocks[0].content` empty.

Per `aggregates.md` L120 "全ブロックが空（または `divider` のみ）の Note はファイル化されない", the following user-reachable note states are all "empty" but are not enumerated as edge cases by the spec:

1. `[empty paragraph, empty paragraph]` — user pressed Enter on an empty note.
2. `[paragraph("   "), paragraph("\t")]` — multiple whitespace-only paragraphs.
3. `[divider]` — user typed `---` on an empty note (BlockType change).
4. `[divider, empty paragraph]` — divider followed by empty paragraph.
5. `[empty heading-1]` — user typed `# ` then deleted the trigger char (depending on implementation, may produce a heading-1 with empty content).
6. `[empty bullet]` — same for bullets.

The spec answers none of these. REQ-004 (blur saves empty) is also under-specified for the multi-block case: does blur save `[empty para, empty para]` to disk as `\n\n`? Is that observable as a vault file?

Event Catalog L433 says "Note.isEmpty(note) (= blocks 列が `[empty paragraph]` のみ)" — explicitly committing to the narrow definition, which means cases 1-6 above DO get persisted. This is a data-pollution risk: the user can accidentally fill the vault with whitespace-only files by hitting Enter during idle.

PROP-025 fast-check generator should exercise all 6 shapes; currently only "single empty paragraph; single non-empty block; multi-block sequences" is mentioned, with no constraint on emptiness within the multi-block sequences.

## Recommended fix

1. After deciding FIND-012 (broaden vs narrow `isEmpty`), add to REQ-003 an explicit Edge Cases sub-section enumerating each empty-shape variant and the expected behavior:

   | Note state | Idle save | Blur save |
   |---|---|---|
   | `[empty paragraph]` | Discard (EmptyNoteDiscarded) | Save |
   | `[empty para, empty para]` | ? | ? |
   | `[paragraph(" "), paragraph("\t")]` | ? | ? |
   | `[divider]` | ? | ? |
   | `[divider, empty paragraph]` | ? | ? |
   | `[heading-1("")]` | ? | ? |
   | `[bullet("")]` | ? | ? |

2. Update PROP-025 generator to produce blocks satisfying each row, asserting the chosen `isEmpty` outcome.

3. Update REQ-004 to specify what blur save writes for each shape (the file bytes are observable to users).
