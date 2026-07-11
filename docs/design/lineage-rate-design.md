# 系統連動レート（Lineage-Linked Rate）— 診断・設計書

- 版: **v2**（独立レビュー `lineage-rate-review.md` の指摘＋確定裁定8件を反映 / **実装・DDL・デプロイなし**）
- 改訂履歴: v1=Opus 4.8作成 → 独立レビュー=Fable 5 → **v2改訂=Fable 5（claude-fable-5）**
- 対象: 外部サプライヤー搭載のための手数料機構。初号サプライヤー＝**オムニス（高さん／投資用マンション・保険）**。
- 原則: 本書は**設計のみ**。money計算の「意味」に触れる拡張のため、**本書v2を勝彦＋Claudeが承認してから**実装バッチを発行する。診断は実データ**読み取りのみ**（書込・DDL・デプロイ一切なし）。
- 現状データ実測（read-only）: `menu_rewards` 16行/sum=**340,100**、`is_frontier` **1名（勝彦本人・配下0・payout_overrides凍結0行）＝override機構は未実運用**、`services` 6件（supplier列なし）、continuous案件0件、`billing/invoice/charge/supplier` テーブル皆無（＝請求は完全新規ドメイン）。

## v1→v2 変更要旨（確定裁定の反映）

| # | 裁定 | v2での反映 |
|---|---|---|
| 1 | **2段凍結を採用** | §2を全面改訂：成約時＝**条件のみ**凍結（fee_snapshot）／金額＝**月次請求クローズ時**に `supplier_charges` へ凍結。`mb_fee_amount` 列は**廃案**。 |
| 2 | **money検証＝全行スナップショットハッシュ方式** | §5を改訂：menu_rewards の固定定数（16行/¥340,100）をバッチ開始時全行ハッシュへ置換（MB seed照合は補助チェックとして存置）。 |
| 3 | **法人override＝12ヶ月窓バイパス・契約ベース** | §4(c)を改訂（※勝彦承認前提の起案）。 |
| 4 | **5%ベース＝報酬総額（税抜・源泉前）・継続は月次追撃** | §4(b)を改訂（2段凍結が自然に処理）。 |
| 5 | **F1/F2の明確化** | 折半ベースの正式定義＝**override控除前**（§4(a)・私案）／全deal生成経路での条件凍結の網羅（§2）。 |
| 6 | **backfill再実行ガード** | §4(c)に仕様追加：凍結済みバッチは再凍結不可。 |
| 7 | **盲点9件を定義** | §7を新設（各1項）。 |
| 8 | **P0-a/b再定義＋規模再見積り** | §6を改訂。 |

---

## 0. 用語と全体像

- **系統（lineage）**: あるフロンティア配下のパートナー群。現行frontier機構（`partners.frontier_id` の1段親子）と同一概念。**Phase 0は1段のみ**（配下の配下は含めない・現行コード `lib/frontier.ts:34-36` と一致）。
- **サプライヤー**: 実務対応を自社で行う外部事業者。オムニス＝サプライヤー、先方の業務委託者＝そのサプライヤーの**デリバリー**（既存機構）。
- **系統連動レート**: 「どの系統のパートナーが・どのメニューへ持ち込んだか」の組合せでMB手数料の種別と率/額が決まる仕組み。

確定済みビジネス条件（標準レートカード・変更不可）→ 4つのお金の流れ:

| # | 条件 | 向き | お金の流れ | カテゴリ |
|---|---|---|---|---|
| 1 | 入会金・月額ゼロ | — | なし | 実装不要 |
| 2 | 他系統(MB含む)→当該サプライヤーメニュー | MBが**請求** | (a) 折半＝案件**粗利(税抜)の50%** | 新規（請求） |
| 3 | 当該サプライヤー系統→MBメニュー | MBが**支払** | (c) 法人フロンティアoverride（会社版） | 既存流用＋窓バイパス |
| 4 | 当該サプライヤー系統→自社メニュー | MBが**請求** | (b) 決済手数料＝**パートナー支払額の5%**（上乗せ・受取不減額）／override無効 | 新規（請求） |
| 特例 | オムニス＝ファウンディング | (b)に代え | (d) **月額¥50,000（税別）固定** | 新規（請求・定額） |

---

## 1. 系統判定（設計項目1）

