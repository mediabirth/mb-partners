/* Part B テストデータ投入（本番DB・service_role）。顧客名/案件名すべて先頭「【テスト】」。
 * 投入先 vendor＝神原勝彦（delivery ffa3815d…）。再実行可：先に【テスト】系を削除してから投入。 */
const fs = require('fs')
const env = fs.readFileSync('.env.local', 'utf8')
const get = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : '' }
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL') || get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const VENDOR_DELIVERY = 'ffa3815d-39e3-4458-87fa-67154b200c7c' // 神原勝彦（実アカウント・削除しない）
const PARTNER = 'b0000001-0000-0000-0000-000000000000'         // KT8842
const DIRECTOR = '39b30d21-61ae-4573-8ea8-2f6b493bf969'         // MB Admin（MB担当）
const RESO = 'reso', SITE_MENU = 'c0000006-0000-0000-0000-000000000000', LOGO_MENU = 'c0000005-0000-0000-0000-000000000000'
const FM = '2026-06-01', NOW = new Date().toISOString()
const must = (r, l) => { if (r.error || !r.data) throw new Error(l + ': ' + (r.error ? r.error.message : 'no data')); return r.data }
const created = { deals: [], deliveries: [] }

async function cleanExisting() {
  const { data: olds } = await sb.from('deals').select('id').like('customer_name', '【テスト】%')
  const ids = (olds ?? []).map(d => d.id)
  if (ids.length) {
    const { data: asg } = await sb.from('delivery_assignments').select('id').in('deal_id', ids)
    const aIds = (asg ?? []).map(a => a.id)
    if (aIds.length) await sb.from('expense_claims').delete().in('delivery_assignment_id', aIds)
    await sb.from('delivery_payout_items').delete().in('deal_id', ids)
    await sb.from('delivery_assignments').delete().in('deal_id', ids)
    await sb.from('deal_tasks').delete().in('deal_id', ids)
    await sb.from('deal_items').delete().in('deal_id', ids)
    await sb.from('deals').delete().in('id', ids)
  }
  await sb.from('deliveries').delete().like('name', '【テスト】%')
  console.log('cleared existing 【テスト】:', ids.length, 'deals')
}

async function mkDeal(f) { const d = must(await sb.from('deals').insert({ consent: true, source: 'manual', ...f }).select('id').single(), 'deal'); created.deals.push({ id: d.id, name: f.customer_name }); return d.id }
async function mkItem(f) { return must(await sb.from('deal_items').insert(f).select('id').single(), 'item').id }
async function mkAssign(f) { return must(await sb.from('delivery_assignments').insert(f).select('id').single(), 'assign').id }
async function mkExpense(f) { return must(await sb.from('expense_claims').insert(f).select('id').single(), 'exp').id }
async function mkPayout(f) { return must(await sb.from('delivery_payout_items').insert({ period: '2026-06', ...f }).select('id').single(), 'po').id }

