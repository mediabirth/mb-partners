import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import AppNav from '@/components/AppNav'
import PageTransition from '@/components/PageTransition'

// Edge runtime: no cold starts, globally distributed SSR
// All server components in /app/** use only @supabase/ssr + next/headers (edge-safe)
export const runtime = 'edge'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, color')
    .eq('id', user.id)
    .single()

  return (
    <div style={{ background: '#E9E9ED', minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 430, background: '#fff', minHeight: '100dvh',
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href="/app/mypage" style={{
              display: 'flex', alignItems: 'center', gap: 7,
              border: '1px solid var(--line)', borderRadius: 30,
              padding: '4px 12px 4px 4px', minHeight: 40, textDecoration: 'none', color: 'inherit',
              transition: 'border-color .2s',
            }}>
              <span style={{
                width: 27, height: 27, borderRadius: '50%',
                background: profile?.color ?? 'var(--blue)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.72rem', fontWeight: 700, flexShrink: 0,
              }}>
                {(profile?.name ?? 'P')[0]}
              </span>
              <b style={{ fontSize: '.72rem' }}>{profile?.name ?? '—'}</b>
            </Link>
            <Link href="/app/settings" aria-label="設定" style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '1px solid var(--line)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', textDecoration: 'none', color: 'var(--txt)',
              background: 'var(--bg)',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </Link>
          </div>
        </header>

        {/* Page content — fixed nav + iOS home indicator 分の余白を確保 */}
        <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(86px + env(safe-area-inset-bottom))' }}>
          <PageTransition>{children}</PageTransition>
        </main>

        <AppNav />
      </div>
    </div>
  )
}
