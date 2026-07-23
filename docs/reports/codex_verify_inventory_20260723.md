# 検証スイート棚卸し 統合レポート（2026-07-23）

- 実行モデル: OpenAI Codex（GPT-5）
- 土台 / rollback: `dd282d4f104b32ed6e961e8fba99e8e206485f5d` / `rollback-codex-verify-inventory-20260723-baseline`
- 完了タグ: `codex-verify-inventory-20260723`
- デプロイ: なし（プロダクトコード非接触・検証資産整備のみ）
- メール: `pnpm test:verify` が `CC_MAIL_SUPPRESS=1` を強制。実送信0件

## 結論

検証資産を「恒久」「バッチ固有／診断」「運用」に分離し、恒久入口を `pnpm test:verify` の1行へ統一した。既存の恒久候補には、実ユーザー・`cc-monitor`・既存デモ・固定案件ID・固定日付・旧UI・実行者固有の `/private/tmp/claude-*` への依存が混在していたため、恒久5ファイルを `scripts/verification/permanent/` へ移し、安全なthrowawayまたはread-onlyへ改修した。

この実行環境ではmacOSがPlaywright/ChromeのMachポート登録を拒否したため、ブラウザ依存5本はアサーション到達前の「実行不能」。したがって「恒久スイート全green」とは判定していない。非ブラウザ部分は build 0、canon 61/61、HTTP境界4/4 green。接続済みブラウザによる代替実測では公開4面が375px横溢れ0・実描画・console error 0だった。

## インベントリ

判定は `green` / `red` / `実行不能`。`隔離`は恒久合否から外したバッチ固有資産で、再利用前の再設計が必要。

### 恒久スイート

| ファイル | 目的 | 最終更新 | 現在結果 |
|---|---|---:|---|
| `lib/status-effects.test.ts` | 状態表示canon 61 assertion | 2026-07-04 | green（61/61） |
| `scripts/verification/permanent/verify-integrity.mjs` | 3面307、webhook 401、公開4面の200/375px/描画/error | 2026-07-23 | HTTP 4/4 green、Playwright起動不能。接続済みブラウザ代替は4面green |
| `scripts/verification/permanent/session-isolation.e2e.mjs` | 3面cookie独立、二重ロール、運営者条件ケース | 2026-07-23（原版2026-07-11） | 実行不能（ブラウザ起動拒否）、fixture残置0 |
| `scripts/verification/permanent/perf-sakusaku.mts` | throwaway 3面warm 100/500ms＋active feedback | 2026-07-23（原版2026-07-13） | 実行不能（ブラウザ起動拒否）、fixture残置0 |
| `scripts/verification/permanent/resume-reload.e2e.mts` | deploy SHA不一致時の自動reload | 2026-07-23（原版2026-07-18） | 実行不能（ブラウザ起動拒否）、fixture残置0 |
| `scripts/verification/permanent/resume-perf.mts` | 5/35/65分復帰時の3面500msゲート | 2026-07-23（原版2026-07-18） | 実行不能（ブラウザ起動拒否）、fixture残置0 |
| `scripts/verification/run-permanent.mjs` | build＋全恒久ゲート直列実行、メール抑止 | 2026-07-23 | green（全入口を実行しred集約） |

### バッチ固有／診断用（恒久入口から隔離）

