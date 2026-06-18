import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import AnalyticsClient from './AnalyticsClient'

export const runtime = 'edge'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')
  const { data: profile } = await supabase.from('profiles').select('name, role, color').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') redirect('/console')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: 2 }}>分析</p>
            <h1 style={{ fontSize: '1rem', fontWeight: 900, lineHeight: 1 }}>成約分析・深掘り</h1>
          </div>
          <Link href="/console" style={{ fontSize: '.7rem', color: 'var(--blue)', fontWeight: 700, textDecoration: 'none' }}>← ダッシュボード</Link>
        </div>
        <AnalyticsClient />
      </div>
    </div>
  )
}
