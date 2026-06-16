# 性能改善：アイドル後の初動遅延 — 統合レポート（2026-06-16）

完全自走で実施。各施策 build+検証→ vercel --prod。認証フロー・host/role分離・既存deal frozen・payout/snapshot は不変。

## A 診断（原因の内訳）
本番実測（warm/cold）:
| 対象 | cold（アイドル後初回） | warm |
|---|---|---|
| `/api/services` | **8.58s** | 0.48s |
| `/login` | 0.79s | 0.16s |
| `/console/login` | 0.19s | 0.14s |

- **最大要因＝`/api/services` の cold start 8.5s**。refer ページが遷移ごとに client fetch するため、アイドル後の初動で顕在化。
- region=`hnd1`（Supabaseと同一）、hot API/middleware は edge（cold小）。
- middleware 認証＝`getUser()`（auth検証）＋`roleOf()`（profiles DB）の2往復。
- Supabase 無料枠は長期無アクセスで pause（復帰初回が更に遅延）。PWA standalone 復帰は SW が network-only のため full reload でも stale化はしない。

## B 無料施策（全実施・各フォールバック付き・before/after）
**B1 ウォームキープ** — `/api/health`（edge・認証不要・DB非依存）。`vercel.json` crons に追加。
- フォールバック：**Hobby は cron 日次のみ**（`*/5` はデプロイ拒否）→ 日次 `0 0 * * *` に設定。真の5分間隔は**外部pinger**で（下記「勝彦の操作」）。

**B3 不変データのCDNキャッシュ（最大効果）** — `/api/services` を service role（Cookie非依存・全ユーザー共通マスタ）化し `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`。`vercel.json` で `/api/services` を no-store 例外（catch-all より前＝先勝ち）に。
- after：`x-vercel-cache: HIT`（CDN配信）、**`/api/services` 8.58s(cold)→ 0.08〜0.10s（CDN HIT）**。関数を起動しない＝cold start を回避。認証データは含まない（安全）。

**B2 ログイン軽量化（DB回避・フォールバック）** — middleware の role を `user.app_metadata.role`（JWTクレーム）から読む。**あればDB問い合わせ無し**、無ければ従来 `profiles` 参照へ自動フォールバック。
- 既存5ユーザーへ `app_metadata.role` をバックフィル、invite accept の `createUser` に `app_metadata:{role}` 付与。
- Supabase の access token hook 等**ダッシュボード設定は不要**（`getUser()` が `app_metadata` を返すため）。`getUser` による検証は維持＝認証フロー不変。
- 検証：partner→`/app`・owner→`/console`・partner→console はガード、ループ無し、データ最新。

**B4 edge統一** — `/api/health`・`/api/services`・主要 console API・middleware は edge（cold最小）。Google連携など node crypto 依存のみ node 維持（計測上 edge化不利のため据置）。

### after サマリ
- `/api/services`：**8.58s → 0.08〜0.10s**（CDN HIT・cold回避）＝アイドル初動の主因を解消。
- `/login`：warm 0.16〜0.22s（不変・回帰なし）。
- middleware：claim 有時は role 判定の DB往復を削減（profiles 参照を回避）。

## 勝彦の操作が要る項目（手順のみ・CCは実装回避済み）
1. **5分間隔のウォームキープ（任意・無料）**：Hobby の Vercel cron は日次のみのため、外部 pinger で `https://mb-partners.app/api/health` を5分間隔ping。
   - 例）UptimeRobot か cron-job.org に無料登録 → URL=`https://mb-partners.app/api/health`・間隔=5分・GET。これで write-path/認証関数の cold start をほぼ常時回避。
   - 未設定でも B3 により最大要因（/api/services）は解消済み。

## C 課金推奨（実装せず・billing不変・推奨のみ）
- B で `/api/services` の cold は解消、login は元々 warm 良好。**現時点で課金必須ではない**。
- ただし write-path/認証関数の「アイドル後初回」を**恒常的にゼロ**にしたい場合：
  - **Vercel Pro ＋ Fluid Compute（≈$20/月/メンバー）**：インスタンス再利用で cold start を大幅低減＋cron を分単位で実行可（外部pinger不要に）。根拠＝B1のHobby cron制約・write-path cold。
  - **Supabase Pro（≈$25/月）**：無料枠の自動 pause を回避（長期無アクセス後の復帰遅延を解消）。根拠＝pause復帰の初回遅延。
- 当面は「B3（実装済）＋ 外部pinger（無料）」で実用上十分。上記は判断材料として提示（変更は勝彦判断）。

## バックアップ / 不変性
`docs/reports/r_perf_profiles_backup.json`（バックフィル前 profiles）。app_metadata 付与は metadata のみ＝認証情報・パスワード不変。既存 payout/snapshot・deal frozen・host/role分離は不変。
