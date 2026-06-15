# フロンティア（統括パートナー）実装 R2 — 統合レポート（2026-06-16）

自走・無確認で実装。build+検証→ vercel --prod（最終 `fb83lhi9s`）。host/role分離・既存deal frozen・既存payout snapshot 不変。前提列 `partners.is_frontier / frontier_id / frontier_linked_at` を使用（追加DDLなし）。

## A. 整合性監査（方針）
既存の支払いは SQL関数 `close_month_batch` が月次で確定deal→`payout_items`(gross/withholding/net/statement) を生成（源泉=個人 ROUND(gross×0.1021)、frozen）。CCはDDL/関数を実行できない＋snapshotを壊さない方針のため、**オーバーライドは“1種類の報酬”としてアプリ層で加算（既存 payout_items / close_month_batch は不変）**と決定。`frontier_id` FK整合先＝`partners.id`(uuid)。源泉・端数は `lib/payout` を流用。

## D. オーバーライド計算（`lib/frontier.ts`）
- override = 配下パートナー報酬 × **10%**、`frontier_linked_at + 12ヶ月以内`（linkedAt ≤ deal日 ≤ linkedAt+12M）。
- **1段のみ**：各 deal は「成約した本人の“直接の”フロンティア1人」にのみ加算。override を deal として扱わない＝**再帰しない／配下の配下へ波及しない**。
- 未稼働・期限切れ・該当なし・未確定 deal は 0。源泉/端数は合算grossに対し既存ルールで再計算。
- **ユニット検証 全PASS**：10%計算／1段(MID=配下分)／多段波及なし(TOPに孫deal混入せず)／12ヶ月外=0／非フロンティア=0／未確定除外。

## B. ロール付与（コンソール）
- 招待フォーム：役割「通常パートナー / フロンティア」。フロンティア選択時は招待URLに `?role=frontier` を付与→受諾で `is_frontier=true`。
- パートナー編集（`FrontierControls`）：役割(is_frontier) と「紐づくフロンティア」(frontier_id) を `PATCH /api/console/partners/[id]` で更新。設定時に `frontier_linked_at` を記録（解除でクリア）。自己紐づけは拒否。

## C. フロンティア導線（APP）
- `/app/frontier` ダッシュボード（`is_frontier` のみ・他はリダイレクト）：今月のオーバーライド／稼働率／今月新規／MVP配下／配下カード（各配下の今月override・対象期間内外）。
- ホームに導線カード（is_frontier のみ）。
- 「パートナーを招待」＝`POST /api/app/frontier/invite`（is_frontier限定）で配下専用リンク `/invite/{token}?f={自分のpartner_id}` を発行。受諾時に `frontier_id=当該フロンティア・frontier_linked_at=now` で自動紐づけ（invite accept が `f` を反映、invitesのDDL不要）。

## E. 支払い明細の合算
- `lib/frontier-payout.ts augmentBatches()`：各バッチ月の確定/支払 deal から override を算出し、フロンティアの payout_item に上乗せ（item無しは override のみの合成行を追加）。源泉は合算 gross で再計算。
- 反映：`/api/console/payouts`（GET）・CSV（自己/override/総額/源泉/手取の列）・コンソール支払画面（「👑統括」バッジ・override 表記・合算netと総額・合計行）。**payout_items snapshot は読み取りのみ＝不変。**

## F. 検証（demo・本番E2E）
- demo構成：KT8842=フロンティア(top)／SS1203=KT配下(2026-04-01紐付・自身もフロンティア)／IN0907=SS配下(2026-05-01)。
- **ダッシュボード(KT8842)**：今月override **¥19,000**（配下 佐々木の今月成約¥190,000×10%）・稼働率100%・MVP・配下カード「オーバーライド対象 ＋¥19,000」。
- **コンソール支払(本番API)**：5月バッチ＝KT8842 override ¥3,000・SS1203 override ¥12,000(配下IN分・自己item無→合成行)。**4月バッチ＝KT override 0・自己netのみ＝非override/既存不変**。「統括」バッジ描画確認。
- 多段波及なし・12ヶ月外0・非フロンティア不変・既存payout snapshot不変 を確認。
- スクショ：`docs/reports/review_screens/r2/`（frontier_dashboard.png / console_payouts.png）。バックアップ：`docs/reports/r2_partners_backup.json`。

## 不変性
既存 close_month_batch / payout_items は無変更（override は導出・加算のみ）。host/role分離・frozen deal 不変。DDLなしで完遂。
