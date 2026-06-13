import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPartnerByUserId } from '@/lib/supabase/queries'

/**
 * PATCH /api/notifications/read
 * Body: { ids?: string[] }
 *   ids を省略 → 全未読を既読にする
 *   ids を指定 → 指定IDのみ既読にする（自分の通知のみ）
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partner = await getPartnerByUserId(supabase, user.id)
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] | undefined = body.ids

  const now = new Date().toISOString()

  let query = supabase
    .from('notifications')
    .update({ read_at: now })
    .eq('partner_id', partner.id)
    .is('read_at', null)

  if (ids && ids.length > 0) {
    query = query.in('id', ids)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
