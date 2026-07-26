# UX-5a 全画面ペア整合差分表

- 実行日: 2026-07-26 JST
- 実行モデル: GPT-5.6 Sol
- 対象: ローカル `main` / `89c600a`
- 性質: read-only 診断。分類はすべて**案**であり、採否・仕様の確定はリード裁定に委ねる。
- 非実施: プロダクトコード変更、DB書込、デプロイ、タグ、実ユーザー操作、E2E fixture 作成。
- 読み方: 「対面値」は console に対する supplier / partner / vendor 側の実装値。複数面は `supplier:` 等で分けた。

## 調査方法と境界

1. `AGENTS.md`、`CLAUDE.md`、`docs/RESUME.md`（2026-07-26 第5巡）、`docs/copy-guideline.md` を正典として読んだ。
2. ルート、Server Component、Client Component、共通表示関数、PageGuide を静的に突合した。データに依存する表示は、型・状態マップ・分岐条件まで追った。
3. 既知7件を `K1`〜`K7` として種にし、同じDB値・同じ操作・同じ概念を文字列検索して追加差分を抽出した。
4. 「意図された差」は、ペルソナ・権限・業務段階に理由が読めるという**分類案**であって、確定ではない。「不整合」「欠落」「過剰」も同様に裁定前の候補である。
5. 行番号は本バッチ開始時 `89c600a` のもの。生成物・コメントだけの語は除き、原則として実UI、状態マップ、PageGuide、到達可能な部品を対象にした。

## 行数サマリ

| 比較領域 | 行数 | 既知7件を含む行 |
|---|---:|---|
| 1. サービスマスタ編集 | 30 | K2, K3 |
| 2. 案件 | 31 | K1, K7 |
| 3. お金 | 22 | — |
| 4. パートナー管理・招待 | 20 | — |
| 5. 設定・プロフィール | 24 | K4, K6 |
| 6. 通知 | 12 | — |
| 7. 語彙横断 | 24 | K1, K2, K3, K5 |
| **合計** | **163** | **既知7件を全数収録** |

既知7件の対応:

| 種 | 既知内容 | 本表 |
|---|---|---|
| K1 | `in_progress` が console「商談中」、他面「対応中」 | CASE-02, VOC-01 |
| K2 | サービスマスタ7組の同概念異ラベル | SVC-01〜07, VOC-07〜13 |
| K3 | データ結合値「ヒヤリング」対 UI「ヒアリング」 | SVC-23, VOC-05〜06 |
| K4 | console 運営者にパスワード変更がない | PROF-13 |
| K5 | 経費 `rejected` の「却下／差戻し」混在 | VOC-03〜04 |
| K6 | vendor 設定に「サービスガイド」がない | PROF-17 |
| K7 | console 案件ボードだけ「進行中／納品済み」のプロジェクト列を持つ | CASE-05〜07 |

---

## 1. サービスマスタ編集

比較: `/console/services` ↔ `/app/s/products`

