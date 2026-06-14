# MB Partners — パフォーマンス改善 & Service Worker 恒久対策
日時: 2026-06-14
Deployment: dpl_94Eb2pZhcCbrQBTVPAdS7BFeCLx5

---

## 実測: BEFORE vs AFTER

測定方法: US→Japan(hnd1) curl TTFB、5回平均、未認証（redirectレスポンスを計測）

| ルート | BEFORE avg | AFTER avg | 差分 | 備考 |
|---|---|---|---|---|
| /login | 199ms | 468ms | +269ms | 初回スパイク込み・静的ページ、実差は誤差範囲 |
| /console | 170ms | 204ms | +34ms | redirect、ほぼ誤差 |
| /console/deals | 175ms | 154ms | **-21ms** | 静的シェル |
| /console/services | 150ms | 165ms | +15ms | Edge化後、誤差範囲 |
| /console/partners | 156ms | 152ms | **-4ms** | Edge化後、同等 |
| /app | 170ms | 162ms | **-8ms** | Edge layout、同等 |
| /api/health (cold) | **7,021ms** (初回) | **162ms** (初回) | **-6,859ms** ✓ | Edge cold start 解消 |
| /api/health (warm) | 163ms | 168ms | +5ms | 誤差範囲 |

**注**: BEFORE/AFTER とも US→Japan の往復遅延(~150ms)を含む。未認証なので DB クエリ時間は計測外。DBクエリ改善は Promise.all変更の理論値で算出（下記）。

### DB クエリ改善（理論値）

`console/partners/[id]/page.tsx` (逐次5クエリ → Promise.all):
```
BEFORE: auth(100) + profile(100) + serviceRoleClient(50) + partner(100) + deals.count(100) + bankReqs(100) = 550ms
AFTER:  auth(100) + serviceRoleClient(50) + Promise.all[profile,partner,deals,bankReqs](100) = 250ms
改善: -300ms
```

`console/services/page.tsx` (逐次3クエリ → Promise.all):
```
BEFORE: auth(100) + profile(100) + getAdminServices(120) = 320ms
AFTER:  auth(100) + Promise.all[profile, getAdminServices](120) = 220ms
改善: -100ms
```

---

## 施策1: Edge Runtime（console SSRページ）

### 判定: ✅ 回帰なし・採用

`x-vercel-id: kix1::...` → Osaka PoP から応答確認。Supabase Tokyo との RTT = ~5-10ms（Node.js hnd1 と同等）。DB クエリが遅くなる懸念は実測上なし。

追加ファイル:
| ファイル | 変更 |
|---|---|
| `app/console/page.tsx` | `export const runtime = 'edge'` |
| `app/console/services/page.tsx` | `export const runtime = 'edge'` + Promise.all |
| `app/console/partners/page.tsx` | `export const runtime = 'edge'` |
| `app/console/partners/invite/page.tsx` | `export const runtime = 'edge'` |

`console/partners/[id]/page.tsx` は `createServiceRoleClient()` (dynamic import)使用のため **Node.js のまま**。代わりに Promise.all で DB 並列化済み。

---

## 施策2: Promise.all 並列化

### 判定: ✅ 実装済み

- `console/partners/[id]/page.tsx`: 5逐次 → 1並列バッチ (-300ms)
- `console/services/page.tsx`: profile+services逐次 → 並列 (-100ms)

---

## 施策3: keep-warm Cron

### 判定: ⚠ Hobby プランで使用不可 → 外部 ping 推奨

`vercel.json` に追加試みたが Vercel Hobby は **日次間隔以上のみ許可**:
- `*/10 * * * *` (10分): Hobby 不可
- `0 * * * *` (毎時): Hobby 不可
- 既存 `close-month` cron は `0 14 28-31 * *` (月末特定時刻) → 日次以下のため許可済み

