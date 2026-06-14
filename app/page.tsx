import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPartnerByUserId } from '@/lib/supabase/queries'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'partner') {
    // Verify partner record exists before sending to /app.
    // If the record is missing (edge case: deleted partner), send to console login
    // to avoid a /app → / → /app redirect loop.
    const partner = await getPartnerByUserId(supabase, user.id)
    if (!partner) redirect('/console/login')
    redirect('/app')
  }

  redirect('/console')
}
