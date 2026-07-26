import { redirect } from 'next/navigation'
import { loadVendorBundle, deriveVendorNotifs } from '@/lib/vendor-data'
import VendorInboxClient from './VendorInboxClient'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export default async function VendorInbox() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  // 純化バッチD: 通知は本人宛の契約・お金イベントのみ（お知らせ/broadcasts は受託者向け配信機能が無いため撤去）。
  const admin = await createServiceRoleClient()
  const { data: authUser } = await admin.auth.admin.getUserById(b.userId)
  const readIds = new Set(
    Array.isArray(authUser.user?.user_metadata?.vendor_notification_reads)
      ? authUser.user.user_metadata.vendor_notification_reads.filter((id: unknown): id is string => typeof id === 'string')
      : []
  )
  const notifs = deriveVendorNotifs(b).map(notification => ({ ...notification, read_at: readIds.has(notification.id) ? notification.at : null }))
  return <VendorInboxClient notifs={notifs} />
}
