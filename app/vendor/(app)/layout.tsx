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
      {/* v2.2 デザイン規律：/vendor 本文のみ、共有部品由来の太字(b/見出し/ボタン/チップ/タグ)を500へ静音化。
          ★この <style> は /vendor レイアウト内のみ読み込まれ、セレクタも .vendor-quiet 配下に限定＝APP/コンソールは不変。
          ★ロゴ・アバター頭文字・ナビは SurfaceShell(この配下外)＝従来のまま（ブランド表現）。 */}
      <style>{`.vendor-quiet :is(b,strong,.btn,.ui-btn,.ty-h1,.ty-h2,.eyebrow,.chip,.ui-tag){font-weight:500}.vendor-quiet .rh-q *{font-weight:500!important}
/* タイポグラフィ規律v2.2（日本語改行・vendor限定＝.vendor-quietスコープ＝3面分離維持・auto-phrase非対応はnormalフォールバック） */
.vendor-quiet{line-break:strict}
.vendor-quiet p,.vendor-quiet li{text-wrap:pretty}
@supports (word-break:auto-phrase){.vendor-quiet p,.vendor-quiet li{word-break:auto-phrase}}
.vendor-quiet :is(h1,h2,.ty-h1,.ty-h2){text-wrap:balance}`}</style>
      <div className="vendor-quiet" style={{ display: 'contents' }}>
        {children}
      </div>
    </SurfaceShell>
  )
}
