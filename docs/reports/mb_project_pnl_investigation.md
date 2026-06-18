# MBプロジェクトP&L：現構造 調査レポート

調査日: 2026-06-17 ／ **コード変更・デプロイ・DDL なし（本番は読取のみ）**
対象: `~/mb-partners/app`（Next.js App Router・Supabase・L1〜L3 稼働済）

最終形: 案件＝プロジェクトP&L。
`MB粗利 = 受注額 − （紹介/協力報酬 ＋ フロンティアoverride ＋ デリバリー委託費 ＋ 承認済デリバリー経費 ＋ その他原価）`
ロール: リファラル(済)/フロンティア(済)/MB担当=フロントディレクター(社内・新)/デリバリー=実行委託先(明細単位・新)/セールス(将来)。

---

## 0. 結論サマリ（先に要点）

- **致命的ギャップ＝「受注額（顧客が払う売上）」を確実には持っていない。** `deal_items.amount` は**パートナー報酬額**。率案件のみ `base_amount` に「売上/粗利ベース」が入るが、**固定案件（紹介固定・協力固定・手動）には売上が一切無い**。P&Lの土台に **`deal_items.revenue`（受注額）新設が必須**。
- **粗利＝現状は『運営取り分（協力のみ）』の簡易版**。`opMargin = Σbase_amount(協力) − Σamount(協力) − Σamount(紹介)`。固定案件の売上が無いため、これは正確なMB粗利ではない。
- **凍結/payoutは `deals.amount`（＝パートナー報酬合計）だけを読む**。デリバリー費・経費・MB粗利は**別ストリーム**にすれば `close_month_batch`/`payout_items`/`payout_overrides`/frozen に**一切触れずに**算出可能。
- **内部ユーザー基盤は `profiles.role` にあり**（owner/manager/staff/admin/viewer）が、現在 owner 1名のみ。**案件への「MB担当」アサイン用カラムは無い**（新設要）。
- **Supabase Storage は稼働中**（buckets: `broadcasts`(public), `service-logos`(public)）。経費エビデンス用の**private bucket 追加で対応可能**。
- ⇒ 推奨: **(a)deal_items.revenue 追加 → (b)deliveries/delivery_assignments＋expense_claims(+evidence) → (c)deals.director_id(内部アサイン) → (d)MB粗利は読取専用集約（payout非接触）→ (e)Phase Cはデリバリー専用ロール＋RLS分離**。partnerのpayout/凍結は終始無改修。

---

## 1. 受注額/金額：amount・base_amount の意味（revenueの有無）

| カラム | 意味 | revenue(受注額)か |
|---|---|---|
| `deals.amount` / `deal_items.amount` | **パートナー報酬額**（固定=ref/coop固定値、率=base×率の結果） | ❌ 売上ではない |
| `deals.base_amount` / `deal_items.base_amount` | **率案件の売上/粗利ベース**（`coop_base` ラベルが '売上' or '利益'） | △ 率案件のみ・意味が売上/粗利で揺れる |
| `service_menus` | `ref_value`(紹介報酬)・`coop_value`(協力率/額)・`example_ref`(例示テキスト) | ❌ 顧客価格フィールド無し |

- **fixed案件（紹介固定・協力固定・手動）には『顧客が払う受注額』が存在しない**（報酬だけ）。
- **rate案件は `base_amount` が売上/粗利の代理**だが、`coop_base` が '売上'/'利益' で意味が揺れる（粗利ベースの率もある）。
- ⇒ **正確なP&Lには明細単位の `revenue`（受注額・税抜）を明示保存する新カラムが必須**（§8a）。`base_amount` は「率の計算ベース」として温存。

`deal_items` 実カラム（L1〜L3）: `id, deal_id, service_id, menu_id, kind('fixed'|'rate'), amount, base_amount, sort, created_at, updated_at`。**revenue 列は無い。**

---

## 2. 粗利計算：現コードの算出

`app/console/page.tsx`（ダッシュボード・サーバ集計・表示のみ）:
```
won = deals(status in confirmed/paid, fixed_month=対象月)
coop = won.filter(channel in cooperation/frontier)
ref  = won.filter(channel referral)
coopBase    = Σ coop.base_amount   // 協力の売上/粗利
coopPay     = Σ coop.amount        // 協力パートナー支払(コスト)
referralPay = Σ ref.amount         // 紹介手数料(コスト)
opMargin = coopBase − coopPay − referralPay   // 「運営取り分」
```
- **売上とみなしているのは協力の `base_amount` のみ**。固定の紹介/直販案件の売上は計上されない。
- 引いているのは「協力パートナー支払＋紹介手数料」だけ。**フロンティアoverride・デリバリー費・経費・その他原価は引いていない**。
- ⇒ 現「粗利」は近似。最終形のMB粗利には **revenue＋全コスト**が必要（§8d）。

源泉/手取り: `lib/payout.ts`（`withholdingTax` 個人10.21%）。

---

## 3. フロンティア override（フロンティア報酬）

