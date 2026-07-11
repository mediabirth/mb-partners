# 系統連動レート設計書 — 独立レビュー審査所見

- 実行モデル: **Claude Fable 5（claude-fable-5）**（/model で切替確認済み）
- 対象: `docs/design/lineage-rate-design.md` v1（Opus 4.8 作成）
- 立場: 独立監査（作者ではない・擁護でなく粗探し）。read-only／実装・DDL・書込・デプロイなし。
- 突合方法: 設計書の全主張をコード実体（ファイル/行）と本番DB read-only 照会で検証。

## 総合判定

**骨格は妥当・ただしこのままの実装承認には反対。** additive設計・既存frontier/deliveries流用・請求と支払の分離・P0分割という方向性は正しい。しかし **§2「fee_snapshot を成約確定時に凍結」は、設計書自身が §3 で定義した Phase 0 オムニス報告フロー（売上は成約後に運営が入力）と正面矛盾しており、実装すると折半手数料が ¥0 で凍結される**。この1点の修正（後述の2段凍結）を条件に、修正版の承認を推奨する。

---

## 1. 事実突合（設計書の主張 vs コード実体）

### 正確だった主張（抜粋）
- frontier機構（`deals.partner_id → partners.frontier_id`・1段のみ・10%・12ヶ月窓・`payout_overrides`凍結）＝ `lib/frontier.ts:38-56` と一致。✔
- reward_snapshot の凍結ポイント（`app/app/refer/actions.ts:110-128` 申込時 → `app/api/console/deals/[id]/route.ts` 確定時）と後段が凍結値のみ読む構造（`api/console/continuous-payouts/route.ts:50-57`）。✔
- 請求ドメイン（invoice/billing/charge/supplier）が完全新規＝DB照会で該当テーブルゼロを確認。✔
- canon 61 assertion が金額を検証しない（status→表示/メール写像のみ）。✔
- `ensureEditable` の確定ガードと revenue-only 例外（`items/[itemId]/route.ts:18-46`）。✔

### 事実誤認・根拠薄弱（要修正）

**F1（重要）: `grossBeforeReward` の式の記述がコードと不一致。**
設計書は折半ベースを「受注額−委託費−経費−その他原価」と記述するが、実コードは **frontier override も控除**する：
```ts
// app/console/deals/_parts.tsx:137-140
return revenue - (d._frontier_override ?? 0) - (d.other_cost ?? 0) - (d._delivery_cost ?? 0) - (d._delivery_expense ?? 0)
```
（コード内コメント「勝彦定義」は override を書いていないが、実装は引いている。）条件②（他系統→サプライヤーメニュー）では紹介パートナーにMB系フロンティアが付く場合があり、**折半ベースが override 分だけ小さくなる**。「折半ベース＝override控除前 or 控除後」は金額に直結する未決定事項であり、設計書はこの分岐の存在自体を見落としている。→ 承認チェックリストに追加すべき。

**F2: fee_snapshot の凍結ポイント列挙が不完全。**
設計書は `refer/actions.ts`（申込）＋ confirm PATCH の2点のみを挙げるが、deals への insert 経路は少なくとも3系統ある: `app/app/refer/actions.ts`（パートナー紹介）、`app/api/referral/route.ts`（/r/ 顧客相談）、`app/api/console/deals/route.ts`（直営業＝**商談を経ず confirmed で起票**）。特に直営業パスは confirm PATCH を通らないため、設計書のままでは **直営業サプライヤー案件に fee_snapshot が焼かれない**。

**F3（軽微）: 「16行ガード＝`scripts/cleanup-all-data.sql:104`」は誇張。**
これはクリーンアップスクリプト内のガードであり、本番 runtime を守るものではない。実体は検証標準の手動チェック。不変条件の強制力の記述として薄弱。

**F4（設計書に無い好材料）: override は現在“未実運用”。**
本番実データ（read-only）: is_frontier＝**神原勝彦本人（ZZ6347）1名のみ**・`frontier_id` を持つ配下 **0名**・`payout_overrides` 凍結 **0行**・continuous案件 **0件**・deals 6件（confirmed+paid 2件）。指示文が示唆した「既存の高さん個人override」は**存在しない**。つまり `computeOverrides` への抑止ガード追加は、**過去の支払実績と一切干渉しない**（回帰面は設計書の想定より軽い）。P0-b のリスク評価を下方修正できる。

