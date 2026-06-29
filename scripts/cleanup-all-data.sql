-- ============================================================================
-- 全データ＆全アカウント クリーン化（owner+カレンダー連携+マスタ 保護）
-- 1トランザクション・FK依存順・末尾でガード assert（違反時 EXCEPTION→自動 ROLLBACK）
-- ★保護（このSQLに DELETE/DROP を一切書かない）：
--   mb_calendar(単数) / services / service_menus / menus / menu_rewards /
--   cooperation_task_templates / notification_settings / message_templates /
--   mb_calendars / member_notification_prefs(テーブル自体)
-- ★owner 保護：email='mediabirth.project@gmail.com' を WHERE で明示除外
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- Phase 1：ログ・通知・分析・スタンドアロン・問い合わせ（profiles NO ACTION ブロッカー解除）
DELETE FROM audit_logs;
DELETE FROM funnel_events;
DELETE FROM notifications;
DELETE FROM ai_usage;
DELETE FROM messages;
DELETE FROM meeting_reminders;
DELETE FROM push_subscriptions;
DELETE FROM line_login_nonces;
DELETE FROM line_oauth_nonces;
DELETE FROM partner_line_links;
DELETE FROM synapse_contacts;
DELETE FROM bank_change_requests;
DELETE FROM broadcast_reads;
DELETE FROM broadcasts;
DELETE FROM inquiry_messages;
DELETE FROM inquiries;

-- Phase 2：ベンダー子（葉→中間）
DELETE FROM delivery_deliverables;
DELETE FROM delivery_schedule;
DELETE FROM delivery_tasks;
DELETE FROM delivery_updates;
DELETE FROM expense_claims;
DELETE FROM delivery_payout_items;
DELETE FROM delivery_assignments;

-- Phase 3：ベンダー親（紐付き invites は CASCADE）
DELETE FROM deliveries;

-- Phase 4：案件・商談
DELETE FROM meetings;
DELETE FROM continuous_payouts;
DELETE FROM deal_events;
DELETE FROM deal_items;
DELETE FROM deal_tasks;
DELETE FROM deals;

-- Phase 5：報酬支払（¥142,318 消滅）
DELETE FROM payout_items;
DELETE FROM payout_overrides;
DELETE FROM payout_batches;

-- Phase 6：パートナー（残り partner子は CASCADE）
DELETE FROM referral_links;
DELETE FROM calendar_links;
DELETE FROM partner_applications;
DELETE FROM partners;

-- Phase 7：招待（残り全て・profiles.created_by NO ACTION のため profiles より前に）
DELETE FROM invites;

-- Phase 8：メンバー通知（owner分は保護・現0）
DELETE FROM member_notification_prefs
  WHERE user_id NOT IN (SELECT id FROM profiles WHERE email = 'mediabirth.project@gmail.com');

-- Phase 9a：profiles（owner以外）
DELETE FROM profiles
  WHERE email IS DISTINCT FROM 'mediabirth.project@gmail.com';

-- Phase 9b：auth.users（owner以外・孤児含む。残った非owner profiles は CASCADE）
DELETE FROM auth.users
  WHERE email IS DISTINCT FROM 'mediabirth.project@gmail.com';

-- ============================================================================
-- ★ガード：保護対象が生存し、削除対象が空であることを assert。違反で EXCEPTION→ROLLBACK
-- ============================================================================
DO $$
DECLARE
  owner_n int; auth_n int; cal_n int; svc_n int; menu_n int; rew_n int; coop_n int; ns_n int; mt_n int;
  deals_n int; partners_n int; pay_n int; deliv_n int;
BEGIN
  SELECT count(*) INTO owner_n FROM profiles;
  SELECT count(*) INTO auth_n  FROM auth.users;
  SELECT count(*) INTO cal_n   FROM mb_calendar WHERE id = 1 AND google_email = 'kthk.kmbr@gmail.com';
  SELECT count(*) INTO svc_n   FROM services;
  SELECT count(*) INTO menu_n  FROM menus;
  SELECT count(*) INTO rew_n   FROM menu_rewards;
  SELECT count(*) INTO coop_n  FROM cooperation_task_templates;
  SELECT count(*) INTO ns_n    FROM notification_settings;
  SELECT count(*) INTO mt_n    FROM message_templates;
  SELECT count(*) INTO deals_n FROM deals;
  SELECT count(*) INTO partners_n FROM partners;
  SELECT count(*) INTO pay_n   FROM payout_items;
  SELECT count(*) INTO deliv_n FROM deliveries;

  IF owner_n <> 1 THEN RAISE EXCEPTION 'GUARD: profiles must be 1(owner), got %', owner_n; END IF;
  IF auth_n  <> 1 THEN RAISE EXCEPTION 'GUARD: auth.users must be 1(owner), got %', auth_n; END IF;
  IF cal_n   <> 1 THEN RAISE EXCEPTION 'GUARD: mb_calendar id=1 kthk.kmbr must survive, got %', cal_n; END IF;
  IF svc_n   <> 5 THEN RAISE EXCEPTION 'GUARD: services must be 5, got %', svc_n; END IF;
  IF menu_n  <> 12 THEN RAISE EXCEPTION 'GUARD: menus must be 12, got %', menu_n; END IF;
  IF rew_n   <> 16 THEN RAISE EXCEPTION 'GUARD: menu_rewards must be 16, got %', rew_n; END IF;
  IF coop_n  <> 41 THEN RAISE EXCEPTION 'GUARD: cooperation_task_templates must be 41, got %', coop_n; END IF;
  IF ns_n    <> 1 THEN RAISE EXCEPTION 'GUARD: notification_settings must be 1, got %', ns_n; END IF;
  IF mt_n    <> 4 THEN RAISE EXCEPTION 'GUARD: message_templates must be 4, got %', mt_n; END IF;
  IF deals_n <> 0 OR partners_n <> 0 OR pay_n <> 0 OR deliv_n <> 0 THEN
    RAISE EXCEPTION 'GUARD: transactional data not empty (deals=% partners=% payout=% deliveries=%)', deals_n, partners_n, pay_n, deliv_n;
  END IF;
  RAISE NOTICE 'GUARD PASSED: owner=1 auth=1 calendar=1 masters intact, tx data empty';
END $$;

COMMIT;
