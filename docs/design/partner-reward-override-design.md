# パートナー別報酬率（サプライヤー供給メニュー限定）設計書 v1

- 日付: 2026-07-12 ／ 実行モデル: Claude Fable 5 ／ フェーズ: **設計のみ（read-only・実装/DDL/デプロイなし）**
- 関連正典: docs/design/lineage-rate-design.md v2（2段凍結）・docs/copy-guideline.md §5f（サプライヤー呼称・面公開境界）
- 前提コード実査: refer/actions.ts（snapshot焼き）・api/referral・console/deals/[id]（確定）・lib/deal-reward.ts（明細）・console/continuous-payouts（継続）・lib/supplier-fee.ts（validateSupplierReward/fee）・lib/supabase/queries.ts getServicesWithMenus（APP表示）・audit_logs（actor/category/target/action/meta）

## 0. 確定ビジネス条件（指示の写し・本設計の枠）

- **スコープ＝サプライヤー供給メニューのみ**（報酬原資がサプライヤー100%のため正当）。MBメニューのパートナー別率は対象外（将来のティア制度・別卓）。
- サプライヤーの依頼に基づき、**特定パートナー×特定メニュー（または×サプライヤー全メニュー）**の報酬率/額を個別上書き。
- 設定は当面**コンソール（運営）のみ**。サプライヤーポータルでの自己設定は Phase 2。
- **凍結思想の適用**: 成約時（正確には案件作成時＝現行実装の凍結点）の reward_snapshot に個別率が焼かれ、以後の変更は確定済みへ波及しない。

## 1. データ設計

### 1.1 新テーブル `partner_reward_overrides`（additive・RLSなし=service_roleのみ）

```sql
create table partner_reward_overrides (
  id uuid primary key default gen_random_uuid(),
  supplier_partner_id uuid not null references partners(id),  -- 境界の主キー（誤設定ガード＆ポータル境界の基準）
  partner_id uuid not null references partners(id),            -- 対象パートナー
  reward_id uuid references menu_rewards(id) on delete cascade, -- null = サプライヤー全メニュー（§1.3）
  override_value numeric not null,                              -- 値のみ上書き（型・ベースは正典に従う＝§3の単純化）
  note text,                                                    -- 依頼の出自（例: 高さん依頼 2026-07-15）
  active boolean not null default true,
  created_by uuid,                                              -- 設定した運営 profile
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, reward_id)                                -- 同一対象の重複禁止（全メニュー行は partner×supplier で部分unique index）
);
create unique index on partner_reward_overrides (partner_id, supplier_partner_id) where reward_id is null;
```

**設計判断（重要）**
- **上書きは「値」のみ**。reward_type（fixed/rate）・reward_base（売上/粗利）は**メニュー正典に従う**。
  型ごと差し替え可能にすると、逆ザヤ/枠内バリデーション・確定経路・表示の全てで場合分けが爆発する。型を変えたい場合は「そのパートナー専用メニュー報酬行を作る」既存手段で足りる（menu_rewards は複数行対応済み）。
- **粒度は menu_rewards 行（reward_id）**。メニューは複数報酬を持てるため、メニュー粒度では「どの報酬を上書きするか」が曖昧になる。UI上は「メニュー→報酬」の順で選ばせる。
- **全メニュー上書き（reward_id null）は rate 型のみに適用**（fixed は各メニューで金額の意味が異なるため一括不可）。適用対象＝当該サプライヤー配下・active な rate/continuous 型報酬すべて。
- supplier_partner_id を非正規化して持つ＝(a)誤設定ガード（reward が本当にそのサプライヤー配下かを設定時に検証して焼く）(b)Phase 2 ポータル境界（自社分のみ）の構造的キー。

### 1.2 優先順位（正典）

```
reward_id 指定の個別上書き ＞ 全メニュー上書き（reward_id null・rate型のみ） ＞ メニュー正典（menu_rewards）
```

### 1.3 解決関数（新設・単一ソース）

`lib/reward-override.ts` に純関数＋DB解決を1本化する：

