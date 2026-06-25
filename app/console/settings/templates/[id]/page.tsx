import { redirect, notFound } from 'next/navigation'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import TemplateEditClient from '../TemplateEditClient'
import type { Template } from '../../../messages/MessagesClient'

// Phase3-D②：自由送信テンプレ 編集（detail）。owner gate・隔離表のみ。
export const runtime = 'edge'

export default async function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'owner') redirect('/console')

  const admin = await createServiceRoleClient()
  const { data } = await admin.from('message_templates')
    .select('id, title, body, subject, category, channel, attachments, sort_order')
    .eq('id', id).eq('is_active', true).maybeSingle()
  if (!data) notFound()
  const tpl = data as Template

  let previewUrl: string | undefined
  const path = tpl.attachments?.find(a => a.type === 'image')?.path
  if (path) {
    const { data: signed } = await admin.storage.from('message-attachments').createSignedUrl(path, 3600)
    previewUrl = signed?.signedUrl ?? undefined
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <TemplateEditClient existing={tpl} previewUrl={previewUrl} />
      </div>
    </div>
  )
}
