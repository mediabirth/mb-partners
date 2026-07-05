# MB Partners 純化バッチ 統合レポート（2026-07-05）

自走・無確認で完遂。土台=`58ad09d` → 2コミット → **デプロイHEAD=`fc14471`（READY・stamp実測一致）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。

- タグ: `deploy-purification-20260705`=fc14471 ／ `rollback-purification-baseline`=58ad09d
- 検証green: build 0・3面307・webhook401・page errors []・stamp=fc14471=HEAD・**test:session 26/26**・canon **61**・money確認（§終）
- **純化フロー一気通貫 実ブラウザ 17/17 green**（提示→承諾→納品ゲート→経費→承認→粗利／2レーン／通知単一化／フッター）

## 方針
デリバリーの実進行はSlack・電話で密に回っており、ツールのプロジェクト管理表示は「更新されない第二の真実＝張りぼて予備軍」。デリバリーを**契約とお金の公式記録**（提示→承諾→納品→経費申請→承認→粗利→支払）に純化した。

## A. コンソール案件詳細の削ぎ落とし
- **撤去（MISSING実測）**: 「デリバリー進行（プロジェクト管理）」「プロジェクト概要／スコープ」（`DeliveryProgress.tsx` 全体・タスク/マイルストーン/メッセージCRUD）＋ 手動「プロジェクト状態」select。
- **納品マーカー1点に整備**: デリバリー行の状態を **提示中→了承済→納品済み** の1本に集約（`lib/status.ts ASSIGN_STATUS` に delivered 追加）。計算式ブロック（MB粗利）は健在。
- **誰が納品を宣言するか＝受託者本人**（納品を知っているのは実行者＝最も自然・かつ経費申請ゲートと直結）。`delivery_assignments.status` に `delivered` を追加（**DDLなし**＝status は text／proposed→accepted→delivered）。

## B. ボードのデリバリー系レーン簡素化
- **6レーン→2レーン**（進行中／納品済み）。旧6値（未着手/確認待ち/修正対応/納品完了/保留等）は表示写像で吸収し、`deals.project_status` 列・`/project-status` route は**非破壊deprecate**。
- **レーンは手動 project_status でなく「納品signal」から導出**（`projectLaneOf`＝了承済/納品済みの割当が全て delivered→納品済み）。手動DnDでの project 移動は廃止（＝更新されない第二の真実を排除）。商談→プロジェクト列のドロップは従来どおり成約フロー。
- status-effects `projectLaneTranslation`（confirmed翻訳・レーン数非依存）・ⓘマトリクス注記（「進行中／納品済み」）を追随。**canon 61 assertion 維持**。

## C. ベンダーアプリの純化
- **案件詳細**（page全面書換）: 承諾（`VendorOfferActions`）→**納品済みにする**（`VendorDeliverAction`）→ 経費申請（`VendorCaseExpense`）→ 委託費明細。PMタブ（やること/メッセージ）・NextTaskCard・進捗%を撤去（`VendorCaseTabs.tsx` 削除）。
- **経費申請は「納品済み」がゲート**（正典業務フロー）: 納品前は「経費を申請」disabled＋「納品済みにすると経費を申請できます」、納品後に有効化。実測でゲート挙動を確認。
- **home / cases一覧**もPM撤去（タスク/マイルストーン/進捗バー/StatusSteps）→委託ライフサイクル（提示中/了承済/納品済み）＋委託費で表示。

## D. ベンダー通知の適正化（parityの正しい例外）
- **「お知らせ」タブ撤去**→本人宛イベント（経費承認/却下・支払・アサイン）の**単一リスト**へ。broadcasts に相当する受託者向け配信機能が存在しないため（存在しない機能の空タブ＝張りぼて予備軍）。
- **copy-guideline §5d「存在しない機能の文法を移植しない」**を恒久追記（parityは構造一致であって、実体の無い機能UIの空移植ではない）。

## E. ベンダーフッター
- ボトムナビの**「案件」ラベル削除＝全項目アイコンのみに統一**（`SurfaceNav iconOnly`・**aria-labelで名称保持**・タップ領域不変）。APP（AppNav）はラベル維持で不変。

## 乖離リスト（非破壊deprecate・将来削除候補）
- `deals.project_status`（列）・`/api/console/deals/[id]/project-status`（route）・`lib/phase.ts PROJECT_STATUSES`/`PROJECT_STATUS_STYLE`（旧6値）
- `delivery_tasks`・`delivery_updates`・`deals.delivery_brief` と関連route（`/api/console/delivery-tasks`・`/delivery-updates`・`/brief`・`/api/vendor/tasks`・`/api/vendor/updates`）＝PMデータ・到達不能
- 保持: `delivery_deliverables`＋`/api/vendor/deliverables`（成果物添付・任意）・`expense_claims`・`delivery_payout_items`（お金）

## before / after（対比スクショ・docs/reports/screens_integrity/）
- ベンダー案件詳細: before=3タブ+進捗+タスク → after `pur_vendor_case_{proposed,accepted,delivered}`（承諾/納品ゲート/納品後）
- コンソール詳細: before=デリバリー進行/プロジェクト状態select → after `pur_console_detail`（委託行=納品済み・粗利・PM無し）
- ボード: before=6レーン → after `pur_console_board`（進行中/納品済み 2レーン）
- 通知: before=3タブ → after `pur_vendor_inbox`（単一リスト）
- フッター: before=ラベル付き → after `pur_vendor_footer`（アイコンのみ）

## §終 money証明・残置ゼロ
- money: **CC の作業で deals 報酬ハッシュ不変**（`48a896fa…` 前後一致）・menu_rewards **16行/340,100**・確定ガード/reward_snapshot 非接触・勝彦deals **3件**。委託費原価の集計に delivered を算入（納品後も原価確定＝意味維持・確定額非接触）。
- **DDL変更ゼロ**（`delivery_assignments.status` は既存 text 列に値 `delivered` を追加運用）。ライブ送信ゼロ（検証はローカル本番ビルド＝RESEND不在）・実予約ゼロ。
- 実データ操作禁止則: 全書込 throwaway・実データ読取のみ。撤去後 psql実測: **deals=6（正規のみ）・throwaway 残置 0**。test:session 26/26・eslint認証封鎖・identity不変条件・3面分離 維持。

## コミット（rollback-purification-baseline..deploy-purification-20260705）
fc14471 デリバリー純化（PM撤去・納品ゲート・2レーン・通知単一化・フッター）（＋docs）