| ID | 項目 | console値 | 対面値 | 分類案 | 根拠 |
|---|---|---|---|---|---|
| SVC-01 | サービス名ラベル | ブランド名（必須） | supplier: サービス名 | 不整合 | 同じ `services.name`。`app/console/services/ServicesClient.tsx:841` / `app/app/s/products/ProductsClient.tsx:203`。K2 |
| SVC-02 | 短い説明 | 一言説明 | supplier: ひとこと説明（一覧に表示・申請制） | 不整合 | 同じ `menus.short_description`。`ServicesClient.tsx:922` / `ProductsClient.tsx:241`。K2 |
| SVC-03 | 対象者 | こんな方に（Who） | supplier: こんなお客さまに（申請制） | 不整合 | console の `who` と supplier の `target_audience` は別カラムでも、画面上は対象説明として隣接し意味が交差する。`ServicesClient.tsx:850-855` / `ProductsClient.tsx:207-208`。K2 |
| SVC-04 | 紹介フック | 紹介対象（フック文） | supplier: 紹介しやすい方（申請制） | 不整合 | 同じ編集領域で表示目的の説明が異なる。`ServicesClient.tsx:850` / `ProductsClient.tsx:208`。K2 |
| SVC-05 | 詳細説明 | 詳細説明 | supplier: 詳しい説明（詳細シートに表示・申請制） | 不整合 | 同じ `menus.description`。`ServicesClient.tsx:925` / `ProductsClient.tsx:242`。K2 |
| SVC-06 | サービス説明 | 説明（〜とは） | supplier: サービス概要（申請制） | 不整合 | 同じ `services.description`。`ServicesClient.tsx:847` / `ProductsClient.tsx:206`。K2 |
| SVC-07 | URL | サービスサイト URL | supplier: WebサイトURL（申請制） | 不整合 | 同じ `services.url`。`ServicesClient.tsx:856` / `ProductsClient.tsx:209`。K2 |
| SVC-08 | カテゴリ | 編集可 | supplier: 申請制で編集可 | 意図された差 | 同じ値だが、対外表示項目のため supplier は承認を挟む。`ServicesClient.tsx:844-846` / `ProductsClient.tsx:205`。 |
| SVC-09 | サブタイトル | 編集可 | supplier: 申請制で編集可 | 意図された差 | 反映権限の差。`ServicesClient.tsx:906-909` / `ProductsClient.tsx:204`。 |
| SVC-10 | ロゴ画像 | URL/アップロードを直接保存 | supplier: 申請制 | 意図された差 | 対外素材の承認境界。`ServicesClient.tsx:859-878` / `ProductsClient.tsx:210-211`。 |
| SVC-11 | イメージ画像 | URL/アップロードを直接保存 | supplier: 申請制 | 意図された差 | 同上。`ServicesClient.tsx:879-899` / `ProductsClient.tsx:210`。 |
| SVC-12 | 公開状態 | 停止中／公開中を直接切替 | supplier: 変更申請 | 意図された差 | console が公開責任者。`ServicesClient.tsx:882-891` / `ProductsClient.tsx:212-220`。 |
| SVC-13 | 供給元 | MB自社／サプライヤーを選択 | supplier: 表示・変更なし | 意図された差 | テナント境界を supplier 自身に変更させないため。`ServicesClient.tsx:893-901`。 |
| SVC-14 | 担当者 | サービス・メニュー両方で選択 | supplier: 表示・変更なし | 意図された差 | MB Partners 内部の担当割当。`ServicesClient.tsx:902-905,931-935`。 |
| SVC-15 | 社内向けメモ | console 側に同欄なし | supplier: すぐ反映 | 欠落 | supplier 専用メモだが console から参照・編集できる対になる欄がない。`ProductsClient.tsx:221-227` / `supplier-guides.ts:34`。 |
| SVC-16 | メニュー名 | 直接編集 | supplier: 申請制 | 意図された差 | 対外表示値の承認境界。`ServicesClient.tsx:919` / `ProductsClient.tsx:240`。 |
| SVC-17 | 顧客向け説明 | 直接編集 | supplier: 申請制 | 意図された差 | 紹介ページに出る文言。`ServicesClient.tsx:928` / `ProductsClient.tsx:243`。 |
| SVC-18 | 報酬型 | 固定額／粗利%／継続% 等を直接保存 | supplier: 同型を「すぐ反映」で保存 | 意図された差 | 値の部品はほぼ同じ。supplier 側は自身のメニュー定義。`ServicesClient.tsx:939-985` / `MenuOpsEditor.tsx:51-79`。 |
| SVC-19 | 報酬値・基準 | 値、期間、トリガー、基準 | supplier: 同項目 | 意図された差 | 実体は同じだがラベル補助・保存単位が異なる。`ServicesClient.tsx:939-985` / `MenuOpsEditor.tsx:51-79`。 |
| SVC-20 | 報酬行の追加・削除 | 複数行の追加・削除あり | supplier: 同じ | 意図された差 | 機能は整合。`ServicesClient.tsx:936-986` / `MenuOpsEditor.tsx:48-80`。 |
| SVC-21 | 協力タスク | 6マスタ選択、説明編集、auto/manual 表示 | supplier: 6マスタ選択のみ | 欠落 | supplier 面にタスク説明編集と自動／手動の意味表示がない。`ServicesClient.tsx:986-1034` / `MenuOpsEditor.tsx:81-99`。 |
| SVC-22 | 協力タスクの見出し | 協力タスク | supplier: 協力タスク（パートナーの役割分担） | 意図された差 | supplier 側は平易な補足を付与。`ServicesClient.tsx:988` / `MenuOpsEditor.tsx:81`。 |
| SVC-23 | 協力タスクの hearing 値 | マスタ値「ヒヤリング」 | supplier: マスタ値「ヒヤリング」／見出しは「ヒアリング」 | 不整合 | DB/API結合値は旧表記、見出しは正表記。単純置換不可。`ServicesClient.tsx:22` / `MenuOpsEditor.tsx:9,103` / `app/api/supplier/menu-ops/route.ts:18`。K3 |
| SVC-24 | ヒアリング項目 | 保存済みメニューごとに編集 | supplier: 同じ | 意図された差 | 機能は整合。`ServicesClient.tsx:1037-1041` / `MenuOpsEditor.tsx:101-121`。 |
| SVC-25 | メニュー追加 | console: 即時追加 | supplier: 申請制 | 意図された差 | supplier は公開構造変更を申請。`ServicesClient.tsx:802-828` / `ProductsClient.tsx:229-236`。 |
| SVC-26 | サービス追加 | console: 追加可 | supplier: 追加不可 | 意図された差 | サービス自体の作成は運営権限。`ServicesClient.tsx:735-750`。 |
| SVC-27 | 並べ替え | サービス／メニューのドラッグ並べ替え | supplier: なし | 意図された差 | 全体掲載順は console 管理。`ServicesClient.tsx:752-840`。 |
| SVC-28 | 保存動線 | 画面下「保存する」でブランド・メニュー・報酬を一括 | supplier: 下部「保存する」＋「変更を申請」 | 意図された差 | 即時反映と申請反映を分離。`ServicesClient.tsx:1045-1051` / `ProductsClient.tsx:260-265` / 両Guide。 |
| SVC-29 | 即時保存の重複 | 一括保存1系統 | supplier: `MenuOpsEditor` 内「この定義を保存する」＋フッター「保存する」 | 過剰 | 同じ報酬・タスク・ヒアリング領域に二つの保存入口が見える。`MenuOpsEditor.tsx:122` / `ProductsClient.tsx:263`。 |
| SVC-30 | ⓘの説明範囲 | 基本情報／メニュー／報酬／ヒアリング／一括保存 | supplier: 即時反映・申請反映を説明 | 欠落 | supplier Guide はロゴ等を列挙するが、実在するカテゴリ・対象者・URL・二重保存入口の対応を全数説明していない。`console-guides.ts:225-242` / `supplier-guides.ts:26-40`。 |

---

## 2. 案件

比較: console ボード＋ドロワー ↔ supplier ボード＋ドロワー ↔ partner 案件詳細 ↔ vendor 案件詳細

