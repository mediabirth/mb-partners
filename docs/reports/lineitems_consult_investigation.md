# 案件の明細化＋相談案件：現構造 調査レポート

調査日: 2026-06-17 ／ **コード変更・デプロイ・DDL なし（本番は読取のみ）**
対象: `~/mb-partners/app`（Next.js App Router・Supabase）

最終形（実装したいゴール）: 1案件＝複数サービス明細（service×金額）、相談案件＝明細ゼロ起票→後から追加、明細増減で金額/報酬を自動再計算、関わり方(紹介/協力)は案件単位、報酬＝明細合計・締めで凍結。

---

## 0. 結論サマリ（先に要点）

- **現状は「1案件＝1サービス(`service_id`+`menu_id`)+1金額(`amount`)」の単一サービス前提**。明細テーブルは無い（`deal_items` は存在しない）。
- **`deals.amount` ＝「パートナー報酬額」**（案件売上額ではない）。売上/粗利のベースは率案件のみ `deals.base_amount` に入る。
- **報酬計算は1箇所に集約**：`app/api/console/deals/[id]/route.ts` の PATCH（成約=confirmed 時）。`effective_kind` ゲート（協力タスク未達→紹介レート）もここ。
- **月次締め・凍結・payout は `deals.amount` だけを読む**（`reward_snapshot` は読まない）。`close_month_batch()` が confirmed deal の `SUM(amount)` を partner 別に集計→`payout_items` に凍結。override は `payout_overrides` に凍結。
- ⇒ **推奨実装は安全に成立**：「`deals.amount` を明細合計の集約として維持し、内訳は新表 `deal_items`、凍結は従来どおり集約値を snapshot」。frozen/snapshot/close_month_batch/payout/billing は**無改修**で済む。改修は「明細CRUD＋amount再集計＋表示」に限定できる。

---

## 1. `deals`（案件）の現データ構造

実DB全カラム（service_role で確認）:
`amount, base_amount, calendar_event_id, channel, company_name, consent, contact_name, created_at, created_by, customer_email, customer_name, customer_type, effective_kind, fixed_month, id, internal_memo, lost_at, lost_note, lost_reason, meeting_at, meeting_url, menu_id, partner_id, reward_snapshot, service_id, source, status, updated_at`

| カラム | 型/値 | 意味 |
|---|---|---|
| `id` | uuid | 案件ID |
| `partner_id` | uuid | 担当パートナー（`partners.id`） |
| `service_id` | text（例 `moom`,`reso`） | **単一サービス**（services.id） |
| `menu_id` | uuid | **単一メニュー**（service_menus.id）。報酬レートの参照元 |
| `channel` | enum `deal_channel` | **関わり方（案件単位）**：`referral`(紹介)/`cooperation`(協力)/`direct`(直販)/`frontier`(旧称・協力扱い) |
| **`amount`** | bigint | **パートナー報酬額**（売上額ではない）。固定=ref/coop固定額、率=base×率の結果 |
| **`base_amount`** | bigint/null | 率案件の**実額ベース（売上/粗利）**。協力ダッシュボードの「協力売上/粗利」はこれの合計 |
| `status` | enum `deal_status` | `received`/`in_progress`/`confirmed`/`paid`/`lost` |
| `effective_kind` | text（Batch P追加） | ゲート結果。協力で必須タスク未達→`referral`、達成→`cooperation` |
| `reward_snapshot` | jsonb | **作成時のメニュースナップ＋確定時の計算情報**（rate/base_amount/base_label/computed/effective_kind/gate_reason 等）。**※payoutは読まない・表示/監査用** |
| `fixed_month` | date/null | 計上月（締めの帰属月）。null時は created_at の月 |
| `consent` | bool | 顧客同意 |
| `source` | text | `link`/`qr`/`partner_form`/`manual` 等 |
| `customer_name`/`customer_type`/`company_name`/`contact_name`/`customer_email` | text | 顧客情報（customer_email は Batch B-2 追加・任意） |
| `meeting_at`/`calendar_event_id`/`meeting_url` | — | 商談日時・Google Calendar イベント・Meetリンク（Batch M） |
| `lost_at`/`lost_reason`/`lost_note` | — | 不成立メタ（Batch N） |
| `internal_memo` | text | 社内メモ（電話番号等） |
| `created_by`/`created_at`/`updated_at` | — | 監査 |

**金額の関係（重要）**: `amount = reward（報酬）`、`base_amount = 売上/粗利ベース`。
- 固定（紹介/協力固定）: `amount = ref_value`（or coop固定値）、base_amount は使わない。
- 率（協力 rate・紹介 rate）: 確定時 `amount = round(base_amount × rate%)`。

