import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServicesWithMenus } from '@/lib/supabase/queries'
import ConsoleNav from '@/components/ConsoleNav'
import ServicesClient from './ServicesClient'

export default async function ServicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, color')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'partner' || !profile) redirect('/console')

  const services = await getServicesWithMenus(supabase)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <ServicesClient initialServices={services} />
      </div>
    </div>
  )
}
