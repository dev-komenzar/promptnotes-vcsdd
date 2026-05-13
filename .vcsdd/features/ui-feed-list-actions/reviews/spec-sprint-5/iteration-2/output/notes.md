# Sprint 5 spec review iter-2 — fresh-context adversary notes

Reviewer: adversary (zero Builder context)
Scope: Re-audit of the 11 iter-1 findings against the reworked Sprint 5 spec sections, plus independent re-review for new issues.
Verdict: PASS on both dimensions (spec_fidelity, verification_readiness).

## Artifacts read

- `.vcsdd/features/ui-feed-list-actions/reviews/spec-sprint-5/iteration-2/input/manifest.json` (entirety).
- `.vcsdd/features/ui-feed-list-actions/reviews/spec-sprint-5/iteration-1/output/verdict.json` and all 11 `FIND-S5-SPEC-{001..011}.json` files (full content), plus `notes.md`.
- `behavioral-spec.md` — Sprint 5 section (lines 904-1054), REQ-FEED-022 (lines 591-611), REQ-FEED-009 Sprint 4 amendment as convention reference (lines 247-282), front matter (lines 1-30).
- `verification-architecture.md` — Sprint 5 section (lines 679-761), Sprint 4 reference table (lines 670-676), front matter (lines 1-49).
- `promptnotes/src-tauri/src/feed.rs` — `scan_vault_feed` and `feed_initial_state` (lines 380-449).
- `promptnotes/src/lib/domain/app-startup/initialize-capture.ts` — `nextAvailableNoteId` (lines 85-104), `formatBaseId` (lines 110-126). Verified the new traceability paths in the spec point to a real file.

## Per-finding audit

### FIND-S5-SPEC-001 (traceability dead paths) — resolved

Resolution blocks present at three locations (behavioral-spec.md:967, 1008, 1049). Every occurrence of `docs/domain/code/ts/src/lib/domain/app-startup/initialize-capture.ts` has been replaced with `promptnotes/src/lib/domain/app-startup/initialize-capture.ts`. I directly read the new path and confirmed `initializeCaptureSession` lives at lines 46-73 and `nextAvailableNoteId` at lines 86-104 — line ranges match the spec citations. No residual ambiguity.

### FIND-S5-SPEC-002 (stem-vs-path namespace) — resolved

The Resolution block at behavioral-spec.md:935-936 explicitly accepts option (b) from the iter-1 remediation: keep `scan_vault_feed`'s full-path namespace for `visible_note_ids`/`note_metadata`, and use a stem-derived `existing_ids` HashSet **only** for the collision check. Step 2 (line 938) now reads "collision check 専用" with lowercase-stem derivation explicitly named, and step 6 (line 945) explicitly states the namespace asymmetry: "既存ノートの ID は full path のまま。新規ノートの ID は stem 形式". The PROP-FEED-S5-004 invariant `note_metadata.contains_key(visible_note_ids[0])` (verification-architecture.md:709) is satisfied trivially by the new stem-keyed entry that is prepended. Because new IDs are guaranteed to start with `YYYY-` and contain no `/`, they cannot accidentally collide with full-path-formatted existing IDs. Defensible.

### FIND-S5-SPEC-003 (every-call destructive) — resolved

The EARS clause at behavioral-spec.md:918 is now scoped: "WHEN `feed_initial_state(vault_path)` が **AppShell の `Configured` 状態マウント時に初めて** 呼ばれ、かつ `editing.currentNoteId == None` である". The Resolution block at line 920 names the discipline: front-end-side single-invocation guarantee, Rust handler does not enforce idempotency. REQ-FEED-029 Resolution (line 977) carries this into a concrete implementation rule: `+page.svelte` may call `feed_initial_state` only inside `onMount` / `$effect`, never on re-render or route remount. Acceptance Criterion #3 of REQ-FEED-029 (line 1001) makes this testable via vitest. This is option (a) of the iter-1 remediation, applied consistently across REQ-FEED-028 + REQ-FEED-029.

### FIND-S5-SPEC-004 (EC-FEED-016 over-claim) — resolved

The Sprint 5 amendment for EC-FEED-016 (lines 1016-1028) now opens with an explicit retention clause (line 1018: "Sprint 4 amendment は Sprint 5 以降も存続する"), and the Resolution block (line 1022) explicitly scopes the "Sprint 5 では起きない" claim to the `feed_initial_state` path only. The summary block at lines 1027-1028 distinguishes the two paths cleanly. The weasel phrasing flagged in iter-1 ("Sprint 5 では起きない") is now bounded to "`feed_initial_state` 経路の editingNoteId" — no global no-orphan misreading remains.

### FIND-S5-SPEC-005 (PN-knv manifest claim vs spec deferral) — resolved

