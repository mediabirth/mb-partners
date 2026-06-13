-- M6: invites.token に DEFAULT を追加（既存スキーマには DEFAULT なし）
ALTER TABLE invites ALTER COLUMN token SET DEFAULT gen_random_uuid();

-- expires_at のデフォルトも念のため確認・設定
ALTER TABLE invites ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');
