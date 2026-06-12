import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppNav from '@/components/AppNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, color')
    .eq('id', user.id)
    .single()

  return (
    <div style={{ background: '#E9E9ED', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 430, background: '#fff', minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 48px rgba(14,14,20,.12)', position: 'relative',
      }}>
        {/* App bar */}
        <header style={{
          background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(12px)',
          padding: '12px 20px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 50,
          borderBottom: '1px solid var(--line)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
              <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="3"/>
              <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="3"/>
              <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="3"/>
              <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
            </svg>
            <b style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.95rem' }}>
              MB <span style={{ color: 'var(--blue)' }}>Partners</span>
            </b>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--line)', borderRadius: 30, padding: '4px 12px 4px 4px', minHeight: 40 }}>
            <span style={{
              width: 27, height: 27, borderRadius: '50%',
              background: profile?.color ?? 'var(--blue)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.72rem', fontWeight: 700, flexShrink: 0,
            }}>
              {(profile?.name ?? 'P')[0]}
            </span>
            <b style={{ fontSize: '.72rem' }}>{profile?.name ?? '—'}</b>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 86 }}>
          {children}
        </main>

        <AppNav />
      </div>
    </div>
  )
}
