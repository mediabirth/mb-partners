/**
 * 新「メニュー（1メニュー1報酬）」マスタ操作（owner/manager）。
 * GET  /api/console/menus?service_menu_id=...  — 親サービス配下のメニュー一覧
 * POST /api/console/menus                       — メニュー追加（1報酬）
 * ★menus はメニュー定義のみ。money計算・reward_snapshot 凍結・deals には関与しない。
 * ★旧 service_menus（ref/coop 2報酬）は段階6まで併走温存（本APIは触らない）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return !!profile && ['owner', 'manager', 'admin'].includes(profile.role)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const smId = new URL(req.url).searchParams.get('service_menu_id')
  const admin = await createServiceRoleClient()
  let q = admin.from('menus').select('*').order('service_menu_id').order('sort')
  if (smId) q = admin.from('menus').select('*').eq('service_menu_id', smId).order('sort')
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message, menus: [] }, { status: 200 })
  return NextResponse.json({ menus: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  if (!b.service_menu_id || !b.name?.trim()) return NextResponse.json({ error: 'service_menu_id と name は必須です' }, { status: 400 })
  const rewardType = b.reward_type === 'rate' ? 'rate' : 'fixed'
  const row = {
    service_menu_id: b.service_menu_id,
    name: String(b.name).trim().slice(0, 120),
    reward_type: rewardType,
    reward_value: Number(b.reward_value) || 0,
    reward_base: rewardType === 'rate' ? (b.reward_base || '粗利') : null,
    reward_trigger: b.reward_trigger ? String(b.reward_trigger).trim() : null,
    sort: Number(b.sort) || 0,
    active: b.active !== false,
  }
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('menus').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ menu: data })
}
