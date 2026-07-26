import { redirect } from 'next/navigation'
import Link from 'next/link'
import { loadVendorBundle } from '@/lib/vendor-data'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getServicesWithMenus } from '@/lib/supabase/queries'
import GuideAccordion from '@/app/app/guide/GuideAccordion'

export const runtime = 'edge'

export default async function VendorGuidePage() {
  if (!(await loadVendorBundle())) redirect('/vendor/login')
  const admin = await createServiceRoleClient()
  const services = await getServicesWithMenus(admin)
  return (
    <div className="page-anim">
      <Link href="/vendor/settings" style={{ display: 'inline-flex', fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, textDecoration: 'none' }}>
        ← 設定
      </Link>
      <div style={{ padding: '10px 20px 6px' }}><h1 style={{ fontSize: '.98rem', fontWeight: 500 }}>サービスガイド</h1></div>
      <div style={{ paddingBottom: 24 }}>
        {services.map(service => <GuideAccordion key={service.id} svc={service} />)}
      </div>
    </div>
  )
}
