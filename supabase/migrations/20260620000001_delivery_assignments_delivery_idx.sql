-- perf: vendor gating クエリ delivery_assignments.delivery_id の seq scan を解消（唯一のindex欠落）。
-- 通常index・IF NOT EXISTS で冪等・結果不変・お金/RLS/権限に無影響。小規模につき CONCURRENTLY 不要（トランザクション可）。
create index if not exists delivery_assignments_delivery_idx on public.delivery_assignments(delivery_id);
