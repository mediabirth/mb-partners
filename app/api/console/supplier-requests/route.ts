/**
 * サプライヤー変更申請の承認キュー（B・運営）。
 * GET   ?supplier=<id> — 申請一覧（表示用のメニュー名同梱）
 * PATCH {id, action:'approve'|'reject', reason?} — 承認=対象へ反映／却下=理由つき非反映。全て audit_logs 記録。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function requireOps(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role, name').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) return null
  return { id: user.id, name: profile.name as string | null }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireOps(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supplierId = new URL(req.url).searchParams.get('supplier')
  if (!supplierId) return NextResponse.json({ error: 'supplier は必須です' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { data: reqs } = await admin.from('supplier_change_requests').select('id, service_id, menu_id, kind, payload, status, reason, created_at').eq('supplier_partner_id', supplierId).order('created_at', { ascending: false }).limit(50)
  const menuIds = [...new Set((reqs ?? []).map(r => r.menu_id).filter(Boolean))] as string[]
  const { data: mn } = menuIds.length ? await admin.from('menus').select('id, name').in('id', menuIds) : { data: [] }
  const nameByMenu = Object.fromEntries((mn ?? []).map(m => [m.id, m.name]))
  return NextResponse.json({ requests: (reqs ?? []).map(r => ({ ...r, menu_name: r.menu_id ? nameByMenu[r.menu_id] ?? null : null })) })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const actor = await requireOps(supabase)
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const id = typeof b.id === 'string' ? b.id : ''
  const action = b.action === 'approve' ? 'approve' : b.action === 'reject' ? 'reject' : ''
  if (!id || !action) return NextResponse.json({ error: 'id / action は必須です' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { data: r } = await admin.from('supplier_change_requests').select('*').eq('id', id).maybeSingle()
  if (!r) return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })
  if (r.status !== 'pending') return NextResponse.json({ error: 'この申請は処理済みです' }, { status: 409 })

  if (action === 'approve') {
    const value = (r.payload as { value?: unknown })?.value
    let applyErr: string | null = null
    if (r.kind === 'public_description' && r.menu_id) {
      const { error } = await admin.from('menus').update({ public_description: String(value ?? '').trim() || null }).eq('id', r.menu_id)
      applyErr = error?.message ?? null
    } else if (r.kind === 'menu_name' && r.menu_id) {
      const nm = String(value ?? '').trim()
      if (!nm) applyErr = 'メニュー名が空です'
      else { const { error } = await admin.from('menus').update({ name: nm }).eq('id', r.menu_id); applyErr = error?.message ?? null }
    } else if (r.kind === 'image') {
      const { error } = await admin.from('services').update({ image_url: String(value ?? '').trim() || null }).eq('id', r.service_id)
      applyErr = error?.message ?? null
    } else if (r.kind === 'visibility') {
      const { error } = await admin.from('services').update({ active: !!value }).eq('id', r.service_id)
      applyErr = error?.message ?? null
    } else applyErr = '未知の申請種別です'
    if (applyErr) return NextResponse.json({ error: `反映に失敗しました: ${applyErr}` }, { status: 500 })
  }

  const { error } = await admin.from('supplier_change_requests').update({ status: action === 'approve' ? 'approved' : 'rejected', reason: typeof b.reason === 'string' ? b.reason.trim().slice(0, 300) || null : null, decided_at: new Date().toISOString(), decided_by: actor.id }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { await admin.from('audit_logs').insert({ actor_profile_id: actor.id, actor_name: actor.name ?? '運営', category: 'supplier_self', target: `request:${id}`, action, meta: { kind: r.kind, service_id: r.service_id, menu_id: r.menu_id, value: (r.payload as { value?: unknown })?.value, reason: b.reason ?? null } }) } catch { /* best-effort */ }
  return NextResponse.json({ ok: true })
}
