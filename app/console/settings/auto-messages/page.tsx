import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import AutoMessagesScreen from './AutoMessagesScreen'
import type { Template } from '../../messages/MessagesClient'
import { SECTIONS } from '../messaging-sections'

// Phase3-D②c：自動メッセージ＝左右1画面（7イベント list ＋ 右編集同時）。owner gate・隔離表のみ。解決ロジックは不変。
export const runtime = 'edge'

async function ownerOrRedirect() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'owner') redirect('/console')
}

async function loadSections() {
  const admin = await createServiceRoleClient()
  const keys = SECTIONS.map(s => s.key)
  const { data } = await admin.from('message_templates')
    .select('id, title, body, subject, category, channel, attachments, sort_order')
    .eq('is_active', true).in('category', keys).order('created_at', { ascending: false })
  const byCategory: Record<string, Template> = {}
  for (const t of (data ?? []) as Template[]) { if (t.category && !byCategory[t.category]) byCategory[t.category] = t }
  const signedUrls: Record<string, string> = {}
  const imgPaths = [...new Set(Object.values(byCategory).flatMap(t => (t.attachments ?? []).filter(a => a?.type === 'image' && a?.path).map(a => a.path)))]
  if (imgPaths.length) {
    const { data: signed } = await admin.storage.from('message-attachments').createSignedUrls(imgPaths, 3600)
    for (const s of signed ?? []) { if (s.signedUrl && s.path) signedUrls[s.path] = s.signedUrl }
  }
  return { byCategory, signedUrls }
}

export default async function AutoMessagesPage() {
  await ownerOrRedirect()
  const { byCategory, signedUrls } = await loadSections()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <AutoMessagesScreen byCategory={byCategory} signedUrls={signedUrls} />
      </div>
    </div>
  )
}

export { loadSections, ownerOrRedirect }
