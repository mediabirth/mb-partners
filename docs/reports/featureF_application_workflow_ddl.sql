-- Feature F: パートナー応募のステータス制ワークフロー（面談予約→承認でリファラル招待）。
-- ★追加型・冪等のみ（ADD COLUMN IF NOT EXISTS）。既存データ・money・他テーブル非接触。
-- status: 'applied'(応募受付/面談予約待ち) → 'interview_booked'(面談予約済み) → 'approved'(承認・招待発行) / 'rejected'(見送り)
alter table public.partner_applications
  add column if not exists status text not null default 'applied',
  add column if not exists interview_token uuid default gen_random_uuid(),
  add column if not exists interview_at timestamptz,
  add column if not exists interview_meet_url text,
  add column if not exists invited_at timestamptz;

-- 既存行にも面談トークンを付与（volatile default は既存行に一意値を入れるが念のため冪等backfill）
update public.partner_applications set interview_token = gen_random_uuid() where interview_token is null;

-- 面談トークンは公開URLの鍵＝一意制約（存在すれば無視）
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'partner_applications_interview_token_key'
  ) then
    alter table public.partner_applications add constraint partner_applications_interview_token_key unique (interview_token);
  end if;
end $$;

-- 既に activated_at が立っている（旧「仲間化」済み）行は approved 扱いに寄せる（表示整合・冪等）
update public.partner_applications set status = 'approved' where activated_at is not null and status = 'applied';
