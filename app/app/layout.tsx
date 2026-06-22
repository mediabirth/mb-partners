import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import AppNav from '@/components/AppNav'
import SurfaceShell from '@/components/ui/SurfaceShell'
import PageTransition from '@/components/PageTransition'
import SWRProvider from '@/components/SWRProvider'

// Edge runtime: no cold starts, globally distributed SSR
// All server components in /app/** use only @supabase/ssr + next/headers (edge-safe)
export const runtime = 'edge'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const uid = await getCachedUid()
  if (!uid) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, color')
    .eq('id', uid)
    .single()

  // BR-V3：シェル chrome は単一ソース SurfaceShell。差分はルート/名前/色/ナビ config のみ。
  // SYNAPSE Phase 0.5（S1）：app限定でヘッダーに私的台帳への入口を1つ追加（vendor/console には出さない）。
  const synapseLink = (
    <Link href="/app/synapse" aria-label="つながりの台帳" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'var(--txt)' }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="9" r="2.4" /><circle cx="9" cy="18" r="2.4" /><path d="M8 7l8 1.5M7.6 16l1.2-7.5M11 18l5-7" /></svg>
      </span>
    </Link>
  )
  return (
    <SurfaceShell homeHref="/app" mypageHref="/app/mypage" settingsHref="/app/settings" name={profile?.name ?? null} color={profile?.color ?? null} nav={<AppNav />} headerExtra={synapseLink}>
      <SWRProvider><PageTransition>{children}</PageTransition></SWRProvider>
    </SurfaceShell>
  )
}