- 計算: `lib/frontier.ts computeOverrides(deals, partnerById, ym)` = confirmed/paid deal の **`amount × OVERRIDE_RATE(10%)`** を直の親フロンティアに1段だけ加算（12ヶ月窓・自己紐づけ除外）。`reward_snapshot` ではなく **`deals.amount`** を参照。
- 凍結: `lib/frontier-payout.ts freezeOverridesForBatch(admin, batchId, ym)` が締め直後に **`payout_overrides`**（`batch_id, frontier_id, override_gross, rate`）へ upsert。
- 合算表示: `augmentBatches` が closed/paid は凍結値、open はライブ。
- 表示: `app/app/frontier/page.tsx`（フロンティアダッシュボード）。
- ⇒ MB粗利の控除項目として **override_gross（または amount×10%）** を引く。**計算/凍結ロジックは読むだけ**。

---

## 4. パートナーpayout/凍結（触ってはいけない範囲）

| オブジェクト | 何を読む/持つ | いつ凍結 |
|---|---|---|
| `close_month_batch(target_month)` RPC（SECURITY DEFINER・service_role） | confirmed deal の **`SUM(deals.amount)`** を partner別集計 → `payout_items` 作成、batch closed | 月末 cron（28-31）`/api/cron/close-month` |
| `payout_batches` | `id, month, status(open/closed/paid), closed_at, paid_at` | — |
| `payout_items` | `batch_id, partner_id, gross, withholding, net, statement(jsonb)` ＝**凍結スナップショット** | close時 delete→再作成、paidで不変 |
| `payout_overrides` | `batch_id, frontier_id, override_gross, rate` ＝**override凍結** | close直後 freeze |

**🚫 触ってはいけない範囲（最終形でも無改修）:**
`close_month_batch.sql` / `payout_items` / `payout_overrides` / `freezeOverridesForBatch` / `lib/frontier.ts` / `lib/payout.ts` / `app/api/cron/close-month`。
**前提:** これらは「パートナー（紹介/協力/フロンティア）への支払い」専用。**デリバリー委託先への支払いは別テーブル・別バッチ**にして、ここには一切混ぜない（§8d）。

---

## 5. 内部ユーザー/権限（MB担当アサインの土台）

- 認証: コンソールは `profiles.role`（`owner`/`manager`/`staff`/`admin`/`viewer`／非partner）でガード。middleware＋各route の `requireConsole/requireWrite`。招待は `app/api/console/invites`（admin/viewer 役割を招待）。
- 現状: **profiles roles = `owner`×1, `partner`×4**（manager/staff等は未作成だが基盤はある）。
- **案件への「MB担当（フロントディレクター）」アサイン用カラムは deals に無い**（`partner_id`=紹介元パートナー、`created_by`=作成者のみ）。
- ⇒ **新設方針**: 内部ユーザーは `profiles`（role を 'staff'/'director' 等で運用）を流用しつつ、`deals.director_id uuid → profiles.id` を追加（案件単位）。複数の社内担当を管理・選択UIをコンソールに新設（§8c）。「内部ユーザー一覧＋ロール管理」は設定画面に最小追加。

---

## 6. 添付/ストレージ（経費エビデンス）

- **Supabase Storage 稼働中**。bucket: `broadcasts`(public), `service-logos`(public)。migration `20260614000004_storage_service_logos.sql` あり（service ロゴアップロード運用実績）。
- ⇒ 経費エビデンス（領収書 画像/PDF）は **新規 private bucket `expense-evidence`** を作成し、RLSで「申請者本人＋運営のみ閲覧」に。アップロードは署名付きURL or service role 経由。**既存の公開bucketとは分離**（経費は機微情報のため private 必須）。

---

## 7. 明細(deal_items) 現構造（L1〜L3）

- **カラム**: `id, deal_id(FK deals on delete cascade), service_id(text, nullable可・相談), menu_id(uuid), kind('fixed'|'rate'), amount(報酬), base_amount(率ベース), sort, created_at, updated_at`。
- **RLS/GRANT**: `enable row level security` ＋ `service_role` 全権（L1）。partner-read ポリシー（`batchL2_rls.sql`）は **任意**（本番表示は service_role 経由のため未適用でも動作）。
- **確定集約（L2）**: `app/api/console/deals/[id]/route.ts` の成約後段で、**明細1件＝legacy同期／複数＝effectiveKindで再集計**し `deals.amount = Σ(明細reward)`。`lib/deal-reward.ts`(純関数)・`lib/deal-items-recompute.ts`(成約前の見積もり再計算)。
- **編集**: `app/api/console/deals/[id]/items[/[itemId]]`（owner/manager・received/in_progress のみ）。最初の明細追加で `deals.service_id` 充填＋協力タスク実体化（L3）。
- **相談案件（L3）**: `deals.service_id` nullable・`is_consultation`・明細ゼロ起票・0件は成約ガードで確定不可。
- ⇒ **deal_items が「明細単位の経済」の正しい器**。受注額・デリバリー割当・経費を**明細単位**で足す土台が既にある。MB担当は案件単位（deals）。

---

## 8. 実装方針の提案

