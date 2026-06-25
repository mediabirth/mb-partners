import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import TemplatesListClient from './TemplatesListClient'
import type { Template } from '../../messages/MessagesClient'
import { SECTIONS } from '../messaging-sections'

// Phase3-D②：自由送信テンプレ＝一覧（list）。行クリックで編集へ。owner gate・隔離表のみ。
export const runtime = 'edge'
const SECTION_KEYS = new Set(SECTIONS.map(s => s.key))

export default async function TemplatesListPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'owner') redirect('/console')

  const admin = await createServiceRoleClient()
  const { data } = await admin.from('message_templates')
    .select('id, title, body, subject, category, channel, attachments, sort_order, updated_at')
    .eq('is_active', true).order('updated_at', { ascending: false })
  // 自由送信テンプレのみ（自動メッセージ category は別ページ）。
  const templates = ((data ?? []) as (Template & { updated_at: string })[]).filter(t => !t.category || !SECTION_KEYS.has(t.category))

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <TemplatesListClient templates={templates} />
      </div>
    </div>
  )
}
