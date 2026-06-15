# 別タスク3点 一括実行 — 統合レポート（2026-06-15）

順序固定で実行。デプロイは各フェーズ build+検証OK後。マスター整合 / host・role分離 / 既存deal frozen を不変。

## Phase 1 — ダッシュボード月セレクタ ✅
- 上部に月セレクタ（◀▶＋ドロップダウン、既定=当月）。`?m=YYYY-MM` でサーバー再集計（当月固定を解除）。
- 月候補=データのある月＋直近12か月（当月以前・降順）。運営エコノミクス（取り分(協力)/協力発生/パートナー支払/紹介手数料）が選択月に連動。
- 検証: 06=¥1,620,000 / 05=¥960,000（鈴木 不動産 5月分を確認）。
- commit `(t3-phase1)` / **deploy `odojs7q5p`**
- スクショ: `docs/reports/review_screens/t3_phase1/`

## Phase 2 — サービスロゴ投入 ✅（DX除く）
- `components/ServiceAvatar`（logo_path→無ければ従来 ServiceIcon）を console一覧/編集・APP refer①・guide に適用。
- ロゴ配置 `app/public/logos/`: `moom.jpg / mh.jpg / reso.png / live.png`（実ファイルの拡張子に合わせて投入）。
- `services.logo_path` 更新（DML）: moom→/logos/moom.jpg, mh→/logos/mh.jpg, reso→/logos/reso.png, live→/logos/live.png。
- **DX(PRAGMATION/EMANATION) はロゴ未提供 → logo_path=null（従来アイコンにフォールバック）**。届き次第 `dx.*` 配置＋1行UPDATEで完結可能。
- 本番アセット 200 / dx.png 404（想定どおり）。
- commit `(t3-phase2/code)` `(t3-phase2+3)` / **deploy `bpguafdfw`**
- スクショ: `docs/reports/review_screens/t3_phase2/`（console_services_logos / app_refer_logos / app_guide_logos）

## Phase 3 — 不要カラム削除 ✅
- **menu_id バックフィル 7件**（金額frozen・系譜目的、残0）:
  - moom 賃貸仲介: 鈴木 不動産 / 高橋 家具 / 山手不動産（共同仲介）
  - dx DX・AI導入: ミナト製作所（DX共同）/ 大和ロジ（DX共同）
  - reso 受託開発（代表）: GROVE社（受託開発・共同）
  - mh 採用企業の開拓（代表）: リーフ人材（採用・共同）
- 参照切替（ft_*/category/services.coop_* を全除去 → 協力は service_menus.coop_* に一本化）:
  menus POST/PATCH, services POST/PATCH, deals GET + [id]計算, console deals rateInfo,
  refer 協力ヘッドライン（メニュー由来）, partner詳細（channelベース）, ServicesClient（サービス既定協力セクション撤去）, queries 型/select。
- **デプロイ順序**: カラム非参照コードを先行デプロイ（`c0m3m4bea`）→ その後 DROP（無停止を担保）。
- **DROP（勝彦実行・残存0）**: `service_menus`(ft_enabled, ft_rate, ft_basis, ft_trigger, ft_condition, example_ft, category) / `services`(coop_enabled, coop_rate, coop_base)。SQL=`docs/reports/t3p3_drop_columns.sql`。適用確認: `services.coop_rate` select → 400。
- スコープ外で残置: `services.ft_trigger / ft_condition / coverage_steps`（将来クリーンアップ候補）。
- DROP適用後の最終 build+検証OK → **deploy `bpguafdfw`**（Phase2と同時）。
- commit `(t3-phase3)` 他。

## バックアップ
`docs/reports/` に: `t3p3_services_backup.json` / `t3p3_service_menus_backup.json` / `t3p3_deals_backup.json` / `t3p2_services_prelogo_backup.json` / `t3p3_drop_columns.sql`

## 本番疎通（最終）
apex `/login`=200, console `/console/login`=200, `/logos/{moom.jpg,mh.jpg,reso.png,live.png}`=200, `/logos/dx.png`=404（想定）。

## 残課題
- **DXロゴ未提供**: 受領後 `public/logos/dx.{ext}` 配置＋`UPDATE services SET logo_path='/logos/dx.{ext}' WHERE id='dx'`＋デプロイで完結。
