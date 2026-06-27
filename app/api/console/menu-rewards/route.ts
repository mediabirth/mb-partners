/**
 * 報酬（menu_rewards・メニューの子・複数）操作（owner/manager）。
 * GET  ?menu_id=...  — メニュー配下の報酬一覧
 * POST              — 報酬追加（固定 or 粗利%・トリガー）
 * ★money計算式には触れない（報酬定義のみ）。確定時の reward 計算は従来式 base×value/100。
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
  const menuId = new URL(req.url).searchParams.get('menu_id')
  const admin = await createServiceRoleClient()
  const q = admin.from('menu_rewards').select('*')
  const { data, error } = menuId ? await q.eq('menu_id', menuId).order('sort') : await q.order('sort')
  if (error) return NextResponse.json({ error: error.message, rewards: [] }, { status: 200 })
  return NextResponse.json({ rewards: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  if (!b.menu_id) return NextResponse.json({ error: 'menu_id は必須です' }, { status: 400 })
  const rewardType = b.reward_type === 'rate' ? 'rate' : 'fixed'
  const row = {
    menu_id: b.menu_id,
    reward_type: rewardType,
    reward_value: Number(b.reward_value) || 0,
    reward_base: rewardType === 'rate' ? (b.reward_base || '粗利') : null,
    reward_trigger: b.reward_trigger ? String(b.reward_trigger).trim() : null,
    sort: Number(b.sort) || 0,
    active: b.active !== false,
  }
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('menu_rewards').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reward: data })
}
