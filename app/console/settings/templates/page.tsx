import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import TemplatesScreen from './TemplatesScreen'
import type { Template } from '../../messages/MessagesClient'
import { SECTIONS } from '../messaging-sections'

// Phase3-D②c：自由送信テンプレ＝左右1画面（一覧＋編集同時）。owner gate・隔離表のみ。
export const runtime = 'edge'
const SECTION_KEYS = new Set(SECTIONS.map(s => s.key))

async function loadFreeTemplates() {
  const admin = await createServiceRoleClient()
  const { data } = await admin.from('message_templates')
    .select('id, title, body, subject, category, channel, attachments, sort_order, updated_at')
    .eq('is_active', true).order('updated_at', { ascending: false })
  const templates = ((data ?? []) as (Template & { updated_at: string })[]).filter(t => !t.category || !SECTION_KEYS.has(t.category))
  const signedUrls: Record<string, string> = {}
  const imgPaths = [...new Set(templates.flatMap(t => (t.attachments ?? []).filter(a => a?.type === 'image' && a?.path).map(a => a.path)))]
  if (imgPaths.length) {
    const { data: signed } = await admin.storage.from('message-attachments').createSignedUrls(imgPaths, 3600)
    for (const s of signed ?? []) { if (s.signedUrl && s.path) signedUrls[s.path] = s.signedUrl }
  }
  return { templates, signedUrls }
}

export async function ownerOrRedirect() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'owner') redirect('/console')
}

export default async function TemplatesListPage() {
  await ownerOrRedirect()
  const { templates, signedUrls } = await loadFreeTemplates()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <TemplatesScreen initial={templates} signedUrls={signedUrls} />
      </div>
    </div>
  )
}

export { loadFreeTemplates }