### 現行データ経路（診断・v1から不変）
- 案件の紹介パートナー＝`deals.partner_id`（money帰属の正典列）。系統＝`partners.frontier_id`（→`partners.id`）＋`frontier_linked_at`。
- 既存override＝`lib/frontier.ts computeOverrides`：1段のみ・`d.amount×10%`・12ヶ月窓・`payout_overrides`凍結。設定入口＝`FrontierControls`→`PATCH /api/console/partners/[id]`、招待経由＝`api/invite/accept/route.ts:198-206`。

### 設計
- 系統判定関数 `lib/lineage.ts`（純関数・read-only）:
  ```
  resolveLineage(deal, partnerById, supplierByService) → {
    referrer_partner_id,          // deals.partner_id
    referrer_frontier_id,         // partners.frontier_id（null＝MB系統）
    menu_supplier_partner_id,     // 案件メニューの属するサプライヤー（null＝MBメニュー）
    self_service,                 // referrer_frontier_id === menu_supplier_partner_id
    cross_supplier,               // referrer_frontier_id がサプライヤーで、かつ別サプライヤーのメニュー（§7-6・Phase 0対象外の記録）
  }
  ```
- **多段（配下の配下）＝非採用**（Phase 0は1段固定。多段は将来別設計・再帰CTE化）。自己紐づけは現行同様無視。

---

## 2. 2段凍結（設計項目2・裁定1＝v2の中核）

### 思想
v1の「成約時に条件＋金額を凍結」は、Phase 0のオムニス報告フロー（**売上は成約後に運営入力**・revenueはconfirmed後も編集可＝`items/[itemId]/route.ts:33-45`）と矛盾し、折半が¥0で凍結される欠陥があった（レビュー指摘）。v2は**条件と金額の凍結を分離**する:

### 第1段：条件の凍結（`deals.fee_snapshot` jsonb・成約確定時）
```jsonc
{
  "version": 2,
  "lineage_kind": "supplier" | "mb",
  "referrer_partner_id": "<uuid>",
  "referrer_frontier_id": "<uuid|null>",
  "menu_supplier_partner_id": "<uuid|null>",
  "self_service": true | false,
  "cross_supplier": false,                    // Phase 0では常にfalse想定・記録のみ
  "rate_kind": "half_commission" | "payment_fee_5" | "corporate_override" | "omnis_monthly" | "none",
  "direction": "charge" | "pay" | "none",
  "rate": 0.5 | 0.05 | 0.10 | null,
  "rate_card_version": "std-v1" | "omnis-founding-v1"
}
```
- **金額は入れない**（`mb_fee_amount` 列は廃案）。後からの系統変更・レートカード改定が確定案件に波及しない保証は、この条件凍結で担保。
- **凍結ポイント＝全deal生成経路を網羅**（裁定5・F2対応）:
  1. `app/app/refer/actions.ts`（パートナー紹介・received起票）— 暫定条件を焼く
  2. `app/api/referral/route.ts`（/r/ 顧客相談起票）— 暫定条件を焼く
  3. `app/api/console/deals/route.ts`（**直営業＝confirmed直行**）— 起票時に確定条件を焼く
  4. `app/api/console/deals/[id]/route.ts`（confirm PATCH）— **confirmを通過するたび上書き再凍結**（差し戻し→再成約も同一規則。確定済みsupplier_chargesが存在する場合は警告表示）
  - フォールバック: 請求クローズ時に「supplierメニューなのに fee_snapshot=null の confirmed deal」を検知し警告（§7-9で監視にも接続）。fee_snapshot=null＝従来MB案件（手数料対象外）の後方互換は維持。

