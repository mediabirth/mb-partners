# Codexブラウザ検証能力 環境整備レポート（2026-07-23）

- 土台: `d1e04f090fc5b19cbfff54db42c5656f40b33b39`
- rollback: `rollback-codex-browser-capability-20260723-baseline`
- 完了タグ: `codex-browser-capability-20260723`
- 実行モデル: OpenAI Codex（GPT-5）
- プロダクトコード変更: なし

## 確立内容

`pnpm exec playwright install --with-deps chromium` を実行し、Playwright 1.60.0、Chromium 148.0.7778.96（v1223）、Chrome Headless Shell v1223、FFmpeg v1011の配置を確認した。

通常のmulti-process起動はCodexデスクトップのmacOSサンドボックスにより以下で拒否される。

```text
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.<pid>:
Permission denied (1100)
```

必要なOS側能力は、Chromiumが子プロセス連携用のglobal Mach serviceを登録できること。Codexアプリをsandboxの外で起動するか、アプリ署名entitlementで `org.chromium.Chromium.MachPortRendezvousServer.*` のMach service登録を許可する必要がある。通常の「ファイルとフォルダ」「画面収録」「アクセシビリティ」許可では解消しない。

Codex内では `--single-process --no-zygote` が起動可能であることを実証した。恒久スイートに共通ランチャーを追加し、通常起動を先に試し、上記Mach拒否のときだけsingle-processへフォールバックする。single-processでは複数BrowserContextが不安定なため、1ブラウザ1Contextを維持し、ケース間をcookie消去で分離した。

代替案:

1. 通常ターミナル／CI runnerでmulti-process Chromiumを使用（推奨）。
2. Codex内では今回のsingle-processフォールバック。
3. 接続済みin-app Browser/Chromeを使う。ただしCLIスイートの直接実行ではなく、画面実測の補完用途。
4. Linuxコンテナ／CI上のChrome Headless Shellを使用。macOS Mach service制約を受けない。

## ブラウザ依存5本

| スイート | 結果 | 実測 |
|---|---|---|
| `verify-integrity.mjs` | green | 17 passed / 0 failed |
| `session-isolation.e2e.mjs` | green | 32 passed / 0 failed |
| `perf-sakusaku.mts` | red | console 110/112ms、APP 111/135ms、vendor 28/810ms（骨格/操作可能）。active feedback 26–38ms |
| `resume-reload.e2e.mts` | green | 2 passed / 0 failed（SHA注入build） |
| `resume-perf.mts` | green | 21 green / 0 red。最大376ms、5/35/65分復帰すべて500ms以内 |

`perf-sakusaku` の初回実行で検証側の旧 `/vendor/money` とsynthetic PointerEventによる無効な`:active`計測を検出し、現行 `/vendor/rewards` と実mouse down計測へ是正した。是正後は全3面で測定値が取得でき、上記の性能redを実測した。プロダクト性能は本環境整備バッチでは修正していない。

## 安全性

- `CC_MAIL_SUPPRESS=1`
- 実ユーザー・実案件・`cc-monitor`非接触
- money 4ハッシュ前後一致:
  - menu: `bb94d30546ab15ef5e39f8bdeb76528e`
  - deals: `d5976ebf80e9a169239dee552b7650ef`
  - fee: `4b17cc905c8346133a0ab55a1291ce9b`
  - override: `0fd767f4ec2d0dde13a3cacb441fb734`
- 勝彦deals: 3件不変
- fixture残置: auth.users / profiles / partners / deliveries / invites / services = すべて0
