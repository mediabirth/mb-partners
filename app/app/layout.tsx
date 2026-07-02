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
      {/* v3.1 デザイン規律：/app 本文のみ、共有部品由来の太字(b/見出し/ボタン/チップ/タグ)を500へ静音化。
          ★この <style> は /app レイアウト内のみ読み込まれ、セレクタも .app-quiet 配下に限定＝ベンダー/コンソールは不変。
          ★ロゴ「MB Partners」・アバター頭文字・ナビは SurfaceShell(この配下外)＝従来700のまま（ブランド表現）。 */}
      <style>{`.app-quiet :is(b,strong,.btn,.ui-btn,.ty-h1,.ty-h2,.eyebrow,.chip,.ui-tag){font-weight:500}.app-quiet .rh-q *{font-weight:500!important}`}</style>
      <div className="app-quiet" style={{ display: 'contents' }}>
        <SWRProvider><PageTransition>{children}</PageTransition></SWRProvider>
      </div>
    </SurfaceShell>
  )
}