| ID | 項目 | console値 | 対面値 | 分類案 | 根拠 |
|---|---|---|---|---|---|
| CASE-01 | 受付 | ボード列「受付」 | supplier: 受付／partner: 受付／vendor: 準備中（詳細） | 意図された差 | vendor は委託成立前の担当者視点。`console-guides.ts:14` / `supplier-guides.ts:49` / `lib/status.ts:13` / `lib/vendor-status.ts:20`。 |
| CASE-02 | `in_progress` | ボード列「商談中」 | supplier/partner: 対応中、vendor: 実行中 | 不整合 | 同じ案件状態を console だけ別語で表示。`app/console/deals/_parts.tsx:268` / `lib/status.ts:14` / `lib/vendor-status.ts:11`。K1 |
| CASE-03 | `confirmed` | 状態「成約」 | supplier/partner: 成約、vendor: 実行中 | 意図された差 | vendor は受注成否より委託の実行段階を優先。`lib/status.ts:15` / `lib/vendor-status.ts:11`。 |
| CASE-04 | `paid` / `lost` | アーカイブに「支払済／不成立」 | supplier: paidのみ列、不成立は非表示／partner: 詳細表示／vendor: 終了 | 意図された差 | 面ごとの担当範囲。`app/console/deals/page.tsx:625-656` / `supplier-guides.ts:49` / `app/app/cases/[id]/page.tsx:145` / `lib/vendor-status.ts:12`。 |
| CASE-05 | 成約後の列 | 進行中 | supplier/partner: 列なし（状態は成約）／vendor: 実行中 | 意図された差 | console の内部プロジェクト状態。`console-guides.ts:16,21`。K7 |
| CASE-06 | 納品後の列 | 納品済み | supplier: 案件列は成約のまま、委託行だけ納品済み／partner: なし／vendor: 委託状態「納品済み」 | 意図された差 | console が委託納品の集約をボード列へ投影。`console-guides.ts:16` / `DealDrawer.tsx:547` / `lib/vendor-status.ts:30`。K7 |
| CASE-07 | 状態と列の対応ⓘ | 対応表あり | supplier Guide: 受付→対応中→成約→支払済／partner・vendor: 対応表なし | 欠落 | console の二層状態だけは説明済み。対面側には console 用語との対応根拠がない。`console-guides.ts:12-21` / `supplier-guides.ts:45-57`。K7 |
| CASE-08 | ボードカード主語 | お客さま名 | supplier: お客さま名／partner: 案件一覧もお客さま名／vendor: お客さま名 | 意図された差 | 主体は整合。`app/console/deals/page.tsx:713-754` / `app/app/s/deals/page.tsx` / 各 cases page。 |
| CASE-09 | サービス表示 | ブランド＋メニュー | supplier: ブランド＋メニュー／partner: ブランド＋メニュー／vendor: サービスのみ | 欠落 | vendor 詳細には menu 名がなく、同一案件の作業単位を識別しにくい可能性。`DealDrawer.tsx:146-158` / `app/vendor/(app)/cases/[id]/page.tsx:34-47`。 |
| CASE-10 | 紹介者 | console: 紹介元・パートナー名 | supplier: 紹介元区分、partner: 本人なので不要、vendor: なし | 意図された差 | 個人情報・役割境界。`DealDrawer.tsx:300-344` / `app/app/s/deals/page.tsx`。 |
| CASE-11 | MB担当 | console: 閲覧・変更 | supplier/partner/vendor: なし | 意図された差 | 運営内部の担当割当。`DealDrawer.tsx:300-344`。 |
| CASE-12 | 顧客連絡先 | console: メール表示・コピー | supplier: なし／partner: なし／vendor: なし | 意図された差 | 個人情報の最小開示。`DealDrawer.tsx:300-344`。 |
| CASE-13 | ヒアリング回答 | console: 編集＋自動保存＋自由記述 | supplier: 読取のみ／partner: 協力範囲は入力可／vendor: なし | 意図された差 | 入力責任と開示境界。`console-guides.ts:55-56` / `supplier-guides.ts:56` / `app/app/cases/[id]/page.tsx:155-177`。 |
| CASE-14 | 協力タスク | console: 達成状況を編集 | supplier: 定義は products、案件drawerでは表示なし／partner: チェック実行／vendor: なし | 欠落 | 発注元 supplier の案件詳細に、協力タスクの実施状況が見えない。`DealDrawer.tsx:227-274` / `app/app/cases/[id]/page.tsx:155-177`。 |
| CASE-15 | 状態遷移 | console: 受付→対応中→成約→支払済、不成立、再開、戻す | supplier: 案件状態遷移なし／partner: なし／vendor: 委託提示の受諾・辞退のみ | 意図された差 | console が案件状態の責任者。`DealDrawer.tsx:162-222,277-294` / `VendorOfferActions.tsx`。 |
| CASE-16 | 成約CTA | 成約にする | supplier/partner/vendor: なし | 意図された差 | snapshot凍結を console に限定。`DealDrawer.tsx:198` / `app/console/deals/page.tsx:818`。 |
| CASE-17 | 報酬確定CTA | 報酬を確定する | supplier/partner/vendor: なし | 意図された差 | money 確定権限。`DealDrawer.tsx:200`。 |
| CASE-18 | 不成立CTA | 不成立にする／再開する | supplier/vendor: なし／partner: 結果表示のみ | 意図された差 | 運営状態操作。`DealDrawer.tsx:180,275-294` / `app/app/cases/[id]/page.tsx:145-151`。 |
| CASE-19 | 受注額 | console: 成約時入力・後編集 | supplier: 成約後に入力／partner: 閲覧なし／vendor: 閲覧なし | 意図された差 | supplier が自社受注額を補完できる設計。`DealDrawer.tsx:463-478` / `supplier-guides.ts:53`。 |
| CASE-20 | 金額式 | console: 受注額−委託費−経費−原価−報酬 | supplier: money面で集約、案件drawerは受注額・委託費／partner: 報酬のみ／vendor: 委託費＋経費のみ | 意図された差 | 各ペルソナに見せる金額境界。`console-guides.ts:57-58` / `supplier-guides.ts:53-55`。 |
| CASE-21 | 委託追加 | console: 委託先と委託費を提示 | supplier: 同操作 | partner/vendor: なし | 意図された差 | console と supplier が発注元。`console-guides.ts:62` / `supplier-guides.ts:54`。 |
| CASE-22 | 委託提示状態 | 提示中・未確定／ベンダーの承諾待ち | supplier: 提示中／vendor: 承諾待ち | 意図された差 | 発注側の行状態と受注側の次アクションを分けた可能性。`DealDrawer.tsx:484` / `lib/vendor-status.ts:28`。 |
| CASE-23 | 委託受諾 | console: 閲覧のみ | supplier: 閲覧のみ／vendor: 受ける・辞退する | 意図された差 | vendor 本人の意思操作。`VendorOfferActions.tsx:3-70`。 |
| CASE-24 | 納品確定 | console: 納品済みにする | supplier: 同操作／vendor: 自身では不可 | 意図された差 | 発注元確認。`DealDrawer.tsx:422-425` / `supplier-guides.ts:55` / `VendorCaseExpense.tsx:24`。 |
| CASE-25 | 経費申請 | console: 追加・承認・却下・差戻し | supplier: 承認側／partner: なし／vendor: 納品後に申請 | 意図された差 | 申請者と承認者の分離。`DealDrawer.tsx:432-458` / `VendorCaseExpense.tsx:19-28`。 |
| CASE-26 | 経費状態語 | console: 承認済／却下／差戻し | supplier: 同系統／vendor: 申請中／承認済／却下 | 不整合 | `rejected` の表示語が console 内でも分裂。詳細は VOC-03〜04。`lib/vendor-status.ts:37-40` / `app/console/page.tsx:250`。 |
| CASE-27 | エビデンス | console: 添付・閲覧・削除 | supplier: 添付・閲覧／partner: なし／vendor: 経費領収書 | 意図された差 | console/supplier は契約・売上証跡、vendor は経費証跡。`DealDrawer.tsx:65-114,528` / `supplier-guides.ts:57`。 |
| CASE-28 | 履歴 | console: タイムライン・イベント | supplier: 状態と登録日中心／partner: 履歴あり／vendor: 経費履歴のみ | 欠落 | vendor に提示・受諾・納品の時系列表示がなく、同じ委託の経緯が追いにくい。`DealDrawer.tsx:222-294` / `app/app/cases/[id]/page.tsx:178-218` / vendor detail。 |
| CASE-29 | 次の一手 | console: 状態別動詞CTA | supplier: 受注額・委託の操作／partner: narrative／vendor: 受諾または経費 | 意図された差 | 各役割の行動責任に合わせた差。`console-guides.ts:61-64` / `app/app/cases/[id]/page.tsx:153-177`。 |
| CASE-30 | 案件詳細のⓘ | console: PageGuideあり | supplier: PageGuideあり／partner: メニューⓘのみ／vendor: なし | 欠落 | partner/vendor には状態・操作全体を説明するガイドがない。`console-guides.ts:48-70` / `supplier-guides.ts:45-62` / partner detail `MenuInfo`。 |
| CASE-31 | 空状態 | console: 列・アーカイブ別 | supplier: 列別／partner: ＋ボタン誘導／vendor: 進行中の委託はまだありません | 意図された差 | 操作可能性に応じた次の一手の差。ただし文法は4面で統一されていない。各 cases page / `app/vendor/(app)/page.tsx:125-140`。 |

