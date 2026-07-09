/**
 * POST /api/console/applications/[id]/reject
 * 応募を「見送り」に。status='rejected' を立てるだけ（招待は発行しない）。
 * ★money/deals/account 非接触。冪等。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['owner', 'manager'].includes(profile?.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = await createServiceRoleClient()
    const { data: app } = await admin.from('partner_applications').select('id, status, invited_at').eq('id', id).maybeSingle()
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (app.status === 'approved' || app.invited_at) return NextResponse.json({ error: '承認済みの応募は見送りにできません' }, { status: 409 })

    await admin.from('partner_applications').update({ status: 'rejected' }).eq('id', id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '処理に失敗しました' }, { status: 500 })
  }
}
