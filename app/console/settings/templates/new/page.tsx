import { redirect } from 'next/navigation'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import TemplateEditClient from '../TemplateEditClient'

// Phase3-D②：自由送信テンプレ 新規作成。owner gate。
export const runtime = 'edge'

export default async function TemplateNewPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'owner') redirect('/console')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <TemplateEditClient existing={null} />
      </div>
    </div>
  )
}