---

## 3. お金

比較: `/console/payouts` ↔ `/app/s/money` ↔ `/app/rewards` ↔ `/vendor/rewards`

| ID | 項目 | console値 | 対面値 | 分類案 | 根拠 |
|---|---|---|---|---|---|
| MONEY-01 | 画面名 | 支払 | supplier: お金／partner: 報酬／vendor: 委託費 | 意図された差 | 支払者・受取者・取引種別に応じた主語。各 page header。 |
| MONEY-02 | タブ | パートナー報酬／サプライヤー請求 | supplier: 支払う／受け取る | partner/vendor: タブなし | 意図された差 | supplier だけ支払者と受取者を兼ねる。`app/console/payouts/page.tsx` / `app/app/s/money/page.tsx`。 |
| MONEY-03 | 期間 | 選択月＋累計 | supplier: 今月＋履歴／partner: 当年＋月別／vendor: 累計＋月別 | 不整合 | 同じ「合計」でも期間基準が面ごとに異なり、ラベルだけでは比較不能。各 rewards/money page。 |
| MONEY-04 | 主指標 | 今月の支払見込み・確定 | supplier: 今月の手残り／partner: 年間報酬／vendor: 委託費合計 | 意図された差 | ペルソナの主要判断に合わせた差。 |
| MONEY-05 | 支払済 | 支払済 | supplier: お支払い確認済み（請求）／partner: 支払済／vendor: 支払済 | 意図された差 | supplier は「当社への入金」、partner/vendor は「自分への支払」。各状態マップ。 |
| MONEY-06 | 未払い | 要支払い／確定前（今月集計中） | supplier: 締め済み・請求書待ち／partner: 未払い（確定）・振込予定／vendor: 未払い | 意図された差 | 工程が異なる。ただし同じ月次精算の対応表はない。`app/console/payouts/page.tsx` / 各 reward page。 |
| MONEY-07 | supplier charge `unbilled` | 未請求 | supplier: 締め済み・請求書待ち | 意図された差 | 内部処理語を対外向け行動語へ翻訳。`SupplierChargesPanel.tsx:14-18` / `app/app/s/money/page.tsx:14-18`。 |
| MONEY-08 | supplier charge `invoiced` | 請求済 | supplier: 請求済み | 不整合 | 同一DB状態で送り仮名が異なる。`SupplierChargesPanel.tsx:14-18` / `app/app/s/money/page.tsx:14-18`。 |
| MONEY-09 | supplier charge `settled` | 入金済 | supplier: お支払い確認済み | 意図された差 | console 内部語と supplier 安心語。`SupplierChargesPanel.tsx` / supplier `CHG_ST`。 |
| MONEY-10 | 凍結 | この月を締める（凍結）／凍結解除 | supplier: 締め済み・請求書待ち、変更不可の説明 | 意図された差 | 操作者だけに内部の凍結操作を見せる。`SupplierChargesPanel.tsx` / `supplier-guides.ts:94-100`。 |
| MONEY-11 | partner 支払内訳 | gross−源泉徴収=net | partner: 同じ源泉徴収内訳 | supplier: 紹介報酬集約／vendor: 対象外 | 意図された差 | 同じ値の出し分けは整合。`app/console/payouts/page.tsx` / `app/app/rewards/page.tsx`。 |
| MONEY-12 | vendor 支払内訳 | 委託費＋承認済経費 | vendor: 同じ | supplier: 支払側の委託費 | 意図された差 | 発注・運営・受注の三者で同一構成を表示。`app/console/payouts/page.tsx` / `app/vendor/(app)/rewards/page.tsx:62-72`。 |
| MONEY-13 | supplier waterfall | console: 支払単位の一覧 | supplier: 総受注額−紹介報酬−利用料=手残り | partner/vendor: なし | 意図された差 | supplier 固有の事業収支。`app/app/s/money/page.tsx`。 |
| MONEY-14 | 月別バー | console: 支払済=緑、その他=別色、0円非描画 | supplier: waterfall／履歴で別文法 | partner/vendor: 月別カード | 不整合 | 同じ月別比較に共通の色・0円・凡例文法がない。console payouts / 各 rewards page。 |
| MONEY-15 | CSV | 出力あり | supplier/partner/vendor: なし | 意図された差 | 運営の会計作業向け。`app/console/payouts/page.tsx`。 |
| MONEY-16 | 支払操作 | 凍結、支払済にする、戻す | supplier/partner/vendor: 読取のみ | 意図された差 | money 確定権限を console に閉じる。 |
| MONEY-17 | 振込口座導線 | 相手ごとの口座確認 | supplier: 受取口座表示／partner: プロフィールから変更／vendor: プロフィールから変更 | 意図された差 | 操作責任に応じた差。各 money/rewards page。 |
| MONEY-18 | 口座変更のGuide | console: 対象外 | supplier Guide: 「設定ページから申請」 | 実体: supplier settings の口座申請＋APPプロフィールにも口座表示 | 不整合 | 行き先と変更権限が二重に読める。`lib/supplier-guides.ts:101` / `app/app/s/settings/page.tsx` / `app/app/mypage/page.tsx`。 |
| MONEY-19 | ⓘ | PageGuideあり | supplier: PageGuideあり／partner: なし／vendor: なし | 欠落 | 税・確定・支払予定を扱う partner/vendor に説明入口がない。`console-guides.ts:202-223` / `supplier-guides.ts:89-104`。 |
| MONEY-20 | 空状態 | 対象はありません／すべて支払済 | supplier: 各内訳ごとの空表示／partner: 報酬はまだありません／vendor: 委託費はまだありません | 意図された差 | 次の行動と立場に応じた差。 |
| MONEY-21 | ブランド表記 | MB Partners | supplier: MB Partners／partner: MB Partners中心／vendor: 注記で「MB」 | 不整合 | vendor の対外UIだけ単独 `MB`。`app/vendor/(app)/rewards/page.tsx:39,72`。 |
| MONEY-22 | 状態ピル | 支払工程ごとのピル・行区分 | supplier: 文字＋ドット中心／partner/vendor: Hero 指標＋月行 | 不整合 | 同じ支払状態を認識する形・色・語が4面で共有されていない。各 page の status renderer。 |