```ts
resolveEffectiveReward(admin, { partnerId, reward }): Promise<{
  value: number                 // 有効値（override or 正典）
  overridden: boolean
  override_id: string | null
  original_value: number        // 正典値（snapshot監査用）
}>
```
- 全ての読み手（作成時snapshot・APP表示・コンソール表示）はこの関数のみを通す。fail-safe＝解決失敗は正典値（override無効化方向に倒す）。

## 2. 接続点の全列挙（reward_snapshot／報酬計算／確定ガード）

現行の報酬決定は「**作成時に menu_rewards を snapshot へ焼き、以後は snapshot を正とする**」構造。接続点は以下で全てである（コード実査済み）：

| # | 経路 | ファイル | 現状 | 改修 |
|---|---|---|---|---|
| A | 案件作成（APP紹介） | `app/app/refer/actions.ts`（rewardRef→menu_rewards取得→amount/reward_snapshot） | 正典値を焼く | **mr取得後に resolveEffectiveReward を挿入**。fixed は `amount` にも反映。snapshot に `override_applied: { override_id, original_value }` を追記（監査痕跡・rateInfo互換キーは値差し替えのみ） |
| B | 案件作成（/r/ 顧客相談） | `app/api/referral/route.ts` | **実装時判明**: /r/ は menu_rewards を選択せず legacy service_menus（ref_*）を snapshot に焼く | **全メニュー上書き（rate型）のみ**を legacy ref_value に適用（個別 reward_id 上書きは anchor が無く適用外＝P1注記）。/r/ の新報酬モデル移行時に個別上書きも自然合流 |
| C | 確定・報酬計算 | `app/api/console/deals/[id]/route.ts` L74-125 | rate は `menu?.ref_type ?? snap?.ref_type` と**menuライブ優先**の枝がある | **snapshot に override_applied がある案件は snapshot 優先**へ順序変更（1行）。これを怠ると、確定時に menu ライブ値で個別率が上書き戻りする（本設計の最大の落とし穴・リスク表①） |
| D | 継続の月次確定 | `app/api/console/continuous-payouts/route.ts` | `snap.reward_value` を正（凍結済） | **変更不要**（Aで焼いた値が自動で流れる）。なお標準サプライヤーは継続型を禁止済みのため対象は折半カードのみ |
| E | 明細（複数deal_items） | `lib/deal-reward.ts` computeDealReward（menusByIdライブ参照） | 複数明細の見積/再計算のみ・単一明細はlegacy(snapshot)計算 | **Phase 1 は対象外と明記**（サプライヤー紹介案件は単一明細）。コンソールで supplier 案件に明細を追加する運用が始まる場合は menusById 解決に override を注入（Phase 2） |
| F | 支払側（payout/close） | close_month_batch は `deals.amount` を読む | — | **変更不要**（A/Cで確定した amount が唯一の入力） |
| G | サプライヤー請求 | `lib/supplier-charges.ts` | payment_fee_5 の base＝`deals.amount`（=支払った報酬） | **変更不要・自動整合**（個別率で増減した報酬に 5% がそのまま乗る）。passthrough手数料・折半・月額は報酬額に非依存 |
| H | 確定ガード（逆ザヤ） | `lib/supplier-fee.ts` validateSupplierReward | menu_rewards の保存時ガード | **override 設定APIに同一ガードを適用**（§3・§4）。menu_rewards 本体は不変 |

> 接続点の少なさは既存の「snapshot凍結」思想の恩恵。**書き換えるのは A/B（焼く瞬間）と C（snapshot優先の1判断）だけ**で、支払・請求・継続は自動追随する。

## 3. 型別の挙動定義とバリデーション整合

| カード/報酬型 | 上書き対象 | 有効範囲ガード（設定時・ハード） | 備考 |
|---|---|---|---|
| 標準（passthrough）× fixed | 金額 | 1 ≤ v ≤ 10,000,000（事故上限） | 原資100%サプライヤー＝逆ザヤ概念なし。警告なし |
| 標準（passthrough）× rate（受注額%） | 率 | 0 < v ≤ 100 | 100%超は構造的に不正。継続型は正典側で禁止済み |
| 折半（オムニス等）× rate/continuous | 率 | 0 < v ≤ 50（**既存の逆ザヤ50%硬上限をそのまま適用**） | 報酬はMB取り分から出るため枠内必須 |
| 折半 × fixed | 金額 | 上限ガード＋**既存と同一の警告文**を設定UIに表示 | 粗利次第で50%枠超の可能性（正典の警告を踏襲） |