---

## 2. 6つの承認判断への所見

| # | 判断 | 所見 | 理由 |
|---|---|---|---|
| 1 | 系統＝1段のみ | **同意** | コード実体（1段・非再帰）とビジネス定義（フロンティア配下）に一致。多段は override 意味論の再設計を要し Phase 0 に不要。 |
| 2 | 5%ベース＝報酬総額（税抜・源泉前）※Claude修正指定 | **条件付き同意** | fixed/rate 案件では `deals.amount`＝源泉前グロス報酬なので修正指定どおり成立（源泉は `lib/payout.ts` で支払時にのみ適用・snapshotに入らない）。**ただし継続報酬は月次 `continuous_payouts.confirmed_amount` が deals.amount に載らない**ため、成約時の静的凍結では捕捉不能。「継続案件は月次確定のたびに当月分5%を追加計上する」を定義に含めること（現在 continuous 0件のため Phase 0 実害なし・定義だけ今決める）。 |
| 3 | 会社override＝既存10%/12ヶ月流用 | **条件付き同意（重要な留保）** | 10%は「既存機構の会社版」の文言どおりで同意。**12ヶ月窓は問題**：ビジネス条件③に期限の記載はなく、サプライヤー契約は契約期間ベースが自然。現行流用だと系統パートナーの紐づけから12ヶ月で override が黙って消滅し、条件③の意図（サプライヤー系統→MBメニューは常に支払）と矛盾する可能性が高い。**supplier系統のみ窓をバイパスするか、12ヶ月で切る仕様かを勝彦が明示判断すべき**（設計書はこの論点を提示していない）。 |
| 4 | menu_rewards 基準改定（seed 16行固定＋supplier別集計） | **条件付き同意＋対案** | 改定必要性は同意（supplier メニュー追加で16行を超えるのは不可避）。ただし提案方式には穴：「MB seed 16行固定」だけでは **supplier 行の無断変更を検出できない**。対案（§5）の全行スナップショット方式を推奨。 |
| 5 | Phase 0＝手動請求＋読み取りビュー | **同意（ただし compute-on-read 単独案は非推奨）** | 手動請求は正しい通水。ただし設計書が「テーブルすら作らず compute-on-read でも成立」とした選択肢は**危険**：revenue は confirmed 後も編集可（`items/[itemId]/route.ts:33-45` 実測）のため、**読むたびに請求額が変わる**。請求は凍結レコード（`supplier_charges`）必須とすべき。 |
| 6 | P0-a → P0-b の2段実装 | **同意** | 分割自体は正しい。ただし P0-a の内容は §3 の凍結タイミング修正（2段凍結）を反映してから。F4 により P0-b の実質リスクは想定より低い。 |

---

## 3. 最重要リスクの深掘り

### (a) computeOverrides への自己サービス抑止ガード

- **既存の個人override との干渉**: 実データ上、override は未発火（配下0・凍結0）。既存支払への影響は**ゼロ**（F4）。
- **payout_overrides 凍結分との相互作用＝見落としあり**: `POST /api/console/payouts/freeze-overrides`（backfill）は**「現時点の料率・紐づけ・金額」で過去の closed/paid バッチを再凍結する**（route冒頭コメントに明記・delete-then-insert）。抑止ガード導入後にこれを再実行すると、**過去月の凍結値が新ルールで書き換わり得る**。fee_snapshot=null の旧案件は抑止対象外なので現時点の実害はないが、設計書はこのハザードに触れていない。実装バッチで「backfill は今後、運用ルール上再実行禁止（または fee_snapshot 導入前の deal を対象外とするガード付き）」を明記すべき。
- **open バッチは live 再計算**（`augmentBatches`）: ガード導入は当月 open バッチに即時反映される。これは意図どおりの挙動だが、「導入デプロイの瞬間に当月 override 表示が変わる」ことを運用告知に含めること。
- **12ヶ月窓との相互作用**: 窓判定と self_service 判定は独立条件で干渉しない。ただし §2-判断3 の窓自体の妥当性論点が先。
- **pnl への波及**: `lib/pnl.ts` の mbMargin と `grossBeforeReward` は `_frontier_override` を控除するため、抑止で override が消える案件は **MB粗利の表示が増える**。④自社メニュー案件は折半対象でないため請求額への波及はないが、ダッシュボード/分析の数字が動く点は回帰確認に含めること。

