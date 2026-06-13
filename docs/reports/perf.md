# パフォーマンス計測レポート

**計測日**: 2026-06-13
**環境**: 本番 mb-partners.app (Vercel + Supabase `zwnpbqpntiwsacsrrvfk`)
**DB状態**: Healthy / CPU 2% / RAM 54% / 8 of 60 conns（DBは詰まっていない）

---

## 1. 応答時間実測（TTFB）

### ページ

| ルート | コールド初回 | コールド(30s後) | ウォーム2回目 | ウォーム3回目 |
|--------|------------|--------------|------------|------------|
| `/` (→ redirect) | 368ms | — | ~170ms | — |
| `/login` | **1031ms** | 203ms | 188ms | 175ms |
| `/console/login` | 544ms | 171ms | 160ms | 163ms |
| `/app` (redirect) | — | — | 285ms | — |
| `/console` (redirect) | — | — | 293ms | — |

### API ルート（ウォーム時）

| ルート | TTFB | 備考 |
|--------|------|------|
| `GET /api/services` | ❌ **404** | ルートファイルが存在しない（バグ） |
| `GET /api/console/search?q=` | 91〜406ms | 初回長め、ウォームで90ms前後 |
| `GET /api/referral/info?token=` | 118〜221ms (ウォーム) / **1093ms** (初回) | |
| `GET /api/notifications/unread` | 341ms | 認証あり |

---

## 2. Vercel Region 確認

```
レスポンスヘッダ: x-vercel-id: kix1::dxzst-...
CDN PoP:  kix1 (関西国際空港 / 大阪)
Function: hnd1 (羽田 / 東京) — vercel.json の "regions": ["hnd1"] が有効
```

**判定**: ✅ `hnd1` 設定は効いている。CDN PoP が Osaka 経由なのは地理的ルーティングで正常。

---

## 3. コールドスタート分析

- **初回 `/login` が 1031ms**: CDN ミス + Vercel 関数のコールドスタートが重なった
- **30秒アイドル後 `/login` が 203ms**: 30秒ではコールドスタートにならない（関数が warm を維持）
- **結論**: 真のコールドスタート（数分〜十数分の無アクセス後）では 0.5〜1.5s の上振れが発生する可能性がある。DBは原因ではなく、Vercel関数の初期化（Next.js bundleロード）が主因。

---

## 4. SSR 認証チェックの往復数

### `/app/*` パートナーページ（`app/app/layout.tsx` + 各ページ）

```
layout:
  1. getCachedUser()           → Supabase Auth HTTP round-trip (キャッシュ: React cache())
  2. createClient()
  3. profiles SELECT (needs userId from #1)

app/page.tsx (home):
  4. createClient()            → キャッシュ済みで再初期化のみ
  5. getPartnerByUserId()      → SELECT partners (needs userId, serial)
  6. getDealsForPartner()      → SELECT deals (needs partnerId from #5, serial)
  7. getRecentDealEvents()     → SELECT deal_events (needs dealIds from #6, serial)
```

**合計**: Auth 1回 + DB 4クエリ = **5 serial round-trips**
→ 各クエリが ~30ms (LAN内) × 5 = 約150ms をDB往復だけで消費

### `/app/cases/page.tsx`

```
1. getCachedUser()             → auth (layout共有でキャッシュ済)
2. getPartnerByUserId()        → serial
3. getDealsForPartner()        → serial
```
= 3 DB round-trips (auth はキャッシュ済なのでカウントしない)

### `/console/page.tsx` (最適化済み)

```
1. supabase.auth.getUser()     → auth (1回)
2. Promise.all([profile, getAllDeals, recentEvents])  → 3並列
```
= 2 serial steps (最適)

---

## 5. N+1・逐次 await の洗い出し

| ファイル | 問題 | 依存関係 | 解決策 |
|---------|------|---------|--------|
| `app/app/page.tsx` | getPartner → getDeals → getEvents が 3 serial | dealIds が deals 結果に依存 | deals + deal_events を1クエリに統合（JOIN） |
| `app/app/cases/page.tsx` | getPartner → getDeals が 2 serial | partnerId が必要 | partners + deals を1クエリに統合 |
| `app/app/rewards/page.tsx` | 同上 | 同上 | 同上 |
| `app/app/layout.tsx` | `getCachedUser()` の後に `createClient()` を再度呼ぶ + profile SELECT | 軽微 | `getCachedUser` で profile も取得する形に統合可 |
| `app/api/console/search/route.ts` | 406ms (初回) — 複数テーブルを連続クエリ？ | — | SELECT を並列化または全文検索インデックス確認 |

---

## 6. Edge Runtime 化の候補

以下はサービスロール不要・認証不要の読み取り専用 → `export const runtime = 'edge'` で Cold Start を削減できる

| API ルート | 現状 | Edge 化可否 | 想定改善 |
|-----------|------|-----------|---------|
| `GET /api/services` | ❌ 404 (ルート欠落) | ✅ 可能 | バグ修正と同時にEdge化 |
| `GET /api/referral/info` | Node runtime | ✅ 可能 | 初回 1093ms → 200ms 台に |
| `GET /api/console/search` | Node runtime | ⚠️ 要確認（認証あり） | 慎重に検討 |

---

## 7. バグ：`/api/services` が 404

`app/app/refer/page.tsx` が `fetch('/api/services')` を呼んでいるが、対応ルートファイル (`app/api/services/route.ts`) が存在しない。
→ パートナーが「紹介する」ページを開いてもサービス一覧が表示されない。
**ログイン修正と同バッチで修正必要。**

---

## 8. 優先修正リスト（次フェーズ）

実施順（ログイン経路確定後）:

1. **`/api/services` 404 修正** (バグ → 機能に直結)
2. **`getPartnerByUserId + getDealsForPartner` を1クエリに統合** — `/app`, `/app/cases`, `/app/rewards` 3ページ改善
3. **`/api/referral/info` Edge 化** — 公開ページの初回表示改善
4. **`/api/services` Edge 化** — 修正後に適用
5. **`app/app/page.tsx` の deal_events JOIN統合** — serial 4→2 round-trips
6. (中優先) `getCachedUser` + profile を layout で1クエリに統合

**期待改善**:
- パートナーホーム TTFB: 現状 ~400ms (SSR) → ~200ms台 (2 parallel DB calls)
- 紹介ページ初回サービス読込: 404 → 即座表示
- referral/info コールド: 1093ms → 200ms台

---

## 9. 結論

| 優先度 | 原因 | 対処 |
|--------|------|------|
| 🔴 HIGH | Vercel関数のコールドスタート | Edge化（/api/services, /api/referral/info） |
| 🔴 HIGH | `/api/services` 404バグ | ルートファイル作成 |
| 🟡 MID | パートナーページの逐次DB呼び出し | JOIN統合で serial 削減 |
| 🟢 LOW | DBアップグレード | 不要（DB は余裕あり） |
| ✅ OK | `hnd1` region設定 | 正常稼働中 |
| ✅ OK | `getCachedUser` React cache | 正常稼働中 |
| ✅ OK | console/page.tsx Promise.all | 最適化済み |
