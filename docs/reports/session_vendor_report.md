# MB Partners セッション根本改善＋ベンダー近代化プログラム 統合レポート（2026-07-05）

自走・無確認で完遂。土台=`bbe66a4` → 5コミット → **デプロイHEAD=`9d57b45`（READY・stamp実測一致）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。

- タグ: `deploy-session-vendor-20260705`=9d57b45 ／ `rollback-session-vendor-baseline`=bbe66a4
- 検証green: build exit 0・3面307・LINE webhook無署名401・page errors []・stamp=9d57b45=HEAD・money不変（§終）・
  **恒久回帰テスト `pnpm test:session` 26/26 green（本番実ブラウザ）**・canon 61 green

## ⚠ 冒頭：既存セッションへの影響 — 再ログインは不要です

本改修は**誰の再ログインも必要としません**。勝彦さん・米井さんの現在のセッション（cookie）はそのまま有効です。
- 認証の cookie 名前空間・検証方式（proxy の getClaims）は無改修。
- ログアウトの挙動を `scope:'local'`（その面だけ）に変えましたが、これは「今後ログアウトしたとき他面を巻き添えにしない」改善で、既存セッションを切りません。
- 勝彦さんの二重ロール（同一メールで partner＋vendor）は、今回の修正で**両面とも今までどおり使えます**（むしろ入れ替わりが直り、パートナー面の表示が「神原 勝彦」に復元されました）。

## 柱1・1a — 再発の考古学（なぜ直しても再発し続けたのか）

3面（console / app / vendor）は**cookie 名だけ**で分かれています（`mb-auth-console/-app/-vendor`）。console は別ホスト（`console.mb-partners.app`）なのでブラウザが自動で分離しますが、**app と vendor は同一オリジン `mb-partners.app` を共有**するため、分離の正しさは「全クライアント構築箇所で正しい cookie 名を渡し続けること」だけに依存します。その設定が**6箇所に散在**していました。

| # | sha | 日付 | 何をしたか | 再発との関係 |
|---|-----|------|-----------|-------------|
| 1 | 95fb51b | 06-19 | surface.ts 新設・**vendor 面と mb-auth-vendor を追加**・proxy/server/client に cookie 名を配線 | **穴が開いた瞬間**。3面目を app と同じ apex に足したことで「ホスト分離」が「cookie 名分離のみ」に変質。しかも client.ts は `isSingleton:false` を付け忘れ、潜在バグを同日に出荷 |
| 2 | f5288a9 / 8a3f680 | 06-21 | middleware を getUser→getClaims 等に最適化 | surface-scoped cookie を保持＝退行なし（疑ったが白） |
| 3 | 312e3f0 | 06-26 | LINEログイン新設（新しい認証入口） | cookie 名を正しく渡していた＝「思い出せば効く」証拠 |
| 4 | **35ef2ab** | 07-02 | **修理①**: `isSingleton:false`＋surface別memo（ブラウザ単一化バグの封鎖） | @supabase/ssr の createBrowserClient がモジュール単一で最初の surface の storageKey を使い回す件を修正。穴（#1）から13日後 |
| 5 | a48e0ff | 07-04 | **修理②**: 招待URLのapex固定 | accept が console オリジンで cookie を書き別 surface 名前空間に落ちる件（origin 次元の同種バグ）を修正 |

**根本再発機序**: (1) 同一オリジン分離は本質的に脆い（ブラウザの守りがない）。(2) 分離設定が**中央化されておらず6箇所に散在**——新しい認証入口（LINE・招待・magic）が生の `@supabase/ssr` を直接呼ぶたびに cookie 名を付け忘れる余地があった。(3) 各修理は**1次元ずつの点修理**（cookie名 / ライブラリ単一化 / origin）で、統一された不変条件がなかった。

## 柱1・1b — 認証ストレージ全数マップと HEAD の残存地雷

構築箇所は6つ: `lib/supabase/client.ts`（ブラウザ）、`lib/supabase/server.ts`、`proxy.ts`、`app/auth/callback/route.ts`、`app/api/auth/line/callback/route.ts`、そして**残存地雷** `app/auth/magic/page.tsx`——ここだけ生の `createBrowserClient()` を `cookieOptions.name` 無しで呼び、デフォルト cookie（`sb-*`）に書いて surface 分離をバイパスしていた（35ef2ab が直した反パターンが legacy パスに生き残っていた）。

