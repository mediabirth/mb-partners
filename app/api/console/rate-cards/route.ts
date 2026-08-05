/**
 * レートカード（Feature I・不変版方式）。GET=一覧／POST=新版作成のみ。
 * ★UPDATE/DELETEは提供しない（immutable）。改定＝新カード作成→サプライヤー付け替え。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

async function gate(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p && ['owner', 'manager'].includes(p.role) ? user : null
}

export async function GET() {
  const supabase = await createClient()
  if (!(await gate(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  // DBの旧列はDDL互換のため残すが、製品コード/APIからは参照・返却しない（仕様正典 §11）。
  const { data } = await admin.from('rate_cards').select('id, name, half_commission_rate, payment_fee_rate, override_rate, version, fee_model, revenue_fee_rate, deprecated, created_at').order('created_at')
  return NextResponse.json({ cards: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await gate(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const id = String(b.id ?? '').trim()
  if (!/^[a-z0-9-]{3,40}$/.test(id)) return NextResponse.json({ error: 'id は英小文字・数字・ハイフン（例: std-v2）' }, { status: 400 })
  if (!b.name) return NextResponse.json({ error: 'name は必須です' }, { status: 400 })
  const feeModel = b.fee_model === 'passthrough' ? 'passthrough' : 'half_commission'
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('rate_cards').insert({
    id, name: String(b.name).trim(),
    half_commission_rate: 0.5,
    payment_fee_rate: 0.05,
    override_rate: 0.10,
    fee_model: feeModel,
    revenue_fee_rate: 0.05,
    version: Number(b.version ?? 1) || 1, note: b.note ?? null,
  }).select('id, name, half_commission_rate, payment_fee_rate, override_rate, version, fee_model, revenue_fee_rate, deprecated, created_at').single()
  if (error) return NextResponse.json({ error: error.message.includes('duplicate') ? '同じIDのカードが既に存在します（不変版方式＝既存は書き換え不可）' : error.message }, { status: 409 })
  return NextResponse.json({ card: data }, { status: 201 })
}

// 不変版方式: 既存カードの変更・削除は405（immutable検証の対象）。
export async function PATCH() { return NextResponse.json({ error: 'レートカードは不変です（改定＝新カード作成→付け替え）' }, { status: 405 }) }
export async function DELETE() { return NextResponse.json({ error: 'レートカードは削除できません（不変版方式）' }, { status: 405 }) }
