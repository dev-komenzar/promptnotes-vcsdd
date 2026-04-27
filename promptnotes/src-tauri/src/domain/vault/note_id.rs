/// note_id.rs — Pure helper: next_available_note_id
///
/// PROP-003: next_available_note_id(preferred, existingIds) returns NoteId ∉ existingIds
/// PROP-022: next_available_note_id is deterministic — same inputs → same output
///
/// Covers: REQ-011
///
/// The actual implementation is in docs/domain/code/rust/src/vault/ports.rs
/// and currently `todo!()`. These tests are Phase 2a Red phase tests — they
/// will fail until Phase 2b implements the function.

// Re-export the pure helper from the domain crate so tests can target it.
pub use promptnotes_domain::vault::ports::next_available_note_id;

#[cfg(test)]
mod tests {
    use super::next_available_note_id;
    use promptnotes_domain::value_objects::{NoteId, Timestamp};
    use std::collections::HashSet;

    // ── Timestamp construction helper ─────────────────────────────────────
    // Timestamp::try_from_epoch_millis is also todo!() in Phase 11+,
    // but we need a way to construct test values.
    // For Phase 2a Red, these helpers will panic (todo!()) when executed,
    // which is the expected Red behaviour.

    fn ts(ms: i64) -> Timestamp {
        // This will todo!() until Phase 2b — that is the Red evidence.
        Timestamp::try_from_epoch_millis(ms).unwrap()
    }

    fn note_id(raw: &str) -> NoteId {
        // NoteId::try_new is also todo!() — Red phase.
        NoteId::try_new(raw).unwrap()
    }

    // ── PROP-003: Uniqueness invariant ────────────────────────────────────

    /// PROP-003 / REQ-011: result is NOT in existingIds
    #[test]
    fn prop003_result_not_in_existing_ids_empty_set() {
        // Base case: empty existing set → base timestamp format used.
        let preferred = ts(1714298400000);
        let existing: HashSet<NoteId> = HashSet::new();

        let result = next_available_note_id(preferred, &existing);

        assert!(
            !existing.contains(&result),
            "result {:?} must not be in existing ids",
            result
        );
    }

    /// PROP-003 / REQ-011: when base timestamp collides, suffix -1 is appended.
    #[test]
    fn prop003_result_not_in_existing_ids_with_collision() {
        let preferred = ts(1714298400000);
        // The base NoteId that would be generated from preferred.
        // Format: YYYY-MM-DD-HHmmss-SSS
        let base_id = note_id("2026-04-28-120000-000");
        let mut existing = HashSet::new();
        existing.insert(base_id.clone());

        let result = next_available_note_id(preferred, &existing);

        assert!(
            !existing.contains(&result),
            "result {:?} must not collide with existing {:?}",
            result,
            existing
        );
    }

    /// PROP-003 / REQ-011: suffix increments until unique (-2 when -1 also occupied).
    #[test]
    fn prop003_result_not_in_existing_ids_double_collision() {
        let preferred = ts(1714298400000);
        let base_id = note_id("2026-04-28-120000-000");
        let suffix_1_id = note_id("2026-04-28-120000-000-1");

        let mut existing = HashSet::new();
        existing.insert(base_id.clone());
        existing.insert(suffix_1_id.clone());

        let result = next_available_note_id(preferred, &existing);

        assert!(
            !existing.contains(&result),
            "result {:?} must not be in existing set {:?}",
            result,
            existing
        );
    }

    // ── PROP-022: Determinism ─────────────────────────────────────────────

    /// PROP-022 / REQ-011: same (preferred, existingIds) → same result.
    #[test]
    fn prop022_deterministic_empty_set() {
        let preferred = ts(1714298400000);
        let existing: HashSet<NoteId> = HashSet::new();

        let r1 = next_available_note_id(preferred, &existing);
        let r2 = next_available_note_id(preferred, &existing);

        assert_eq!(r1, r2, "same inputs must produce same NoteId");
    }

    /// PROP-022 / REQ-011: deterministic even with collisions.
    #[test]
    fn prop022_deterministic_with_collision() {
        let preferred = ts(1714298400000);
        let base_id = note_id("2026-04-28-120000-000");
        let mut existing = HashSet::new();
        existing.insert(base_id);

        let r1 = next_available_note_id(preferred, &existing);
        let r2 = next_available_note_id(preferred, &existing);

        assert_eq!(r1, r2, "determinism holds under collision");
    }

    // ── PROP-003 property test via proptest ──────────────────────────────

    use proptest::prelude::*;

    proptest! {
        /// PROP-003 property: ∀ epoch_ms ∈ [1000, 9_999_999], ∀ small existing set,
        /// next_available_note_id result ∉ existing.
        #[test]
        fn prop003_proptest_uniqueness(
            epoch_ms in 1000i64..9_999_999i64,
            // Generate 0–5 note IDs as arbitrary strings to act as "existing".
            // In Phase 2a these are arbitrary strings; in Phase 2b they'll
            // need to conform to the NoteId format.
            existing_strs in proptest::collection::vec(
                "[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}",
                0..5
            )
        ) {
            let preferred = ts(epoch_ms);
            let mut existing = HashSet::new();
            for s in &existing_strs {
                if let Ok(id) = NoteId::try_new(s) {
                    existing.insert(id);
                }
            }

            let result = next_available_note_id(preferred, &existing);
            prop_assert!(
                !existing.contains(&result),
                "result {:?} must not be in existing set",
                result
            );
        }

        /// PROP-022 property: ∀ epoch_ms, same call produces same result.
        #[test]
        fn prop022_proptest_determinism(
            epoch_ms in 1000i64..9_999_999i64,
            existing_strs in proptest::collection::vec(
                "[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}",
                0..5
            )
        ) {
            let preferred = ts(epoch_ms);
            let mut existing = HashSet::new();
            for s in &existing_strs {
                if let Ok(id) = NoteId::try_new(s) {
                    existing.insert(id);
                }
            }

            let r1 = next_available_note_id(preferred, &existing);
            let r2 = next_available_note_id(preferred, &existing);
            prop_assert_eq!(r1, r2, "determinism: same inputs produce same NoteId");
        }
    }
}
