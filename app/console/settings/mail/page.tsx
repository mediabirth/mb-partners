import { redirect } from 'next/navigation'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import MailScreen from './MailScreen'

// 磨き①: メール管理（テンプレ一覧・プレビュー・編集・送信履歴・マトリクス）。owner/manager gate。
export const runtime = 'edge'

export default async function MailAdminPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('name, role, color').eq('id', uid).single()
  if (!prof || !['owner', 'manager'].includes(prof.role)) redirect('/console')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={prof.name ?? '管理者'} profileColor={prof.color ?? '#0E0E14'} />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <MailScreen />
      </div>
    </div>
  )
}