- ガードの実装は `validateSupplierReward(db, menuId, rewardType, value, rewardBase)` を**そのまま再利用**（menu_id→カード種別解決が既にある）。override 設定APIは同関数を通してから保存する＝二重定義しない。
- 全メニュー上書き（rate のみ）は、保存時に配下の**全対象報酬に対して**同ガードを走らせ、1件でも違反があれば保存全体を拒否（部分適用しない）。

## 4. 表示の個別化と境界設計

### 4.1 本人にだけ個別率を見せる（v1.1改訂・2026-07-23＝実装事実へ追随）

- **実装済みの正**: 個別化は `/api/my-reward-overrides`（認証必須・セッション由来 partner の差分のみ・`Cache-Control: no-store`）＋**クライアント1箇所マージ**で行う。`/api/services` は全ユーザー共通の正典マスタとして CDN 共有キャッシュ（s-maxage）される——**そこへ個別値を混ぜることは恒久禁止**（共有キャッシュに個別値が焼かれ他パートナーへ漏出）。
- ※v1の「/api/services でサーバ側マージ」案は、本書 §4.2 リスク④（共有キャッシュ禁止）と自己矛盾していたため**廃案**。`/api/services` 側にも恒久禁止コメントを常設済み。
- `lib/reward-override.ts` の `personalizeRewards()`（サーバ側マージ実装・呼び出し元ゼロ）は**削除**（是正パッケージA）——設計書経由で誤配線されると漏出経路になるため、死にコードとして残さない。
- 案件・報酬明細（cases/rewards/継続）は **reward_snapshot / deals.amount 駆動のため自動的に本人の値**になる（改修不要・接続点F/D）。
- 表示装飾は Phase 1 では行わない（静音原則＝値が正しければ説明は不要）。「あなた専用条件」バッジは Phase 2 の任意項目。

### 4.2 他パートナーへの境界

- `/api/services` は認証必須・レスポンスはリクエスト毎にサーバ側で構築（CDNキャッシュなし・SWR はブラウザ内キャッシュのみ）。**差し替えはセッション partner_id でのみ行う**ため、他人に個別率が漏れる経路は構造的にない。
  - 検証項目: 同一メニューを A（override有）/B（無）両セッションで取得し、B のレスポンス・rendered innerText に個別値が現れないこと。
  - リスク: 将来 `/api/services` に `Cache-Control: public` や全面キャッシュを入れると境界が壊れる → 設計書として**このAPIの共有キャッシュ禁止**を明記（リスク表④）。
- 公開面（/r/・/partners）は報酬を一切出さない既存正典のまま（個別率も当然不出）。
- コンソール: サプライヤー詳細に「個別条件」節（一覧・追加・停止）。サプライヤーポータル（Phase 2）では supplier_partner_id スコープで自社分のみ。

## 5. 悪用・事故の防止

1. **誤設定ガード（保存時）**: 対象 reward がそのサプライヤー配下であることを検証して supplier_partner_id を焼く／対象 partner がサプライヤー本人（partner_id = supplier_partner_id）の場合は拒否（自己報酬の水増し経路を遮断）／§3 の値レンジ＋逆ザヤガード／同一対象の重複は unique 制約で拒否。
2. **監査**: 追加・変更・停止の全てを `audit_logs` に記録（category='reward_override'・target=partner/reward・action=create/update/deactivate・meta={before, after, supplier, note, actor}）。既存の口座変更（bank/route.ts）と同じ流儀。
3. **snapshot への監査痕跡**: `override_applied: { override_id, original_value }` を焼く＝確定後に「なぜこの率か」を案件単体で説明できる（override 行が後に消えても案件は自己完結）。
4. **money 3ハッシュへの影響**:
   - `menu_rewards` ハッシュ: **不変**（overrides は別テーブル・正典に触れない）。
   - `deals` reward-hash: 個別率案件の作成・確定で**正当に変化**（従来どおり「誰の操作か」を突合）。
   - fee-hash: 不変（凍結後の請求行に非接触）。
   - **追加提案**: 検証標準に第4ハッシュ「override-hash」＝`select coalesce(md5(string_agg(id::text||partner_id::text||coalesce(reward_id::text,'')||override_value::text||active::text, ',' order by id)),'(empty)') from partner_reward_overrides` を追記し、CCバッチが個別条件を勝手に触っていないことを同じ流儀で証明する。
