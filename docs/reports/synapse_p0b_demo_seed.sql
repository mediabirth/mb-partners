-- SYNAPSE Phase 0.5（S3）：デモ連絡先 seed（本人＝勝田 勝彦 / code=KT8842 のアカウントにのみ投入）。
-- ★本人RLSのみの私的データ（他者不可視）。need-firstカードが映えるよう業種を散らし困りごとを明確化。
-- ★各 name と notes に【デモ】を付与＝容易に削除可能。お金/deals/frontier/帰属とは無関係。
-- 実行：psql 直（DATABASE_URL）。2026-06-22 適用。
-- ★クリーンアップ（公開前チェックリスト）：
--   delete from public.synapse_contacts where name like '%【デモ】%';
insert into public.synapse_contacts (partner_id, name, company, industry, role, relationship, needs, notes, source)
select p.id, v.name, v.company, v.industry, v.role, v.relationship, v.needs, v.notes, v.source
from public.partners p
cross join (values
  ('佐藤 健一【デモ】','旭フーズ株式会社','食品メーカー','EC事業部 部長','異業種交流会で名刺交換','新規ECの立ち上げを任されたが社内に経験者がおらず、採用にも苦戦している','【デモ】need-first表示確認用','interview'),
  ('田中 美咲【デモ】','つむぎ工務店','建設・工務店','専務取締役','前職の取引先','職人の高齢化が進み、若手採用と現場のIT化（図面・工程管理）を同時に進めたい','【デモ】','manual'),
  ('山本 拓也【デモ】','クリニックやまもと','医療（クリニック）','院長','知人の紹介','増患のためのWeb集患と口コミ対策を始めたいが、何から手をつけるべきか分からない','【デモ】','interview'),
  ('中村 由紀【デモ】','エヌ・アパレル','アパレルEC','取締役','商工会セミナーで同席','在庫が読めず欠品と過剰在庫を繰り返している。売れ筋分析と需要予測を仕組み化したい','【デモ】','card'),
  ('大野 慎吾【デモ】','大野会計事務所','士業（会計）','代表税理士','顧問先からの紹介','顧問先の事業承継案件が増え、信頼できるM&A・後継者マッチングの相談先を探している','【デモ】','manual')
) as v(name, company, industry, role, relationship, needs, notes, source)
where p.code = 'KT8842';
