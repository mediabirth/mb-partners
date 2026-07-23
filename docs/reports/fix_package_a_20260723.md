# 是正パッケージA 統合レポート（2026-07-23）

- 実行モデル: Codex（GPT-5）
- 着手HEAD: `bd6ace35c9717cbed3f56f9530510dc6f3ad5d62`
- rollback: `rollback-fix-package-a-20260723-baseline`
- 指定tag: `deploy-fix-package-a-20260723`
- メール: `CC_MAIL_SUPPRESS=1`。実送信0件
- 実運用データ: 読取スナップショットのみ。米井さん、実案件、`cc-monitor`への書込・操作0件

## 実装

### A. 漏出予備軍の根絶

- `lib/reward-override.ts` の未使用 `personalizeRewards()` を削除した。プロダクト・検証資産を対象に `rg` し、呼出元0件を再確認。
- 削除位置へ「個別化は `/api/my-reward-overrides`（no-store）＋クライアント1箇所マージのみ。`/api/services`（CDN共有キャッシュ）への個別値混入は禁止」の恒久コメントを残した。
- `components/ui/index.ts` の不存在 `../ChannelMark` exportとコメント上の言及を削除した。

### B. 型検査のゲート化

- `package.json`: `typecheck = tsc --noEmit`を追加。
- `scripts/verification/run-permanent.mjs`: build直後へtypecheckを追加。
- 現HEADのTypeScript診断20件を0件へ是正。relationの配列/object推論は実行値に触れない`unknown`経由の型整理、暗黙anyは型注釈、`lost`は既存正典へ型unionを追随、重複styleは同値の重複keyだけ削除した。
- `api/invite/accept`: 新規登録時の現行値を保存。フル登録は従来どおり`partnerFields.tax_type`、非フル登録は`individual`。
- money近接3ファイル（`delivery-payout`、`reward-overrides`、`supplier-charges`）は型表現のみ変更し、分岐・値・クエリ・計算を変更していない。
- `lib/supabase/server.ts`: Supabase SSRの現行2引数シグネチャへ型を追随し、既存cookie guard後の値とresponse headersをそのままadapterへ転送。
- 20件が0になった後、`next.config.ts`の`ignoreBuildErrors`節をコメントごと削除。`pnpm build`ログで`Running TypeScript`、exit 0を確認。

### C. 検証配線

- `test:canon`を`tsx --test lib/*.test.ts`へ拡張。7ファイルgreen:
  - status-effects 61
  - coop-task-display 7
  - deal-status-narrative 6
  - reward-format 8
  - synapse-fetch 8（SSRF 15/15を含む）
  - synapse-match 16
  - synapse-nudge 16
- 恒久runnerのbuildへ`NEXT_PUBLIC_BUILD_SHA=$(git rev-parse --short HEAD)`相当を注入。`resume-reload`は2/2 green。
- `perf-sakusaku`:
  - hydration完了後に入力し、email/password値を検査、空なら最大3回再入力する決定的ログインへ変更。
  - 各面で対象遷移→開始面への復帰を1回捨てるwarm-upを追加。
  - feedback確認のmouse-upが先にリンク遷移を発火して本計測と競合する欠陥を、リンク外mouse-upで除去。
  - 骨格値はURL完了時刻ではなく`aria-busy`のloading DOM出現とURL到達の早い方を実測するよう是正。

### D. money証跡

- `freezeOverridesForBatch`: `payout_overrides.rate`へ実適用率 `supplierFrontiers[frontier_id]?.rate ?? OVERRIDE_RATE`を記録。`override_gross`および支払計算は変更していない。
- `payout_overrides.rate`の読者はプロダクト・検証資産の`rg`で0件。
- `validateSupplierReward`: catchのみfail-closedへ変更し、`{ ok:false, error:'確認できませんでした。もう一度お試しください' }`を返す。通常経路と`resolveEffectiveReward`の正典値fail-safeは不変。

## 検証

| ゲート | 結果 | 証跡 |
|---|---:|---|
| build | GREEN | exit 0、TypeScript実行を確認 |
| typecheck | GREEN | 20 → 0、exit 0 |
| canon全7本 | GREEN | 7 files / 0 fail |
| integrity | GREEN | 17/17（3面307、webhook 401、公開面、375px、page errors []） |
| session | GREEN | 32/32（運営者条件case[7]含む） |
| resume-reload | GREEN | 2/2 |
| resume-perf | GREEN（再実行） | 21/21 |
| perf-sakusaku | **RED** | console 56/60/40ms、app 268/272/40ms、vendor 46/829/41ms（骨格/操作可能/feedback） |
| test:verify総合 | **RED** | performance exit 1。初回resume-perf 20/21も単独再実行で21/21 green |

`perf-sakusaku`はwarm-up後も3回同傾向を再現した。appは骨格100msを超過、vendorは操作可能500msを超過した。指定にあった「vendor warm 314ms」は本HEAD・本Codex環境では再現せず、829–833msだった。数値を改変したり閾値を緩めたりせず、実測REDとして扱う。

## money前後・残置

| 対象 | Before | After | 判定 |
|---|---|---|---:|
| menu_rewards | `bb94d30546ab15ef5e39f8bdeb76528e` | 同左 | 不変 |
| deals reward | `d5976ebf80e9a169239dee552b7650ef` | 同左 | 不変 |
| fee | `4b17cc905c8346133a0ab55a1291ce9b` | 同左 | 不変 |
| override | `0fd767f4ec2d0dde13a3cacb441fb734` | 同左 | 不変 |
| MB seed補助 | 16行 / ¥340,100 | 同左 | 不変 |
| 勝彦deals | 3件 | 3件 | 不変 |

恒久スイートの既知メール12件、招待、partnerコードについて残置0をSQLで確認した。実送信0件。

## デプロイ判定

**NO DEPLOY。** 自律デプロイ条件③（回帰green）の性能ゲートが未達であるため、`vercel --prod`および`git push origin main`は実行しない。stamp=デプロイSHAの本番実測も未実施。認証・招待・cookieの挙動変更はないが、保守的にsession case[7]を含む32/32を実行済み。

次の一手は、appのloading境界が100ms以内に描画されない経路と、vendor rewardsの`loadVendorBundle`に残るDB待機をプロファイルし、プロダクト性能是正を独立バッチで行うこと。

## 開示

- 着手前から存在した `docs/design/lineage-rate-design.md`、`docs/design/partner-reward-override-design.md`、`docs/design/coop-reward-freeze.md`、`docs/RESUME.md`、`docs/reports/screens_integrity/*.png` 7枚の差分は変更・commit対象外。
- 指定された実装項目A/B/C/Dは完了したが、「`pnpm test:verify`全green」と本番デプロイは性能REDにより未達。
