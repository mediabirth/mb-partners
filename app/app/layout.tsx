import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
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
  if (!uid) {
    // 認証判定は不変。弾いた後の行き先にだけ戻り先（proxy が付与した x-mb-path・/app配下のみ）を付ける。
    const p = (await headers()).get('x-mb-path')
    redirect(p && (p === '/app' || p.startsWith('/app/')) ? `/login?redirect=${encodeURIComponent(p)}` : '/login')
  }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, color')
    .eq('id', uid)
    .single()

  // BR-V3：シェル chrome は単一ソース SurfaceShell。差分はルート/名前/色/ナビ config のみ。
  // SYNAPSE：ヘッダーのアイコンは撤去（導線は HOME ヒーローのノードへ移設）。既存ナビは不変。
  return (
    <SurfaceShell homeHref="/app" mypageHref="/app/mypage" settingsHref="/app/settings" name={profile?.name ?? null} color={profile?.color ?? null} nav={<AppNav />}>
      <SWRProvider><PageTransition>{children}</PageTransition></SWRProvider>
    </SurfaceShell>
  )
}
