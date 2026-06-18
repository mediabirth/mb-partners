// BR-V3：単一ソース SettingsScreen を vendor config で描画（app と同一画面・同一ラベル）。
import SettingsScreen from '@/components/ui/SettingsScreen'
import VendorLogout from '../../VendorLogout'

export const runtime = 'edge'

export default function VendorSettings() {
  return (
    <SettingsScreen
      links={[
        { href: '/vendor/mypage', label: 'プロフィール' },
        { href: '/vendor/inbox', label: '通知' },
      ]}
      notifications={[
        { title: 'アプリ内通知', desc: '受信箱でいつでも確認できます', state: 'on' },
        { title: 'メール通知', desc: '重要なお知らせをメールでお届けします', state: 'soon' },
        { title: 'プッシュ通知', desc: '今後のアップデートで対応予定です', state: 'soon' },
      ]}
      logout={<VendorLogout />}
    />
  )
}
