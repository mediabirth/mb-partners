# MB Partners コンソール静音化v2.1 統合レポート（2026-07-04）

自走・無確認で完遂。土台=`f6c41a8` → 4コミット → **デプロイHEAD=`78f2dac`（READY・stamp実測一致）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。実装2並列のサブエージェント使用。

- タグ: `deploy-console-silent-v2-1-20260704`=78f2dac ／ `rollback-console-silent-v2-1-baseline`=f6c41a8
- 検証green: build exit 0・3面307・webhook401・page errors []・stamp=HEAD・money不変（§5）・**本番FOUND/MISSING 17/17**（初回16/17→残1件はテストが検証対象と別のselect＝トップバーのMB担当フィルタを操作していたことが原因。正しい対象で再実測しgreen）
- モック（board_zones_badge_and_service_master_list_v2）は環境内に実ファイル不在→ミッション本文を確定アンカーとして採用（従来どおり記録）

## A. ボード仕上げ（FOUND/MISSING実測）

1. **要対応バッジ**: 赤字テキストピルMISSING実測・カード右上7px赤丸FOUND（title=判定根拠から導出「要対応: 実績金額が未入力／却下された経費があります／受注額（売上）が未入力」の該当連結・カード体裁不変）
2. **「成約・未着手」→「成約」**: MISSING実測。ラベルは `DEAL_STATUS.confirmed.label` 正典導出へ（status-effects 61 assertion green維持）
3. **空レーン常時表示**: 畳み機構（state・縦書きヘッダ・畳むボタン）全撤去。納品完了/保留レーンの常時表示をFOUND実測
4. **ゾーン見出し**: PHASE_LABEL正典（商談/プロジェクト）由来の11px muted 1行＋ゾーン間24pxガター（レーン間12px）。各レーンの旧極小グループラベルは一本化のため撤去。**色・枠・背景の追加ゼロ**

## B. 案件詳細の張りぼて根絶

- **動作全数表（19要素）**: 全インタラクティブ要素を「動く18／削除1（稟議）／提案0」に分類＝宙に浮きゼロ（全表はコミットfccbeedのレポート部・エージェント報告に基づき§Bに転記済み・主要: CTA/タスク/明細CRUD/経費4種/コピー/details すべて配線健在）
- **MB担当の修理＋実測**: 配線は健在で、真因は「金額・原価折りたたみ内への埋没」と「保存後の無フィードバック」。右カラム「お客さま」へ常時可視で移設＋savePnl成功時の楽観更新を追加。**本番実測: ドロワーのselectで「神原勝彦（owner）」選択→PATCH pnl→deals.director_id=39b30d21…をpsql確認→原状復帰（null）まで完走green**
- **稟議ステージの概念廃止**: UI・saveReviewStage・型を撤去（MISSING実測）。API route `/review-stage`・DB列 `review_stage`・既存データは**deprecate残置**（乖離リスト: 将来削除候補。パートナー面の細分化表示は前バッチで既に死語彙化しており利用箇所ゼロ）
- **「協力・紹介」区分語の根絶（grep一覧）**:
  - 正典: `INTAKE_LABEL.referral_coop`「紹介・協力」→**「紹介」**（lib/phase.ts＝流入チップ/フィルタへ一括波及）／analyticsのローカル直書き→「紹介」／status.tsコメント追随
  - deals/page.tsx: カード注釈「紹介・協力パートナー名」→「パートナー名」・起票コメント→「パートナー経由の商談起票」・流入フィルタ表示「パートナー経由」
  - **UI表示に「協力」の区分語は残存ゼロ**をgrepで確認。正当残置: `channel==='cooperation'`等のコード値・deal_tasks機構・機能名称（対応範囲/協力タスク＝タスク群名称）・lib/coop-*のAPP側機能語

## C. サービスマスタ一覧v2＋ドラッグ並び替え

- **一覧v2**: 1行1ブランド0.5px罫線リスト（グリップ14px→ロゴ32px/r8→名前14px/500＋カテゴリ11px→「メニュー N」12px→7px公開ドット（公開=accent塗り/停止=枠）＋語→chevron）。行クリック=編集3ペイン。旧インライン編集群・▲▼・公開トグル・説明文は一覧から全撤去（MISSING実測）→編集は3ペインへ集約（担当selectも基本情報/メニューペインへ移設）
- **タスク説明**: 独立TaskDescriptionEditor（services/page.tsx直置き）を廃止し、3ペイン中央・メニュー選択時の協力タスク内インライン✎へ統一（旧配置MISSING実測・既存API流用・コンポーネントファイル削除）
- **DnD並び替え（追補）**: ボードと同文法のHTML5 DnD（ライブラリ追加なし・ボタン式UI廃止）。ブランド行→services.sort・左ナビメニュー→menus.sortを**変更行のみPATCH即保存＋8秒Undo**。sortの書込はドロップとUndoのみ（マウント時等の自動書換なし）。APP波及: attachMenus/referがsort昇順描画であることを確認済み＝並びがそのまま反映
- **検証**: ヘッドレスDnD自動操作は不安定なため前例どおり「保存経路のAPI実測＋実装レビュー＋単体テスト」で担保——**PATCH sort=99→psql永続確認→原状復帰（0-5の基準値と完全一致をpsql突合）**。ブラウザ実DnDは勝彦実機での最終確認事項として明記

## §5 money証明・検証・残置

- menu_rewards **16行/sum=340,100** 前後一致 ✓・deals報酬ハッシュ `6e4c6047…` 不変 ✓・勝彦deals残置 ✓・reward_snapshot/確定ガード非接触 ✓・DDL追加ゼロ・ライブ送信ゼロ・実予約ゼロ
- 検証書込はすべて原状復帰済み（director_id→null・services.sort→0-5基準値）＝**残置ゼロ**
- build exit 0／status-effects 61 green／3面307／webhook401／page errors []／stamp=78f2dac=HEAD
- スクショ: sv21_board / sv21_detail_director / sv21_director_saved / sv21_services_list / sv21_services_menu_pane

## コミット（rollback-console-silent-v2-1-baseline..deploy-console-silent-v2-1-20260704）
b7ef1e9 正典語「紹介」化 → fccbeed ボード仕上げ+張りぼて根絶 → 78f2dac 一覧v2+DnD
