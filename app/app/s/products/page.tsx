import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
async function requireSupplierId(): Promise<string> {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, supplier_rate_card').eq('profile_id', user!.id).maybeSingle()
  if (!me) redirect('/app')
  if (!me!.supplier_rate_card) {
    const admin = await createServiceRoleClient()
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', me!.id).limit(1)
    if (!sv?.length) redirect('/app')
  }
  return me!.id
}

import PageGuide from '@/components/PageGuide'
import { SG_PRODUCTS } from '@/lib/supplier-guides'
import SupplierSettings from '../../dashboard/SupplierSettings'
// 商品: ブランド/メニューの管理（即時系＋申請系を1画面に・「申請中」バッジ・PC=2ペインはSupplierSettings page変種）
export default async function SupplierProductsPage() {
  await requireSupplierId()
  return (
    <div className="page-anim" style={{ padding: '18px 18px 40px', maxWidth: 980, margin: '0 auto', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: '.95rem', fontWeight: 700 }}>商品</h1>
        <PageGuide data={SG_PRODUCTS} />
      </div>
      <SupplierSettings variant="page" />
    </div>
  )
}