---

## 4. パートナー管理・招待

比較: console partners＋invite ↔ supplier 招待（パートナー／委託先・分岐質問）↔ APP frontier 招待

| ID | 項目 | console値 | 対面値 | 分類案 | 根拠 |
|---|---|---|---|---|---|
| INV-01 | 招待kind | partner／frontier／supplier／delivery を選択 | supplier: partner または vendor、APP: frontier 固定 | 意図された差 | 招待者が作れる席を権限で限定。console invite / `InviteModal.tsx` / `FrontierInvite.tsx`。 |
| INV-02 | 分岐質問 | なし。kindを直接選ぶ | supplier vendor: 「営業・紹介を担う／実務を担う」 | 欠落 | console の delivery 招待には、誤席防止の平易な分岐質問がない。`app/app/s/partners/InviteModal.tsx:36-62`。 |
| INV-03 | メール | 全kind必須 | supplier: 任意（リンクだけ作成可）／frontier: 必須 | 不整合 | 同じ招待API系で入力要否が3通り。console invite form / `InviteModal.tsx` / `FrontierInvite.tsx`。 |
| INV-04 | 氏名 | partner/frontier任意、delivery必須、supplierは会社名 | supplier partner: 欄なし、vendor work時は必須／frontier: 任意 | 不整合 | partner招待だけ console/APP と supplier で氏名の採取可否が異なる。 |
| INV-05 | 会社名 | supplier kindで必須 | supplier: 自社から supplier を招待できない／frontier: なし | 意図された差 | supplier 席の発行は console に限定。 |
| INV-06 | 業務内容 | console delivery: 業務名・事業名 | supplier vendor: 「実務を担う」分岐で業務内容任意 | 不整合 | 同じ delivery/vendor kind で必須度とラベルが異なる。 |
| INV-07 | レートカード | supplier 招待時に選択 | supplier/APP: なし | 意図された差 | supplier 契約条件は console 管理。 |
| INV-08 | 紹介URL | 発行結果をコピー | supplier: メールなしでもコピー主体／frontier: メール送信主体 | 不整合 | 同じ招待成果物に対する主動線が統一されていない。 |
| INV-09 | 有効期限 | 7日を明記 | supplier/APP: 画面上の期限説明なし | 欠落 | 受け手に共有するリンクの寿命が対面画面で不明。console invite / supplier `InviteModal` / `FrontierInvite`。 |
| INV-10 | frontier 条件 | console: frontier kind | APP: チームに招待、12か月条件の説明 | 意図された差 | APP は自身のチーム条件を説明する必要がある。`FrontierInvite.tsx`。 |
| INV-11 | frontier 報酬語 | console: 内部条件 | APP: 「オーバーライド」 | 不整合 | 対外UIに内部語が露出。`app/app/frontier/FrontierInvite.tsx:27`。 |
| INV-12 | vendor 呼称 | console: デリバリー | supplier: 委託先、部品内説明にアサイン | 不整合 | console 内部語は許容候補だが、supplier 側「アサイン」は平易語彙に未追随。`InviteModal.tsx:50-60` / `supplier-guides.ts:46,77`。 |
| INV-13 | partner 呼称 | console: パートナー／リファラル（内部フィルタ） | supplier/APP: パートナー | 意図された差 | console 内部分類と対外語の差。console partners page / `copy-guideline.md`。 |
| INV-14 | 成功表示 | 招待送信結果＋コピー | supplier: コピー中心 | frontier: 送信完了 | 意図された差 | メール任意設計による差だが、成功後の次の一手は揃っていない。 |
| INV-15 | コピーボタン | コピー／コピー済み | supplier: `コピーしました ✓` | APPにも記号付き成功表現あり | 不整合 | ボタン文言の記号禁止正典と不一致。`InviteModal.tsx` / `docs/copy-guideline.md`。 |
| INV-16 | 一覧のkind | console: 5分類フィルタ＋状態/KPI | supplier: partner/vendorを別導線、一覧はパートナー中心 | APP: frontier一覧 | 意図された差 | 管理範囲が異なる。 |
| INV-17 | 招待前の役割説明 | kindごとの短い説明 | supplier: 分岐カードで詳しく説明 | frontier: チーム条件を説明 | 不整合 | 同じ誤招待防止情報が画面ごとに密度・タイミング違い。 |
| INV-18 | ⓘ | partners・invite双方にPageGuide | supplier: partners Guideあり | frontier: Guideなし | 欠落 | frontier の12か月条件・報酬関係に常設説明入口がない。`console-guides.ts:131-184` / `supplier-guides.ts:66-85`。 |
| INV-19 | 孤立部品 | console: 到達可能なinvite | supplier: `SupplierInvite.tsx` が参照ゼロで `InviteModal` と重複 | 過剰 | `rg "SupplierInvite"` で定義以外の参照なし。`app/app/s/partners/SupplierInvite.tsx`。 |
| INV-20 | 空状態 | console: フィルタ対象なし | supplier: パートナー招待を促す | frontier: チーム招待を促す | 意図された差 | 可能な招待行為に合わせた次の一手。各一覧 page。 |

