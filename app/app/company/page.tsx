import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import SupplierSection from '../dashboard/SupplierSection'
import SupplierSettings from '../dashboard/SupplierSettings'
// 会社（サプライヤー専用タブ）: 商品（サービス設定）・案件・お金・委託・変更申請を1画面で。
export default async function CompanyPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, supplier_rate_card').eq('profile_id', user.id).maybeSingle()
  if (!me) redirect('/app')
  if (!me.supplier_rate_card) {
    const admin = await createServiceRoleClient()
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', me.id).limit(1)
    if (!sv?.length) redirect('/app')
  }
  return (
    <div className="page-anim" style={{ paddingBottom: 8 }}>
      <h2 style={{ fontSize: '.92rem', fontWeight: 500, margin: '18px 20px 0' }}>あなたの会社</h2>
      <SupplierSettings />
      <SupplierSection />
    </div>
  )
}
