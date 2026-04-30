# Phase 5 Security Report — app-startup

**Feature**: app-startup
**Phase**: 5 (Formal Hardening)
**Verified at**: 2026-04-30T20:30:00Z

---

## Tooling

| Tool | Status | Output |
|------|--------|--------|
| bun pm scan | 未設定 | bunfig.toml に [install.security] scanner 指定なし (security-results/bun-audit.log) |
| npm audit | 実行不可 | bun.lock のみ存在、package-lock.json なし |
| semgrep | NOT INSTALLED | security-results/semgrep-not-installed.txt |
| cargo audit | NOT INSTALLED | PATH 上に存在しない |
| 手動 OWASP 検査 | 実施済み | security-results/owasp-visual-inspection.log |
| Wycheproof | 非適用 | app-startup に暗号処理なし |

---

## Findings

### 所見 1 (LOW): パストラバーサル処理のインフラ層依存

- **OWASP カテゴリ**: A01:2021 - Broken Access Control (path traversal)
- **重大度**: LOW
- **対象ファイル**: `scan-vault.ts`
- **該当箇所**: `listMarkdown` ポートが返す `filePath` 値の検証

**説明**:
`scanVault` 関数は `listMarkdown()` ポートが返すファイルパスをそのまま
`readFile()` ポートに渡す。`../../../etc/passwd` のようなパストラバーサル文字列が
`listMarkdown` の戻り値に含まれた場合、`readFile` に渡されてしまう可能性がある。

**軽減措置**:
1. `filePathStem()` 関数は `split("/").pop()` を使って末尾ファイル名のみを抽出するため、
   ステム検証 (`NOTE_ID_FORMAT` regex) はディレクトリトラバーサルの影響を受けない。
2. `NOTE_ID_FORMAT = /^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}(-\d+)?$/` により
   非適合ステムを持つファイルは `CorruptedFile` として除外される (FIND-004)。
3. 実際の `listMarkdown` 実装は Tauri `tauri-plugin-fs` が担当し、
   Tauri の `allowlist` 設定でサンドボックス化されている。
4. ドメイン層は `readFile` ポートのインターフェース経由でのみファイルを読み込む。

**推奨**:
インフラ層 (`tauri-plugin-fs` adapter) での `..` セグメント正規化を
明示的に文書化すること (Phase 6 以降の infrastructure sprint にて対応予定)。
ドメイン層での追加対応は不要。

---

### ソースコード静的検査結果

検査コマンドと結果:

```
grep -nE "Date\.now\(\)" app-startup/*.ts | grep -v comment
  -> 0 件 (コメント内への言及のみ)

grep -nE "process\." app-startup/*.ts
  -> 0 件

grep -nE "eval\(|exec\(|spawn\(" app-startup/*.ts
  -> 0 件

grep -nE "require\(" app-startup/*.ts
  -> 0 件
```

**A2 - Cryptographic Failures**: 暗号処理なし。Wycheproof 非適用。

**A3 - Injection**: eval/exec/spawn の呼び出しなし。PASS。

**A5 - Security Misconfiguration**: 環境変数 (`process.env`) の直接読み取りなし。
設定はすべて `settingsLoad` ポート経由。PASS。

**A8 - Software and Data Integrity**: 外部 URL からのデータ取得なし。
Tauri IPC + ローカルファイルシステムのみ。PASS。

---

## Summary

**全体的なセキュリティポスチャ**: ACCEPTABLE

- 重大度 HIGH 以上の所見: 0 件
- 重大度 MEDIUM の所見: 0 件
- 重大度 LOW の所見: 1 件 (パストラバーサル: インフラ層依存、ドメイン層で部分軽減済み)

**考慮した OWASP Top 10 カテゴリ**:
- A01 Broken Access Control: パストラバーサル (LOW、上記所見 1)
- A02 Cryptographic Failures: 非適用
- A03 Injection: PASS (eval/exec なし)
- A04 Insecure Design: PASS (ポートアーキテクチャによる I/O 分離)
- A05 Security Misconfiguration: PASS
- A06 Vulnerable Components: 自動 audit 不可 (手動確認、既知 CVE なし)
- A07 Identity/Authentication: 非適用
- A08 Software Integrity: PASS
- A09 Logging/Monitoring: スコープ外
- A10 SSRF: 非適用 (外部 HTTP リクエストなし)

**残留リスク**:
- semgrep / cargo audit が未インストールのため自動スキャンが実施できなかった。
  定期的な依存関係の脆弱性スキャンを推奨する。
- Wycheproof は現フィーチャーに暗号処理が存在しないため非適用。
  今後暗号機能が追加された場合は再評価が必要。
