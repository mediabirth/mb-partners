# MB Partners PWA化 R4 — レポート（2026-06-16）

自走・無確認で実装。build+検証→ vercel --prod（最終 `fefzg5a0s`）。既存挙動・host/role分離・認証フロー・既存機能は不変。

## 1. manifest（`app/manifest.ts` → `/manifest.webmanifest`）
`name="MB Partners"` / `short_name="MB Partners"` / `start_url="/"` / `scope="/"`（追加）/ `display="standalone"` / `theme_color="#4733E6"` / `background_color="#ffffff"` / icons=`/icon-192.png`・`/icon-512.png`（any）＋`/icon-maskable.png`（maskable）＋favicon。**app・console 両hostの `<head>` に `<link rel="manifest">` 自動付与**を確認。

## 2. Service Worker（`public/sw.js`・既存土台を踏襲）
- **静的アセットのみ** `/_next/static/`（content-hash・immutable）を **cache-first** で precache。
- **ナビゲーション要求・API/認証ルートは network-only**（フォールスルー＝キャッシュしない。`vercel.json` で `no-store`）。→ **ログインループ・古いデータが出ない**。
- `skipWaiting`＋`clients.claim`＋`controllerchange→reload` で新デプロイ時に自動更新。
- 登録：`app/layout.tsx` の登録スクリプト。検証で `SW: registered`。

## 3. iOS対応メタ（`metadata`）
`apple-touch-icon=/icon-192.png` / `apple-mobile-web-app-title="MB Partners"` / `apple-mobile-web-app-status-bar-style="default"` / `apple-mobile-web-app-capable="yes"` ＋ `mobile-web-app-capable="yes"` / `theme-color="#4733E6"`。

## 4. インストール誘導（`components/InstallHint.tsx`・控えめ/ディスミス可）
- Android/Chrome：`beforeinstallprompt` を捕捉→「追加」ボタンで `prompt()`。
- iOS Safari：少し待って「共有 → ホーム画面に追加」手順テキスト。
- **standalone起動中・一度閉じた後は非表示**（localStorage）。safe-area考慮。root layout に設置（app/console共通）。

## 5. 検証
- 本番：`/manifest.webmanifest`=200・`/sw.js`=200。`<head>` に manifest/apple-touch-icon/capable(apple+modern)/status-bar/theme-color。
- **認証フロー不変（最重要）**：ログイン成功→認証必須ページ（報酬/月次明細）が**最新データで描画**＝SWでstaleにならない・ログインループなし。pageエラー0。
- SW registered。iOS UAでインストールヒント表示を確認（スクショ）。
- **インストール可能性（Lighthouse PWA基準）**：HTTPS＋manifest(name/icons 192+512/start_url/standalone)＋登録済SW を満たす（※Lighthouse自動実行は本環境不可のため基準を手動確認）。
- console側も同manifest/theme-color参照（host/role分離は不変）。

## 6. プッシュ通知
今回は**土台のみ**（manifest/SW/インストール導線）。Web Push 本実装は次段。

## スクショ
`docs/reports/review_screens/r4/install_hint_ios.png`（iOSインストールヒント＋認証済みホーム）。