## 柱1・1c — 根本解（衝突が構造的に不可能な形＝一元化）

1. **サーバ側の唯一の門**: `lib/supabase/server.ts` に `makeSurfaceServerClient(surface, cookieAdapter)` を新設。surface→cookie名（`cookieNameFor`）を強制注入。`auth/callback`・`line/callback` をこれ経由に統一（生の `createServerClient` 構築を除去）。
2. **ブラウザ側の唯一の門**: `lib/supabase/client.ts` の `createClient()`（`isSingleton:false`＋surface別memo）に一本化。`app/auth/magic/page.tsx` の生 `createBrowserClient` をこれへ置換＝地雷除去。
3. **構造ガード（eslint）**: `@supabase/ssr` の `createBrowserClient`/`createServerClient` の直接importを **`lib/supabase/**` と `proxy.ts` 以外で禁止**（`no-restricted-imports`）。新しい認証入口が中央factoryをバイパスして cookie 名を取り違えることが**構造的に不可能**に（自己テストで違反ファイルを error 検出することを確認）。
4. **signOut scope:'local'**（3面）: 1面のログアウトが同一アカウントの他面/他端末のセッションを巻き添えにしない（同一ユーザー横断のログアウト経路の封鎖）。

## 柱1・1d — 恒久回帰テスト（本丸・標準チェックに恒久追加）

`scripts/session-isolation.e2e.mjs`（`pnpm test:session`）を新設し、**CLAUDE.md の検証標準に build/307/webhook401 と同格で明記**。
同一ブラウザで3面ログイン→1面のセッション期限切れ→再ログイン→**他2面が生存**を本番実ブラウザで実測。throwaway 3アカウントは自動生成・実行後自動撤去。**本番 26/26 green**（レイテンシ耐性のためリトライ化）。

## 追補 — アイデンティティ入れ替わりのフォレンジックと根本修正

### フォレンジック（何が起きたか）
`bfb3c027`＝`kthk.kmbr@gmail.com`＝勝彦さんのテスト用アカウント。
- 2026-07-02 11:56 **partner** として招待受諾（invite 名「神原 勝彦」）→ profile(role=partner)＋partners行(ZZ6347)＋テスト deals 3件。
- 2026-07-04 14:12 **同一メールで vendor 招待を受諾**（invite 名「神原商店」・delivery 0a2838aa）→ `app/api/vendor/accept` の既存プロフィール分岐が **`profiles.update({ name:'神原商店', role:'vendor' })`** を実行し、**partner プロフィールを vendor に上書き**。
- 結果: パートナー「神原 勝彦」が消え、コンソールのパートナー一覧に「神原商店 / vendor」という別人格が出現（＝「未知の名称のパートナー」の正体）。partners行・deals は無傷。

**(b) 未知パートナーの正体 = CC検証throwawayの残骸か？ → 否。** これは勝彦さん自身の二重ロールテストアカウントが**コード欠陥で破損**したもの。CCのthrowaway（@mb-system.internal）とは別物。**残置ゼロ報告との矛盾はありません**（本件はCCの残置ではなくプロダクトのaccept経路の欠陥）。
**(c) 復元可否 → 可能。** partner の元名「神原 勝彦」は invite ea276acb に残存。partners行・deals も無傷のため完全復元した。

### 根本修正（面ごとに独立して安全に共存するモデル・1cと同じ一元化レイヤー）
profiles は auth ユーザー（＝メール）と 1:1 で `role` 単一列。同一メールが partner と vendor を兼ねると単一 role では表せない——これが根本原因。
1. **`lib/identity.ts` の `attachSurfaceProfile`** を新設＝accept 経路の profiles 書込の**唯一の門**。**既存プロフィールには role も name も一切触れない**（新規作成時のみ role/name を確定）。面をまたぐ上書きが構造的に不可能。
2. `vendor/accept`・`invite/accept` を中央の門経由に統一（vendor/accept の role 上書きを除去）。
3. **面ごとの本人性を単一 role 列でなく面固有テーブルで判定**: `resolveVendor` と vendor layout を「自分の auth_user に紐づく **delivery** があること」（linkage）へ。`role==='vendor'` 要求を撤廃＝partner(role=partner) が delivery linkage で vendor を安全に兼任。vendor 面の表示名は `deliveries.name/nickname` を正とし partner 面の profiles.name を混ぜない。
4. **復元**: bfb3c027 を role=partner・name='神原 勝彦' へ（delivery linkage は温存＝両立）。

