-- ============================================================
-- F-4 アバター用ストレージ — Supabase SQL Editor で1回実行。CCはDDL/バケット作成不可。
-- avatars バケット（公開読取）＋ 本人フォルダ(<uid>/...)のみ書込可のRLS。アップロードはAPI(service_role)経由。
-- お金系には一切触れない。profiles.avatar_url 列は既存（本SQLでは変更しない）。
-- ============================================================

-- ① 公開バケット作成（5MB上限・画像のみ）。冪等。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

-- ② 公開読取（誰でも閲覧）。
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select using (bucket_id = 'avatars');

-- ③ 本人フォルダのみ書込（先頭フォルダ名 = 自分のuid）。
drop policy if exists avatars_self_insert on storage.objects;
create policy avatars_self_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_self_update on storage.objects;
create policy avatars_self_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_self_delete on storage.objects;
create policy avatars_self_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