;(async () => {
 await cleanExisting()

 // ── 1) 紹介・成約・今月：明細2（サイト¥300k/ロゴ¥100k）・MB担当・その他原価¥20k・神原割当¥120k・経費3 ──
 const d1 = await mkDeal({ customer_name: '【テスト】紹介成約 株式会社サンプル', service_id: RESO, partner_id: PARTNER, channel: 'referral', status: 'confirmed', amount: 40000, fixed_month: FM, director_id: DIRECTOR, other_cost: 20000 })
 const d1site = await mkItem({ deal_id: d1, service_id: RESO, menu_id: SITE_MENU, kind: 'fixed', amount: 30000, revenue: 300000, sort: 0 })
 await mkItem({ deal_id: d1, service_id: RESO, menu_id: LOGO_MENU, kind: 'fixed', amount: 10000, revenue: 100000, sort: 1 })
 const a1 = await mkAssign({ deal_id: d1, deal_item_id: d1site, delivery_id: VENDOR_DELIVERY, base_fee: 120000, assigned_by: DIRECTOR })
 await mkExpense({ delivery_assignment_id: a1, kind: '交通', amount: 15000, status: 'approved', approved_by: DIRECTOR, approved_at: NOW, submitted_by: null })
 await mkExpense({ delivery_assignment_id: a1, kind: '宿泊', amount: 30000, status: 'submitted', submitted_by: null })
 await mkExpense({ delivery_assignment_id: a1, kind: 'その他', amount: 5000, status: 'rejected', submitted_by: null })
 await mkPayout({ delivery_id: VENDOR_DELIVERY, deal_id: d1, deal_item_id: d1site, base_fee: 120000, expense_total: 15000, amount: 135000, status: 'unpaid', frozen_at: NOW })

 // ── 2) 協力・成約・今月：協力タスク一部完了/未完・神原割当¥80k・経費1(承認¥10k)・支払=凍結→支払済 ──
 const d2 = await mkDeal({ customer_name: '【テスト】協力成約 合同会社コラボ', service_id: RESO, menu_id: SITE_MENU, partner_id: PARTNER, channel: 'cooperation', status: 'confirmed', amount: 50000, base_amount: 500000, fixed_month: FM, director_id: DIRECTOR, effective_kind: 'cooperation', reward_snapshot: { ref_type: 'rate', ref_value: 10, ref_base: '売上', effective_kind: 'referral', gate_reason: '必須の協力タスクが未完了のため紹介レートを適用（テストデータ）' } })
 const d2item = await mkItem({ deal_id: d2, service_id: RESO, menu_id: SITE_MENU, kind: 'rate', amount: 50000, base_amount: 500000, revenue: 600000, sort: 0 })
 await sb.from('deal_tasks').insert([
   { deal_id: d2, label: '初回ヒアリング', kind: 'coop', required: true, done: true, done_at: NOW, done_by: DIRECTOR, sort: 0 },
   { deal_id: d2, label: '制作物の確認', kind: 'coop', required: true, done: false, sort: 1 },
   { deal_id: d2, label: '納品立ち会い', kind: 'coop', required: false, done: false, sort: 2 },
 ])
 const a2 = await mkAssign({ deal_id: d2, deal_item_id: d2item, delivery_id: VENDOR_DELIVERY, base_fee: 80000, assigned_by: DIRECTOR })
 await mkExpense({ delivery_assignment_id: a2, kind: '交通', amount: 10000, status: 'approved', approved_by: DIRECTOR, approved_at: NOW, submitted_by: null })
 await mkPayout({ delivery_id: VENDOR_DELIVERY, deal_id: d2, deal_item_id: d2item, base_fee: 80000, expense_total: 10000, amount: 90000, status: 'paid', frozen_at: NOW, paid_at: NOW, paid_by: DIRECTOR })

 // ── 3) 相談案件（サービス未定・明細0・受付） ──
 let d3
 try { d3 = await mkDeal({ customer_name: '【テスト】相談 個人のお客様', service_id: null, channel: 'referral', partner_id: PARTNER, status: 'received', amount: 0, is_consultation: true }) }
 catch { d3 = await mkDeal({ customer_name: '【テスト】相談 個人のお客様', service_id: RESO, channel: 'referral', partner_id: PARTNER, status: 'received', amount: 0, is_consultation: true }) }

 // ── 4) 隔離確認：別委託先B にだけ紐づく成約案件＋割当（神原に見えないこと用） ──
 const dvB = must(await sb.from('deliveries').insert({ name: '【テスト】委託先B', kind: 'エンジニア', active: true }).select('id').single(), 'dvB').id
 created.deliveries.push({ id: dvB, name: '【テスト】委託先B' })
 const d4 = await mkDeal({ customer_name: '【テスト】隔離確認 B社案件', service_id: RESO, partner_id: PARTNER, channel: 'referral', status: 'confirmed', amount: 20000, fixed_month: FM, director_id: DIRECTOR })
 const d4item = await mkItem({ deal_id: d4, service_id: RESO, kind: 'fixed', amount: 20000, revenue: 200000, sort: 0 })
 const a4 = await mkAssign({ deal_id: d4, deal_item_id: d4item, delivery_id: dvB, base_fee: 50000, assigned_by: DIRECTOR })
 await mkPayout({ delivery_id: dvB, deal_id: d4, deal_item_id: d4item, base_fee: 50000, expense_total: 0, amount: 50000, status: 'unpaid', frozen_at: NOW })

 // ── 5) 受注額未入力の固定案件（「未入力N件」バナー用） ──
 const d5 = await mkDeal({ customer_name: '【テスト】未入力 固定案件 D社', service_id: RESO, partner_id: PARTNER, channel: 'referral', status: 'confirmed', amount: 25000, fixed_month: FM })
 await mkItem({ deal_id: d5, service_id: RESO, kind: 'fixed', amount: 25000, revenue: null, sort: 0 })

 console.log('\n=== 投入完了 ===')
 console.log('deals:'); created.deals.forEach(d => console.log('  ' + d.id + '  ' + d.name))
 console.log('test deliveries (B):'); created.deliveries.forEach(d => console.log('  ' + d.id + '  ' + d.name))
 console.log('神原 delivery (保持):', VENDOR_DELIVERY)
})().catch(e => console.log('SEED ERROR', e.message))
