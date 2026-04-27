//! Domain-level Result alias.
//!
//! DMMF principle: business failures use `Result<Ok, Err>`; panics are
//! reserved for genuinely unrecoverable system faults.

pub type DomainResult<T, E> = core::result::Result<T, E>;
