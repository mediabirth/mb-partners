/**
 * vendor ポータルの app シェル — BR-V3：単一ソース SurfaceShell を app と同一に描画。
 * 差分はルート/名前/色/ナビ config のみ（chrome は 1 実装＝乖離不能）。
 * vendor ロール限定（未ログイン/非vendorは /vendor/login へ）。認証・RLS・隔離・セッション分離は無改修。
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VendorNav from '@/components/VendorNav'
import SurfaceShell from '@/components/ui/SurfaceShell'

export const runtime = 'edge'

export default async function VendorAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/vendor/login')
  const { data: profile } = await supabase.from('profiles').select('name, role, color').eq('id', user.id).single()
  if (!profile || profile.role !== 'vendor') redirect('/vendor/login')

  return (
    <SurfaceShell homeHref="/vendor" mypageHref="/vendor/mypage" settingsHref="/vendor/settings" name={profile.name ?? null} color={profile.color ?? null} nav={<VendorNav />}>
      {children}
    </SurfaceShell>
  )
}
