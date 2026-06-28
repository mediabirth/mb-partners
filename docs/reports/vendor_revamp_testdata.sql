-- ベンダー確認用テストデータ（神原勝彦＝唯一の生きたベンダー）。固定UUID＝冪等。
-- ★パートナー/ money 非干渉：deals は system partner(MBHOUSE)・amount=0・status非confirmed（close_month は is_system 除外＋confirmed のみ）。
BEGIN;

-- 冪等クリーンアップ（固定UUID・子は CASCADE）
DELETE FROM delivery_payout_items WHERE deal_id IN ('d1111111-1111-1111-1111-111111111111','d2222222-2222-2222-2222-222222222222','d3333333-3333-3333-3333-333333333333');
DELETE FROM deals WHERE id IN ('d1111111-1111-1111-1111-111111111111','d2222222-2222-2222-2222-222222222222','d3333333-3333-3333-3333-333333333333');

-- deals（顧客＝customer_name / 案件名＝delivery_brief）
INSERT INTO deals (id, partner_id, service_id, customer_name, delivery_brief, channel, source, status, amount, consent, created_at) VALUES
 ('d1111111-1111-1111-1111-111111111111','90ff5a51-183c-48b0-9bdd-a25349fb5d34','reso','◯◯株式会社','ブランド撮影','cooperation','admin_manual','in_progress',0,true, now() - interval '6 days'),
 ('d2222222-2222-2222-2222-222222222222','90ff5a51-183c-48b0-9bdd-a25349fb5d34','mh','△△商事','採用支援コンサル','cooperation','admin_manual','paid',0,true, now() - interval '40 days'),
 ('d3333333-3333-3333-3333-333333333333','90ff5a51-183c-48b0-9bdd-a25349fb5d34','reso','□□デザイン','サイトデザイン','cooperation','admin_manual','paid',0,true, now() - interval '70 days');

-- assignment（神原・ブランド撮影・委託費80000・実行中）
INSERT INTO delivery_assignments (id, deal_id, delivery_id, base_fee, status, assigned_at, note) VALUES
 ('a1111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111','ffa3815d-39e3-4458-87fa-67154b200c7c',80000,'in_progress', now() - interval '6 days','ブランド撮影');

-- tasks 5件（3 done / 2 pending）＝進捗 3/5
INSERT INTO delivery_tasks (delivery_assignment_id, title, type, needs_deliverable, due_date, sort, status, done_at) VALUES
 ('a1111111-1111-1111-1111-111111111111','日程を確定する','task',false,null,0,'done', now() - interval '5 days'),
 ('a1111111-1111-1111-1111-111111111111','現地で撮影する','task',false,null,1,'done', now() - interval '3 days'),
 ('a1111111-1111-1111-1111-111111111111','セレクト・編集','task',false,null,2,'done', now() - interval '1 day'),
 ('a1111111-1111-1111-1111-111111111111','撮影データを納品する','task',true,(now() + interval '2 days')::date,3,'pending',null),
 ('a1111111-1111-1111-1111-111111111111','最終確認・クローズ','task',false,(now() + interval '9 days')::date,4,'pending',null);

-- deliverable 1件（アップロード済）
INSERT INTO delivery_deliverables (delivery_assignment_id, task_id, file_path, file_name, note, created_at) VALUES
 ('a1111111-1111-1111-1111-111111111111', null, 'vendor-test/locselect.zip','ロケ撮影_セレクト.zip','セレクト版', now() - interval '1 day');

-- MB↔ベンダー チャット 2件
INSERT INTO delivery_updates (delivery_assignment_id, kind, body, sender, created_at) VALUES
 ('a1111111-1111-1111-1111-111111111111','message','撮影お疲れさまでした！データ納品お待ちしています。','mb', now() - interval '20 hours'),
 ('a1111111-1111-1111-1111-111111111111','message','明日中に納品します。','vendor', now() - interval '18 hours');

-- スケジュール：候補日提示(pending) ＋ 予定2件
INSERT INTO delivery_schedule (delivery_assignment_id, row_type, label, event_type, proposed_dates, status, sort) VALUES
 ('a1111111-1111-1111-1111-111111111111','proposal','クローズ打合せの日程','打合せ', ARRAY['2026-07-02','2026-07-03','2026-07-05']::date[], 'pending', 0);
INSERT INTO delivery_schedule (delivery_assignment_id, row_type, label, event_type, event_date, status, sort) VALUES
 ('a1111111-1111-1111-1111-111111111111','event','データ納品期限','納品期限','2026-07-03','confirmed',1),
 ('a1111111-1111-1111-1111-111111111111','event','プロジェクトクローズ','クローズ','2026-07-10','confirmed',2);

-- 委託費明細 3件（未払い¥80,000 ＋ 支払済¥110,000 ＋ ¥50,000 ＝ 累計¥240,000）
INSERT INTO delivery_payout_items (delivery_id, deal_id, base_fee, expense_total, amount, period, status, paid_at, frozen_at) VALUES
 ('ffa3815d-39e3-4458-87fa-67154b200c7c','d1111111-1111-1111-1111-111111111111',80000,0,80000,'2026-07','unpaid',null, now() - interval '1 day'),
 ('ffa3815d-39e3-4458-87fa-67154b200c7c','d2222222-2222-2222-2222-222222222222',100000,10000,110000,'2026-06','paid', now() - interval '20 days', now() - interval '30 days'),
 ('ffa3815d-39e3-4458-87fa-67154b200c7c','d3333333-3333-3333-3333-333333333333',50000,0,50000,'2026-05','paid', now() - interval '50 days', now() - interval '60 days');

-- 神原 プロフィール（本人確認lock項目・職種 kind は列保持・非表示）
UPDATE deliveries SET
  nickname='かんばら', display_code='KT8842', phone='090-1234-5678',
  address='東京都渋谷区〇〇 1-2-3', tax_type='個人',
  bank_name='みずほ銀行', bank_branch='渋谷支店', bank_account='普通 1234567',
  bank_holder_kana='カンバラ カツヒコ', invoice_number='T1234567890123'
WHERE id='ffa3815d-39e3-4458-87fa-67154b200c7c';

COMMIT;