### (b) fee_snapshot の穴

- **凍結タイミング（致命・本レビュー最大の指摘）**: 設計書 §3 は Phase 0 の売上/粗利を「**成約後に**先方報告値を運営が入力」（revenue の confirmed 後編集はコードで明示的に許可済み）と定義しながら、§2 で「成約確定時に fee_snapshot/mb_fee_amount を凍結」とする。**成約時点で revenue は未入力のため、折半＝50%×0＝¥0 が凍結される**。5%も同様に、成約時の deals.amount は確定しているが継続分は捕捉されない。→ 対案（§5・2段凍結）へ。
- **差し戻し→再成約**: DealDrawer には「←◯◯に戻す」管理操作があり、confirmed→in_progress に戻すと明細が再編集可能になり、再confirmで reward は再計算される。**fee_snapshot の再凍結が未定義**。仕様化案:「confirm を通過するたびに fee_snapshot を上書き再凍結（ただし当該 deal に確定済み supplier_charges が存在する場合は差分を警告）」。
- **取消（案件を取り消す）**: 不可逆削除・痕跡ゼロ。請求確定後に deal が消えると請求根拠が消失する。→ `supplier_charges` に deal_id だけでなく**金額・顧客名・期間のスナップショットを自己完結で持つ**理由になる（設計書の supplier_charges 案には note しかない）。
- **確定ガードとの整合**: `ensureEditable` に fee 列を追加ロックする方針は妥当。ただし revenue-only 例外が残る以上、「fee の額」を deal 側に凍結する設計そのものが脆い——額の凍結は請求レコード側（charge close 時）で行うのが構造的に安全（＝2段凍結の根拠その2）。

### (c) menu_rewards 基準改定と検出力

- 設計書案（seed 16行/¥340,100 固定＋supplier別集計）は、**supplier 行への無断変更（CC事故・不正）を検出できない**。16行チェックは supplier 行を素通りする。
- また「16行」を数える術が現状スキーマに無い：menu_rewards に supplier 識別が無く、`menus→service_menus→services.supplier_partner_id` の join で導出するしかない。チェックSQLが複雑化し、運用ミスの温床。
- **対案（§5）**: 固定定数を捨て、deals reward-hash と同型の**バッチ開始時スナップショット方式**へ。`md5(string_agg(id||reward_type||reward_value||... order by id))` を開始時に記録し終了時に突合。「変わったら誰の操作か突合」という既存 reward-hash の運用ルールと完全に同型になり、supplier 行も含めて検出力が落ちない。MB seed の 16/¥340,100 は「join で MB分のみ抽出した補助チェック」として残せる。

---

## 4. 設計書に無い盲点（実装前に決めるべき未定義事項）