---

## 5. 設定・プロフィール

比較: APP ↔ vendor ↔ supplier ↔ console。ここだけは要求どおり行の有無マトリクスにした。

| ID | 行・機能 | APP | vendor | supplier | console | 分類案 | 根拠 |
|---|---|---|---|---|---|---|---|
| PROF-01 | 画面名 | プロフィール＋設定 | プロフィール＋設定 | 設定（プロフィールはAPP共用） | 設定 | 意図された差 | `/app/mypage`, `/app/settings`, `/vendor/mypage`, `/vendor/settings`, `/app/s/settings`, `/console/settings`。 |
| PROF-02 | 氏名 | 表示・編集 | 表示（編集不可） | APPプロフィールへ | 表示名を編集 | 不整合 | 同じ自己情報でも vendor だけ氏名変更不可。各 mypage / console `ProfileSection`。 |
| PROF-03 | アバター | 頭文字中心 | 頭文字中心 | APP共用 | 画像アップロード | 意図された差 | console は運営者プロフィール画像を持つ。 |
| PROF-04 | メール表示 | あり | あり | 通知メールあり | ログインメールあり | 意図された差 | supplier 設定の通知先と認証メールは別概念。 |
| PROF-05 | メール変更 | `AccountSecurityPanel` | `AccountSecurityPanel` | `AccountSecurityPanel`（app surface） | なし | 欠落 | console だけ自己管理なし。`components/auth/AccountSecurityPanel.tsx` / console settings。 |
| PROF-06 | メール欄注記 | 「変更はサポート」系の旧注記＋下に変更機能 | vendorも同型 | supplierは変更機能あり | 読取のみ | 過剰 | APP/vendor の無効化メール欄説明が、新設済み自己変更機能と二重・矛盾。各 mypage。 |
| PROF-07 | 電話 | 表示・編集 | 表示・編集 | 会社電話を編集 | なし | 意図された差 | 個人面と法人面の違い。 |
| PROF-08 | 住所 | 表示・編集 | 表示・編集 | 会社情報側 | なし | 意図された差 | 運営者には業務上不要。 |
| PROF-09 | 税区分 | 表示 | 表示 | 会社税区分 | なし | 意図された差 | 支払対象者・請求主体のみ。 |
| PROF-10 | インボイス | 表示・編集 | 表示（編集不可） | 会社情報／申請 | なし | 不整合 | vendor の自己情報だけ変更入口がない。 |
| PROF-11 | 振込口座 | 表示・編集 | 表示（編集不可） | 変更申請 | なし | 意図された差 | supplier は凍結・審査対象、ただし vendor の変更不能理由は画面上不明。 |
| PROF-12 | パスワード変更 | あり | あり | あり | なし | 欠落 | console 運営者だけ自己回復不能。K4。`AccountSecurityPanel` の利用箇所と `/console/settings/page.tsx`。 |
| PROF-13 | 現在パスワード再確認 | あり | あり | あり | なし | 欠落 | K4 の具体的機能差。`components/auth/AccountSecurityPanel.tsx`。 |
| PROF-14 | 会社名・ID | なし | なし | あり | なし | 意図された差 | supplier 法人席固有。`app/app/s/settings/page.tsx`。 |
| PROF-15 | 変更申請履歴 | なし | なし | あり | なし | 意図された差 | supplier の凍結項目変更フロー固有。 |
| PROF-16 | サービスガイド | 設定にあり | なし | supplier各面のPageGuide | console各面のPageGuide | 欠落 | vendor 設定だけガイド入口がない。K6。`app/app/settings/page.tsx` / `app/vendor/(app)/settings/page.tsx`。 |
| PROF-17 | 利用規約・ヘルプ | あり | あり | APP設定を利用可能 | console設定にはなし | 意図された差 | console は社内面。ただし運営者のヘルプ入口は別途確認要。 |
| PROF-18 | サポート | あり | あり | APP設定を利用可能 | 問い合わせ管理のみ | 意図された差 | 問い合わせる側と受ける側。 |
| PROF-19 | アプリ内通知 | ON/OFF | ON/OFF | APP共用 | イベント別設定 | 意図された差 | console は送受信運用の粒度が高い。 |
| PROF-20 | メール通知 | ON/OFF | ON/OFF | 通知メール先＋APP共用 | イベント別＋宛先 | 意図された差 | supplier は法人連絡先も持つ。 |
| PROF-21 | プッシュ／LINE | APP: push＋LINE | なし | APP surfaceのpush可否は設定ページに明示なし | Slack・メール | 意図された差 | チャネル機構の差。ただし利用可否の説明は欠落候補。 |
| PROF-22 | メンバー管理 | なし | なし | パートナー管理は別画面 | console: 運営メンバー | 意図された差 | 組織管理責任の差。 |
| PROF-23 | 運用設定 | なし | なし | なし | メールテンプレ・監視・カレンダー・目標・監査 | 意図された差 | console 固有。`lib/console-guides.ts:353-370`。 |
| PROF-24 | ログアウト・版数 | APP設定に両方 | vendor設定に両方 | supplier設定にログアウト、版数はAPP shell | console設定内にはなし | 不整合 | 同じ設定終端の行構成が面ごとに異なる。各 settings page。 |