| ファイル | 目的 | 最終更新 | 現在結果 |
|---|---|---:|---|
| `scripts/click-menu-reorder.mjs` | 本番メニュー並替え再現 | 2026-06-29 | 実行不能（実マスタ更新） |
| `scripts/console-restructure.e2e.mts` | コンソール再構造化バッチ | 2026-07-14 | 隔離（固定UI・固定スクショパス） |
| `scripts/final-verify-reorder.mjs` | 本番並替え復元・API swap | 2026-06-29 | 実行不能（実マスタ更新） |
| `scripts/measure-ttfb.sh` | 本番URL TTFBスポット計測 | 2026-06-14 | 隔離（閾値なし） |
| `scripts/optimistic.e2e.mts` | 案件レーン楽観更新バッチ | 2026-07-18 | 隔離（単一機能バッチ） |
| `scripts/perf-feel.mjs` | 旧3面体感計測 | 2026-07-05 | red（teardown任意・恒久閾値なし） |
| `scripts/perf-lcp.mjs` | 旧LCP計測 | 2026-07-04 | 実行不能（実ユーザー・固定案件） |
| `scripts/perf-measure.mjs` | 旧面別性能スポット計測 | 2026-06-29 | 隔離（恒久閾値なし） |
| `scripts/render-page.mjs` | 本番ページ描画デバッグ | 2026-06-28 | 実行不能（実ユーザー前提） |
| `scripts/render-refer.mjs` | 紹介画面描画デバッグ | 2026-06-28 | 実行不能（既存デモ前提） |
| `scripts/repro-continuous.mjs` | 継続報酬作成再現 | 2026-06-28 | 実行不能（本番書込） |
| `scripts/repro-deal-continuous.mjs` | 継続案件再現 | 2026-06-28 | 実行不能（本番書込） |
| `scripts/repro-reward.mjs` | 報酬parse再現 | 2026-06-28 | 実行不能（本番書込） |
| `scripts/server-times.mts` | API中央値診断 | 2026-07-18 | red（固定絶対出力・閾値なし） |
| `scripts/supplier-auth-fix.e2e.mts` | supplier認証修理バッチ | 2026-07-17 | 隔離（バッチ固有） |
| `scripts/supplier-mastery.e2e.mts` | supplier masteryバッチ | 2026-07-18 | 隔離（バッチ固有） |
| `scripts/supplier-mgmt.e2e.mts` | supplier管理総合バッチ | 2026-07-13 | 隔離（固定fixture・巨大単体） |
| `scripts/supplier-polish3.e2e.mts` | supplier polish第3バッチ | 2026-07-18 | 隔離（バッチ固有） |
| `scripts/supplier-refine-full.e2e.mts` | supplier refine fullバッチ | 2026-07-17 | 隔離（バッチ固有） |
| `scripts/supplier-refine.e2e.mts` | supplier refineバッチ | 2026-07-14 | 隔離（バッチ固有） |
| `scripts/vendor-evidence-mobile.check.mts` | evidenceモバイルバッチ | 2026-07-14 | 隔離（バッチ固有） |
| `scripts/vendor-evidence.e2e.mts` | evidence総合バッチ | 2026-07-14 | 隔離（バッチ固有） |
| `scripts/vendor-purify-mobile.check.mts` | vendor純化モバイルバッチ | 2026-07-14 | 隔離（バッチ固有） |
| `scripts/vendor-purify.e2e.mts` | vendor純化総合バッチ | 2026-07-14 | 隔離（バッチ固有） |
| `scripts/verify-aggregate.mjs` | 集計値スポット出力 | 2026-06-29 | 実行不能（実ownerセッション・assertなし） |
| `scripts/verify-flow.mjs` | 紹介入口v3フロー | 2026-07-03 | 実行不能（既存デモ・旧UI） |
| `scripts/verify-menu-reorder.mjs` | 本番メニュー並替え | 2026-06-29 | 実行不能（実マスタPATCH） |
| `scripts/verify-rate-menu.mjs` | 紹介入口v2率メニュー | 2026-07-03 | 実行不能（既存デモ・旧UI） |
| `scripts/verify-referral-v2.mjs` | 紹介入口v2 | 2026-07-03 | 実行不能（既存デモ・旧UI） |
| `scripts/verify-v3.mjs` | 紹介入口v3 | 2026-07-03 | 実行不能（既存デモ・旧UI） |
| `scripts/verify-v4.mjs` | 案件詳細v4 | 2026-07-04 | 実行不能（実ユーザー・固定案件） |
| `scripts/take-screenshots-prod.ts` | 本番スクリーンショット証跡 | 2026-06-14 | 実行不能（実認証情報） |
| `scripts/take-screenshots.ts` | ローカルスクリーンショット証跡 | 2026-06-14 | 隔離（旧ポート・旧面一覧） |

### 運用資産（検証ランナー対象外）

| ファイル | 目的 | 最終更新 | 現在結果 |
|---|---|---:|---|
| `scripts/calendar-member-phase1.sql` | 本番DDL/データ移送 | 2026-06-30 | 対象外・自動実行禁止 |
| `scripts/check-db.ts` | DB状態表示 | 2026-06-14 | 対象外（read-only診断） |
| `scripts/check-db2.ts` | payout等DB状態表示 | 2026-06-14 | 対象外（read-only診断） |
| `scripts/check-pre-deploy.ts` | 旧pre-deploy状態dump | 2026-06-14 | 対象外（assert不十分） |
| `scripts/cleanup-all-data.sql` | 全データcleanup | 2026-06-30 | 対象外・実行禁止 |
| `scripts/count-before-migration.ts` | 旧migration前count | 2026-06-14 | 対象外 |
| `scripts/gen-brand-icons.mjs` | ブランド画像生成 | 2026-07-08 | 対象外 |
| `scripts/gen-icons.mjs` | PWA画像生成 | 2026-07-04 | 対象外 |
| `scripts/gen-og.mjs` | OGP画像生成 | 2026-07-08 | 対象外 |
| `scripts/post-migration-dump.json` | 旧migration証跡 | 2026-06-14 | 対象外 |
| `scripts/preview-emails.ts` | メールHTML preview | 2026-07-04 | 対象外 |
| `scripts/run-master-migration.ts` | 旧master migration | 2026-06-14 | 対象外・自動実行禁止 |
| `scripts/seed-demo.ts` | デモseed | 2026-06-14 | 対象外・自動実行禁止 |
| `scripts/seed-system-partner.cjs` | system partner seed | 2026-06-19 | 対象外・自動実行禁止 |

## 診断分類