REQ-FEED-029 now contains a "Scope Limitation (PN-knv)" subsection (lines 981-992) with a Resolution block (line 983) that explicitly enumerates what is in scope (initial-mount auto-create + immediate edit mode) and what is deferred (ctrl+N keybinding event listener, session-running ctrl+N second-note creation, keybinding-driven re-invocation). This is the iter-1 remediation option (a/c hybrid): the spec documents partial coverage rather than dropping PN-knv from the manifest. The manifest still claims PN-knv coverage, but a reader who follows the manifest → spec linkage will hit the Scope Limitation block and understand the partial coverage. Acceptable.

### FIND-S5-SPEC-006 (contradictory ACs in REQ-FEED-022) — resolved

REQ-FEED-022 Behavior line 598 now uses strikethrough markup (`~~Returns a snapshot with ... editing.status = "idle" ...~~`) followed by an inline Sprint 5 amendment that names the new value (`"editing"`). REQ-FEED-022 AC #2 at line 603 uses the HTML comment convention from Sprint 4 (`<!-- OLD (Sprint 2, superseded by Sprint 5 REQ-FEED-028): ... -->`) and provides the replacement AC inline: `feed.visibleNoteIds.len() == 1`. The Resolution block at line 605 records what changed. A standalone REQ-FEED-022 Sprint 5 amendment subsection (lines 1032-1043) summarises both changes with line-cited references. No contradictory ACs survive.

### FIND-S5-SPEC-007 (PROP-FEED-S5-005 required=false) — resolved

verification-architecture.md:710 now reads `**true**` (markdown-bold to flag the change), the snapshot count is expanded from "1 ペア" to "最低 4 ペア" with four named edge cases: base case (single-digit time fields), collision -1 suffix, collision -10 suffix, UTC epoch (`now_ms == 0`). The Verification Tier Table at line 754 mirrors `**true**`. The Resolution block at line 712 records the change and names a deferral target sprint with an explicit closure precondition ("proptest による `(now_ms, existing)` 全範囲での parity テストがパスする"). Parity-obligation downgrade is fully reversed; matches Sprint 4 PROP-FEED-S4-016 in rigor.

### FIND-S5-SPEC-008 (regex / i64 mismatch) — resolved

PROP-FEED-S5-003 at verification-architecture.md:708 now bounds the input domain to `now_ms ∈ [0, 253_402_300_800_000)` (year 0001..9999 UTC) and explicitly declares out-of-range inputs as panic-allowed undefined behavior. The proptest strategy is named: `0i64..253_402_300_800_000`. I verified the upper bound numerically: 253_402_300_800 sec = Year 10000-01-01 00:00:00 UTC, exclusive — correct. The Resolution block at line 714 records the change.

### FIND-S5-SPEC-009 (unbounded existing set) — resolved

PROP-FEED-S5-002 at verification-architecture.md:707 now adds `existing.len() < 1_024` and an inline termination argument: "existing は有限集合なので `-N` suffix loop は必ず終端する — 最悪でも `N == existing.len() + 1` で終了する". This is correct: the loop iterates `i = 1, 2, ...` checking `base-{i}`; in the worst case where `existing` contains `base, base-1, ..., base-existing.len()`, the loop exits at `i = existing.len() + 1`. So termination is bounded by `O(existing.len())`. The Resolution block at line 716 records the change.

### FIND-S5-SPEC-010 (test fixture under-specified) — resolved

verification-architecture.md:720-729 introduces a "Test Fixture Contract" subsection answering all four iter-1 sub-questions:
- (a) `tempfile::TempDir` named, with `Cargo.toml [dev-dependencies]` addition noted.
- (b) The seeded note is `2020-01-01-000000-000.md` with body `"hello world\n"`, no YAML frontmatter (fallback values are explicitly relied upon).
- (c) Clock injection is explicitly **not** introduced. `next_available_note_id` (the pure function) takes `now_ms: i64` directly. `feed_initial_state` integration tests accept wall-clock non-determinism and assert only that `visible_note_ids[0]` matches the regex. The collision-test "Clock 固定 + 既存 ID 1 件" (behavioral-spec.md:960) is correctly relegated to a pure unit test of `next_available_note_id`, not the integration test of `feed_initial_state`.
- (d) `before_count`/`after_count` `read_dir` comparison is named.

The Resolution block at line 720 records the decision. Test list lines 732-737 map directly to each PROP-S5-XXX with concrete inputs.

### FIND-S5-SPEC-011 (vault scan semantics) — resolved

REQ-FEED-028 now contains a "Vault Scan Semantics" subsection (behavioral-spec.md:922-931) with a Resolution block (line 924) and explicit positions on all six iter-1 sub-questions: case-insensitive extension match (`ext.eq_ignore_ascii_case("md")`), non-recursive (inherits REQ-FEED-022), dot-files excluded, symlinks NOT followed (`is_file()` filter), stem-collision under case-insensitivity, `Path::file_stem` for stem calculation. Step 1 of Detailed Behavior (line 937) cross-references this subsection.

## Independent re-review (Track 2)

I re-read the entire Sprint 5 section of both specs and checked for the four specific risks the manifest highlighted (Track 2 from the manifest):

