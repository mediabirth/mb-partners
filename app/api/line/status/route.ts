import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// L-B：連携状態の取得（本人のみ）。お金・案件に非接触。
export const runtime = 'edge'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.json({ linked: false })

  const admin = await createServiceRoleClient()
  const { data } = await admin.from('partner_line_links').select('partner_id').eq('partner_id', partner.id).maybeSingle()
  return NextResponse.json({ linked: !!data })
}
