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
import { SG_NETWORK } from '@/lib/supplier-guides'
import FrontierInvite from '../../frontier/FrontierInvite'
import FrontierSection from '../../dashboard/FrontierSection'
// 網（リファラル）: 招待リンク最上部＋配下・還元＋自分の紹介導線
export default async function SupplierNetworkPage() {
  await requireSupplierId()
  return (
    <div className="page-anim" style={{ padding: '18px 0 40px', maxWidth: 720, margin: '0 auto', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 20px 12px' }}>
        <h1 style={{ fontSize: '.95rem', fontWeight: 700 }}>網（リファラル）</h1>
        <PageGuide data={SG_NETWORK} />
      </div>
      <div style={{ margin: '0 20px', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, padding: '13px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: '.76rem', fontWeight: 700 }}>リファラルを招待（最優先）</div>
          <a href="/app/refer" style={{ flexShrink: 0, fontSize: '.7rem', fontWeight: 500, color: '#fff', background: 'var(--c-blue)', borderRadius: 999, padding: '8px 16px', textDecoration: 'none' }}>自分で紹介する →</a>
        </div>
        <FrontierInvite />
      </div>
      <FrontierSection />
    </div>
  )
}
