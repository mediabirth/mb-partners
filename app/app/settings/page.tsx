'use client'
// BR-V3：単一ソース SettingsScreen を app config で描画（vendor と同一画面・同一ラベル）。
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import SettingsScreen from '@/components/ui/SettingsScreen'
import LineLinkCard from '@/components/LineLinkCard'

export default function SettingsPage() {
  const router = useRouter()
  async function logout() {
    const sb = createClient()
    await sb.auth.signOut()
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
        { title: 'プッシュ通知', desc: '今後のアップデートで対応予定です', state: 'soon' },
      ]}
      extra={<LineLinkCard />}
      logout={<button onClick={logout} className="btn btn-g" style={{ width: '100%', marginTop: 0 }}>ログアウト</button>}
    />
  )
}