---

## 2. 報酬計算：どこで・どう算出するか

**算出は1箇所に集約**：`app/api/console/deals/[id]/route.ts`（コンソールの案件 PATCH）。

フロー（成約=confirmed 時、または率案件で実額入力時）:
1. メニュー（`service_menus`）の `coop_*`（coop_type fixed/rate, coop_value, coop_base）と `ref_*`（ref_type, ref_value, ref_base）を取得。
2. **協力タスクゲート(Batch P)**: `lib/coop-tasks.requiredTasksDone(admin, dealId)` で `deal_tasks` の必須完了を判定。
   - `effective_kind = (channel==='cooperation' && 必須全完了) ? 'cooperation' : 'referral'`（**fail-open**：`deal_tasks` 無/エラーは true=協力維持）。
3. 採用レート: `effective_kind==='cooperation'` → `coop_*`、協力ダウングレード → `ref_*`、生来の紹介 → 従来どおり `ref_*`。
4. 計算:
   - 固定: `amount = fixed値`。
   - 率: `amount = round(base_amount × rate / 100)`（base未入力なら 400 needsBase を返しコンソールが実額入力モーダルを出す）。
5. 記録: `reward_snapshot` に `{rate, base_amount, computed, effective_kind, gate_reason}` を保存、`deals.effective_kind` 列にも best-effort 保存、ダウングレード時は非公開 deal_event を追加。

**作成時の初期 amount**（`app/app/refer/actions.ts` / `app/api/referral/route.ts`）:
- 固定 → 即 `amount=固定値`、率 → `amount=0`（確定時に base×率で確定）。`reward_snapshot = menu`（メニュー丸ごと）。

**源泉/手取り**: `lib/payout.ts`（`withholdingTax` 個人10.21%・`close_month_batch` の `ROUND(gross*0.1021)` と一致保証）。

**override（フロンティア統括報酬）**: `lib/frontier.ts computeOverrides` が confirmed/paid deal の **`amount × 10%`** を集計（`reward_snapshot` ではなく `amount`）。

> **amount と reward の関係（明確化）**: `deals.amount` がそのまま「その案件のパートナー報酬」。payout・override・ダッシュボード・支払明細はすべて `deals.amount`（の合計）を真実とする。`reward_snapshot` は内訳/監査の付帯情報で**支払ロジックは読まない**。

---

## 3. 凍結・snapshot・close_month_batch・payout

**月次締めバッチ**: `supabase/migrations/20260613000001_close_month_batch.sql` の関数 `close_month_batch(target_month)`（SECURITY DEFINER・service_role のみ）。`app/api/cron/close-month/route.ts`（Vercel Cron 28-31）が呼ぶ。冪等。

読むもの・凍結するもの:
- 対象: `WHERE d.status='confirmed'` かつ（`fixed_month` の月 or なければ `created_at` の月）= 対象月。
- 集計: partner 別に **`SUM(d.amount)::bigint AS gross`**（＝**deals.amount のみ**を合算。reward_snapshot は読まない）。
- 源泉: 個人のみ `ROUND(gross*0.1021)`、net=gross−wh。
- **凍結先 = `payout_items`**（`batch_id, partner_id, gross, withholding, net, statement(jsonb=deals内訳)`）を毎回 delete→再 insert。`payout_batches` を `closed` に。`status='paid'` のバッチは再締め不可（例外）。
- partner へ通知(notifications) を作成。

**override 凍結**: `lib/frontier-payout.ts freezeOverridesForBatch` が締め直後に `payout_overrides`（`batch_id, frontier_id, override_gross, rate`）へ「締め時点の料率・紐づけ・金額」を upsert。`augmentBatches` で closed/paid は凍結値、open はライブ。

**いつ凍結されるか**: 月末の close 実行時（payout_items 作成＋payout_overrides 凍結）。以後 paid になると変更不可。

**要点（明細化への含意）**: 凍結スナップショットは `payout_items`/`payout_overrides` であり、その入力は**`deals.amount`**。`deals.amount` を正しく保てば凍結ロジックは一切触らなくてよい。

---

## 4. サービス/メニューの持ち方・単一サービス前提箇所

