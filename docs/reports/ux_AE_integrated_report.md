# APP UX改善 A→E 一括実行 — 統合レポート（2026-06-15）

全フェーズ build+検証OK→ vercel --prod（app/）。マスター整合(5サービス/9メニュー)・host/role分離・既存deal frozen 不変。既存トークン(.lift/.shine/.celebrate-pop/.bar-grow/CountUp)を拡張。prefers-reduced-motion は globals で尊重。**DDLなし**で完遂（deals.meeting_at/calendar_event_id は既存）。

| Phase | commit | deploy |
|---|---|---|
| A ブランド/ロゴ | `6e1083f` | `9qfzisbwu` |
| B 紹介ファネル | `13afb9e` | `6mz6z82d3` |
| C 商談カレンダー | `589fbed` | `304xt8b3i` |
| D 案件一覧＆報酬 | `27e4852` | `eaq8iderh` |
| E 仕掛け仕上げ | `e155380` | `bv9fp33y9`（最新・本番反映） |

## A ブランド/ロゴ（①⑦）
- `ServiceAvatar`(ロゴ→無ければ従来アイコン) を APP全サービス表示へ: サービス選択/関わり方/ガイド/報酬内訳(rewards行)/案件詳細。案件一覧の行は⑥方針で除外。
- 招待メール(`lib/email.ts`)上部に MBマーク画像(`/icon-192.png`)。Slack(`lib/slack.ts`)に `username="MB Partners"` + `icon_url`(MBマーク)。
- サービス選択=統合後の5サービス表示を確認。

## B 紹介ファネル（②③④＋⑨一部）
- ②STEP1: ロゴ+名前+一言コピーのみ(費用非表示)、ブランドアクセント+lift/shine。
- ③STEP2: メニュー一覧で紹介/協力を選択、報酬を主役表示(¥/%・対応範囲・資格条件)。
- ④申込: 報酬ハイライト(「この紹介で ¥30,000」/協力「粗利の50%」)、この後の流れ1-2-3、2経路明確化（**経路B=リンク/QR・予約リンクを「おすすめ」で主役** / 経路A=その場フォーム）、連絡先・メモ=任意明示(必須=お名前のみ)、「•」除去、CTA前向き、協力同意を平易化。
- 完了: celebrate-pop🎉＋見込み報酬＋次の一歩(続けて紹介/商談を設定/案件一覧)。
- スクショ: `docs/reports/review_screens/ux_B/`（step1_service / step2_menu / step3_referral / step3_coop / step4_celebration）

## C 商談カレンダー（⑤）
- 外部遷移/新規タブを廃止 → in-app ボトムシート `BookingDrawer`。
- 空き枠をデフォルト表示（**次の空き日を既定選択→当日の時間枠を即時表示**、月グリッド廃止）。
- free/busy は Google Calendar 連携を裏で使用（`GET /api/calendar/slots`：availability＋FreeBusy、未連携時はavail3ベース）。
- 確定で `POST /api/deals/[id]/meeting` → 連携時 createCalendarEvent→`calendar_event_id`、`deals.meeting_at`保存（所有確認=authed、更新=service role）。
- 顧客共有(リンク/QR)は主経路のまま。動線: 申込完了→「商談を設定(任意)」→in-appスロット→確定。
- 検証: meeting_at保存OK（demo未連携のためevent_id=null）。スクショ: `docs/reports/review_screens/ux_C/`（booking_drawer / booking_confirmed）

## D 案件一覧＆報酬（⑥⑧）
- ⑥案件一覧: 進捗バー→**4段ステッパー**(受付→対応中→成約→支払済、完了段=緑)。カードからサービス名/アイコン除去→「誰を/どの企業を＋進捗」に集約。報酬簡潔(右寄せ¥、支払済=緑)。
- ⑧報酬: 月次明細を**既定で折りたたみ**(native details)→タップで内訳展開(案件別: 顧客/サービス/金額/ステータス)。
- スクショ: `docs/reports/review_screens/ux_D/`（cases_stepper / rewards_collapsed / rewards_expanded）

## E 仕掛け仕上げ（⑨）
- ホーム動機づけ: **次回振込までの進捗**(あとN日+bar-growバー)＋見込み報酬＋やさしい励まし(状態別文言)。空状態に「最初の紹介をしてみよう」hero(✨+CTA)。
- 小さな歓喜: celebrate-pop はポジティブ時のみ（紹介完了🎉/予約確定📅/空状態✨）。count-up・card lift/shine・滑らかな遷移を横断適用。reduced-motion は globals で尊重。
- スクショ: `docs/reports/review_screens/ux_E/home.png`

## 安全弁・整合
- 破壊的DB操作なし（検証で作成したテスト案件は都度削除）。DDL不要（既存列で完結）。
- 本番疎通: apex/console login=200、`/logos/moom.jpg`=200、`/api/calendar/slots`未認証=401。
- 既存deal frozen・5サービス/9メニュー・host/role分離いずれも不変。

## 備考（スコープ外の既知事項）
- DXサービスのロゴは未提供のため `logo_path=null`（従来アイコンにフォールバック）。提供され次第 `public/logos/dx.*` 配置＋1行UPDATEで反映可能。
