import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAdminServicesWithMenus } from '@/lib/supabase/queries'
import ConsoleNav from '@/components/ConsoleNav'
import ServicesClientLazy from './ServicesClientLazy'

export const runtime = 'edge'

export default async function ServicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  // Profile check + services data in parallel
  const [profileRes, services] = await Promise.all([
    supabase.from('profiles').select('name, role, color').eq('id', user.id).single(),
    getAdminServicesWithMenus(supabase),
  ])
  const profile = profileRes.data

  if (profile?.role === 'partner' || !profile) redirect('/console')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />
      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* タスク説明の編集は3ペイン（協力タスク内の✎）へ統一済み＝旧 TaskDescriptionEditor は撤去。 */}
        <ServicesClientLazy initialServices={services} />
      </div>
    </div>
  )
}