- マスタ: `services`（id=text 例 moom/mh/reso/live/dx, name, icon, color, logo_path, sort…）、`service_menus`（id, service_id, name, sort, **ref_***[ref_type/value/base/trigger/months/enabled], **coop_***[coop_enabled/type/value/base/coverage/condition], coverage_steps, qualification 等）。
- **deal は `service_id`+`menu_id` を各1つ**しか持たない（単一サービス前提のコア）。
- 単一前提のクエリ（`lib/supabase/queries.ts`）: `getPartnerWithDeals`/`getDealWithEvents`/`getAllDeals`/`getDealsForConsole` すべて **`services(...)` と `service_menus(...)` を1対1 join**（行15,25,71-72,83,131-133）。
- 報酬計算は `deal.menu_id` → `service_menus` の単一メニューに依存（§2）。
- 協力タスクテンプレ `cooperation_task_templates` は `service_id`+`menu_id(null可)` 単位 → deal の単一 service/menu に紐づけて実体化。

---

## 5. 案件作成フロー（サービス・金額・channel の受け方）

主に2経路。いずれも**単一サービス**で保存:
- `app/app/refer/actions.ts submitPartnerReferral`（パートナーのフォーム）: `serviceId, menuId, channel('referral'|'cooperation'), customer*` を受け、メニューから初期 `amount`（固定=値/率=0）を決定、`deals` に `service_id, menu_id, channel, amount, reward_snapshot=menu` を1行 insert。協力なら `instantiateDealTasks` でタスク生成。
- `app/api/referral/route.ts`（紹介リンク/QR）: token→link→service の1メニューで `channel='referral'` deal を insert。
- `app/api/console/deals/route.ts POST`（コンソール手動）: `customer_name, service_id, channel, amount…` を受け1行 insert。
- 相談案件（明細ゼロ）に相当する仕組みは**現状なし**（必ず service_id 必須）。

---

## 6. 表示箇所の洗い出し（明細化で改修が要る箇所）

`amount`（単一）/`services.name`（単一）/`ServiceAvatar`（単一）を前提に表示している主な箇所:

**APP（パートナー）**
- `app/app/page.tsx`: 残高カード（confirmedBalance/今月確定/累計＝amount合計）、StatCard「見込み報酬」(pipeline=Σamount)、最近の動き（ServiceAvatar＋ChannelMark）、やること（商談＋協力タスク）。
- `app/app/cases/page.tsx`: 一覧カード＝`ServiceAvatar(d.services)`＋客名＋`ChannelMark`＋`¥d.amount`（副次）＋不成立バッジ＋ステッパー。**単一サービス前提**。
- `app/app/cases/[id]/page.tsx`: ヘッダ `ServiceAvatar(svc)`＋`ChannelMark`、情報テーブル（報酬予定額=`deal.amount`／サービス=`svc.name`／メニュー=`menu.name`）、協力なら `TaskChecklist`。**単一サービス前提**。
- `app/app/rewards/page.tsx`: paidGross/confirmedGross（Σamount）、月別 deal 一覧（`d.amount`・`services.name`・`ChannelMark`・status）。
- `app/app/rewards/statement/page.tsx`＋`StatementClient.tsx`: 明細行 `摘要 = ${customer_name} / ${services?.name}`、`区分`、`金額=amount`、源泉、差引。**1行1案件＝1サービス前提**。

**コンソール**
- `app/console/deals/page.tsx`: ボードカード（ServiceAvatar・客名・ChannelMark・`¥amount`/不成立理由）、アーカイブ一覧、詳細パネル（サービス名／チャネル／報酬予定=amount／実績金額 base_amount 編集／effective_kind・gate_reason／rateInfo）。**単一サービス前提が濃い**。
- `app/console/page.tsx`（ダッシュボード）: 運営取り分 = `Σbase_amount(協力) − Σamount(協力) − Σamount(紹介)`、KPI（成約数・粗利=Σbase_amount・成約率・対応中パイプライン=Σamount）、6ヶ月推移、要対応、最近の動き。**amount/base_amount 集計に依存**。
- `app/console/payouts/*`: `payout_items.gross/net` と `statement` jsonb（deal内訳）を表示。
- `app/console/tasks/*`（Batch P）: テンプレ CRUD（service×menu）。

**コンポーネント**
- `components/ServiceAvatar.tsx`/`ServiceIcon.tsx`: **1サービス**のロゴ/モノグラム。
- `components/ChannelMark.tsx`: channel（案件単位なので明細化後も案件単位でOK）。

> 明細化で「複数サービスを1案件に表示」する必要があるのは主に: 案件一覧カード（代表サービス＋「他N件」 or 複数アバター）、案件詳細（明細リスト）、コンソール詳細パネル（明細CRUD）、支払明細（1案件で複数行 or 内訳）。金額表示は「案件合計＝Σ明細」に置換。