### 第2段：金額の凍結（`supplier_charges`・月次請求クローズ時）
`delivery_payout_items` パターン（凍結スナップショット＋状態機械）を踏襲した新テーブル（**追加型・既存money非接触**）:
```
supplier_charges:
  id, supplier_partner_id, deal_id (nullable=月額等の非案件行),
  kind ('half_commission'|'payment_fee_5'|'omnis_monthly'),
  period (YYYY-MM),
  base_amount bigint,        -- 凍結時点の適用ベース（折半=粗利税抜／5%=報酬総額）
  rate numeric,              -- 0.5 / 0.05 / null(月額)
  amount bigint,             -- 請求額（税抜）
  tax_treatment text default 'taxable_excl',   -- §7-1
  snapshot jsonb,            -- 自己完結の根拠（顧客ラベル・入力値内訳・fee_snapshot写し）→ deal取消にも耐える
  status ('unbilled'|'invoiced'|'settled'),
  frozen_at, invoiced_at, settled_at, note, created_at, updated_at
  unique(deal_id, kind, period)（deal行）／unique(supplier_partner_id, kind, period)（月額行）
```
- **月次請求クローズ（Phase 0＝コンソール手動アクション・owner/manager）**: サプライヤー×月を指定→当月分の (a)(b)(d) をその時点の確定入力から算出して凍結。**以後の入力変更（revenue追記・経費承認等）は凍結済み請求に波及しない**。
- 取消: `unbilled` の間のみ凍結解除可（`invoiced`以降は不可）＝ delivery_payout_items の DELETE 規則と同型。
- 継続報酬の5%（裁定4）: 月次クローズが当月の `continuous_payouts.confirmed_amount` を拾って追撃計上＝2段凍結が構造的に処理。
- CC不変監査: **fee-hash** `md5(string_agg(snapshot::text||amount::text order by id)) from supplier_charges` を検証標準に追加（reward-hashと同型・§5）。

---

## 3. サプライヤーモデル（設計項目3・v1から実質不変）

- **`services.supplier_partner_id uuid`**（→`partners.id`・is_frontier会社フロンティア・null＝MB自社）を追加。オムニス＝services 1行＋is_frontierパートナー1件（高さんの法人）。
- 「自社メニュー」＝`supplier_partner_id=X` のサービス配下、「当該系統」＝`frontier_id=X` のパートナー群。
- 先方業務委託者＝既存 `deliveries`（`service_id` で紐づけ）＋ `delivery_assignments`。委託費/経費/支払は既存機構。
- **Phase 0の売上/粗利報告**: 先方報告値を運営がコンソール入力（既存入口流用・新UI不要）: revenue（`items/[itemId]`）・other_cost（`pnl`）・base_fee・expense_claims。全て `['owner','manager','admin']` ガード（既存 `requireWrite`）。
- **登録フロー要件（§7-2）**: サプライヤーpartner行は **`tax_type='corporate'` 必須**。

---

## 4. お金の流れ（設計項目4）

### (a) 折半手数料 — MBがサプライヤーへ請求
- 発火: `fee_snapshot.rate_kind='half_commission'`（他系統→当該サプライヤーメニュー）。
- **ベースの正式定義（裁定5・F1解決・私案＝承認事項）**:
  **折半ベース＝「受注額(税抜) − 委託費 − 承認済経費 − その他原価」＝ frontier override 控除前**。契約書と同じ言葉で定義する。
  - 実装注意: 既存 `grossBeforeReward`（`_parts.tsx:137-140`）は **`_frontier_override` を控除している**ためそのまま流用しない。**専用関数 `supplierChargeBase(deal)`**（override を引かない）を新設し、既存関数・既存率報酬のbaseは**一切触らない**。
- 計算: `amount = round(supplierChargeBase × 0.5)`。**月次請求クローズ時に凍結**（第2段）。
- 経済性: (a)の対象案件でMBは自らの半分から紹介パートナー報酬・MB系override を負担する（§7-7の逆ザヤ防止と対）。

### (b) 決済手数料5% — MBがサプライヤーへ請求
- 発火: `rate_kind='payment_fee_5'`（同系統→自社メニュー）。MB手数料本体0%・override無効（(c)の抑止）。
- **ベース＝「当該案件でMBがパートナーへ支払う報酬総額（税抜・源泉徴収前）」（裁定4・確定）**:
  - fixed/rate 案件＝凍結済み `deals.amount`（源泉前グロス）。
  - **継続案件＝月次クローズごとに当月 `continuous_payouts.confirmed_amount` の5%を追撃計上**。
  - 源泉はベースに影響しない（源泉は支払時に `lib/payout.withholdingTax` が適用・snapshotに入らない現行構造のまま）。
- **パートナー受取の不減額（構造保証）**: 5%は `supplier_charges`（請求）にのみ記録され、`payout_items`／`close_month_batch`／継続支払には**一切入らない**。パートナー受取は構造的に不変。実装バッチで「partner net 不変」を実測項目化。

