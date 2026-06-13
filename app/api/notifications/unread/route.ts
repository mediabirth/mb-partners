import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPartnerByUserId } from '@/lib/supabase/queries'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })

  const partner = await getPartnerByUserId(supabase, user.id)
  if (!partner) return NextResponse.json({ count: 0 })

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partner.id)
    .is('read_at', null)

  return NextResponse.json({ count: count ?? 0 })
}
