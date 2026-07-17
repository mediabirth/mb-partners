/**
 * サプライヤー本人による個別報酬率（B・2026-07-18）。
 * MBコンソールの /api/console/reward-overrides と同一機構（partner_reward_overrides・値のみ上書き・snapshot凍結不変）を
 * 「自社の紹介者 × 自社メニューの報酬」に限って開放する（原資100%サプライヤーのため正当）。
 * GET   — 自分の個別条件一覧＋設定材料（自社の紹介者・自社報酬ツリー）
 * POST  { partner_id, reward_id, override_value, note? } — 追加（本人拒否・自社紹介者限定・値ガード=コンソールと同一）
 * PATCH { id, override_value? , active? } — 変更/無効化（自分が設定した行のみ）
 * ★新規計算ゼロ: 適用は既存 resolveEffectiveReward／成約時snapshot凍結の機構がそのまま働く。audit記録＋運営通知。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { validateSupplierReward } from '@/lib/supplier-fee'

export const runtime = 'nodejs'
type Admin = Awaited<ReturnType<typeof createServiceRoleClient>>

async function requireSupplier() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('partners').select('id, code, supplier_rate_card, company_name, profiles(name)').eq('profile_id', user.id).maybeSingle()
  if (!p) return null
  const admin = await createServiceRoleClient()
  if (!p.supplier_rate_card) {
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', p.id).limit(1)
    if (!sv?.length) return null
  }
  return { partnerId: p.id, code: p.code, name: (p as { company_name?: string | null }).company_name || (p.profiles as { name?: string } | null)?.name || p.code }
}

async function audit(admin: Admin, me: { code: string; name: string }, action: string, target: string, meta: Record<string, unknown>) {
  try { await admin.from('audit_logs').insert({ actor_profile_id: null, actor_name: `サプライヤー本人（${me.name}）`, category: 'reward_override', target, action, meta }) } catch { /* best-effort */ }
  try { const { sendSlack } = await import('@/lib/notify'); await sendSlack(`🏷️ MB Partners｜個別条件（サプライヤー設定）：*${me.name}*（${me.code}）が ${target} を${action === 'create' ? '追加' : '変更'}\n${JSON.stringify(meta).slice(0, 300)}`) } catch { /* best-effort */ }
}

/** reward が自社メニュー配下か（コンソール rewardContext と同一の辿り）。 */
async function ownReward(admin: Admin, partnerId: string, rewardId: string) {
  const { data: r } = await admin.from('menu_rewards').select('id, menu_id, reward_type, reward_value, reward_base').eq('id', rewardId).maybeSingle()
  if (!r) return null
  const { data: m } = await admin.from('menus').select('service_menu_id, name').eq('id', r.menu_id).maybeSingle()
  if (!m?.service_menu_id) return null
  const { data: sm } = await admin.from('service_menus').select('service_id').eq('id', m.service_menu_id).maybeSingle()
  if (!sm?.service_id) return null
  const { data: sv } = await admin.from('services').select('id').eq('id', sm.service_id).eq('supplier_partner_id', partnerId).maybeSingle()
  return sv ? { reward: r, menuName: m.name as string } : null
}

/** 対象パートナーが自社の紹介者（frontier_id=本人）か。 */
async function ownPartner(admin: Admin, meId: string, partnerId: string) {
  const { data: pt } = await admin.from('partners').select('id, code, frontier_id, profiles(name)').eq('id', partnerId).maybeSingle()
  if (!pt || pt.frontier_id !== meId) return null
  return { code: pt.code as string, name: (pt.profiles as { name?: string } | null)?.name ?? pt.code as string }
}

async function guardValue(admin: Admin, menuId: string, rewardType: string, value: number, rewardBase: string | null): Promise<{ ok: boolean; error?: string; warning?: string }> {
  if (rewardType === 'fixed') {
    if (!(value >= 1 && value <= 10_000_000)) return { ok: false, error: '固定額は1〜10,000,000円の範囲で設定してください' }
  } else {
    if (!(value > 0 && value <= 100)) return { ok: false, error: '率は0より大きく100%以下で設定してください' }
  }
  const g = await validateSupplierReward(admin, menuId, rewardType, value, rewardBase)
  if (!g.ok) return { ok: false, error: g.error }
  return { ok: true, warning: g.warning }
}

