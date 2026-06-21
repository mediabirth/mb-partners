/**
 * POST /api/console/reactivate/nudge — 休眠パートナーへの再活性化ナッジ（MOPS確認付き・手動）。
 * ★スパム防止：同一partnerへ直近 NUDGE_COOLDOWN_DAYS(14日) は再送不可。自動連投しない（ops が1人ずつ送る）。
 * ★お金・status・confirmed・reward・pnl には一切触れない。notify() で inbox+LINE+push へ fan-out するだけ。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify/index'

export const runtime = 'nodejs'

const NUDGE_COOLDOWN_DAYS = 14

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { partnerId } = await req.json().catch(() => ({}))
  if (!partnerId) return NextResponse.json({ error: 'partnerId required' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const { data: partner } = await admin.from('partners').select('id, profile_id, last_nudged_at').eq('id', partnerId).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  // 頻度上限：直近 14 日に送っていれば再送不可（スパム防止）。
  if (partner.last_nudged_at && Date.now() - new Date(partner.last_nudged_at).getTime() < NUDGE_COOLDOWN_DAYS * 86_400_000) {
    return NextResponse.json({ error: `直近${NUDGE_COOLDOWN_DAYS}日に送信済みのため再送できません`, cooldown: true }, { status: 429 })
  }

  // 名前＋過去成約の有無（read-only・温かい一言用）。お金額は出さない。
  const { data: prof } = partner.profile_id ? await admin.from('profiles').select('name').eq('id', partner.profile_id).single() : { data: null }
  const name = prof?.name ?? 'パートナー'
  const { count: wonCount } = await admin.from('deals').select('id', { count: 'exact', head: true }).eq('partner_id', partnerId).in('status', ['confirmed', 'paid'])
  const thanks = (wonCount ?? 0) > 0 ? 'これまでのご紹介、ありがとうございます。' : ''

  const payload = {
    title: 'MB Partners からのお知らせ',
    body: `${name}さん、お久しぶりです。最近、MB Partnersでご紹介できそうな方はいませんか？${thanks ? '\n' + thanks : ''}`,
    url: '/app/refer',
    tag: 'mbp-nudge',
    ref: { type: 'nudge' as const },
  }
  const results = await notify(admin, partnerId, payload, { event: 'nudge' })

  // 送信記録（頻度上限の基準）。お金/status には触れない。
  await admin.from('partners').update({ last_nudged_at: new Date().toISOString() }).eq('id', partnerId)

  return NextResponse.json({ ok: true, channels: results })
}
