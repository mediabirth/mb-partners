# GEN-2「道具」— メニュー別シェアカード 設計書 v1

- 日付: 2026-08-18 ／ 起案: リード ／ 承認: 勝彦（GEN-2着手指示 2026-08-18・完全自走指示込み）
- 位置づけ: GENプログラム第2弾。パートナーが「会話の中でそのまま出せる道具」を持つ。
- 現状の核心ギャップ: `/r/[token]` は完全クライアント描画で **OGメタが無い**＝LINE/Slack/Messengerに
  貼っても素のURLにしか見えない。共有の中身（?m=メニュー選択・QR・LINE送信）は既にあるので、
  GEN-2の本丸は「**貼った瞬間に商品カードとして立ち上がる**」化＋帰属計測の配線。

## 1. 設計判断(リード裁定)

1. **新しい共有面は作らない**。既存の `/r/[token]（?m=menu）` に OG の顔を与える。
   URLは今のまま＝配った既存リンクも全て遡ってカード化される（若菜さん・高さんの既存リンク含む）。
2. **顧客の目の原則を維持**: カードに載せてよいのは `services`(name/color/image_url) と
   `menus.public_description` のみ（/api/referral/info と同じ許可表）。short_description・紹介者名・
   金額/報酬/率は構造的に不使用。紹介の機構はカードにも透けさせない（「◯◯のご相談」の顔）。
3. **OG画像は決定的生成**（next/og ImageResponse・AI不使用・外部fetchなし＝フォントはリポ内サブセット同梱）。
4. **帰属の配線を今回やる**（GEN-4の前提）: funnel_events に src/menu_id を additive に追加し、
   landing_view が `?src=`（digest/card）と `?m=` を記録する。GEN-1 の src=digest はこれで実測可能になる。

## 2. 仕様

### 2.1 OGメタ（/r/[token]）
- `app/r/[token]/page.tsx` を server wrapper + client 本体に分割（**描画・フォーム・landing_view計測・
  hydration挙動は不変**。client本体は現ファイルの中身をそのまま移す）。
- `generateMetadata`: token→referral_links→service（＋`?m=`があれば該当menu）を読み取り専用で解決。
  - title: `{menu.name}｜{service.name}`（m無し=`{service.name}のご相談`）
  - description: `menus.public_description`（m無し=サービス側の公開一言）を全角90字で切る。
    空なら「{name}についてのご相談を承ります」（既存fallbackDescと同文）。
  - openGraph.images: `/api/og/r/{token}{?m=}`・twitter card=summary_large_image。
  - 解決は `unstable_cache`（key=token+m・revalidate 300s）で1リクエスト2読取以内。
  - 不正token: 汎用サイトmetadata（tokenの有効性を外部に語らない）。ページ挙動は現状どおり。
- **SW**: 公開面に触れるため `CACHE_NAME` bump（CLAUDE.md★公開ページ規律）。

### 2.2 OG画像（/api/og/r/[token]）
- next/og ImageResponse 1200×630。構成=サービスのブランド色/ヘッダ画像(image_url があれば)＋
  メニュー名（m指定時）＋public_descriptionの一行＋控えめな「ご相談はこちらから」。ロゴはBrandMark準拠。
- フォント: リポ内に日本語サブセットを同梱（実行時の外部fetch禁止・CSP/オフライン安全）。
- キャッシュ: `s-maxage=86400, stale-while-revalidate`（デプロイでURL不変のため長期可）。
- 不正token/menu: サービス非依存の汎用ブランドカードを200で返す（oracleなし・スクレイパに壊れ画像を見せない）。
- 生成物にmoney語・数値率が乗り得ないことは入力の許可表（§1-2）で構造保証＋検証でgrep。

### 2.3 共有シートの道具化（app/app/refer/ShareLinkSheet.tsx）
- **カードプレビュー**: シート内に「相手にはこう見えます」として OG画像実物（/api/og/r/…）を縮小表示。
  パートナーが道具の顔を確認してから配れる＝配る勇気の後押し（GEN-2の心臓）。
- **そのまま送れるひとこと**: 選択中の内容（全体 or メニュー）から決定的テンプレで生成する2〜3行の
  紹介文（public_descriptionベース・敬体・押し売り語なし）＋リンクを「文面ごとコピー」ボタンで一括コピー。
  LINEボタンの本文も同テンプレに統一。文面はcopy-guideline準拠・money語なし。
- **端末共有**: `navigator.share` 対応端末では「共有…」ボタン（title+text+url）。非対応では非表示。
- 共有URLへ `src=card` を付与（?m= と併存可）。表示URLとコピーされるURLは常に同一。

### 2.4 帰属計測（GEN-4の土台）
- migration（additive）: `funnel_events` に `src text null`・`menu_id uuid null` を追加。
- `/api/funnel/track`: landing_view/share で `src`（allowlist: digest/card）と `menu_id`（uuid形式検証）を
  受理・記録。dedup_hash に src/menu を含め、別メニュー/別srcを過剰デデュープしない。
- `/r/[token]` client: landing_view 送信時に `?src=`・`?m=` を同送（fire-and-forget不変）。
- 既存イベント・既存列は不変。money非接触。

## 3. 境界・不変
- money 4ハッシュ非接触。公開面に出る文字列の供給源は §1-2 の許可表のみ（default-deny）。
- 帰属の正: 起票の帰属は従来どおり POST /api/referral の token。funnel は計測専用（帰属に影響しない）。
- /api/referral/info のレスポンス形は不変（他消費者に波及させない）。
- 認証・cookie・招待は非接触（全て公開面＋パートナー面の既存認証内）。

## 4. 検証（実装バッチ合格条件）
1. 本番実測（★公開ページ規律・alias直・SWブロックbrowser・cache-busting）: throwawayパートナーの実tokenで
   `/r/{token}` `/r/{token}?m={menu}` のHTMLに og:title/og:description/og:image が正しく出る。
   OG画像 200/image/*・不正token→汎用カード200。LINE/Slackのスクレイパ相当（curl UA変更）でも同HTML。
2. OGメタ・OG画像・ひとことテンプレの出力に money語/金額・short_description・紹介者名が不出現（grep）。
3. funnel: src=digest/card・menu_id が landing_view に記録される実走（throwaway）＋既存イベント形の後方互換。
4. 共有シート: カードプレビュー表示・文面ごとコピー実測・375px溢れ0・44px・navigator.share非対応環境での非表示。
5. /r/ 初回表示の体感非劣化（generateMetadata追加後のTTFB実測を before/after で併記・キャッシュ効き確認）。
6. SW CACHE_NAME bump・品質ゲート7項目・`pnpm test:verify` 全green・残置ゼロ（throwaway partner/link/funnel行）。

## 5. GEN-2後の状態
- パートナーの武器: 貼れば商品カードに見えるリンク＋そのまま送れる文面＋QR＋プレビュー。
- GEN-1ダイジェストの「今週のネタ」リンクも自動でカード化（同じ/r/経路のため追加実装ゼロ）。
- funnel に src/menu が入り始める＝GEN-4（2回目紹介率ダッシュボード）の実データが貯まり出す。
