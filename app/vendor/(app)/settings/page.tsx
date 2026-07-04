// BR-V3：単一ソース SettingsScreen を vendor config で描画（app と同一画面・同一ラベル）。
// ★紹介者専用（サービスガイド・知り合いを推薦/招待）はベンダーに出さない。
// 磨き③: 「プッシュ通知 準備中」行と「LINE連携 準備中」カード（押せない張りぼて）を撤去。
//   Push購読はpartner紐付けのためベンダーには提供対象外（提供時に行ごと復活させる）。
import SettingsScreen from '@/components/ui/SettingsScreen'
import VendorLogout from '../../VendorLogout'

export const runtime = 'edge'

export default function VendorSettings() {
  return (
    <SettingsScreen
      links={[
        { href: '/vendor/mypage', label: 'プロフィール' },
        { href: '/vendor/terms', label: '業務委託規約・ヘルプ' },
        { href: '/vendor/support', label: 'お問い合わせ' },
      ]}
      notifications={[
        { title: 'アプリ内通知', desc: '受信箱でいつでも確認できます', state: 'on' },
        // メール通知：委託費の確定時に登録メールへ送信（Resend・本番配線済）。
        { title: 'メール通知', desc: '委託費の確定など重要なお知らせをメールでお届けします', state: 'on' },
      ]}
      logout={<VendorLogout />}
    />
  )
}
