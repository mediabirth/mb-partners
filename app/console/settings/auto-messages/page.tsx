import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import AutoMessagesClient from './AutoMessagesClient'
import { SECTIONS } from '../messaging-sections'

// Phase3-D②b：自動メッセージ＝一覧（list）。owner gate・状態（category別カスタム有無）のみ読む。解決ロジックは不変。
export const runtime = 'edge'

export default async function AutoMessagesPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'owner') redirect('/console')

  const admin = await createServiceRoleClient()
  const keys = SECTIONS.map(s => s.key)
  const { data } = await admin.from('message_templates').select('category').eq('is_active', true).in('category', keys)
  const customCategories = [...new Set((data ?? []).map((r: { category: string | null }) => r.category).filter(Boolean) as string[])]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <AutoMessagesClient customCategories={customCategories} />
      </div>
    </div>
  )
}
