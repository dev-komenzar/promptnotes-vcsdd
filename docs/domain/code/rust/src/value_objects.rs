//! Shared Kernel — Value Objects.
//!
//! 由来:
//!   - glossary.md §0 (Shared Kernel)
//!   - aggregates.md §1 Note Aggregate / §4 Vault Aggregate
//!
//! DMMF: Simple 型は newtype + Smart Constructor。
//! 不変条件は `try_new` 内で検証し、検証済みの値だけが構築できる。

use crate::result::DomainResult;

// ──────────────────────────────────────────────────────────────────────
// NoteId — 形式 YYYY-MM-DD-HHmmss-SSS[-N]
// glossary.md §0 ノート ID, aggregates.md §1 衝突回避設計
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NoteId(String);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoteIdError {
    /// 形式が `YYYY-MM-DD-HHmmss-SSS` または `YYYY-MM-DD-HHmmss-SSS-N` でない。
    InvalidFormat,
}

impl NoteId {
    /// 文字列から NoteId を構築する。形式違反は `InvalidFormat`。
    /// 衝突回避サフィックス `-N` (N >= 1) を含む形式も許容する。
    ///
    /// 有効形式: `YYYY-MM-DD-HHmmss-SSS` または `YYYY-MM-DD-HHmmss-SSS-N` (N >= 1)
    pub fn try_new(raw: &str) -> DomainResult<Self, NoteIdError> {
        if is_valid_note_id(raw) {
            Ok(Self(raw.to_string()))
        } else {
            Err(NoteIdError::InvalidFormat)
        }
    }

