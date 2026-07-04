# MB Partners コンソール静音化v2 統合レポート（2026-07-04）

自走・無確認で完遂。土台=`084a5f3` → 4コミット → **デプロイHEAD=`f6c41a8`（READY・stamp実測一致）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。実装2並列のサブエージェント使用。

- タグ: `deploy-console-silent-v2-20260704`=f6c41a8 ／ `rollback-console-silent-baseline`=084a5f3
- 検証green: build exit 0・3面未認証307・webhook無署名401・page errors []・stamp=HEAD・money不変（§5）・**本番実描画のFOUND/MISSING 17/17 green**
- 前バッチの機構（ripple判定・OPS_NEXT_ACTION・forecastLine・ⓘマトリクス・ライブプレビュー・ドロップ確認/8秒Undo）は**意味不変で露出のみ変更**。新原則5箇条は docs/copy-guideline.md「5b. コンソール静音化v2」へ恒久追記済み
- モック2枚（console_deal_detail_v2_silent／service_master_v2_and_board_header_silent）は今回も環境内全走査で実ファイル不在→ミッション本文のpixel級記述を確定アンカーとして採用

## A. 案件詳細v2（FOUND全数）

- ヘッダ1行: ロゴ36px＋お客さま名16px/500＋「ブランド ─ メニュー」12px muted＋右に7pxドット+ステータス語12px＋報酬ピル・下0.5px罫線
- 焦点=動詞ボタン1つ（塗り・13px・枠/見出し/常設予告なし）。**結果予告は押下時の確認ダイアログ本文へ移設**（forecastLine＋条件・実行する/キャンセル）— 本番実測: CTA押下→「パートナーには「対応中」と表示・デリバリーには「実行中」と表示・パートナーへ「状況更新」メールを送信…」がダイアログにFOUND・常設ではMISSING
- 本体2カラム（1.5:1・0.5px縦罫線・カード枠なし）: 左「進行」=縦タイムライン（7pxドット+1px縦線・完了=accent塗り/現在=ring/未来=枠・項目13px+日時11px）＋既存機能を枠なし再配置／右「お客さま」=連絡先（customer_email・一覧APIへ読み取り追加）+ヒアリング+「金額・原価 ▸」（クリック展開・成約/支払/不成立は自動展開・閉時は非マウント維持）
- 特殊分岐も動詞ラベルで完結:「明細を追加して成約へ」「実績金額を入力して成約へ」「案件を再開する」・paidはボタン非表示（ステータス行が語る）

**機能喪失ゼロ（21ブロック再配置マップ）**: DealStepper→縦タイムライン／基本情報→ヘッダ+タイムライン+右カラム行／部署役職→右カラム／ゲート判定2種→左枠なしテキスト／プロジェクト状態・稟議select→左（説明文はtitle属性へ）／協力タスク+note→左（noteは右ヒアリングにも）／実績金額→左／継続月次→左（ContinuousMonthly不変）／不成立+復活→タイムライン終端+CTA／ステータス前進→CTA一本化・後退→管理操作（ダイアログ経由）／取消→管理操作／明細CRUD・デリバリー割当・経費4種+領収書・P&L・明細追加・DeliveryProgress→「金額・原価」展開内／baseModal・lostModal・directModal→不変。grep全数残存確認・確定ガード/selected同期/needsMigration/遅延import非接触。CTA/ダイアログ文言のユニット網羅は status-effects 61 assertion 維持green

## B. サービスマスタv2（FOUND全数）

- マスター/ディテール3ペイン（幅min(1080px,96vw)）: 左ナビ132px（ブランド名13px/500→基本情報→メニュー名列12px・選択中accent文字→「＋ メニュー追加」・0.5px右罫線）｜中央フラットフォーム（A/B/Cカード箱を解体・ラベル11px muted+0.5px/radius8入力欄の縦流し・基本情報=名前/カテゴリ/説明（〜とは）/紹介対象（フック文）/Who/URL/ロゴ・イメージ横並び2枠/サブタイトル/公開トグル・メニュー選択=名前/一言説明/詳細説明/報酬/タスク）｜右ライブプレビュー336px（実物inline描画維持・一覧⇄シート切替・**左ナビ選択にシートが自動追従**）
- 一言説明もドロワーへ集約（short_description・既存API受理のみ）。新規追加=左ナビ「新規」1項目から始まる同一文法
- 点線ヒント全種・結果予告文を全廃＝**空欄はプレビューの空白自身が語る**
- money境界: reconcileMenusの報酬payload・menu-rewards/task-templates呼び出しバイト不変をdiff確認

## C. ボード（FOUND/MISSING全数）

- レーンヘッダ=ステータス名14px/500＋件数mutedのみ。**写像2行の常時表示はMISSING実測**、hover/タップの**ツールチップ**（var(--txt)地・#fff・11px・radius8・statusTranslation正典由来）でFOUND実測。projectはグループ見出しに1回
- カード2行文法（名前13px/500＋ブランド─メニュー11px muted＋担当3行目）
- ドロップ確認・8秒Undo・ⓘマトリクスは不変

## D. 常設説明テキストの削除一覧（3画面横断・DOM MISSING）

案件詳細（14種）: 「次にすること」枠+見出し／CTA直下forecast常設行／paid「この案件は完了しています」／「社内管理・…表示されません」→title／「保存すると…表示されます」→title／対応範囲の説明文／管理操作3ボタン下のforecastLine常設→ダイアログ・title／「成約時に確定します」／レーン写像2行→ツールチップ／空レーン「ここにドラッグして移動」／「成約後はロック」／「不成立のため編集不可」／「復活期限切れ…」／P&L「※受注額未入力…」
サービスマスタ（8種）: A/B/Cカード箱／PreviewHint点線全種／「保存すると…即時反映されます」／「停止すると…非表示になります」／一覧「表示中/APPに出ません」／「編集内容は…表示されます」「作成すると…追加できます」／ラベル表示先注記全6種／ボタン尾部「…へ反映/公開」
例外申請: なし（すべて構造・ラベル・ダイアログ・title属性で代替できた）

## §5 money証明・検証

- DDL追加ゼロ。menu_rewards **16行/sum=340,100** 前後一致 ✓・deals報酬ハッシュ `6e4c6047…` 不変 ✓・勝彦deals残置 ✓・確定ガード/reward_snapshot/deal作成 非接触 ✓・ライブ送信ゼロ・実予約ゼロ
- build exit 0／status-effects 61 assertion green／3面307／webhook401／page errors []／stamp=f6c41a8=HEAD
- スクショ: sv2_deal_detail / sv2_cta_dialog / sv2_board_tooltip / sv2_services_3pane / sv2_services_menu（docs/reports/screens_integrity/）

## コミット（rollback-console-silent-baseline..deploy-console-silent-v2-20260704）
a94303c 規範5b追記 → 1a09a1d サービスマスタ3ペイン → f6c41a8 案件詳細2カラム+ボードツールチップ
