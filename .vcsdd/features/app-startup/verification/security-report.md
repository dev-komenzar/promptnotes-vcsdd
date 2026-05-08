# Phase 5 Security Report — app-startup

**Feature**: app-startup
**Phase**: 5 (Formal Hardening)
**Sprint**: 5 iteration 2
**Verified at**: 2026-05-08T00:00:00Z

---

## Tooling

| Tool | Status | Output |
|------|--------|--------|
| bun audit | 実行済み | security-results/bun-audit-sprint5.log — 1 LOW (cookie <0.7.0 via @sveltejs/kit) |
| npm audit | 実行不可 | bun.lock のみ存在、package-lock.json なし |
| semgrep | NOT INSTALLED | 前回と同様 (security-results/semgrep-not-installed.txt) |
| cargo audit | NOT INSTALLED | PATH 上に存在しない |
| 手動 OWASP 検査 | 実施済み (継続) | security-results/owasp-visual-inspection.log (sprint 4 baseline 継続) |
| Wycheproof | 非適用 | app-startup に暗号処理なし |

---

## Findings

### 所見 1 (LOW): @sveltejs/kit › cookie 依存脆弱性

- **OWASP カテゴリ**: A06:2021 - Vulnerable and Outdated Components
- **重大度**: LOW
- **対象パッケージ**: cookie <0.7.0 (via @sveltejs/kit)
- **CVE/Advisory**: GHSA-pxg6-pf52-xh8x

**説明**:
`bun audit` (2026-05-08) 実行結果: cookie パッケージが out-of-bounds な cookie 名/パス/ドメインを受け入れる可能性がある。

**app-startup スコープへの適用可能性**:
- `hydrate-feed.ts`, `hydrate-note.ts`, `scan-vault.ts`, `parse-markdown-to-blocks.ts` はいずれも `cookie` パッケージを使用しない。
- 脆弱性は `@sveltejs/kit` の HTTP cookie ハンドリングに由来し、Tauri IPC レイヤーで動作する。
- app-startup はローカルファイルシステム読み取り専用; HTTP リクエスト/レスポンス処理は範囲外。

**推奨**: インフラ sprint にて `@sveltejs/kit` を最新バージョンへ更新すること。

---

### 所見 2 (LOW, 継続): パストラバーサル処理のインフラ層依存

- **OWASP カテゴリ**: A01:2021 - Broken Access Control (path traversal)
- **重大度**: LOW
- **対象ファイル**: `scan-vault.ts`

**説明** (sprint 4 baseline から変更なし):
`scanVault` は `listMarkdown()` ポートが返すファイルパスを `readFile()` ポートに渡す。

**軽減措置**:
1. `NOTE_ID_FORMAT = /^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}(-\d+)?$/` による非適合ステムの `CorruptedFile` 扱い
2. `filePathStem()` による末尾ファイル名のみ抽出
3. Tauri `tauri-plugin-fs` の allowlist サンドボックス

---

### Sprint 5 新規ソースコード静的検査結果

Sprint 5 iteration 2 で追加されたファイルへの検査:

```
grep -nE "Date\.now\(\)" capture-auto-save/parse-markdown-to-blocks.ts | grep -v "//"
  -> 0 件

grep -nE "Date\.now\(\)" app-startup/hydrate-note.ts | grep -v "//"
  -> 0 件

grep -nE "process\.|require\(|eval\(|exec\(|fetch\(" capture-auto-save/parse-markdown-to-blocks.ts
  -> 0 件

grep -nE "process\.|require\(|eval\(|exec\(|fetch\(" app-startup/hydrate-note.ts
  -> 0 件
```

**A2 - Cryptographic Failures**: 暗号処理なし。Wycheproof 非適用。

**A3 - Injection**: eval/exec/spawn の呼び出しなし。PASS。

**A5 - Security Misconfiguration**: 環境変数 (`process.env`) の直接読み取りなし。PASS。

**A8 - Software and Data Integrity**: 外部 URL からのデータ取得なし。PASS。

---

## Summary

**全体的なセキュリティポスチャ**: ACCEPTABLE

- 重大度 HIGH 以上の所見: 0 件
- 重大度 MEDIUM の所見: 0 件
- 重大度 LOW の所見: 2 件
  1. cookie 脆弱性 (GHSA-pxg6-pf52-xh8x): インフラ層、app-startup domain スコープ外
  2. パストラバーサル (継続): インフラ層依存、ドメイン層で部分軽減済み

**Sprint 5 iteration 2 追加コードへの評価**:
- `parse-markdown-to-blocks.ts`: 純粋関数、I/O なし、外部依存なし。セキュリティリスクなし。
- `hydrate-note.ts`: 純粋関数、I/O なし、外部依存なし。セキュリティリスクなし。

**考慮した OWASP Top 10 カテゴリ**:
- A01 Broken Access Control: パストラバーサル (LOW、所見 2)
- A02 Cryptographic Failures: 非適用
- A03 Injection: PASS (eval/exec なし)
- A04 Insecure Design: PASS (ポートアーキテクチャによる I/O 分離)
- A05 Security Misconfiguration: PASS
- A06 Vulnerable Components: LOW (cookie via @sveltejs/kit; 所見 1)
- A07 Identity/Authentication: 非適用
- A08 Software Integrity: PASS
- A09 Logging/Monitoring: スコープ外
- A10 SSRF: 非適用 (外部 HTTP リクエストなし)

**残留リスク**:
- semgrep / cargo audit が未インストールのため自動スキャンが実施できなかった。
- Wycheproof は現フィーチャーに暗号処理が存在しないため非適用。
- cookie 脆弱性はインフラ sprint での @sveltejs/kit 更新で対処予定。