### 6-b. 行レベル詳細インベントリ（display sweep でcross-check済）

**単一サービス前提（`d.services.name` / 単一 `ServiceAvatar` / `d.service_id`）＝改修必須:**
- APPホーム `app/app/page.tsx`: L210 商談の `services?.name||service_menus?.name`、L235 協力タスク行の `services.name`、L274 最近の動き `ServiceAvatar`。
- 案件一覧 `app/app/cases/page.tsx`: L124 `ServiceAvatar`。
- 案件詳細 `app/app/cases/[id]/page.tsx`: L59 ヘッダ `ServiceAvatar`、L119 情報表のサービス名。
- 報酬 `app/app/rewards/page.tsx`: L108 `ServiceAvatar`、L115 `services?.name`。
- 支払明細 `app/app/rewards/statement/page.tsx`: L51 摘要 `customer / services?.name`（1行=1サービス前提）。
- 紹介フォーム `app/app/refer/page.tsx`: L253/L277 サービス選択（作成側・明細選択に拡張）。
- コンソール案件 `app/console/deals/page.tsx`: L346/L350 アーカイブ、L426 ボードカード、L481 詳細パネルのサービス名。
- **コンソール パートナー詳細 `app/console/partners/[id]/page.tsx`: L254 deal一覧の `services?.name`**（§6本文で過少記載だった箇所・要改修）。

**金額（`amount`/`base_amount`）表示・集計（合計表示への置換／集計はΣで概ね無改修）:**
- APP: home L42/46/47/51/130（pipeline/今月/累計/次回振込/残高）、cases L133、detail L118、rewards L33/34/35/92/120、statement page L42/57/63・StatementClient L116。
- コンソール: dashboard L69(`base_amount`)/70/71/93、deals L456(ボード)/485/516/520(詳細 amount/base/計算結果)、**partners list `app/console/partners/page.tsx` L45 Σ・L163 表示**、**partners 詳細 L110 累計・L260 行金額**、payouts L82-84/133/140/147/216/222/225/235/238（payout_items/override 集計＝**完全に payout 由来＝無改修**）。

→ 改修の本丸は「単一サービス表示」の8系統と「1案件=1金額」を「案件合計＋明細内訳」に置換する表示層。payouts/ダッシュボードの集計はΣ系で `deals.amount` 集約方式なら無改修。

---

## 7. 協力タスクとサービスの紐付き（明細化時の単位）

- 現状: `cooperation_task_templates`（service_id+menu_id単位）→ 協力deal作成時に **`deal_tasks(deal_id, …)` を deal 単位で実体化**。`channel` は案件単位、`deal` は単一サービスなので「タスク＝案件＝サービス」が現状一致。
- ゲートも **deal 単位**（`requiredTasksDone(dealId)`）。
- **明細化した場合の論点**: 関わり方(協力)は案件単位の方針なので、**タスクは引き続き「案件単位」が自然**（混在なし前提）。ただしテンプレは service/menu 由来 → 「明細を追加したら、その service/menu のテンプレ分タスクを案件に追記する」設計が要る（タスク自体は deal_id 紐付けのまま、複数サービス分が1案件に集まる）。明細単位タスクにするなら `deal_tasks` に `deal_item_id` を足す拡張も可能だが、ゲート判定は案件単位を維持するのが最小改修。

---

## 8. 実装方針の提案（frozen/snapshot/payout を壊さない）

### 推奨案（採用可・低リスク）: 「`deals.amount` を明細合計の集約として維持」
- 内訳は新表 **`deal_items(deal_id, service_id, menu_id, channel?, amount, base_amount?, reward_snapshot?, sort, created_at)`** に複数行で保持。
- **`deals.amount` / `deals.base_amount` は『明細の合計』として常に再集計して保持**（書込のたび、または確定時に集約）。
- 締め・凍結・payout・override・ダッシュボードは**従来どおり `deals.amount`/`base_amount` を読む** → **無改修**。`payout_items`/`payout_overrides` snapshot も無変更。