### (a) deal_items に受注額 `revenue` を追加 ★土台
- 新カラム `deal_items.revenue bigint`（顧客受注額・税抜）。`base_amount` は率計算ベースとして温存（売上/粗利の意味揺れは `revenue` で解消）。
- 作成/編集UI（コンソール明細編集 L2）に「受注額」入力を追加。`revenue` 未入力＝0（相談/未確定）。
- **リスク**: 低。partner報酬(`amount`)・凍結は無改修。表示/集計のみ追加。
- **DDL案**: `alter table deal_items add column if not exists revenue bigint not null default 0;`
- **改修**: 明細編集API/UI、ダッシュボードP&L集計、案件詳細表示。**工数: 小**。

### (b) deliveries / delivery_assignments ＋ expense_claims（エビデンス添付）
- `deliveries`（実行委託先マスタ＝ベンダー）: `id, name, contact_email, status, created_at`。
- `delivery_assignments`（**明細単位**で割当＋委託費）: `id, deal_item_id(FK), delivery_id(FK), fee bigint(委託費), status, assigned_by, created_at`。
- `expense_claims`（経費申請/承認・**明細 or 割当単位**）: `id, deal_item_id(or assignment_id), delivery_id, amount bigint, memo, evidence_path text(Storage), status('pending'|'approved'|'rejected'), submitted_by, approved_by, approved_at, created_at`。承認済のみ原価計上。
- エビデンス: private bucket `expense-evidence`（§6）。
- **リスク**: 中（新モデル・承認ワークフロー）。partner payout 非接触。
- **DDL案**: 上記3テーブル＋RLS（運営=全権・ベンダー=自分の割当/申請のみ）＋ bucket＋ policy。
- **改修**: コンソール（割当/委託費/経費承認UI）＋（Phase C）ベンダーポータル。**工数: 中〜大**。

### (c) MB担当＝内部ユーザー＆案件アサイン
- `deals.director_id uuid`（→ `profiles.id`、role が内部＝非partner）。案件単位。
- 内部ユーザーは `profiles.role`（'director'/'staff' 等）を運用。設定に内部ユーザー管理（招待は既存 `console/invites` 流用）。
- コンソール案件詳細に「MB担当」セレクタ（社内ユーザー一覧から選択）。
- **リスク**: 低〜中。**DDL案**: `alter table deals add column if not exists director_id uuid;`（+任意で index）。
- **改修**: 案件詳細UI＋内部ユーザー一覧API。**工数: 小〜中**。

### (d) 正確なMB粗利を payout/凍結に触れず算出
- **読取専用の集約**（新 `lib/pnl.ts` or DB view `deal_pnl`）で案件/明細ごとに:
  `MB粗利 = Σ revenue − [ Σ partner報酬(=deals.amount由来の紹介/協力) ＋ frontier override(amount×10% or payout_overrides) ＋ Σ delivery_assignments.fee ＋ Σ expense_claims(approved).amount ＋ その他原価 ]`
- **原則**: `deals.amount`/`payout_items`/`payout_overrides`/`close_month_batch` は**読むだけ**。MB粗利は別計算・別保存（必要なら `deals` に `mb_margin_cache` を持つ程度、凍結は別概念）。
- **デリバリー支払い**は **partner payout とは完全に別のストリーム**（新 `delivery_payout_*` or 申請承認ベースの支払台帳）。close_month_batch には混ぜない。
- **リスク**: 低（集約は読取）。**工数: 中**（集計ロジック＋ダッシュボード刷新）。

### (e) Phase C（デリバリー専用ポータル）のRLS/認証分離
- ベンダーは**別ロール**（`profiles.role='delivery'` or 専用 `delivery_users`＋Supabase Auth）。host/role分離は既存の middleware パターンを踏襲（partner=/app, console=/console に倣い **delivery=/vendor**）。
- RLS: ベンダーは**自分に割当られた `delivery_assignments`/`expense_claims`/対象 `deal_items` のみ** SELECT/INSERT（経費申請）可。受注額・MB粗利・他案件・partner報酬は**非公開**。
- エビデンスbucketも当人＋運営のみ。
- **リスク**: 中（新認証面・RLS設計）。**工数: 大**（独立ポータル）。段階導入: ①revenue＋集計(a,d) → ②MB担当(c) → ③deliveries/経費＋承認(b) → ④ベンダーポータル(e)。

---

## 付録: 確認根拠
- 金額意味/粗利: `app/console/page.tsx`・`app/api/console/deals/[id]/route.ts`・`lib/deal-reward.ts`。
- override: `lib/frontier.ts`・`lib/frontier-payout.ts`・`payout_overrides`。
- 凍結: `supabase/migrations/20260613000001_close_month_batch.sql`・`payout_items`。
- ロール: `profiles.role`（本番=owner1/partner4）・`app/api/console/*` のガード・`app/console/settings`。
- ストレージ: `s.storage.listBuckets()` = broadcasts/service-logos・`20260614000004_storage_service_logos.sql`。
- deal_items: L1`batchL1_*`/L2`lib/deal-*`/L3`batchL3_*`・本番カラム実取得。
- revenueギャップ: deal_items/service_menus 実カラムに顧客価格フィールド無しを確認。
