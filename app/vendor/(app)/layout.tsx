/**
 * vendor ポータルの app シェル — BR-V3：単一ソース SurfaceShell を app と同一に描画。
 * 差分はルート/名前/色/ナビ config のみ（chrome は 1 実装＝乖離不能）。
 * vendor ロール限定（未ログイン/非vendorは /vendor/login へ）。認証・RLS・隔離・セッション分離は無改修。
 */
import { redirect } from 'next/navigation'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/server'
import VendorNav from '@/components/VendorNav'
import SurfaceShell from '@/components/ui/SurfaceShell'

export const runtime = 'edge'

export default async function VendorAppLayout({ children }: { children: React.ReactNode }) {
  // 認可判定は不変（user無し→login／role!=='vendor'→login）。getUser/profiles をリクエスト内で
  // page(resolveVendor) と共有（getCachedUser/getCachedProfile）＝往復削減のみ。取得値は従来と同一。
  const user = await getCachedUser()
  if (!user) redirect('/vendor/login')
  const profile = await getCachedProfile()
  if (!profile || profile.role !== 'vendor') redirect('/vendor/login')

  return (
    <SurfaceShell homeHref="/vendor" mypageHref="/vendor/mypage" settingsHref="/vendor/settings" name={profile.name ?? null} color={profile.color ?? null} avatarUrl={profile.avatar_url ?? null} nav={<VendorNav />}>
      {children}
    </SurfaceShell>
  )
}
