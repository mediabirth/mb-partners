# MB Partners 一括（F→C2→B2→G→H）統合レポート（2026-06-16）

自走・無確認で実行。各項目 build+検証→ vercel --prod(app/)。プラン変更（課金）なし＝推奨はレポートのみ。マスター整合(5サービス/9メニュー)・host/role分離・既存deal frozen 不変。破壊的DB操作なし（検証用テスト案件は都度削除）。DDLなしで完遂（deals.meeting_at/calendar_event_id は既存）。

| 項目 | commit | deploy |
|---|---|---|
| F 性能 | `58d44ed` | `abavpv5mb` |
| C2 予約フロー | `7c1a4b0` | `9216gixnp` |
| B2 関わり方磨き | `d6e0642` | `247r14z0f` |
| G コンソールRWD | `84d5b25` | `8qqz4jgra` |
| H Safari下部 | `9221242` | `gefnt2npr`（最新・本番反映） |

## F 性能の抜本改善
### 計測（before）
- **リージョン**: `vercel.json regions:["hnd1"]`（東京）= Supabase(ap-northeast-1) と同一。**既に最適**（追加修正不要）。
- **runtime**: APP/console は `edge`（cold start極小）。Google連携API(crypto使用)のみ node。
- **認証**: `getCachedUser`(React cache)でlayout+page間の getUser を1回に dedup 済。`Promise.all` も各ページで使用済。
- **白画面**: `loading.tsx` が**皆無**＝遷移時に白画面（最大の体感ボトルネック）。
- **TTFB(prod, warm)**: login ~0.17–0.22s / console ~0.16–0.18s（hnd1で良好）。
### 修正（after）
- **`loading.tsx` を /app・/console に追加**（`.skeleton` スケルトン）→ 遷移/ログインの白画面を解消（体感速度の主改善）。
- TTFB は warm で before と同等（login ~0.17–0.22s / console ~0.16–0.18s）。回帰なし。※デプロイ直後の初回のみ cold start で ~1s。
### 残ボトルネック（レポートのみ）
- **middleware が毎リクエストで `getUser()`(authサーバ往復)＋`roleOf()`(profiles DB)** を実行。role gating のセキュリティ上必要だが2往復。将来策: role を Supabase カスタムJWTクレームに載せ DB往復を除去（要Auth Hook設定）。
- **services/menus** は遷移ごと `/api/services` を client fetch。準静的なため SWR/メモ化で再取得削減余地。
### プラン評価（課金変更なし・推奨のみ）
- 現状 Hobby でも hnd1固定＋edge＋getCachedUser により TTFB は良好で、**現時点で Hobby が致命的ボトルネックという根拠はなし**。
- **Pro 推奨ケース**: ①商用稼働での同時実行・帯域・ビルド時間SLA ②`fluid compute`/longer timeout（Google同期やメール等の重い処理）③Web Analytics/Speed Insights 常用 ④チーム運用。費用 ≈ $20/月/メンバー。現データ規模では機能要件が増えるまで Hobby 継続で可。

## C2 予約フロー改善
- **①空き明確化＋期待感UI**: 日別「◯枠」表示・満/対象外はグレーアウト・**次の空き日を既定選択→時間枠チップ即時**。slots基準を **平日10:00-18:00 / 30分枠 / 直近60日** に。**Google未接続でも必ず空き提示**（除外=既存 deals.meeting_at ＋ 連携時 FreeBusy）。情報入力まで予約完了を実機(ローカル)確認。ブランド調。
- **②協力=同一画面2択**（予約リンク共有／自分で予約）。自分で予約→その場でカレンダー展開→枠選択→「予約」押下の瞬間に **協力deal作成＋商談予約(meeting_at/calendar_event_id)を同時実行**（同意内包, `createDeal`連携）。検証で channel=cooperation＋meeting_at 同時保存を確認。
- **③ホーム「やること」に商談予定**（日時・顧客・案件）を日時順表示。
- **④受付確認メール**（Resend, ベストエフォート）: 紹介登録/協力申込/商談予約 完了でパートナー本人へ。内容=受付内容(顧客・サービス/メニュー・関わり方)＋この後の流れ＋(予約時)商談日時。`lib/email.ts sendReceiptEmail`、actions/meeting API から発火。
- スクショ: `docs/reports/review_screens/c2/`（coop_2choice / selfbook_drawer 他）

## B2 「関わり方」ページ磨き込み
- **メニュー単位グルーピング**: 複数メニューのサービス(reso)はメニュー名で見出しグルーピングし、各メニュー内に紹介/協力の選択。1メニュー(MOOM)はそのまま2択。
- 報酬を主役（**count-up** CountUp、固定=¥/料率=%・基準）に保ちつつ対応範囲・条件は簡潔。スキャンしやすい階層と余白。
- ワクワク: ブランドアクセント色(service.color)・lift/shine・前向きマイクロコピー（この報酬で紹介/協力する）。reduced-motion尊重。
- スクショ: `docs/reports/review_screens/b2/reso_grouped.png`

## G コンソール レスポンシブ
- **<=900px**: サイドバー→**ドロワー＋ハンバーガー＋スクリム**（遷移で自動クローズ）。
- コンテンツ余白(inline `margin-left:230`)を `aside[data-cnav] ~ *` で `!important` 全幅化（全14ページ一括対応）。
- 広いコンテンツ: 案件カンバン `.ckanban`(80vw横スクロール)・パートナー表 `.ctable-scroll`。タップ領域(min 42px)確保。
- 検証 **360/768/1024**: hamburger 360/768表示・1024非表示、ドロワー/全幅/横スクロール動作、pageエラー0。
- スクショ: `docs/reports/review_screens/g/`（dashboard_360/768/1024, drawer_360/768, deals_*）

## H Safari下部ボタン
- **主因**: `viewport-fit=cover` 欠如で `env(safe-area-inset-*)` が常に0 → 既存の `nav-item` safe-area padding が無効だった。
- **修正**: viewport に `viewport-fit=cover` 追加（prod head で出力確認）。partner shell `100vh→100dvh`。`main` paddingBottom を `calc(86px + env(safe-area-inset-bottom))`。下部ナビ item は既存 `max(10px, env(safe-area-inset-bottom))` が cover有効化で実機作動。
- ※iOS実機の inset 値は headless では再現不可。標準手法での実装＋メタ出力を確認済。
- スクショ: `docs/reports/review_screens/h/app_bottom_nav.png`

## 本番疎通（最終）
apex/console login=200（warm TTFB ~0.17s）、`/api/calendar/slots` 未認証=401、`viewport-fit=cover` 出力あり。

## 備考
- DXサービスのロゴは未提供のため `logo_path=null`（従来アイコン）。受領後 `public/logos/dx.*` 配置＋1行UPDATEで反映可能。