    /// `Vault::allocate_note_id` 内部から呼ばれる、検証済み文字列の信頼性昇格。
    /// 外部公開しない。
    pub(crate) fn from_validated(raw: String) -> Self {
        Self(raw)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// ──────────────────────────────────────────────────────────────────────
// Timestamp — ISO 8601 ミリ秒精度
// glossary.md §0 時刻
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Timestamp {
    /// Unix epoch からのミリ秒。単一プロセスで自明な順序を保証。
    epoch_millis: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimestampError {
    /// epoch 以前の負値。
    Negative,
}

impl Timestamp {
    pub fn try_from_epoch_millis(ms: i64) -> DomainResult<Self, TimestampError> {
        if ms < 0 {
            Err(TimestampError::Negative)
        } else {
            Ok(Self { epoch_millis: ms })
        }
    }

    pub fn epoch_millis(&self) -> i64 {
        self.epoch_millis
    }
}

// ──────────────────────────────────────────────────────────────────────
// Tag — 小文字正規化、先頭 # 除去、空文字拒否
// glossary.md §0 タグ, aggregates.md §1 Tag VO
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Tag(String);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TagError {
    /// trim 後に空。
    Empty,
    /// ホワイトスペースのみ等、正規化後に空。
    OnlyWhitespace,
}

impl Tag {
    /// Smart Constructor：正規化（小文字化・先頭 `#` 除去・trim）してから検証。
    pub fn try_new(_raw: &str) -> DomainResult<Self, TagError> {
        todo!("Phase 11+ 実装")
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// ──────────────────────────────────────────────────────────────────────
// Body — Markdown 本文
// glossary.md §0 本文
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Body(String);

impl Body {
    /// Body は内容に対して制約を持たない（空文字も許容、空判定は別 API）。
    pub fn new(raw: String) -> Self {
        Self(raw)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// aggregates.md §1 不変条件 4: trim 後に空であれば「空ノート」。
    pub fn is_empty_after_trim(&self) -> bool {
        self.0.trim().is_empty()
    }
}

// ──────────────────────────────────────────────────────────────────────
// Frontmatter — 固定スキーマ：tags / createdAt / updatedAt
// glossary.md §0 MVP 固定 Frontmatter スキーマ
// aggregates.md §1 Frontmatter VO
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frontmatter {
    /// 重複なしの Tag 集合。順序は保持する（YAML 出力の安定性のため）。
    tags: Vec<Tag>,
    /// 不変。生成時刻。
    created_at: Timestamp,
    /// `created_at` 以降。
    updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrontmatterError {
    /// `updated_at < created_at`。
    UpdatedBeforeCreated,
    /// 同一 Note 内のタグ重複。
    DuplicateTag(Tag),
}

impl Frontmatter {
    pub fn try_new(
        _tags: Vec<Tag>,
        _created_at: Timestamp,
        _updated_at: Timestamp,
    ) -> DomainResult<Self, FrontmatterError> {
        todo!("Phase 11+ 実装")
    }

    pub fn tags(&self) -> &[Tag] {
        &self.tags
    }

    pub fn created_at(&self) -> Timestamp {
        self.created_at
    }

    pub fn updated_at(&self) -> Timestamp {
        self.updated_at
    }
}

// ──────────────────────────────────────────────────────────────────────
// FrontmatterPatch — 部分更新指示
// aggregates.md §1 editFrontmatter
// ──────────────────────────────────────────────────────────────────────

/// `Note::edit_frontmatter` への部分パッチ。
/// 型レベルで「タグ集合の置換」と「タグ追加・削除」を区別する。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrontmatterPatch {
    /// タグ集合をまるごと差し替え。
    ReplaceTags(Vec<Tag>),
    /// タグを 1 件追加。重複は idempotent。
    AddTag(Tag),
    /// タグを 1 件削除。不在は idempotent。
    RemoveTag(Tag),
}

// ──────────────────────────────────────────────────────────────────────
// VaultPath — 実在ディレクトリパス（検証は configure 時）
// glossary.md §3 Vault パス
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct VaultPath(String);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultPathError {
    /// 空文字列。
    Empty,
    /// 相対パス（絶対パスを要求）。
    NotAbsolute,
}

impl VaultPath {
    /// 形式検証のみ（実在検証は `Vault::configure` の責務）。
    pub fn try_new(_raw: &str) -> DomainResult<Self, VaultPathError> {
        todo!("Phase 11+ 実装")
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// ──────────────────────────────────────────────────────────────────────
// VaultId — MVP は singleton、明示的に持つ
// aggregates.md §4 Vault Aggregate
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct VaultId(String);

impl VaultId {
    /// MVP の固定値。
    pub fn singleton() -> Self {
        Self("default".to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// ──────────────────────────────────────────────────────────────────────
// NoteId format validation (private helper)
// ──────────────────────────────────────────────────────────────────────

/// Validate NoteId format: `YYYY-MM-DD-HHmmss-SSS` with optional `-N` suffix (N >= 1).
///
/// Pattern breakdown:
///   YYYY  : 4 decimal digits
///   -MM   : hyphen + 2 decimal digits
///   -DD   : hyphen + 2 decimal digits
///   -HHmmss : hyphen + 6 decimal digits
///   -SSS  : hyphen + 3 decimal digits
///   (-N)? : optional hyphen + one or more decimal digits (collision suffix)
fn is_valid_note_id(raw: &str) -> bool {
    // Minimum base length: 4+1+2+1+2+1+6+1+3 = 21 chars ("YYYY-MM-DD-HHmmss-SSS")
    let bytes = raw.as_bytes();
    if bytes.len() < 21 {
        return false;
    }

    // Validate fixed-position characters.
    // Positions: 0-3=YYYY, 4=-, 5-6=MM, 7=-, 8-9=DD, 10=-, 11-16=HHmmss, 17=-, 18-20=SSS
    if bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'-' || bytes[17] != b'-' {
        return false;
    }

    // Validate digit groups.
    if !all_digits(&bytes[0..4])     // YYYY
        || !all_digits(&bytes[5..7]) // MM
        || !all_digits(&bytes[8..10])// DD
        || !all_digits(&bytes[11..17])// HHmmss
        || !all_digits(&bytes[18..21])// SSS
    {
        return false;
    }

    // Handle optional suffix: nothing, or "-N" where N >= 1 and all digits.
    match bytes.get(21) {
        None => true, // base format, no suffix
        Some(&b'-') => {
            // Collision suffix: must have at least one digit after the hyphen.
            let suffix = &bytes[22..];
            !suffix.is_empty() && all_digits(suffix)
        }
        _ => false, // unexpected character at position 21
    }
}

#[inline]
fn all_digits(slice: &[u8]) -> bool {
    slice.iter().all(|b| b.is_ascii_digit())
}
