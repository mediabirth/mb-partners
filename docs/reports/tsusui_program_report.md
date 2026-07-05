# 通水プログラム 統合レポート（開通 → 束削減 → 循環）

- 実行モデル: **Claude Fable 5**（`claude-fable-5`）
- 土台: `c92a01f`（native-feel）／ロールバック: `rollback-tsusui-baseline` → `c92a01f`
- 完了タグ: `deploy-tsusui-program-20260706` → `ed3461f`
- 思想: 「作る」ではなく「通水」——紹介ループの配管は既に6〜9割敷設済み。露出・分割・循環で水を通す。

| Phase | commit | 主眼 |
|---|---|---|
| P1 開通 | `d7d933c` | 共有UIの露出＋顧客セルフ登録の一気通貫＋紹介ファネル計測 |
| P2 束削減 | `1db16bb` | `/console/deals` 分割＋重い従属subtreeの遅延ロード化（before/after実測） |
| P3 循環 | `ed3461f` | 自動送信ドライラン明示＋累計マイルストーン（静音）＋フロンティア循環の実測 |

---

## Phase 1「開通」— 作れるのに配れない、を終わらせる

既存資産（`referral_links` / `getOrCreateReferralToken` / `/r/[token]` ランディング / `funnel_events`）は揃っていた。欠けていたのは**パートナーの手元にある共有導線**だった。

- **共有UIの露出**: `app/refer` のブランド展開内に「紹介リンクを共有」を追加（`ShareLinkSheet`）。既存トークンを **コピー / LINE / QR** で配れる。ユーザー操作＝外部自動送信ではない（静音）。
- **セルフ登録の一気通貫**: `/r/{token}`（未認証・公開）→ B2B同意フォーム → `/api/referral` が **パートナー帰属で deal 作成**（`source=link/qr`・`consent=true`）。
- **ファネル計測**: `share(copy/line/qr)` / `landing_view` / `register` を `trackFunnel`／API で発火。`funnel_events` に best-effort 記録（お金・帰属に非接触）。
- **ダッシュボード**: `/console/growth`（新設・読み取り専用）。共有→閲覧→登録→成約の転換率、パートナー別生産性、休眠（14日以上）を可視化。
- 検証 `.e2e-p1` **10/10**: 共有リンク発行→顧客セルフ登録→帰属deal→コンソールボード出現→ファネル記録→ダッシュボード実数、throwaway残置ゼロ。

## Phase 2「束削減」— 宣言目標と before/after 実測

対象 `/console/deals`（1831行の単一クライアントコンポーネント）。**自己申告の目標**を立て、実測で示した。

| 指標 | before | after | 差分 |
|---|--:|--:|--:|
| page.tsx 行数 | 1831 | 1027 | **−804（−44%）** |
| 初期クライアントJS（prerendered HTMLが参照する static chunks 合計） | 773.3 kB | 751.0 kB | **−22.3 kB（−2.9%）** |
| 詳細ドロワー | 初期バンドル同梱 | **21.3 kB を on-demand 化** | 案件クリック時のみ取得 |
| ステータス×3面マトリクス | 初期バンドル同梱 | **≈4 kB を on-demand 化** | 参照時のみ取得 |

- 純粋部品（型・ヘルパー・表示専用コンポーネント）を `_parts.tsx`(397) に分離。詳細ドロワーを `DealDrawer.tsx`(404)、マトリクスを `StatusMatrixModal.tsx`(83) へ。いずれも `dynamic(ssr:false)`。
- JSX・計算は**原典を1:1移設**（`selected`→`deal` の置換のみ）。状態・ハンドラは `page.tsx` を単一ソースに `ctx` で受領し、型 `DrawerCtx` で**網羅を静的検証**（threading漏れはコンパイルで検出）。
- **上限の明示**: 227+110+107 = 444 kB の共有フレームワーク（react-dom／next runtime）が初期JSの下限。機能削除なしにここは削れない、という事実を記録。
- 検証 `.e2e-p2` **6/6**: ボードのカード押下で**遅延ドロワーchunkが追加取得される**ことを実証、ドロワー描画・money不変・throwaway残置ゼロ。

## Phase 3「循環」— トリガー(ドライラン)・フロンティア・マイルストーン

3領域とも配管は既存。**露出と実測**で循環を回した。

- **自動送信ドライラン**: 既存の送信マトリクス（`mailMatrix`）に「ドライラン」バナー（`Nイベント／M通`・この画面からは送信されない旨）と、各イベントの**発火タイミング（`trigger`）**を表示。実配線の全体像を送信ゼロで可視化。
- **マイルストーン（静音）**: `MilestoneStrip` を `/app/rewards` に追加。確定＋支払済（税抜・全期間）の**累計報酬**と次の節目までの残額を、罫線トラック＋`--c-blue` の細い充填で淡く表示。バッジ・煽り無し、累計0は非表示、**payout計算に非接触**。
- **フロンティア循環**: 既存 `/app/frontier`（`frontier_id` の downline・override = 成約額 × 10%・12ヶ月窓）を実データで**実測確認**（override 式は `lib/frontier` 不変）。
- 検証 `.e2e-p3` **8/8**: ①累計¥350,000＋次節目残額 ②配下 override **¥20,000 実測** ③ドライランbanner＋trigger表示＋**`mail_log` 件数不変（実送信ゼロ）**＋money不変。

---

## 不変条件（全Phase 共通・green）

- **money**: `menu_rewards` 16行・`reward_value` 合計 **¥340,100** 不変。勝彦 deals（`created_by=bfb3c027`）**3件** 不変。計算の意味・確定値・snapshot 非接触。
- **session独立**: `pnpm test:session` **26/26**。認証クライアントの中央factory封鎖（eslint）維持。
- **canon**: `pnpm test:canon` **61/61**。
- **3面到達**: 未認証で `/app`・`/console`・`/vendor` = **307**。無署名 webhook = **401**。
- **build**: `pnpm build` exit **0**。
- **実データ操作禁止則**: 検証は全て throwaway アカウント／書込のみ・実行後に原状復帰（残置ゼロを毎回確認）。
- **外部送信ガード**: 実ユーザー・運営への実送信ゼロ（P3で `mail_log` 不変を実証）。
- **DDL**: ゼロ（既存 `funnel_events` 等を利用）。font/color 不変（デザインv3ゲート保留）。

## デプロイについて（要・勝彦の実行）

`origin/main` は現在 HEAD より **309 コミット遅れ**ており、これまでのプログラム群（native-feel 等）も含め git push されていない＝**このリポジトリの deploy は git push ではなく別経路（`vercel --prod` 等）**で行われている。CLAUDE.md は本番デプロイを人間確認必須と定めるため、**本プログラムはコードのコミット＋タグ付け（`deploy-tsusui-program-20260706`）までを完了**とし、本番反映は勝彦の実行を待つ。

- 反映: `vercel --prod`（またはこれまでの通水経路）
- 差し戻し: `git reset --hard rollback-tsusui-baseline`（→ `c92a01f`）
