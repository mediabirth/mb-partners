'use client'
// BR-V3：単一ソース SettingsScreen を app config で描画（vendor と同一画面・同一ラベル）。
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import SettingsScreen from '@/components/ui/SettingsScreen'
import LineLinkCard from '@/components/LineLinkCard'
import InviteFellowCard from '@/components/InviteFellowCard'
import PushToggle from '@/components/PushToggle'

export default function SettingsPage() {
  const router = useRouter()
  // Feature E（M-1）：推薦カード用に本人の partner.id を解決（自分の行＝RLSで自己読取可）。
  const [partnerId, setPartnerId] = useState<string | null>(null)
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => {
      if (!data.user) return
      sb.from('partners').select('id').eq('profile_id', data.user.id).maybeSingle()
        .then(({ data: p }: { data: { id: string } | null }) => { if (p?.id) setPartnerId(p.id) })
    })
  }, [])
  async function logout() {
    const sb = createClient()
    // scope:'local'＝この面の cookie だけを消す。既定(global)はユーザーの全リフレッシュトークンを失効させ、
    // 同一アカウントが別面/別端末で持つセッションまで巻き添えにする（＝別面が突然ログアウトする再発経路）。
    await sb.auth.signOut({ scope: 'local' })
    router.push('/login')
  }
  return (
    <SettingsScreen
      links={[
        { href: '/app/mypage', label: 'プロフィール' },
        { href: '/app/guide', label: 'サービスガイド' },
        { href: '/app/terms', label: 'パートナー規約・ヘルプ' },
        { href: '/app/support', label: 'お問い合わせ' },
      ]}
      notifications={[
        { title: 'アプリ内通知', desc: '受信箱でいつでも確認できます', state: 'on' },
        { title: 'メール通知', desc: '重要なお知らせをメールでお届けします', state: 'on' },
        // 磨き③: 「準備中」の張りぼてを実トグルへ（購読/解除・非対応環境は静かに表示）
        { title: 'プッシュ通知', desc: '成約などの大事な瞬間をすぐお知らせします', control: <PushToggle /> },
      ]}
      extra={<>
        <LineLinkCard />
        {/* Feature E（M-1）：推薦カードはホームから撤去し、ログアウト直上に控えめ配置。 */}
        {partnerId && <InviteFellowCard partnerId={partnerId} />}
      </>}
      logout={<button onClick={logout} className="ui-btn ui-btn--secondary ui-btn--lg" style={{ width: '100%', marginTop: 0 }}>ログアウト</button>}
    />
  )
}
