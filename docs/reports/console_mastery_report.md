# MB Partners コンソール操縦席プログラム 統合レポート（2026-07-04）

自走・無確認で完遂。土台=`873609c`（着手時HEADは直後のdocsコミット0abeced・working tree clean）→ 6コミット → **デプロイHEAD=`084a5f3`（READY・/app/settings実描画でstamp一致を実測）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。監査2並列＋実装2並列のサブエージェント使用。

- タグ: `deploy-console-mastery-20260704`=084a5f3 ／ `rollback-console-mastery-baseline`=873609c
- 検証green: build exit 0・3面未認証307・webhook無署名401・page errors []・stamp=HEAD・money不変（§5）
- **モックについて**: 指定の確定モック2枚（console_kanban_status_translation_layer／console_deal_detail_and_service_master_preview）は環境内全走査（mdfind・Downloads・Desktop・Documents・リポジトリ）で発見できず。ミッション本文の意図記述（各節の仕様）を確定アンカーとして採用した（安全側の自己決定・§4）。

---

## 1. 案件ボード「ステータス翻訳レイヤー」（成功基準1: 達成）

- **正典レイヤー新設 `lib/status-effects.ts`**: statusTranslation（3面ラベル）／transitionForecast・forecastLine（遷移の結果予告と波及=ripple判定）／statusEntryEffects（マトリクス用）／OPS_NEXT_ACTION（詳細CTA定義・データ分離）。
  - **ハードコードでないことの証明**: ラベルは DEAL_STATUS（=APPの実表示）と VENDOR_DEAL_ST から、メール名は mail-registry キー参照から導出。単体テスト**61 assertion**が「正典と完全一致」を全5ステータスで強制（`lib/status-effects.test.ts` — 正典を変えれば写像も変わる構造）。
  - 副産物の発見: 旧Wave2の `PARTNER_STAGE`（MB対応中/見送り等）は**どの画面にも描画されない死語彙**と判明→撤去。APP案件一覧/詳細のローカルSTATUS_LABELをDEAL_STATUS導出へ置換（パートナー表示自体を正典単一ソース化＝翻訳の真実性を担保）。
- **写像2行**: shodan各レーンヘッダ直下に「パートナー：◯◯／デリバリー：◯◯」（11px muted）。projectレーンは全6列が同一値（confirmed の翻訳）のため**先頭の展開列に1回だけ表示**（同一値6連発を避ける最適化・折りたたみ列は非表示。モック意図との差分として記録）。本番実描画で受付/商談中の写像をgreen実測。
- **ドロップの結果予告**: 波及あり（表示変化 or メール送信）＝確定前確認モーダル（「◯◯様を「対応中」へ移動しますか」＋forecastLine＋移動する/キャンセル）。project間移動＝波及なし（両面に非公開の社内語彙・通知ゼロを実装監査で確認）→**即時＋8秒Undoトースト（元に戻す）**。confirmed遷移の既存ガード（明細0/率base未入力→baseModal）は温存。
  - 検証note: ブラウザHTML5 DnDの自動操作は不安定なため、確認/Undo分岐は**正典の単体テスト（ripple判定・全遷移のforecastLine生成）＋実装レビュー**で担保し、モーダbr/マトリクス/写像は本番実描画で確認（レポート§スクショ）。メール送信を伴う遷移はCC検証では実行していない（実送信ゼロ）。
- **ⓘ→ステータスマトリクス**: h1隣のⓘ→「ステータスと3面の表示」1画面（運営ドット×パートナー×デリバリー×通知メール＋project_status注記行＋設定→メールへのリンク）。全値が statusTranslation/statusEntryEffects 由来。本番実測green（スクショ cm_status_matrix.png）。

## 2. 案件詳細「次にやること＋結果予告」（成功基準2: 達成）

- 「次にやること」を **OPS_NEXT_ACTION 駆動**に刷新: ステータス連動CTA1つ＋**直下に必ず forecastLine 1行**（例: 受付=「お客さまへ連絡済みにして商談中へ」→「パートナーには「対応中」と表示・デリバリーには「実行中」と表示・パートナーへ「状況更新」メールを送信（受付からの遷移時のみ）」）。特殊分岐（明細0→金額セクション誘導／率base未入力→入力誘導／lost90日内復活／paid完了表示）は全維持＋各々に結果説明。
- **タブ廃止→縦1カラム**: 概要→進行→金額・原価→管理操作（SectionHead・0.5px規律）。**金額・原価は受付〜対応中で折りたたみ（既定閉・「成約時に確定します」注記）、成約以降は前面化**。動的import（DeliveryProgress等）は開くまで非マウント＝性能特性維持。
- 全ステータス変更ボタン・project/review選択に結果予告サブテキスト。
- **既存機能の喪失ゼロ（before/after対比）**: 監査で確定した全機能ブロック21種（DealStepper／基本情報／部署役職／ゲート判定2種／プロジェクト状態／稟議／協力タスク+ヒアリングnote／実績金額／継続月次／不成立詳細+復活／ステータスボタン群／案件取消／明細CRUD／デリバリー割当／経費（追加/承認/却下/削除/領収書）／P&L／明細追加／DeliveryProgress／baseModal／lostModal／directModal）を再配置後もgrepで全数残存確認。selected同期・needsMigration分岐・editable判定・確定ガードは非接触。
- ユニットテスト: OPS_NEXT_ACTION の5ステータス網羅＋全25遷移の forecastLine 生成を検証（61 assertion green）。実描画: 受付案件でCTA+予告の表示green（スクショ cm_deal_detail.png）。