**可否・リスク**
- ✅ 可。close_month_batch・payout・frozen・billing は `deals.amount` しか見ないため、集約値さえ正しければ完全に非接触。
- ⚠ リスク1: **集約の整合性**。明細追加/削除のたびに `deals.amount`(=Σ報酬)・`base_amount`(=Σベース) を必ず再計算する単一関数を用意し、全 mutation 経路から呼ぶ（DBトリガーでも可だがアプリ層集約が現コードと整合的）。
- ⚠ リスク2: **締め後の明細追加**。方針どおり「締め後は新規案件 or 再オープン」。確定/凍結済み deal の明細を編集して `amount` が動くと payout 整合が崩れる → **confirmed/paid の deal は明細編集をロック**（received/in_progress のみ編集可）。
- ⚠ リスク3: **率案件の base_amount**。明細ごとに base/率が異なり得る → 明細単位で `amount=round(base×rate)` を計算し合算。`deals.base_amount` は「Σ明細base」。
- ⚠ リスク4: **協力タスク**は案件単位維持（§7）。明細追加時にテンプレ分を追記。
- ⚠ リスク5: **相談案件（明細ゼロ）**。`service_id` を nullable 化 or 「相談用ダミー」回避が必要。現在 `service_id` は NOT NULL 前提・作成経路が必須。**`deals.service_id`/`menu_id` を nullable 化**し、相談案件は明細ゼロ＝amount 0・status 'received' で起票、面談後にコンソールから明細追加。表示は service_id null を「相談（サービス未定）」と扱う分岐を全表示箇所に追加。

**必要DDL案（提案のみ・未実行）**
```sql
-- 明細テーブル
create table deal_items (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  service_id text not null,
  menu_id uuid,
  amount bigint not null default 0,        -- この明細の報酬
  base_amount bigint,                      -- 率案件のベース
  reward_snapshot jsonb,                   -- 明細のレート内訳
  sort int not null default 0,
  created_at timestamptz not null default now()
);
-- 相談案件のため deal の service/menu を nullable に（要影響確認）
alter table deals alter column service_id drop not null;  -- ※現状の NOT NULL/参照を確認の上
-- deals.amount/base_amount は据え置き（明細合計の集約）
-- （任意）deal_tasks に明細紐付けを足すなら： alter table deal_tasks add column deal_item_id uuid;
```

**改修ファイル一覧（見積）**
- 集約ロジック: 新 `lib/deal-items.ts`（明細CRUD＋`recomputeDealAmount(dealId)`）。
- 作成: `app/app/refer/actions.ts`・`app/api/referral/route.ts`・`app/api/console/deals/route.ts`（単一→明細1行 or 相談=0行）。
- 確定/報酬: `app/api/console/deals/[id]/route.ts`（confirm時に明細から amount 集約・effective_kind ゲートは案件単位維持）。
- コンソール明細CRUD UI: `app/console/deals/page.tsx` 詳細パネル＋新 API `/api/console/deals/[id]/items`。
- 表示: `app/app/cases/page.tsx`・`cases/[id]/page.tsx`・`rewards/page.tsx`・`rewards/statement/*`・`app/app/page.tsx`・`app/console/page.tsx`（代表サービス＋他N件／明細リスト／合計表示）。
- クエリ: `lib/supabase/queries.ts`（`deal_items(...)` join を追加）。
- 協力タスク: 明細追加時テンプレ追記（`lib/coop-tasks.ts`）。
- **非改修（重要）**: `close_month_batch`・`lib/frontier*.ts`・`lib/payout.ts`・`payout_items`/`payout_overrides`・billing。

**工数感（ざっくり）**
- データ層（deal_items＋集約＋作成/確定改修）: 中（要テスト・money path 近接だが集約値で隔離）。
- 表示層（一覧/詳細/明細CRUD/支払明細の複数行対応）: 中〜大（箇所が多い・§6の全所）。
- 相談案件（service nullable＋全表示の null 分岐）: 中（横断的）。
- 合計: **中〜大の1〜2バッチ規模**。money path は集約方式で隔離できるため、リスクは「表示の網羅」と「締め後ロック」「集約整合」に集中。段階導入推奨（①deal_items＋集約・既存は1明細にバックフィル → ②コンソール明細CRUD＋確定集約 → ③相談案件 → ④支払明細/ダッシュボードの複数行表示）。

---

## 付録: 確認した実構造の根拠
- `deals` 全カラム = 本番 service_role 読取。`deal_items` は存在せず（MISSING）。
- 報酬計算 = `app/api/console/deals/[id]/route.ts`（PATCH confirm）。源泉 = `lib/payout.ts`。
- 締め = `supabase/migrations/20260613000001_close_month_batch.sql`（`SUM(d.amount)`→`payout_items`）。override凍結 = `lib/frontier-payout.ts`→`payout_overrides`。
- 単一サービス join = `lib/supabase/queries.ts`。作成 = `app/app/refer/actions.ts` 他。
- 協力タスク = `cooperation_task_templates`/`deal_tasks`（deal単位・Batch P）。
