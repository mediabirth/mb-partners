import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getServicesWithMenus } from '@/lib/supabase/queries'
import ServiceIcon from '@/components/ServiceIcon'
import GuideAccordion from './GuideAccordion'

export const runtime = 'edge'

export default async function GuidePage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const services = await getServicesWithMenus(supabase)

  return (
    <div>
      <Link href="/app/settings" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, textDecoration: 'none',
      }}>
        ← 設定
      </Link>

      <div style={{ padding: '10px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>サービスガイド</h2>
        </div>
      </div>

      <div style={{ paddingBottom: 8 }}>
        {services.map(svc => (
          <GuideAccordion key={svc.id} svc={svc} />
        ))}
      </div>

      <div style={{ height: 20 }} />
    </div>
  )
}