## 3. サービスマスタ「ライブプレビュー」（成功基準3: 達成）

- **★診断結果**: services.image_url／menus.description は「退行」ではなく**新設（コミット6716d45）直後から未活用**。真因は (a) image_url=編集ドロワーにUIはあるが **POST（新規作成）APIが受理せず捨てる**＋反映先が見えない、(b) description=**編集ドロワーに欄が無く**一覧の極小インライン✎のみ＝埋没。両列とも実データ0件（psql実測）がこれを裏付け。
- **復旧**: POST /api/console/services が image_url/target_audience/category を受理・保存。ドロワーのメニュー編集器に「メニュー詳細説明」欄を追加し reconcileMenus→PATCH menus へ配線。
- **ライブプレビュー**: ドロワー2ペイン化（右336px）。「一覧カード⇄詳細シート」切替・編集と同期・ImageUploadは即ヒーロー反映。詳細シートは**実物 components/MenuDetailSheet を inline prop（additive）でそのまま描画**＝APPと実物一致（APP側挙動はバイト不変）。空欄には点線ヒント6種（「説明を入力すると事業概要ⓘが表示されます」等）＝埋めるほど良くなる実感。
- **3画面の同一文法**: A基本情報（各ラベルに表示先を明記）／Bメニューと報酬／C公開状態（「停止するとAPPの紹介一覧から非表示になります」）。保存ボタンに「保存するとAPPに即時反映されます」。新規作成→即メニュー追加の流れを実現（従来は新規サービスにメニュー追加不能だった欠陥も解消）。
- 死コード大掃除: 恒久`{false&&}`2ブロック・段階5スカフォールド・taskTpls死配線・create張りぼて等を削除（**1478→1129行**・挙動不変・money経路バイト不変をdiff確認）。
- 実描画green: プレビュー切替／A/B/C文法／詳細説明欄／結果予告（スクショ cm_services_preview.png / cm_services_sheet_preview.png）。

## 4. モック差分・裁量採用・自己決定の記録

1. **モック実ファイル不在**→ミッション本文の意図記述をアンカー採用（全走査済み）。
2. projectレーンの写像は「全列に2行」でなく**先頭展開列に1回**（6列同一値の繰り返しはノイズ・意図（見るだけで分かる）は維持）。
3. パートナー語の写像元は PARTNER_STAGE でなく **DEAL_STATUS**（前者は死語彙と実測判明。APP実表示との一致こそが翻訳の真実性）。
4. ドロップ確認は「メール送信 or 表示変化を伴う遷移」のみ・project間はUndo（確認疲れ防止の意図を波及判定=rippleとしてデータ化）。
5. 詳細シートプレビューは複製でなく**実物コンポーネントのinline化**（乖離不能・additive）。一覧カードプレビューはBrandCardがrefer専用ローカルのため同文法の簡易再現（PreviewCard・報酬記法は共通関数を再利用）。
6. 新規作成のBメニュー編集は「create後に編集ドロワーへ自動遷移」方式（最小実装・作成→即メニュー追加の体験は同等）。
7. DnD自動テストは行わず単体テスト＋実描画で担保（HTML5 DnDのヘッドレス自動化は不安定・実送信ガード優先）。

## 5. money証明・DDL・検証

- **DDL: 本プログラムでは追加ゼロ**（正典拡張はコードのみ・additive）。
- menu_rewards **16行 / sum=340,100** 前後一致 ✓・deals報酬ハッシュ `6e4c6047…` 不変 ✓・勝彦deals 3件残置 ✓・reward_snapshot/報酬計算/deal作成 非接触（status-effectsは表示・予告の純データ層）✓
- 外部送信: ライブ送信ゼロ・実予約ゼロ・検証残置データゼロ（今回の検証は読み取りとUI操作のみ）
- build exit 0／単体テスト（status-effects 61・reward-format 8・narrative 6 ほか）green／3面307／webhook401／page errors []／stamp=084a5f3=HEAD
- スクショ: docs/reports/screens_integrity/ cm_board_translation / cm_status_matrix / cm_deal_detail / cm_services_preview / cm_services_sheet_preview

## 6. コミット一覧（rollback-console-mastery-baseline..deploy-console-mastery-20260704）

4425e43 正典レイヤー（status-effects＋単体61）→ statusEntryEffects追加 → e04ca79 サービスマスタ再生 → 084a5f3 ボード翻訳レイヤー＋詳細直感化