| 分類 | 件数 | 内容 |
|---|---:|---|
| 実バグ／基盤欠陥 | 2 | ①現HEADは `tsc --noEmit` がプロダクトコード19エラー（Next buildは型検査skip）。②Codex実行環境ではPlaywright/ChromeがMachポート権限で起動不能 |
| 仕様変更への未追随 | 5ファイル | 旧 `verify-integrity`（実ユーザー・固定案件/日付・consoleも375px）、旧 `perf-sakusaku`（cc-monitor/実デモ）、`resume-perf`（固定出力・合否なし）、`resume-reload`（例外cleanupなし）、package入口（恒久全数を実行しない） |
| バッチ固有の使い捨て | 33ファイル | 上表のバッチ固有／診断用。固定ID・旧UI・本番書込を含むため恒久入口から隔離 |

`tsc` 19エラーは本バッチが炙り出した既存プロダクト不整合であり、指示どおりプロダクトコードを修正していない。代表例は `components/ui/index.ts` の欠落import、`FrontierSection.tsx` の重複property、Supabase join型のarray/object不一致。

## 是正内容

1. `scripts/verification/permanent/` を新設し、恒久5本を移動。
2. `verify-integrity` から実ユーザー・実案件・固定日付を除去。未認証境界と公開面read-onlyへ再設計。
3. `perf-sakusaku` から `cc-monitor`、実デモ、実サプライヤーを除去。3面すべて専用throwaway＋100/500ms合否へ変更。
4. session/perf/resume系はブラウザ起動失敗を含む例外時もcleanupするよう補強。
5. `resume-perf` の実行者固有絶対パスを `/private/tmp/mb-partners-verify/` へ変更し、500ms合否を追加。
6. `pnpm test:verify` を追加。build→canon→integrity→session→perf→resume reload→resume perfを直列実行し、全過程で `CC_MAIL_SUPPRESS=1`。
7. `CLAUDE.md` に分類規則を追記し、恒久スクリプト参照先を更新。詳細規則は `scripts/verification/README.md`。

## 実行証跡

`pnpm test:verify`:

| 項目 | 結果 |
|---|---|
| `pnpm build` | exit 0、83 static generation完了 |
| canon | 61 passed / 0 failed |
| 3面未認証 | 307 × 3 |
| webhook | unsigned POST 401 |
| integrity browser | 実行不能（MachPortRendezvousServer permission denied） |
| session | 実行不能（同上）、fixture残置0 |
| warm perf | 実行不能（同上）、fixture残置0 |
| resume reload | 実行不能（同上）、fixture残置0 |
| resume perf | 実行不能（同上）、fixture残置0 |

接続済みブラウザ代替実測（375×667、ローカルproduction build、Service Workerなしの新規タブ）:

| 面 | clientWidth | scrollWidth | 本文文字数 | console error |
|---|---:|---:|---:|---:|
| `/partners` | 375 | 375 | 1,638 | 0 |
| `/join` | 375 | 375 | 788 | 0 |
| `/legal/privacy` | 375 | 375 | 1,343 | 0 |
| `/legal/terms` | 375 | 375 | 1,084 | 0 |

## money 4ハッシュ前後

| 項目 | 開始時 | 終了時 | 判定 |
|---|---|---|---|
| menu_rewards全行 | `bb94d30546ab15ef5e39f8bdeb76528e` | 同左 | 不変 |
| deals reward | `d5976ebf80e9a169239dee552b7650ef` | 同左 | 不変 |
| fee | `4b17cc905c8346133a0ab55a1291ce9b` | 同左 | 不変 |
| override | `0fd767f4ec2d0dde13a3cacb441fb734` | 同左 | 不変 |
| MB seed補助 | 16行 / ¥340,100 | 同左 | 不変 |
| 勝彦deals | 3件 | 3件 | 不変 |

終了時fixture残置: `auth.users=0 / profiles=0 / partners=0 / deliveries=0 / invites=0 / services=0`（今回の恒久fixture識別子に限定した機械照合）。

## プロダクトコード非接触

本バッチの変更対象は `CLAUDE.md`、`package.json`、`scripts/verification/**`、移動元の検証スクリプト、`docs/reports/codex_verify_inventory_20260723.md` のみ。`app/**`、`components/**`、`lib/**`（既存canonを除き変更なし）には差分なし。

着手前から存在した `docs/reports/screens_integrity/*.png` 7点の変更はユーザー所有差分であり、本バッチでは触れていない。

## 未達と次の一手

- 未達: 恒久ブラウザ5本の同一環境での全green。理由はアプリのアサーションではなく、CodexサンドボックスのChromium起動拒否。
- 次の一手: 通常ターミナル（Machポート制限なし）で `pnpm test:verify` を1回実行し、5本の実測値を本レポートへ追補する。redが出た場合は、実バグとして別バッチ裁定を受ける。
- 開示: `tsc --noEmit` 19エラーは既存プロダクトコードのため未修正。型検査をskipする現行buildはexit 0。
