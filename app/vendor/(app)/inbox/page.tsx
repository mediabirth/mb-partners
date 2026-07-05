import { redirect } from 'next/navigation'
import { loadVendorBundle, deriveVendorNotifs } from '@/lib/vendor-data'
import VendorInboxClient from './VendorInboxClient'

export const runtime = 'edge'

export default async function VendorInbox() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  // 純化バッチD: 通知は本人宛の契約・お金イベントのみ（お知らせ/broadcasts は受託者向け配信機能が無いため撤去）。
  const notifs = deriveVendorNotifs(b)
  return <VendorInboxClient notifs={notifs} />
}