---

## 6. 通知

比較: APP inbox ↔ vendor 通知 ↔ supplier

| ID | 項目 | APP値 | 対面値 | 分類案 | 根拠 |
|---|---|---|---|---|---|
| NOTE-01 | 画面 | `/app/inbox` | vendor: `/vendor/inbox`／supplier: `/app/inbox`共用 | 意図された差 | supplier はAPP identityを共用。`components/AppNav.tsx`。 |
| NOTE-02 | 情報源 | personal notifications＋broadcasts | vendor: bundleから派生／supplier: APPと同じ | 意図された差 | vendor は契約・お金イベントに限定。`VendorInboxClient.tsx:5`。 |
| NOTE-03 | タブ | すべて／あなた宛／お知らせ | vendor: なし／supplier: APPと同じ | 欠落 | vendor は種別フィルタがなく、件数増加時の探索手段がない。 |
| NOTE-04 | お知らせ配信 | news/tips broadcastsあり | vendor: なし／supplier: あり | 意図された差 | vendor は実務連絡だけという正典。APP inbox client / vendor inbox client。 |
| NOTE-05 | 個人通知種別 | 報酬確定・支払・問い合わせ返信ほか | vendor: 経費承認/却下・支払・委託提示／supplier: APP個人通知 | 意図された差 | ペルソナごとのイベント。 |
| NOTE-06 | supplier固有通知 | APP一般通知の型 | supplier: 変更申請・請求・委託承認を区別する専用表示なし | 欠落 | supplier shellで同じ inbox を使うが、supplier固有イベントの表示語・絞込が定義されていない。 |
| NOTE-07 | 既読（個人） | `read_at` を保存 | vendor: read-stateなし／supplier: APPと同じ | 欠落 | vendor は開いても未読状態を記録できない。`VendorInboxClient.tsx:5`。 |
| NOTE-08 | 一括既読 | あり | vendor: なし／supplier: あり | 欠落 | vendor の通知量増加時に未読整理不可。APP inbox client。 |
| NOTE-09 | broadcast既読 | UI上は行ごとの既読変化なし | vendor: 対象外／supplier: APPと同じ | 欠落 | `broadcast_reads` 系APIがある一方、inbox表示から利用されない。APP inbox client / broadcasts API。 |
| NOTE-10 | リンク | 通知種別に応じて詳細へ | vendor: 全件案件・報酬へ／supplier: APPと同じ | 意図された差 | 行動先に応じる。 |
| NOTE-11 | 空状態 | まだ通知はありません／まだお知らせはありません | vendor: 通知はありません／supplier: APPと同じ | 不整合 | 同じ空状態の一言文法が二種類。各 inbox client。 |
| NOTE-12 | ⓘ | なし | vendor: なし／supplier: なし | 欠落 | 種別・既読・配信対象の差を説明する入口がない。各 inbox page / guide registry。 |

---

## 7. 語彙横断表

同概念異語を、出現ファイルと行つきで列挙した。内部console専用語は「意図された差」候補、対外面に漏れた内部語は「不整合」候補とした。

