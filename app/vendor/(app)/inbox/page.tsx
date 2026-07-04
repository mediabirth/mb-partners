import { redirect } from 'next/navigation'
import { loadVendorBundle, deriveVendorNotifs } from '@/lib/vendor-data'
import { createServiceRoleClient } from '@/lib/supabase/server'
import VendorInboxClient, { type VBroadcast } from './VendorInboxClient'

export const runtime = 'edge'

export default async function VendorInbox() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  const notifs = deriveVendorNotifs(b)

  // お知らせ = 運営配信の broadcasts（news・配信済）。service_role で読取のみ（DDLレス・money非接触）。
  let broadcasts: VBroadcast[] = []
  try {
    const admin = await createServiceRoleClient()
    const { data } = await admin.from('broadcasts')
      .select('id, kind, title, body, sent_at')
      .eq('kind', 'news').not('sent_at', 'is', null)
      .order('sent_at', { ascending: false }).limit(30)
    broadcasts = (data ?? []) as VBroadcast[]
  } catch { /* broadcasts 未作成でも通知は動く */ }

  return <VendorInboxClient notifs={notifs} broadcasts={broadcasts} />
}