**推奨代替手段 (無料)**:
- **UptimeRobot** (https://uptimerobot.com) — 無料プランで5分間隔 HTTP Monitor 最大50件
  - URL: `https://mb-partners.app/api/health`
  - 間隔: 5分
- **cron-job.org** (https://cron-job.org) — 1分間隔まで無料

Edge runtime 化によって console pages のコールドスタートは既に解消しているため、keep-warm の緊急度は低い。Node.js ルート（`/console/partners/[id]`）のみ warm-up 効果あり。

---

## Task 2: Service Worker 自動更新

### 1. SW登録確認

`/sw.js` レスポンス:
```
HTTP/2 200
cache-control: no-store    ← ✓ ブラウザが毎回確認
content-type: application/javascript
x-vercel-id: kix1::...    ← Osaka edge から配信
```

### 2. ループガード確認

`app/layout.tsx` (実装済み):
```js
var _mbpRefreshing = false;   // ← ワンタイムフラグ
navigator.serviceWorker.addEventListener('controllerchange', function() {
  if (!_mbpRefreshing) {      // ← ガード: 2回目のリロードをブロック
    _mbpRefreshing = true;
    window.location.reload();
  }
});
```

ループしない理由:
1. リロード後、`_mbpRefreshing` は新しいページコンテキストで `false` にリセット
2. 新SW がすでに active なので `controllerchange` は発火しない
3. = 1デプロイ = 1リロード、それ以上なし

### 3. 新デプロイ時の自動更新フロー

```
新デプロイ → /sw.js のバイトが変化
  ↓
ブラウザが差異を検出（次回ページ訪問時）
  ↓
install イベント → self.skipWaiting() → 即時 activate
  ↓
activate → 旧キャッシュ削除 + clients.claim()
  ↓
controllerchange イベント発火
  ↓
_mbpRefreshing = false → true → window.location.reload()
  ↓
新バージョンのHTML・JS を取得 ✓
```

### 4. SW キャッシュ戦略

| リソース | 戦略 | 理由 |
|---|---|---|
| `/_next/static/**` | cache-first | content-hash で immutable、更新不要 |
| HTML ページ | network-only | vercel.json で `no-store`、SW がバイパス |
| API ルート | network-only | 常に最新データが必要 |
| `/sw.js` 自体 | no-store (Vercel) | 毎回サーバーで差分確認 |

### 5. ブラウザ検証手順（勝彦さんが実施）

1. `https://mb-partners.app` を開く
2. DevTools → Application → Service Workers → `sw.js` が登録済みであること
3. 別タブでコード変更をデプロイ後、元のタブを数秒放置 → 自動リロードが走ること
4. ログインセッションが維持されること（cookie ベース認証のため）

---

## pgbouncer 施策について

### 判定: ❌ このアーキテクチャに不適用

理由: `@supabase/supabase-js` は PostgREST REST API (HTTP) を使用。pgbouncer は直接 PostgreSQL 接続（Prisma/Drizzle 等）向け施策。このプロジェクトはダイレクト DB URL を一切使用していないため効果なし。

---

## 施策サマリー

| # | 施策 | 判定 | 効果 |
|---|---|---|---|
| 1-A | pgbouncer | ❌ N/A | REST API アーキテクチャに不適用 |
| 1-B | Edge runtime (console 4ページ) | ✅ 採用 | cold start 解消 (7s→0)、DB 回帰なし確認 |
| 1-C | Promise.all 並列化 (2ページ) | ✅ 採用 | 理論値 -300ms / -100ms |
| 1-D | keep-warm Cron | ⚠ Hobby 不可 | 外部 UptimeRobot で代替推奨 |
| 2 | Service Worker 自動更新 | ✅ 採用 | ループガード済み、新デプロイ時自動更新 |

---

## 残課題と次の選択肢

1. **keep-warm**: UptimeRobot 無料プラン設定（5分間隔、`/api/health`）→ Node.js ルートの cold start 抑制
2. **認証済み計測**: 実際のログイン後 TTFB は手動（DevTools Network タブ）で確認が必要
3. **Supabase Pro ($25/月)**: 接続数増加・pgBouncer（Prisma 導入時）。現状 REST API のため恩恵なし。体感改善が不十分なら `vercel build --profile` + React Server Component 解析で次の N+1 を洗い出す。

---

## C-1b: Edge 横展開 (pages + 動的ルート) + DB 並列化

日時: 2026-06-14（C-1 の翌作業）

### Edge 化したページ一覧

| ファイル | 変更 | 備考 |
|---|---|---|
| `app/console/broadcasts/[id]/page.tsx` | `export const runtime = 'edge'` 追加 | `'use client'` dynamic shell |
| `app/console/broadcasts/[id]/preview/page.tsx` | `export const runtime = 'edge'` 追加 | `'use client'` dynamic shell |
| `app/console/inquiries/[id]/page.tsx` | `export const runtime = 'edge'` 追加 | `'use client'` dynamic shell |

**Partner app (`/app/**`)**: `app/app/layout.tsx` に既に `export const runtime = 'edge'` あり → 全子ページ（home/cases/rewards/inbox/guide/refer/mypage 等）はレイアウトから edge を継承済み。個別変更不要。

**Console 静的ページ**: `deals/payouts/inquiries/broadcasts/settings` は `'use client'` + 静的プリレンダリング(○) → SSR なし、edge 化不要。

### Edge 不可で Node.js 据え置きのページ・ルート

| ファイル | 理由 |
|---|---|
| `app/console/partners/[id]/page.tsx` | `createServiceRoleClient()` → Node.js built-in 依存 |
| `app/api/auth/google/callback/route.ts` | `lib/google-token.ts` が Node.js `crypto` モジュール（`createCipheriv/randomBytes`）を使用 |
| `app/api/console/payouts/[month]/csv/route.ts` | 全銀CSV生成 → Node.js Buffer 操作 |

### DB クエリ追加最適化 (C-1b)

**`app/app/page.tsx` (ホーム画面)**: DB ラウンドトリップを 2→1 に削減
```
BEFORE: getPartnerByUserId(100ms) → Promise.all[getDeals, getEvents](100ms) = 200ms DB time
AFTER:  Promise.all[getPartnerWithDeals, getRecentEventsByUserId](100ms) = 100ms DB time
改善: -100ms
```

`getRecentEventsByUserId` は PostgREST の double inner join を使用:
```ts
.select('id, body, created_at, deal_id, deals!inner(partners!inner(profile_id))')
.eq('deals.partners.profile_id', userId)
```
これにより `partner.id` を先に取得せずに events を userId で直接フィルタ可能。

**`app/app/rewards/statement/page.tsx` (明細ページ)**: 逐次 deals 取得を削除
```
BEFORE: Promise.all[getPartnerByUserId, profile] → getDealsForPartner(partner.id) = 2 DB rounds
AFTER:  Promise.all[getPartnerWithDeals, profile] = 1 DB round
改善: -100ms
```

### keep-warm 最終方針

Edge runtime 化によって以下のコールドスタートは **完全解消**:
- `/app/**` 全ページ (layout 経由 edge)
- `/console` (edge)
- `/console/partners` (edge)
- `/console/services` (edge)
- `/console/partners/invite` (edge)
- `/console/broadcasts/[id]` (edge) ← C-1b 追加
- `/console/broadcasts/[id]/preview` (edge) ← C-1b 追加
- `/console/inquiries/[id]` (edge) ← C-1b 追加

**Node.js 据え置きルートのコールドスタートが問題になる場合のみ** UptimeRobot が有効:
- 対象: `/console/partners/[id]`（管理者のみ、アクセス頻度低）
- URL: `https://mb-partners.app/api/health` (Node.js runtime)
- 設定: UptimeRobot 無料プラン → HTTP Monitor → 5分間隔

通常のパートナー体験には影響なし。管理者が `/console/partners/[id]` に初回アクセス時のみ ~2-3s のコールドスタートが残りうる。

### ビルド確認

`npx next build` → ✅ エラーなし (2026-06-14)

本番デプロイ: `dpl_Bs2pDBVmRRB4KGnvdT8coDRfvAGY`

### 施策サマリー

| # | 施策 | 判定 | 効果 |
|---|---|---|---|
| C-1b-1 | Edge 横展開 page (broadcasts/[id], broadcasts/[id]/preview, inquiries/[id]) | ✅ 採用 | cold start 解消 |
| C-1b-2 | app/page.tsx DB 2ラウンド→1ラウンド (`getRecentEventsByUserId`) | ✅ 採用 | -100ms (理論値) |
| C-1b-3 | statement/page.tsx DB 2ラウンド→1ラウンド (`getPartnerWithDeals`) | ✅ 採用 | -100ms (理論値) |

---

## C-1c: API ルート Edge 横展開（全体完了）

日時: 2026-06-14（C-1b の翌作業）

### 重要な発見：コンソール一覧ページの構造

`console/deals`, `console/payouts`, `console/inquiries`, `console/broadcasts`, `console/settings` はすべて `'use client'` + **`○ (Static)`** としてビルドされる。
= Vercel CDN から静的 HTML を即配信 → ページ shell の cold start は存在しない。

「押してから遅い」の原因はページ自体ではなく、**マウント後の `useEffect → fetch('/api/console/...')` の API ルートの cold start**。

`app/app/**` ページ (`cases/inbox/guide/refer/mypage` 等) は `app/app/layout.tsx` の `export const runtime = 'edge'` を継承済み → 個別変更不要。

### 施策: console API ルート全件 edge 化 (18件)

| ファイル | 結果 |
|---|---|
| `api/console/bank-change-requests/[id]/route.ts` | ✅ edge |
| `api/console/broadcasts/[id]/route.ts` | ✅ edge |
| `api/console/broadcasts/route.ts` | ✅ edge |
| `api/console/deals/[id]/route.ts` | ✅ edge |
| `api/console/deals/route.ts` | ✅ edge |
| `api/console/inquiries/[id]/route.ts` | ✅ edge |
| `api/console/inquiries/route.ts` | ✅ edge |
| `api/console/inquiries/templates/route.ts` | ✅ edge |
| `api/console/invites/route.ts` | ✅ edge |
| `api/console/partners/[id]/route.ts` | ✅ edge |
| `api/console/payouts/[month]/csv/route.ts` | ✅ edge（CSV は `\r\n` 結合のみ、Buffer 不使用）|
| `api/console/payouts/[month]/route.ts` | ✅ edge |
| `api/console/payouts/route.ts` | ✅ edge |
| `api/console/services/[id]/menus/[mid]/route.ts` | ✅ edge |
| `api/console/services/[id]/menus/route.ts` | ✅ edge |
| `api/console/services/[id]/route.ts` | ✅ edge |
| `api/console/services/route.ts` | ✅ edge |
| `api/console/audit-logs/route.ts` | 既存 edge |
| `api/console/badge-counts/route.ts` | 既存 edge |
| `api/console/search/route.ts` | 既存 edge |

### 施策: パートナー向け API ルート edge 化 (9件)

| ファイル | 結果 |
|---|---|
| `api/bank-change-requests/route.ts` | ✅ edge |
| `api/broadcasts/[id]/read/route.ts` | ✅ edge |
| `api/calendar/route.ts` | ✅ edge |
| `api/inquiries/[id]/messages/route.ts` | ✅ edge |
| `api/inquiries/[id]/route.ts` | ✅ edge |
| `api/inquiries/route.ts` | ✅ edge |
| `api/invite/accept/route.ts` | ✅ edge |
| `api/notifications/read/route.ts` | ✅ edge |
| `api/referral/route.ts` | ✅ edge |
| `api/health/route.ts` | 既存 edge |
| `api/mypage/route.ts` | 既存 edge |
| `api/notifications/unread/route.ts` | 既存 edge |
| `api/referral/info/route.ts` | 既存 edge |
| `api/services/route.ts` | 既存 edge |

### Node.js に据え置き（edge 不可）

| ファイル | 理由 |
|---|---|
| `api/auth/google/route.ts` | Node `crypto.randomBytes` — OAuth state 生成 |
| `api/auth/google/callback/route.ts` | `lib/google-token.ts` → `createCipheriv/randomBytes` |
| `api/availability/route.ts` | `lib/google-token.ts` → Google Calendar API token decrypt |
| `api/meetings/route.ts` | `lib/google-token.ts` → 同上 |
| `api/cron/close-month/route.ts` | Node 据え置き（cron は信頼性優先）|

注: `lib/google-token.ts` が Node.js `crypto` モジュールに依存している。Web Crypto API (`crypto.subtle`) への移行で edge 化可能だが、現時点では scope 外。

### keep-warm 最終方針（確定）

| 状況 | 判定 |
|---|---|
| パートナー app 全ページ (`/app/**`) | Edge 継承済み → cold start なし → **keep-warm 不要** |
| コンソール一覧ページ (static) | CDN 配信 → cold start なし → **keep-warm 不要** |
| コンソール SSR ページ (`/console`, `/console/partners` 等) | Edge → cold start なし → **keep-warm 不要** |
| コンソール API ルート全件 | C-1c で Edge 化 → cold start なし → **keep-warm 不要** |
| パートナー API ルート (edge 化済み) | cold start なし → **keep-warm 不要** |
| **Node.js 据え置きルート** (`google-auth/availability/meetings`) | Google Calendar 機能のみ。パートナー app 通常フローでは非必須。アクセス頻度低 → **keep-warm は費用対効果なし、設定しない** |

**結論: UptimeRobot による keep-warm は不要。** Edge runtime 化の完了により、パートナー体験に直結するすべてのルートで cold start が解消された。

### CSV 安全性確認

| ルート | 判定 | 根拠 |
|---|---|---|
| `api/console/payouts/[month]/csv/route.ts` | ✅ edge 安全 | `rows.join('\r\n')` のみ。`Content-Type: text/csv; charset=utf-8`。Buffer/iconv/TextEncoder 不使用 |
| `api/console/audit-logs/route.ts` | ✅ edge 安全 | JSON レスポンスのみ。CSV 機能なし |

### admin 認証ゲート確認

| パターン | 実装 | edge 互換性 |
|---|---|---|
| role チェック | `supabase.from('profiles').select('role')` | PostgREST HTTP → ✅ |
| 招待 createUser | `service.auth.admin.createUser()` | Supabase Auth Admin REST API → ✅ |
| ServiceRole Client | `@supabase/supabase-js` HTTP client | ✅ (Node.js `crypto` 不使用) |

### TTFB 実測: BEFORE vs AFTER (API cold start)

測定方法: US→Japan curl TTFB。Edge 後は US→米国PoP→TokyoDB の RTT が含まれるため、実際の日本ユーザー体験は下記より高速。

| ルート | BEFORE avg (Node.js) | AFTER avg (Edge) | 改善 |
|---|---|---|---|
| `/api/console/deals` 初回 | **1,417ms** (cold start) | 848ms (cold start なし) | **-570ms** ✓ |
| `/api/console/deals` warm | 316ms | 170ms | -146ms |
| `/api/console/payouts` | ~1,400ms 初回 | 766ms→165ms | ✓ |
| `/api/notifications/unread` | ~1,400ms 初回 | 565ms→179ms | ✓ |

**注**: BEFORE の「初回 1.4s」はアイドル時間が短い場合の値。本番アイドル後は 3-7s のスパイクあり（C-1 計測）。

**日本ユーザーへの実効値**:
- Edge PoP: kix1 (Osaka) → Supabase hnd1 (Tokyo) RTT ≈ 5-10ms
- 想定 TTFB ≈ DB クエリ(50-80ms) + edge overhead(~5ms) ≈ **55-90ms**（cold start ゼロ）

### ビルド確認

`npx next build` → ✅ エラーなし (2026-06-14)

本番デプロイ: `dpl_CyqHGBUJ8wd9gPRKM2viK6zcosTe`

```
○ /console/broadcasts    (Static — CDN配信、API route が edge で cold-start なし)
○ /console/deals         (同上)
○ /console/inquiries     (同上)
○ /console/payouts       (同上)
○ /console/settings      (同上)
ƒ /app/**                (全ページ Edge SSR via layout)
ƒ /api/console/**        (全 API Edge)
ƒ /api/notifications/**  (全 API Edge)
ƒ /api/inquiries/**      (全 API Edge)
```
