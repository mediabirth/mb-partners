import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import AutoMessagesClient from './AutoMessagesClient'
import type { Template } from '../../messages/MessagesClient'

// Phase3-D②：自動メッセージ（イベント別）。owner gate・隔離表 message_templates のみ。解決ロジックは不変。
export const runtime = 'edge'

export default async function AutoMessagesPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'owner') redirect('/console')

  const admin = await createServiceRoleClient()
  const { data } = await admin.from('message_templates')
    .select('id, title, body, subject, category, channel, attachments, sort_order')
    .eq('is_active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  const templates = (data ?? []) as Template[]

  const signedUrls: Record<string, string> = {}
  const imgPaths = [...new Set(templates.flatMap(t => (t.attachments ?? []).filter(a => a?.type === 'image' && a?.path).map(a => a.path)))]
  if (imgPaths.length) {
    const { data: signed } = await admin.storage.from('message-attachments').createSignedUrls(imgPaths, 3600)
    for (const s of signed ?? []) { if (s.signedUrl && s.path) signedUrls[s.path] = s.signedUrl }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <AutoMessagesClient initial={templates} signedUrls={signedUrls} />
      </div>
    </div>
  )
}