| ID | 概念 | console値 | 対面値 | 分類案 | 根拠（出現ファイル:行） |
|---|---|---|---|---|---|
| VOC-01 | `in_progress` | 商談中 | supplier/partner: 対応中、vendor: 実行中 | 不整合 | `app/console/deals/_parts.tsx:268`, `app/console/analytics/AnalyticsClient.tsx:82`, `lib/status.ts:14`, `lib/vendor-status.ts:11`。K1 |
| VOC-02 | 進行中 | プロジェクト列「進行中」 | APP一覧: 受付＋対応中の集合も「進行中」、vendor: 委託の集合も「進行中」 | 不整合 | `lib/console-guides.ts:16`, `app/app/cases/page.tsx:138`, `app/vendor/(app)/page.tsx:24,86,122`。同語が3粒度。 |
| VOC-03 | expense `rejected` | ダッシュボード「差戻し経費」 | vendor: 却下 | 不整合 | `app/console/page.tsx:250`, `lib/vendor-status.ts:39`, `lib/vendor-data.ts:129`。K5 |
| VOC-04 | 経費操作 | 却下しました／差戻しましたを別操作にも使用 | vendor: 却下／ホームは差し戻された経費 | 不整合 | `app/console/deals/page.tsx:241`, `app/vendor/(app)/page.tsx:27,34`, `lib/console-guides.ts:64`。DB状態と操作の対応を要裁定。K5 |
| VOC-05 | hearing UI | ヒアリング | supplier/partner: ヒアリング | 意図された差 | 正表記はUIで概ね統一。`app/console/services/HearingItemsEditor.tsx:35,43`, `app/app/s/products/MenuOpsEditor.tsx:103`, `supplier-guides.ts:56`。K3 |
| VOC-06 | hearing 結合キー | ヒヤリング | supplier/API/checklistもヒヤリング | 不整合 | `ServicesClient.tsx:22`, `MenuOpsEditor.tsx:9`, `app/api/supplier/menu-ops/route.ts:18`, `lib/coop-task-display.ts:11`, `components/TaskChecklist.tsx:17,29`。K3 |
| VOC-07 | `services.name` | ブランド名（必須） | supplier: サービス名 | 不整合 | `ServicesClient.tsx:841`, `ProductsClient.tsx:203`。K2 |
| VOC-08 | `short_description` | 一言説明 | supplier: ひとこと説明 | 不整合 | `ServicesClient.tsx:922`, `ProductsClient.tsx:241`。K2 |
| VOC-09 | audience | こんな方に（Who） | supplier: こんなお客さまに | 不整合 | `ServicesClient.tsx:853`, `ProductsClient.tsx:207`。K2 |
| VOC-10 | referral hook | 紹介対象（フック文） | supplier: 紹介しやすい方 | 不整合 | `ServicesClient.tsx:850`, `ProductsClient.tsx:208`。K2 |
| VOC-11 | menu detail | 詳細説明 | supplier: 詳しい説明 | 不整合 | `ServicesClient.tsx:925`, `ProductsClient.tsx:242`。K2 |
| VOC-12 | service description | 説明（〜とは） | supplier: サービス概要 | 不整合 | `ServicesClient.tsx:847`, `ProductsClient.tsx:206`。K2 |
| VOC-13 | service URL | サービスサイト URL | supplier: WebサイトURL | 不整合 | `ServicesClient.tsx:856`, `ProductsClient.tsx:209`。K2 |
| VOC-14 | 委託提示 | 提示中／ベンダーの承諾待ち | supplier: 提示中、vendor: 承諾待ち | 意図された差 | `DealDrawer.tsx:484`, `app/console/deals/page.tsx:389`, `lib/vendor-status.ts:28`。視点差候補。 |
| VOC-15 | 委託受諾済 | 了承済 | supplier: 了承済、vendor: 了承済 | 意図された差 | `lib/vendor-status.ts:29`、console/supplier assignment status renderer。整合例。 |
| VOC-16 | supplier請求 `unbilled` | 未請求 | supplier: 締め済み・請求書待ち | 意図された差 | `app/console/payouts/SupplierChargesPanel.tsx:14-18`, `app/app/s/money/page.tsx:14-18`。 |
| VOC-17 | supplier請求 `invoiced` | 請求済 | supplier: 請求済み | 不整合 | 同上。正典の送り仮名と面別文言を要裁定。 |
| VOC-18 | supplier請求 `settled` | 入金済 | supplier: お支払い確認済み | 意図された差 | 同上。 |
| VOC-19 | 確定状態の送り仮名 | 支払済／承認済 | supplier Guide: 支払済み／確定済み | 不整合 | `docs/copy-guideline.md`, `lib/supplier-guides.ts:39`, `app/console/payouts/page.tsx:292,296`。 |
| VOC-20 | vendor呼称 | console: デリバリー／ベンダー | supplier: 委託先だが説明にアサイン | 不整合 | `lib/console-guides.ts:62-64`, `lib/supplier-guides.ts:46,77`, `app/app/s/partners/InviteModal.tsx`。console内部語は候補、supplier露出は正典違反候補。 |
| VOC-21 | frontier報酬 | console: 個別条件・内部のoverride | APP: オーバーライド | 不整合 | `app/app/frontier/FrontierInvite.tsx:27`, `app/app/dashboard/FrontierSection.tsx:116,118,176`。対外面に内部語。 |
| VOC-22 | 社名略記 | console含む多くは MB Partners | vendor rewards/terms: MB | 不整合 | `app/vendor/(app)/rewards/page.tsx:39,72`, `app/vendor/(app)/terms/page.tsx:7,9`。対外表記正典と不一致。 |
| VOC-23 | ボタン動詞 | 保存する | supplier案件の一部: 保存／項目を保存 | 不整合 | `docs/copy-guideline.md` の動詞終止形、`app/app/s/deals/page.tsx:200,252`, `app/console/services/HearingItemsEditor.tsx`。 |
| VOC-24 | 紹介の構造 | APP/対外: チーム・紹介者 | 公開面の一部: 紹介の流通網 | 不整合 | `app/partners/page.tsx:333` の「紹介の流通網」出力と `docs/copy-guideline.md` の「網」禁止。公開面なので内部語例外外。 |

---

## 横断所見（裁定材料、仕様確定ではない）

1. 最も多い差は「同じDB値に異なる表示語」ではなく、権限・視点に応じた**意図された差の候補**だった。これは一律統一せず、各行の根拠を保ったまま裁定する必要がある。
2. その中で優先度が高く見える候補は、(a) 同一状態 `in_progress`、(b) 経費 `rejected`、(c) サービス編集7ラベル、(d) hearing のUI語と結合キー、(e) console 自己管理欠落、(f) vendor Guide欠落、(g) 対外面の `MB`／`オーバーライド`／`アサイン` である。
3. PageGuide は console と supplier には広くある一方、partner案件詳細、vendor案件詳細、partner/vendor money、frontier招待、通知にはない。単に増やすのではなく、常設説明文ゼロ原則との整合を裁定すべきである。
4. supplier はAPP identityを共用するため、プロフィールと通知がAPP部品を再利用する。その結果、supplier固有の会社情報・請求・変更申請と、個人プロフィール・個人通知の境界が画面間に分散している。
5. 到達可能性の機械検索で `app/app/s/partners/SupplierInvite.tsx` は定義以外の参照がなく、現行 `InviteModal` と機能が重複する孤立候補だった。

## money 4ハッシュ・非接触証明

本バッチは開始・終了とも同一の `BEGIN READ ONLY` トランザクションで正典SQLを実行した。途中のDB操作はこの読取のみ。

| 指標 | 開始時 | 終了時 | 判定 |
|---|---|---|---|
| menu_rewards 全行 | `c5317c594d08ee0afea4a4764082876c` | `c5317c594d08ee0afea4a4764082876c` | 一致 |
| deals reward | `f0cda850919327978126ece73d303434` | `f0cda850919327978126ece73d303434` | 一致 |
| supplier fee | `(empty)` | `(empty)` | 一致 |
| partner override | `(empty)` | `(empty)` | 一致 |
| MB seed補助 | 16行 / ¥340,100 | 16行 / ¥340,100 | 一致 |
| 勝彦deals | 3件 | 3件 | 一致 |

注: 現DBでは `menu_rewards` 全16行・合計¥340,100が撤去後のMB seed全体であり、正典値と一致した。

## 変更・非変更証明

- 新規成果物: `docs/reports/ux5-parity-matrix.md` のみ。
- プロダクトコード: 変更なし。
- DB: `BEGIN READ ONLY` の `SELECT` のみ。書込0件、fixture 0件、残置0件。
- 外部送信: 0件。
- デプロイ: なし。
- タグ: なし。
- 着手前から存在したスクリーンショット7枚の未コミット変更は、本バッチでは変更・復元・stageしていない。