### (c) 法人フロンティアoverride — MBがサプライヤーへ支払（既存流用＋2改修）
- 発火: 当該サプライヤー系統→MBメニュー。サプライヤーをis_frontierパートナー登録し系統の `frontier_id` を張れば既存 `computeOverrides`（10%×`deals.amount`）で発火。`payout_overrides` 凍結・支払管理表示も既存のまま。
- **改修1＝自己サービス抑止**: `fee_snapshot.self_service===true` の deal を override 対象外にするガードを `computeOverrides` に追加（唯一のmoney意味変更）。fee_snapshot=null（旧案件）は抑止しない＝後方互換。
- **改修2＝12ヶ月窓バイパス・契約ベース（裁定3・※勝彦承認前提の起案）**: サプライヤー系統（frontier がいずれかの `services.supplier_partner_id` に一致）の override は `withinWindow` を適用せず、**契約有効期間中は継続・解約で停止**。Phase 0 の契約状態＝サプライヤーpartner行の `status`（active=有効／suspended=解約・停止）を正とする。個人フロンティアの12ヶ月窓は現行のまま不変。
- **改修3＝backfill再実行ガード（裁定6）**: `freezeOverridesForBatch`／`POST /api/console/payouts/freeze-overrides` は、**当該バッチに `payout_overrides` 行が既に存在する場合は再凍結せずskip**する仕様へ（「凍結済みは不変」をコードで強制。現行はdelete-then-insertで“現時点の料率”により再計算されるハザードがあった）。現在凍結0行のため移行影響なし。
- 導入時の表示注意: openバッチはlive再計算のため、ガード導入デプロイの瞬間に当月override表示が変わり得る（運用告知に含める）。pnl表示（mbMarginはoverride控除）も同時に動く＝ダッシュボード数字の変動を回帰確認に含める。

### (d) オムニス月額¥50,000（税別）— 定額請求
- 月次クローズが `supplier_charges` に月額行（deal_id=null・kind='omnis_monthly'・amount=50000・税別）を1行計上（Phase 0は手動）。
- 起算・按分は契約書定義（§7-4）。標準移行（(d)→(b)）は `rate_card_version` の切替＝以後に成約する案件の fee_snapshot から `std-v1` が焼かれる（凍結済み条件・請求は不変）。

### 請求記録と表示
- 置き場＝`supplier_charges`（上記）。**compute-on-read単独案は廃案**（revenueが可変で請求額が動くため・レビュー指摘）。
- コンソール「サプライヤー請求」ビュー（読み取り・月別/案件別集計・CSV）。**支払管理（MBが払う）とは別画面に厳密分離**。Phase 0の請求書発行は運用の手動。

---

## 5. 既存不変条件との整合（設計項目5・裁定2反映）

| 既存不変条件 | 影響 | 対応 |
|---|---|---|
| **menu_rewards 16行/¥340,100** | サプライヤーメニュー追加で行数超過が不可避 | **検証方式を置換（裁定2）**: バッチ開始時に**全行スナップショットハッシュ** `md5(string_agg(id||reward_type||reward_value||coalesce(reward_base,'')||active::text, ',' order by id))` を記録し終了時に突合（「変わったら誰の操作か突合」＝reward-hashと同運用）。**MB seed照合（supplier分を除外したjoinで16行/¥340,100）は補助チェックとして存置**。CLAUDE.md検証標準の文言改定は実装バッチの承認事項。 |
| **deals reward-hash** | サプライヤー案件の正当な成約で変わる | 既存運用どおり（帰属突合）。reward_snapshot/amount の計算式は不変。 |
| **確定ガード** | fee_snapshot（条件）を確定後に触られない必要 | confirm通過時の上書き再凍結のみを正規経路とし、それ以外の書込禁止。金額は deal 側に持たない（2段凍結）ため `ensureEditable` の拡張は**不要になった**（v1から簡素化）。 |
| **canon 61 assertion** | ステータス遷移/メール/3面ラベルに非接触 | green維持見込み。confirm side-effects（`deal-won-*`・「報酬が確定」文言）不変を実装時に確認。 |
| **支払明細** | (c)のみ `payout_overrides` 経由で変化（抑止・窓バイパス）。(a)(b)(d)は支払に入らない | 請求と支払の厳密分離。`payout_items` は完全不変（受取不減額の構造保証）。 |
| **フロンティアoverride計算** | 唯一の意味変更（抑止＋窓バイパス＋backfillガード） | **現在未実運用（配下0・凍結0）のため過去実績との干渉ゼロ**（レビューF4）。専用テストを新設。 |
| **money検証（CC不変）** | 新規: fee-hash（supplier_charges） | 検証標準に追加（§2第2段）。 |

---

## 6. Phase 0 の境界と実装バッチ（設計項目6・裁定8）

