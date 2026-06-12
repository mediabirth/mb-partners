import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'

export default async function AppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  return (
    <div style={{ background: '#E9E9ED', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 430, background: '#fff', minHeight: '100vh', boxShadow: '0 0 48px rgba(14,14,20,.12)', padding: '40px 28px' }}>

        {/* App bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
              <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="3"/>
              <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="3"/>
              <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="3"/>
              <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
            </svg>
            <span style={{ fontWeight: 900, fontSize: '1rem' }}>
              MB <span style={{ color: 'var(--blue)' }}>Partners</span>
            </span>
          </div>
          <LogoutButton />
        </div>

        {/* Welcome */}
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Partner Dashboard</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>
            ようこそ、{profile?.name ?? 'パートナー'}さん
          </h1>
          <p style={{ fontSize: '.75rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.7 }}>
            M1 認証完了。M2（案件・サービス管理）を実装中です。
          </p>
        </div>

        {/* Status card */}
        <div style={{ background: 'var(--blue)', borderRadius: 16, padding: '21px 20px', color: '#fff' }}>
          <div style={{ fontSize: '.6rem', fontWeight: 600, opacity: .7, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            ログイン確認
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>認証 OK</div>
          <div style={{ fontSize: '.72rem', opacity: .8, marginTop: 4 }}>
            {user.email}
          </div>
        </div>

      </div>
    </div>
  )
}