1. **消費税**: 折半・5%・月額の請求はいずれも税別と推定されるが、設計書は月額のみ「税別」明記。請求記録・請求書表示の税区分（外税10%）と `supplier_charges` への税列（または税抜統一＋請求書側で加算）を定義せよ。
2. **源泉徴収の誤適用リスク**: (c) 会社override はサプライヤー（法人）への支払。`withholdingTax` は `tax_type==='individual'` のみ課すため、**サプライヤーの partner 行を `tax_type='corporate'` で登録することが金額正当性の前提**。登録手順書に必須項目として明記せよ（個人で登録すると10.21%が誤って引かれる）。
3. **相殺（ネッティング）**: 同月にMB→サプライヤー支払（c）とサプライヤー→MB請求（a/b/d）が併存し得る。相殺するか別建てか、支払管理/請求ビューの見え方（両建て表示推奨）が未定義。
4. **高さん月額の起算・按分**: 契約起算日・初月日割りの有無・請求サイクル（月初/月末）・標準移行オプションの発動条件と切替月の扱いが未定義。`rate_card_version` だけでは運用できない。
5. **請求の帰属月規則**: (a)(b) の period 決定を支払側と同じ `fixed_month ?? created_at` にするのか、請求クローズ月にするのか未定義（2段凍結を採るなら後者が自然）。
6. **クロスサプライヤー（将来）**: A系統パートナー→Bサプライヤーメニューのとき、Aへの override 支払有無が未定義（現行コードは払う）。Phase 0 は単一サプライヤーで顕在化しないが、fee_snapshot には判定材料（referrer_frontier_id と menu_supplier の両方）が既に入る設計なので、**「未定義であること」自体を snapshot に記録**しておけば後決めできる。
7. **折半の経済性ガード**: 折半は「粗利の50%がMB取り分」だが、そこからMBが紹介パートナー報酬を払う。**オムニスメニューの menu_rewards 設定が粗利の50%を超えるとMBは逆ザヤ**。メニュー報酬設定時の上限ガイドライン（または警告）が必要。
8. **fee_snapshot の面公開**: partner/vendor 面の deals select に fee_snapshot/mb_fee_amount を**載せない**こと（手数料条件はサプライヤー・MB間の商секрет）。実装時に `lib/supabase/queries.ts` の select 列を確認。
9. **自己監視との接続（任意）**: 請求クローズの失敗・fee凍結漏れ（confirmed かつ supplier メニューなのに fee_snapshot=null）を Tier2/3 監視に足すと「勝彦が最初の発見者」を請求面でも防げる。

---

## 5. 対案（提案・設計書の書き換えは行わない）

### 対案1（最重要）: 「2段凍結」— 条件は成約時・額は請求クローズ時
- **成約時（fee_snapshot）**: 系統判定結果・rate_kind・rate・rate_card_version 等の**条件のみ**凍結（額は入れない）。これで「後からの系統変更・レート改定が確定案件に波及しない」は保証される。
- **月次請求クローズ時（supplier_charges）**: 当月分の (a)(b)(d) の**額**を、その時点の確定入力（revenue/経費承認/継続月次確定）から算出して `supplier_charges` に**凍結**（`delivery_payout_items` の unpaid/paid 状態機械を踏襲）。以後の入力変更は凍結済み請求に波及しない。
- 効果: Phase 0 報告フロー（成約後入力）と整合／revenue-only 編集の穴を構造的に閉じる／継続報酬の月次5%も自然に載る／取消事故にも請求レコードが自己完結で耐える。`deals.mb_fee_amount` 列は**不要になる**（実装がさらに1段軽くなる）。

### 対案2: money検証は「全行スナップショット方式」へ
menu_rewards の固定定数チェックを、バッチ開始時ハッシュ（全行）＋MB seed 補助チェックに置換（§3(c)）。fee 側も同様に `supplier_charges` のハッシュを検証標準へ追加。

### 対案3: supplier フロンティアの窓バイパス
`partners` に supplier 判定（`services.supplier_partner_id` から導出可・列追加不要）を用い、`withinWindow` を supplier系統では常に true とする（または契約期間で判定）。12ヶ月窓を残すか外すかは勝彦判断（§2-判断3）だが、レビューとしては**契約ベース（バイパス）を推奨**。

---

## 6. 追加承認チェックリスト（原設計書§8への追記提案）

- [ ] 折半ベースは frontier override **控除前/控除後**どちらか（F1）。
- [ ] 会社override に **12ヶ月窓を適用するか**（バイパス推奨・§2-判断3）。
- [ ] 凍結方式を**2段凍結**（条件=成約時・額=請求クローズ時）へ変更するか（対案1・レビューとしては必須と judged）。
- [ ] money検証を**全行スナップショット方式**へ置換するか（対案2）。
- [ ] 消費税・源泉（corporate必須）・相殺・月額起算/按分・帰属月規則（§4の1-5）。
- [ ] 直営業起票パスへの fee_snapshot 適用（F2）。

---

*結論: 方向性承認・実装は「2段凍結への修正＋12ヶ月窓の明示判断＋検証方式置換」を反映した設計書 v2 を経てから。実データは一切操作していない（read-only）。*
