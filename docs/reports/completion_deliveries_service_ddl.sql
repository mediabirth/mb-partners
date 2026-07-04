-- コンソール完成C1: デリバリー（業務委託先）の担当サービス紐づけ（additive・任意）。
-- アサインselectの候補提示（該当サービス優先）に使用。既存行はnull=全サービス扱い。
alter table public.deliveries add column if not exists service_id text references public.services(id) on delete set null;