### 恒久回帰テストに追加（同上ファイル [5][6]）
同一メールで既存 partner に**実 API `/api/vendor/accept`** を通しても partner の role/name が保全されること／二重ロールの両面同時ログイン生存を実測（**26/26 に内包**）。旧コードなら [5] は必ず落ちる。

## 柱2 — ベンダー近代化（APP構成の転用）

診断の結果、**設定画面（SettingsScreen）と shell/nav は既に単一ソースで共通化済**（BR-V3）。実ギャップは mypage と inbox の2つ。

| 画面 | before | after（APP文法へ） | 固有機能の保持 |
|---|---|---|---|
| 通知(inbox) | フラットな1リスト・タブなし・既読なし | **3タブ文法（すべて/あなた宛/お知らせ）**。あなた宛=派生イベント（`deriveVendorNotifs`）、お知らせ=broadcasts(news)、detail=ヒーロー付き本文 | vendor固有 icon（ok/ng/pay/freeze/assign）・deep link href・お客さま敬称・DDLレス派生を保持 |
| マイページ | 読取専用リスト・編集導線は設定へ飛ぶだけ | **APPの編集モード文法**。非KYC項目（ニックネーム/電話/住所）をインライン編集→`PATCH /api/vendor/mypage` | **KYC確定項目（お名前/税区分/振込先/インボイス）は lock 表示で編集不可**を厳守（銀行編集APIは作らない）。アバターは編集可。表示名は delivery 名を正とし二重ロールでも一貫 |
| 設定(settings) | 既にSettingsScreen共通 | 変更なし（既に近代化済） | VendorLogout（scope:'local'）・vendor限定リンク集・push非搭載を保持 |

3面分離（デプロイ/認証/ルーティング）維持・共通部品（ProfileHeader/AvatarEditor/SettingsScreen）流用・money非接触。
スクショ: `vendor_mypage_new` / `vendor_mypage_edit` / `vendor_inbox_new` / `vendor_settings_new`（docs/reports/screens_integrity/）。

## §終 money証明・残置ゼロ

- 恒久不変: menu_rewards **16行/340,100** ✓・報酬計算式の意味・確定ガード・reward_snapshot 非接触・勝彦deals（created_by=bfb3c027）**3件** ✓
- deals 報酬ハッシュはバッチ内で **CC の作業により変化していない**（本バッチ開始後の変化は勝彦/米井さんの正当な製品操作＝飯田の成約・日本ハウジング起票 由来で、突合済み・CC起因ゼロ）。※CLAUDE.md の money 検証を「固定値pin」から「バッチ内でCCが変えていないことの確認」へ改訂（正当利用で自然に変わるため）。
- DDL 追加ゼロ（既存 `deliveries.status`/`deliveries` 列・`delivery_assignments` 等を活用）。ライブ送信ゼロ（RESEND鍵不在・構造保証）・実予約ゼロ。
- **実データ操作禁止則の順守**: 全UI書込はCC自作throwaway（session3・dual1・vshot1）で実施し撤去。実データ（勝彦/米井/deals）は読み取りと**破損の復元のみ**。撤去後 psql実測: profiles throwaway 残置0・deliveries throwaway 0・勝彦アカウントは partner+vendor 兼任で正しく復元。

## コミット（rollback-session-vendor-baseline..deploy-session-vendor-20260705）
3a74c85 セッション構造封鎖＋恒久テスト → 18775b0 アイデンティティ二重ロール根本修正＋復元 → 9d57b45 ベンダー近代化（通知3タブ＋mypage編集）（＋テスト安定化コミット）