1. **Strikethrough / `<!-- OLD: ... -->` convention readability** — Used only in REQ-FEED-022 (line 598 strikethrough, line 603 HTML comment + replacement). Both render cleanly: the new value is immediately adjacent to the retired one, and a Resolution block at line 605 records the surgical change. No ACs are broken, no semantics lost.

2. **Vault Scan Semantics vs REQ-FEED-022 scan behavior** — The Sprint 5 amendment to REQ-FEED-022 (lines 1032-1043) does not restate the new Vault Scan Semantics. However, REQ-FEED-028 step 1 (line 937) directs the scan in `feed_initial_state` to follow the Sprint 5 Vault Scan Semantics, and the existing `scan_vault_feed` is a private implementation detail (its callers, namely `feed_initial_state` post-Sprint-5, must honour the new contract). The spec is consistent at the contract level — `feed_initial_state` returns notes per the new semantics — even if `scan_vault_feed`'s internal extension-match line in feed.rs:398 must be updated to satisfy the new rule. That update is an implementation concern for Phase 3, not a spec gap. I considered raising a finding for this but the spec contract is unambiguous at the REQ-FEED-028 boundary; an implementer who reads "上記 Vault Scan Semantics に従う" cannot reasonably leave `ext == "md"` unchanged. **No finding raised.**

3. **First-call discipline wire-format implications** — The Resolution is purely a frontend-side discipline (REQ-FEED-029 line 977: `onMount`/`$effect` once). It does not introduce a wire-format flag like `first_call: bool`. The Rust handler remains stateless and side-effect-free at the persistence level (no file created). Repeated invocation produces destructive override of any in-progress editing session, but the spec acceptance criterion at REQ-FEED-029:1001 makes the single-call requirement testable via vitest. The risk surface is documented; no new contract complexity is introduced. **No finding raised.**

4. **Parity strengthening tier mismatch** — PROP-FEED-S5-005 is Tier 1 with `Required: true`, the same tier as Sprint 4 PROP-FEED-S4-016 (line 672, also Tier 1). The verification-architecture.md does not introduce a "TS canonical / Rust mirror" tier asymmetry; both languages are tested against the same shared JSON fixture. **No finding raised.**

## What I considered and rejected as new findings

- **`scan_vault_feed` impl drift vs Sprint 5 Vault Scan Semantics** — feed.rs:398 currently uses `ext == "md"` (case-sensitive), does not check `is_file()`, and does not skip dot-prefixed entries. The Sprint 5 spec at behavioral-spec.md:922-931 mandates a different behavior. This is an implementation gap, not a spec gap. Phase 1c reviews the spec, not the implementation. The spec is now precise enough that a Phase 3 reviewer can flag any non-conforming implementation. **No finding raised.**

- **REQ-FEED-029 cross-feature dependency on `note-body-editor`** — REQ-FEED-029 line 996 references `FeedRow.svelte` from the `note-body-editor` feature. This cross-reference is unchanged from iter-1 and was previously considered borderline in iter-1's notes.md but not raised as a finding. The fact that REQ-FEED-029's AC #1 (line 999) depends on `note-body-editor`'s `{#if editingNoteId === noteId}` logic is documented in "Relationship to Existing Requirements" (line 994). The cross-feature contract is implicit but the reviewer trail is unambiguous. **No finding raised** (consistent with iter-1's same decision).

- **Manifest still claims PN-knv coverage despite Scope Limitation** — The manifest at iteration-2/input/manifest.json line 23 retains `bdTasksCovered: [..., "PN-knv"]`. The spec at REQ-FEED-029:981-992 documents partial coverage and explicit deferral. There is no document-level contradiction because the spec is the source of truth and discloses what is and is not covered. A future sprint manifest should track PN-knv-residual separately, but that is a process recommendation, not a spec defect. **No finding raised.**

- **PROP-FEED-S5-004 invariant `note_metadata.contains_key(visible_note_ids[0])` and the stem/path asymmetry** — The invariant is satisfied for index 0 (the new stem-keyed entry). It would also hold for indices ≥ 1 (the path-keyed entries from `scan_vault_feed`). The spec does not extend the invariant to all indices, but it does not need to — the existing `scan_vault_feed` already guarantees `note_metadata` keys are exactly the elements of `visible_note_ids` for indices ≥ 1. **No finding raised.**

## Anti-leniency self-check

- I did not write "the rework is solid but" — I either flag a finding or accept the resolution as resolved.
- I cited line numbers for every audit decision and verified citations via Read.
- I considered four substantive risks from Track 2 and three additional candidate findings independently — all are either resolved within the spec text or are out-of-scope for Phase 1c.
- I did not lower the bar relative to iter-1. Every iter-1 finding's remediation requirement is verifiably present in the spec text. The Resolution blocks make the changes auditable in-place rather than scattered.
- I did not manufacture findings. The target count of 0-3 is the realistic upper end per the manifest guidance; 0 is reached because the spec rework was thorough and surgical.
