import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import TemplatesClient from './TemplatesClient'
import type { Template } from '../MessagesClient'

// メッセージセンター Phase3-A：テンプレート管理（一覧/追加/編集/削除）。owner gate・隔離表 message_templates のみ。
export const runtime = 'edge'

export default async function TemplatesPage() {
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

  // テンプレ画像の署名URL（サムネ/プレビュー用・private）。
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
        <TemplatesClient initial={templates} signedUrls={signedUrls} />
      </div>
    </div>
  )
}
