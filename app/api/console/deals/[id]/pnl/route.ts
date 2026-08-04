/**
 * 案件P&Lメタ（MB担当・その他原価）の更新。コンソール owner/manager のみ。
 * P&L表示専用の値であり、reward/payout/frozen/override には一切触れない。
 * director_id / other_cost 列が未追加(DDL前)でも壊さない（needsMigration を返す）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role, name').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return { id: user.id, name: profile.name ?? '運営' }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const actor = await requireWrite(supabase)
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json()
  const patch: Record<string, unknown> = {}
  if ('director_id' in b) patch.director_id = b.director_id || null
  if ('other_cost' in b) patch.other_cost = b.other_cost === '' || b.other_cost == null ? 0 : Math.max(0, Math.round(Number(b.other_cost)))
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const { data: before } = 'director_id' in patch
    ? await admin.from('deals').select('director_id, customer_name').eq('id', id).maybeSingle()
    : { data: null }
  const { error } = await admin.from('deals').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })

  const nextDirectorId = 'director_id' in patch ? (patch.director_id as string | null) : undefined
  if (nextDirectorId && before?.director_id !== nextDirectorId) {
    // 公開側は lib/public-timeline.ts の完全一致許可表を通す。氏名・金額などの可変値を本文へ含めない。
    await Promise.all([
      admin.from('deal_events').insert({ deal_id: id, body: '担当が決まりました', visible_to_partner: true, created_by: actor.id }),
      admin.from('audit_logs').insert({
        actor_profile_id: actor.id,
        actor_name: actor.name,
        category: '案件',
        target: before?.customer_name ?? `deal:${id}`,
        action: 'MB担当を変更',
        meta: { deal_id: id, before_director_id: before?.director_id ?? null, director_id: nextDirectorId },
      }),
    ])
  }
  return NextResponse.json({ ok: true })
}
