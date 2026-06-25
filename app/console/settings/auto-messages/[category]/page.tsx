import { redirect, notFound } from 'next/navigation'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import AutoMessageEditClient from '../AutoMessageEditClient'
import type { Template } from '../../../messages/MessagesClient'
import { SECTIONS } from '../../messaging-sections'

// Phase3-D②b：自動メッセージ [category] 編集（detail）。owner gate・隔離表のみ。解決ロジックは不変。
export const runtime = 'edge'

export default async function AutoMessageEditPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  const section = SECTIONS.find(s => s.key === category)
  if (!section) notFound()

  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'owner') redirect('/console')

  const admin = await createServiceRoleClient()
  const { data } = await admin.from('message_templates')
    .select('id, title, body, subject, category, channel, attachments, sort_order')
    .eq('is_active', true).eq('category', category)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const existing = (data ?? null) as Template | null

  let previewUrl: string | undefined
  const path = existing?.attachments?.find(a => a.type === 'image')?.path
  if (path) {
    const { data: signed } = await admin.storage.from('message-attachments').createSignedUrl(path, 3600)
    previewUrl = signed?.signedUrl ?? undefined
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <AutoMessageEditClient section={section} existing={existing} previewUrl={previewUrl} />
      </div>
    </div>
  )
}