5. **無効化は物理削除でなく active=false**（履歴保全）。再有効化も監査に残る。凍結済み案件へは構造的に波及しない（§2）。

## 6. Phase 分割・規模見積り

| Phase | 内容 | 規模 |
|---|---|---|
| **P1（実装バッチ1回）** | DDL＋resolveEffectiveReward＋作成時snapshot焼き（A/B）＋確定経路のsnapshot優先（C）＋設定API（owner/manager・ガード/監査込み）＋コンソールUI（サプライヤー詳細「個別条件」節＋PageGuide）＋APP表示個別化（/api/services）＋E2E（下記）＋override-hash | 実装1日相当・E2E既存スイート拡張（+10〜15 assertions） |
| **P1検証** | throwaway 2パートナー（override有/無）×標準・折半両カード: 表示個別化（本人=個別値/他人=正典値）→成約→snapshot焼き（override_applied/original_value）→確定額=個別率→menu側の値変更が凍結済みに波及しない→payment_fee_5がamount追随→全メニュー上書き→ガード（自己設定拒否・50%超拒否）→監査ログ行→3+1ハッシュ | — |
| **P2** | サプライヤーポータル自己設定（自社分スコープ＋運営承認フロー）・明細（E）/継続の明示対応・「あなた専用」表示装飾 | 別バッチ |

### リスク一覧
| # | リスク | 影響 | 手当て |
|---|---|---|---|
| ① | 確定経路の menu ライブ優先枝（C）を見落とすと、確定時に個別率が正典値へ戻る | 支払額の誤り（過少/過大） | C を P1 必須改修に固定・E2Eで「menu値を変更→確定→個別率のまま」を明示検証 |
| ② | 複数報酬メニューでの対象取り違え | 意図しない報酬行に適用 | 粒度を reward_id に固定・設定UIは「メニュー→報酬」2段選択・確認文言に正典値→新値を明示 |
| ③ | 全メニュー上書きと個別上書きの競合 | 二重適用の混乱 | 優先順位正典（§1.2）＋解決関数の単一ソース化＋unique制約 |
| ④ | `/api/services` への共有キャッシュ導入で他人に個別値が漏れる | 境界破壊 | 本設計書で共有キャッシュ禁止を明記・E2Eに他人セッション非漏出を恒久ケース化 |
| ⑤ | サプライヤー本人への override 設定（自己水増し） | money毀損 | 保存時拒否（§5-1） |
| ⑥ | override 停止後の新規案件が旧率で走る誤解 | 運用混乱 | 停止は「以後の案件から正典値」＝凍結思想の対称。UI ripple 文言で予告 |

## 7. CLAUDE.md 検証標準への追記（実装バッチで適用・文言案）

> **★検証メールの抑止（恒久）**: E2E・検証スクリプトからのメール送信は、**抑止フラグ（環境変数 `CC_MAIL_SUPPRESS=1` で lib/mail-send / lib/notify が no-op＋送信内容をログ返し）** または **内部シンク宛（@mb-system.internal のみ）** を標準とする。throwaway 宛でも実プロバイダ送信（バウンス発生）を伴う検証は、抑止が構造的に不可能な場合に限り、件数を明示して報告する。

（実装メモ: `sendTemplatedEmail`/`sendOpsEmail`/`sendSlack` の入口で env を見て no-op 化する3行ずつの追加＝送信経路の意味は不変。ローカル/E2E 実行時のみ設定。）

---
以上。承認後、P1 を単一バッチ（tag: deploy-partner-reward-override-p1）で実装する。
