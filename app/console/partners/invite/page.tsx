import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import InviteForm from './InviteForm'

export const runtime = 'edge'

export default async function InvitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, color')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'manager'].includes(profile.role)) redirect('/console')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav
        profileName={profile.name ?? '管理者'}
        profileColor={profile.color ?? '#0E0E14'}
      />

      <div style={{ flex: 1, marginLeft: 230 }}>
        <div style={{
          background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--line)', padding: '13px 28px',
          display: 'flex', alignItems: 'center', gap: 12,
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <Link
            href="/console/partners"
            style={{ fontSize: '.72rem', color: 'var(--c-blue)', textDecoration: 'none' }}
          >
            ← パートナー一覧
          </Link>
          <span style={{ color: 'var(--line)' }}>/</span>
          <h1 style={{ fontSize: '1rem', fontWeight: 900, margin: 0 }}>招待を作成</h1>
        </div>

        <div className="page-anim">
          <InviteForm />
        </div>
      </div>
    </div>
  )
}
