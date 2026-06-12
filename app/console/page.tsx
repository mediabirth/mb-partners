import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'

export default async function ConsolePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg2)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        background: '#fff', borderBottom: '1px solid var(--line)',
        padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="3"/>
            <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="3"/>
            <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="3"/>
            <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
          </svg>
          <div>
            <div style={{ fontWeight: 900, fontSize: '.95rem' }}>
              MB Partners <span style={{ color: 'var(--blue)' }}>Console</span>
            </div>
            <div style={{ fontSize: '.55rem', fontFamily: 'Inter', letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted2)' }}>
              Admin
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '.78rem', color: 'var(--muted2)' }}>
            {profile?.name} ({profile?.role})
          </span>
          <LogoutButton />
        </div>
      </header>

      {/* Main */}
      <main style={{ padding: '32px 28px', maxWidth: 900, width: '100%', margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Console Dashboard</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: 16 }}>
          ようこそ、{profile?.name ?? '管理者'}さん
        </h1>
        <p style={{ fontSize: '.8rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
          M1 認証完了。M2（案件・サービス管理）を実装中です。
        </p>

        {/* Status */}
        <div style={{
          marginTop: 24, background: '#fff', border: '1px solid var(--line)',
          borderRadius: 13, padding: '20px 24px',
        }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 8 }}>ログイン確認</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--green)' }}>✓ 認証 OK（2段階認証済み）</div>
          <div style={{ fontSize: '.75rem', color: 'var(--muted2)', marginTop: 4 }}>{user.email}</div>
        </div>
      </main>
    </div>
  )
}
