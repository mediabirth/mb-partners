/* テストデータ全削除（「【テスト】」ラベル基準）。service_role。
 * 実行：cd ~/mb-partners/app && node docs/reports/cleanup_testdata.cjs
 * 神原勝彦の実 deliveries レコード（auth_user_id 紐付き）は削除しない（名前が【テスト】の委託先Bのみ削除）。 */
const fs = require('fs')
const env = fs.readFileSync('.env.local', 'utf8')
const get = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : '' }
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL') || get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

;(async () => {
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
  // 【テスト】名の委託先のみ削除（神原の実レコードは name が「神原勝彦」なので残る）
  const { data: delDeliv } = await sb.from('deliveries').delete().like('name', '【テスト】%').select('id, name')
  console.log('削除: deals', ids.length, '件 / deliveries', (delDeliv ?? []).length, '件（' + (delDeliv ?? []).map(d => d.name).join(', ') + '）')
  console.log('神原勝彦の実アカウント・割当以外は保持されました。')
})().catch(e => console.log('CLEANUP ERROR', e.message))
