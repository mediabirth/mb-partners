# batchPerf2：DB接続永続化 ＋ delivery_assignments(delivery_id) index 実適用 監査記録

日時：2026-06-20 JST / 対象：Supabase（ref zwnpbqpntiwsacsrrvfk）

## A：DB接続の永続化（以後 SQL を psql 直で自走可能に）
- `libpq`（psql）を `brew install libpq` で導入（`/opt/homebrew/opt/libpq/bin/psql`）。
- `app/.env.local`（`.gitignore` の `.env*` で除外＝非コミット）に `DATABASE_URL` を追記。
  - Session pooler：`aws-1-ap-northeast-1.pooler.supabase.com:5432`（`aws-0` は ENOTFOUND、`aws-1` で成功）。
  - 既存 `SUPABASE_DB_PASSWORD` を流用。**接続文字列・パスワードの実値は本書に記載しない。**
- 導通：`psql "$DATABASE_URL" -c "select now();"` → 成功（CONN_OK）。

## B：index 適用（psql 直・db push は使わない＝migration履歴desync回避）
適用：`create index if not exists delivery_assignments_delivery_idx on public.delivery_assignments(delivery_id);`（冪等・結果不変・お金/RLS/権限に無影響）。

データ規模：`delivery_assignments` = **3 行 / 2 delivery**（極小）。

### EXPLAIN ANALYZE（実測）
- 適用前：`Seq Scan on delivery_assignments`（Filter: delivery_id=…）, Execution Time ≈ **0.056 ms**。
- 適用後（自然な planner 選択）：**Seq Scan を維持**, Execution Time ≈ **0.047 ms**。
  - → 3行規模では Seq Scan が最適でplannerが index を選ばないのは正常。**現データでは差は軽微＝速度改善は計測されない（数値は捏造しない）。**
- 適用後（`set enable_seqscan=off` で index 使用可を検証）：**Index Scan using delivery_assignments_delivery_idx**（Execution Time ≈ 0.067 ms）。
  - → index は有効に作成され使用可能。**本indexはスケール時（delivery_assignments 増加時）に delivery_id 絞り込みの seq scan を回避するための予防措置**。

### 記録
- 既存 migration `supabase/migrations/20260620000001_delivery_assignments_delivery_idx.sql` は監査用に保持（`supabase db push` は migration履歴 desync のため未使用）。
- 残課題（任意・別途）：migration履歴 desync 修復（remote履歴 ↔ `app/supabase/migrations` の整合、config.toml/migrations dir の分離整理）。