### 作らないもの（通水思想・v1から維持＋追加）
フル請求エンジン・入金消込・サプライヤーポータル・多段系統・粗利自動取込・**相殺処理（§7-3）**・**mb_fee_amount列（廃案）**・**確定ガードのfee列拡張（2段凍結で不要化）**。

### 流用
系統＝既存frontier／(c)＝既存override＋`payout_overrides`／メニュー＝services＞service_menus＞menus＞menu_rewards／業務委託者＝deliveries一式／売上入力＝既存コンソール入口／パートナー報酬＝reward_snapshot／凍結状態機械＝delivery_payout_itemsパターン。

### P0-a（先行・既存money完全不変）
1. DDL2本（追加型・勝彦適用）: `services.supplier_partner_id` ＋ `supplier_charges` ＋ `deals.fee_snapshot`
2. `lib/lineage.ts`（系統判定）＋ `lib/supplier-fee.ts`（rate_kind解決・`supplierChargeBase` 新設＝既存grossBeforeReward非接触）
3. 全4凍結ポイントへの**条件**凍結（§2第1段）＋ null検知警告
4. 月次請求クローズ（手動・owner/manager）＋「サプライヤー請求」読み取りビュー＋CSV＋月額行の手動計上
5. 検証改定: menu_rewards全行ハッシュ方式＋fee-hash追加＋「partner net不変」実測項目
- **この段階では computeOverrides に一切触れない**＝パートナー報酬・override・支払は完全不変を実測して着地。

### P0-b（override意味変更・要注意）
1. `computeOverrides`: self_service抑止＋サプライヤー窓バイパス（契約ベース）
2. backfill再実行ガード（凍結済みskip）
3. 逆ザヤ防止バリデーション（§7-7・サービスマスタ保存時）
4. 監視Tier3接続（§7-9）＋override専用テスト＋全回帰
- レビューF4（未実運用）により回帰面は小さいが、money意味変更のため単独バッチ・単独タグを維持。

### 規模再見積り
- **P0-a＝中規模**（DDL2＋lib2＋凍結4箇所＋コンソール1ビュー＋検証改定。v1見積りから mb_fee_amount／確定ガード拡張が消え、supplier_charges／クローズUIが増＝差し引き同等）。
- **P0-b＝小〜中規模**（frontier.ts条件2つ＋ガード＋バリデーション＋テスト。F4により v1想定より軽い）。
- 合計: 中規模・2バッチ（v1と同等）。

---

## 7. 盲点9件の定義（裁定7・各1項）

1. **消費税**: (a)(b)(d)の手数料請求はいずれも**課税取引・税別建て**。`supplier_charges.amount` は税抜で凍結し `tax_treatment='taxable_excl'` を記録。請求書発行時に消費税（現行10%）を加算表示。税率は請求書側の関心事としテーブルに税率カラムは持たない（税率改定に凍結値が巻き込まれない）。
2. **源泉徴収**: (c)はサプライヤー（法人）への支払。**サプライヤーpartner行は `tax_type='corporate'` を登録フローで保証**（登録手順書の必須項目＋実装バッチでの作成時チェック）。corporate は `withholdingTax` が0のため誤控除は構造的に発生しない。
3. **相殺（ネッティング）**: **Phase 0は相殺しない**。請求（supplier_charges）と支払（payout_overrides経由）は別建てで進行・別書類。将来の相殺は別設計。
4. **高さん月額の起算・按分**: **契約書定義とし、本設計書は参照のみ**（起算日・初月日割り・請求サイクルは契約に従い、運用が月次クローズで手動計上）。設計はどの定義でも `supplier_charges` 月額行1行で表現可能。
5. **請求の帰属月規則**: (a)＝deal成約月（`fixed_month ?? created_at` のYYYY-MM・支払側 `close_month_batch` と同一規則）。(b)固定/率分＝同じく成約月、継続分＝`continuous_payouts.period_month`。(d)＝暦月。クローズは対象月の翌月に実施（支払側と同リズム）。クローズ後の入力変更は請求に波及しない（§2第2段）。
6. **クロスサプライヤーoverride**（A系統→Bサプライヤーメニュー）: **Phase 0対象外と明記**（単一サプライヤーのため顕在化しない）。ただし `fee_snapshot.cross_supplier` に判定を記録し、将来の裁定材料を凍結時点から残す。現行コードは払う挙動＝Phase 0中にA系統×Bメニューが発生した場合は運用で個別判断。
7. **逆ザヤ防止**: サプライヤーメニュー（`supplier_partner_id` 非null のサービス配下）の `menu_rewards` 保存時に、**報酬がMB受取50%枠内に収まるかのバリデーション**を追加（rate型＝reward_value≤50%を強制、fixed型＝保存時警告＋運用ガイドライン。粗利が案件ごとに変わるためfixedは硬いガード不能＝警告＋請求ビューでの案件別逆ザヤ表示で補完）。
8. **fee_snapshot の面公開禁止**: `fee_snapshot`／`supplier_charges` は **partner/vendor 面の select・API応答に一切載せない**（手数料条件はMB・サプライヤー間の商条件）。実装バッチで `lib/supabase/queries.ts` ほか全selectの列を確認・回帰項目化。
9. **自己監視への接続**: 監視Tier3（日次）に (i)「supplierメニューのconfirmed dealで fee_snapshot=null」検知、(ii) fee-hash照合（CC不変）、(iii) unbilled滞留（クローズ漏れ・前月分がunbilledのまま）検知を追加。発報は既存 `/api/monitor` の recordCheck 経路（2回連続・Slack）。

