/**
 * サプライヤー請求の状態遷移（P0-a・仕様正典 v2 §2第2段）。
 * PATCH  {action:'invoice'|'settle'} — 前進のみ: unbilled→invoiced→settled（後退なし）
 * DELETE — 凍結解除は unbilled の間のみ（invoiced以降は解除不可＝設計どおり）
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

async function gate(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return !!profile && ['owner', 'manager'].includes(profile.role)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await gate(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const admin = await createServiceRoleClient()
  const { data: row } = await admin.from('supplier_charges').select('id, status').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()
  if (b.action === 'invoice') {
    if (row.status !== 'unbilled') return NextResponse.json({ error: 'unbilled のみ請求済みにできます' }, { status: 409 })
    const { error } = await admin.from('supplier_charges').update({ status: 'invoiced', invoiced_at: now, updated_at: now }).eq('id', id).eq('status', 'unbilled')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'invoiced' })
  }
  if (b.action === 'settle') {
    if (row.status !== 'invoiced') return NextResponse.json({ error: 'invoiced のみ入金済みにできます' }, { status: 409 })
    const { error } = await admin.from('supplier_charges').update({ status: 'settled', settled_at: now, updated_at: now }).eq('id', id).eq('status', 'invoiced')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'settled' })
  }
  return NextResponse.json({ error: 'action は invoice|settle です' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await gate(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: row } = await admin.from('supplier_charges').select('id, status').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.status !== 'unbilled') return NextResponse.json({ error: '請求済み以降の凍結は解除できません' }, { status: 409 })
  const { error } = await admin.from('supplier_charges').delete().eq('id', id).eq('status', 'unbilled')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