export async function GET() {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const [{ data: ovs }, { data: subs }, { data: svs }] = await Promise.all([
    admin.from('partner_reward_overrides').select('id, partner_id, reward_id, override_value, note, active, created_at').eq('supplier_partner_id', me.partnerId).order('created_at', { ascending: false }),
    admin.from('partners').select('id, code, status, profiles(name)').eq('frontier_id', me.partnerId).eq('status', 'active'),
    admin.from('services').select('id, name').eq('supplier_partner_id', me.partnerId),
  ])
  // 自社報酬ツリー（コンソールGETと同じ辿り・自社のみ）
  const svIds = (svs ?? []).map((s: { id: string }) => s.id)
  let rewards: { id: string; menu_name: string; service_name: string; reward_type: string; reward_value: number; reward_base: string | null }[] = []
  if (svIds.length) {
    const { data: sms } = await admin.from('service_menus').select('id, service_id').in('service_id', svIds)
    const smIds = (sms ?? []).map((x: { id: string }) => x.id)
    if (smIds.length) {
      const { data: mn } = await admin.from('menus').select('id, service_menu_id, name').in('service_menu_id', smIds).eq('active', true)
      const mIds = (mn ?? []).map((x: { id: string }) => x.id)
      if (mIds.length) {
        const { data: rs } = await admin.from('menu_rewards').select('id, menu_id, reward_type, reward_value, reward_base').in('menu_id', mIds).eq('active', true).order('sort')
        rewards = ((rs ?? []) as { id: string; menu_id: string; reward_type: string; reward_value: number; reward_base: string | null }[]).map(r => {
          const menu = (mn ?? []).find((x: { id: string }) => x.id === r.menu_id) as { service_menu_id: string; name: string } | undefined
          const sm = (sms ?? []).find((x: { id: string }) => x.id === menu?.service_menu_id) as { service_id: string } | undefined
          const sv = (svs ?? []).find((x: { id: string }) => x.id === sm?.service_id) as { name: string } | undefined
          return { id: r.id, menu_name: menu?.name ?? '', service_name: sv?.name ?? '', reward_type: r.reward_type, reward_value: r.reward_value, reward_base: r.reward_base }
        })
      }
    }
  }
  const partners = ((subs ?? []) as unknown as { id: string; code: string; profiles: { name: string | null } | null }[]).map(pt => ({ id: pt.id, code: pt.code, name: pt.profiles?.name ?? pt.code }))
  return NextResponse.json({ overrides: ovs ?? [], partners, rewards })
}

export async function POST(req: NextRequest) {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const b = await req.json().catch(() => ({}))
  const partnerId = typeof b.partner_id === 'string' ? b.partner_id : ''
  const rewardId = typeof b.reward_id === 'string' ? b.reward_id : ''
  const value = Number(b.override_value)
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : null
  if (!partnerId || !rewardId || !Number.isFinite(value)) return NextResponse.json({ error: 'partner_id / reward_id / override_value は必須です' }, { status: 400 })
  if (partnerId === me.partnerId) return NextResponse.json({ error: 'ご自身への個別条件は設定できません' }, { status: 400 })
  const pt = await ownPartner(admin, me.partnerId, partnerId)
  if (!pt) return NextResponse.json({ error: 'あなたのパートナー（紹介者）のみ設定できます' }, { status: 403 })
  const ctx = await ownReward(admin, me.partnerId, rewardId)
  if (!ctx) return NextResponse.json({ error: '自社メニューの報酬のみ設定できます' }, { status: 403 })
  const g = await guardValue(admin, ctx.reward.menu_id, ctx.reward.reward_type, value, ctx.reward.reward_base)
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: 400 })
  const { data: ins, error } = await admin.from('partner_reward_overrides').insert({ supplier_partner_id: me.partnerId, partner_id: partnerId, reward_id: rewardId, override_value: value, note, created_by: null }).select('id').single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'このパートナー×報酬の個別条件は既にあります（変更は一覧から）' : error.message }, { status: error.code === '23505' ? 409 : 500 })
  await audit(admin, me, 'create', `partner:${pt.code}/reward:${rewardId}`, { partner: partnerId, reward_id: rewardId, value, original: ctx.reward.reward_value, menu: ctx.menuName, note, warning: g.warning ?? null })
  return NextResponse.json({ id: ins.id, warning: g.warning ?? null })
}

export async function PATCH(req: NextRequest) {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const b = await req.json().catch(() => ({}))
  const id = typeof b.id === 'string' ? b.id : ''
  if (!id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 })
  const { data: cur } = await admin.from('partner_reward_overrides').select('id, supplier_partner_id, partner_id, reward_id, override_value, active').eq('id', id).eq('supplier_partner_id', me.partnerId).maybeSingle()
  if (!cur) return NextResponse.json({ error: '個別条件が見つかりません' }, { status: 404 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let warning: string | null = null
  if (typeof b.active === 'boolean') patch.active = b.active
  if (b.override_value != null) {
    const value = Number(b.override_value)
    if (!cur.reward_id) return NextResponse.json({ error: 'この条件は運営設定です（変更はMB Partnersへ）' }, { status: 403 })
    const ctx = await ownReward(admin, me.partnerId, cur.reward_id)
    if (!ctx) return NextResponse.json({ error: '対象の報酬が見つかりません' }, { status: 404 })
    const g = await guardValue(admin, ctx.reward.menu_id, ctx.reward.reward_type, value, ctx.reward.reward_base)
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: 400 })
    warning = g.warning ?? null
    patch.override_value = value
  }
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const { error } = await admin.from('partner_reward_overrides').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await audit(admin, me, typeof b.active === 'boolean' ? (b.active ? 'reactivate' : 'deactivate') : 'update', `override:${id}`, { before: { value: cur.override_value, active: cur.active }, after: { value: patch.override_value ?? cur.override_value, active: patch.active ?? cur.active }, partner: cur.partner_id, reward_id: cur.reward_id })
  return NextResponse.json({ ok: true, warning })
}