---

## 8. リスク一覧（v2更新）

| # | リスク | 深刻度 | 緩和 |
|---|---|---|---|
| R1 | computeOverrides の意味変更（抑止＋窓バイパス） | 高→**中**（未実運用・F4） | P0-b単独バッチ・専用テスト・fee_snapshot条件ベース・backfillガード |
| R2 | menu_rewards 検証置換で検出力低下 | 中→**低** | 全行ハッシュ＝supplier行も検出。MB seed補助チェック存置 |
| R3 | 5%ベースの継続報酬取りこぼし | 中→**解消** | 月次クローズの追撃計上（裁定4・2段凍結） |
| R4 | 請求ドメインの過剰実装 | 中 | Phase 0＝手動クローズ＋読み取りビューのみ。相殺・消込・ポータル非構築 |
| R5 | 多段系統の将来要求 | 低 | 1段固定・別設計 |
| R6 | パートナー受取の減額誤設計 | 高 | 構造保証（請求は別テーブル・payout_items非接触）＋「partner net不変」実測 |
| R7 | 標準移行（(d)→(b)）切替 | 低 | rate_card_version（凍結済みは不変） |
| R8 | fee_snapshot未凍結の混在 | 低 | null＝従来案件の後方互換＋null検知警告＋監視Tier3 |
| R9 | クローズ前の入力遅延（先方報告遅れ） | 中 | unbilled滞留の監視（§7-9）＋クローズは翌月実施の運用リズム |
| R10 | 折半ベース定義の契約との乖離 | 中 | §4(a)の定義（override控除前）を**契約書の文言に転記**して一致させる |

---

## 9. 承認チェックリスト（v2・勝彦最終確認）

裁定済み（Claude・反映済み）: 2段凍結／全行ハッシュ検証／5%ベース＝報酬総額（税抜・源泉前）＋継続月次追撃／手動請求＋supplier_charges必須／P0-a・b分割／系統1段／クロスサプライヤーPhase 0対象外／盲点9件の定義。

勝彦の承認が必要な残項目:
- [ ] **法人override＝12ヶ月窓バイパス・契約ベース**（契約有効期間中継続・解約=partner status suspendedで停止）でよいか（§4(c)改修2・起案）。
- [ ] **折半ベース＝override控除前**（受注額−委託費−承認済経費−その他原価）でよいか（§4(a)・私案。承認後、契約書文言に同一定義を転記）。
- [ ] 会社overrideの率は**既存10%のまま**でよいか（変更する場合はrate_card_versionで表現可能）。
- [ ] menu_rewards検証標準の文言改定（全行ハッシュ＋MB seed補助）を実装バッチで適用してよいか。
- [ ] 逆ザヤ防止＝rate型は50%上限強制・fixed型は警告＋請求ビュー表示、の強度でよいか（§7-7）。

---

*実行モデル: v2改訂＝Claude Fable 5（claude-fable-5）。v1作成＝Opus 4.8、独立レビュー＝Fable 5（`lineage-rate-review.md`）。本改訂はread-only（設計書ファイルの改訂のみ・コード/DDL/DB書込/デプロイなし）。実装はv2承認後、P0-a→P0-bの順に別バッチで発行する。*
