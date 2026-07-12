/**
 * P1 パートナー別報酬率 設定API（仕様正典: docs/design/partner-reward-override-design.md §1/§3/§5）。
 * GET   ?supplier=<partner_id> — 一覧＋設定UI用の材料（対象候補パートナー・サプライヤー配下の報酬ツリー）
 * POST  — 追加（誤設定ガード・本人拒否・値レンジ＋逆ザヤガード・重複409・audit_logs記録）
 * PATCH — 値変更 / active切替（before/afterをaudit_logsに記録）
 * ★上書きは「値」のみ（型・ベースは正典）。menu_rewards/deals/payout_* には一切書き込まない。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { validateSupplierReward } from '@/lib/supplier-fee'

export const runtime = 'nodejs'

async function requireOps(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role, name').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) return null
  return { id: user.id, name: profile.name as string | null }
}

type Admin = Awaited<ReturnType<typeof createServiceRoleClient>>

async function audit(admin: Admin, actor: { id: string; name: string | null }, action: string, target: string, meta: Record<string, unknown>) {
  try {
    await admin.from('audit_logs').insert({ actor_profile_id: actor.id, actor_name: actor.name ?? '運営', category: 'reward_override', target, action, meta })
  } catch { /* 監査失敗でも本体は成立させない方針なら throw だが、既存流儀は best-effort */ }
}

/** 対象 reward の所属サプライヤー（menu→service→supplier）と正典値・型を引く。 */
async function rewardContext(admin: Admin, rewardId: string) {
  const { data: r } = await admin.from('menu_rewards').select('id, menu_id, reward_type, reward_value, reward_base').eq('id', rewardId).maybeSingle()
  if (!r) return null
  const { data: m } = await admin.from('menus').select('service_menu_id, name').eq('id', r.menu_id).maybeSingle()
  if (!m?.service_menu_id) return null
  const { data: sm } = await admin.from('service_menus').select('service_id').eq('id', m.service_menu_id).maybeSingle()
  if (!sm?.service_id) return null
  const { data: sv } = await admin.from('services').select('supplier_partner_id, name').eq('id', sm.service_id).maybeSingle()
  return { reward: r, menuName: m.name as string | null, serviceName: (sv?.name as string | null) ?? null, supplierId: (sv?.supplier_partner_id as string | null) ?? null }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const actor = await requireOps(supabase)
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supplierId = new URL(req.url).searchParams.get('supplier')
  if (!supplierId) return NextResponse.json({ error: 'supplier は必須です' }, { status: 400 })
  const admin = await createServiceRoleClient()

  const [{ data: ovs }, { data: svs }, { data: partners }] = await Promise.all([
    admin.from('partner_reward_overrides').select('id, partner_id, reward_id, override_value, note, active, created_at').eq('supplier_partner_id', supplierId).order('created_at', { ascending: false }),
    admin.from('services').select('id, name').eq('supplier_partner_id', supplierId),
    admin.from('partners').select('id, code, is_system, profiles(name)').eq('status', 'active').eq('is_system', false),
  ])
  // サプライヤー配下の報酬ツリー（設定UIの選択材料）
  const svIds = (svs ?? []).map((s: { id: string }) => s.id)
  let rewards: { id: string; menu_id: string; menu_name: string; service_name: string; reward_type: string; reward_value: number; reward_base: string | null }[] = []
  if (svIds.length) {
    const { data: sms } = await admin.from('service_menus').select('id, service_id').in('service_id', svIds)
    const smIds = (sms ?? []).map((x: { id: string }) => x.id)
    if (smIds.length) {
      const { data: mn } = await admin.from('menus').select('id, service_menu_id, name').in('service_menu_id', smIds).eq('active', true)
      const mIds = (mn ?? []).map((x: { id: string }) => x.id)
      if (mIds.length) {
        const { data: rs } = await admin.from('menu_rewards').select('id, menu_id, reward_type, reward_value, reward_base').in('menu_id', mIds).eq('active', true).order('sort')
        rewards = (rs ?? []).map((r: { id: string; menu_id: string; reward_type: string; reward_value: number; reward_base: string | null }) => {
          const menu = (mn ?? []).find((x: { id: string }) => x.id === r.menu_id) as { service_menu_id: string; name: string } | undefined
          const sm = (sms ?? []).find((x: { id: string }) => x.id === menu?.service_menu_id) as { service_id: string } | undefined
          const sv = (svs ?? []).find((x: { id: string }) => x.id === sm?.service_id) as { name: string } | undefined
          return { ...r, menu_name: menu?.name ?? '', service_name: sv?.name ?? '' }
        })
      }
    }
  }
  const partnerList = (partners ?? [])
    .filter((p: { id: string }) => p.id !== supplierId)  // 本人は候補から除外（自己水増し遮断はPOSTでも拒否）
    .map((p: { id: string; code: string; profiles: { name: string | null } | null }) => ({ id: p.id, code: p.code, name: p.profiles?.name ?? p.code }))
  return NextResponse.json({ overrides: ovs ?? [], rewards, partners: partnerList })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const actor = await requireOps(supabase)
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const supplierId = typeof b.supplier_partner_id === 'string' ? b.supplier_partner_id : ''
  const partnerId = typeof b.partner_id === 'string' ? b.partner_id : ''
  const rewardId = typeof b.reward_id === 'string' && b.reward_id ? b.reward_id : null
  const value = Number(b.override_value)
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : null
  if (!supplierId || !partnerId || !Number.isFinite(value)) return NextResponse.json({ error: 'supplier_partner_id / partner_id / override_value は必須です' }, { status: 400 })
  // 本人拒否（設計§5-1: 自己報酬の水増し経路を遮断）
  if (partnerId === supplierId) return NextResponse.json({ error: 'サプライヤー本人への個別条件は設定できません' }, { status: 400 })

  const admin = await createServiceRoleClient()
  // サプライヤー実在＋対象パートナー実在
  const { data: sup } = await admin.from('partners').select('id, supplier_rate_card').eq('id', supplierId).maybeSingle()
  if (!sup) return NextResponse.json({ error: 'サプライヤーが見つかりません' }, { status: 404 })
  const { data: pt } = await admin.from('partners').select('id, code').eq('id', partnerId).maybeSingle()
  if (!pt) return NextResponse.json({ error: '対象パートナーが見つかりません' }, { status: 404 })

  if (rewardId) {
    // 個別上書き: 誤設定ガード＝reward が当該サプライヤー配下であること
    const ctx = await rewardContext(admin, rewardId)
    if (!ctx) return NextResponse.json({ error: '対象の報酬が見つかりません' }, { status: 404 })
    if (ctx.supplierId !== supplierId) return NextResponse.json({ error: 'この報酬は当該サプライヤーの供給メニューではありません' }, { status: 400 })
    // 値レンジ（設計§3）＋既存逆ザヤガードの再利用（値のみ差し替え・型/ベースは正典）
    const g = await guardValue(admin, ctx.reward.menu_id, ctx.reward.reward_type, value, ctx.reward.reward_base)
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: 400 })
    const { data: ins, error } = await admin.from('partner_reward_overrides').insert({ supplier_partner_id: supplierId, partner_id: partnerId, reward_id: rewardId, override_value: value, note, created_by: actor.id }).select('id').single()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'このパートナー×報酬の個別条件は既に存在します（変更はPATCH＝既存行の値更新で）' : error.message }, { status: error.code === '23505' ? 409 : 500 })
    await audit(admin, actor, 'create', `partner:${pt.code}/reward:${rewardId}`, { supplier: supplierId, partner: partnerId, reward_id: rewardId, value, original: ctx.reward.reward_value, note, warning: g.warning ?? null })
    return NextResponse.json({ id: ins.id, warning: g.warning ?? null })
  }

  // 全メニュー上書き（rate/continuous 型のみに適用される値）: 配下の全対象報酬でガード・1件でも違反なら全体拒否（設計§3）
  const { data: svs } = await admin.from('services').select('id').eq('supplier_partner_id', supplierId)
  const svIds = (svs ?? []).map((s: { id: string }) => s.id)
  if (!svIds.length) return NextResponse.json({ error: 'このサプライヤーに供給メニューがありません' }, { status: 400 })
  const { data: sms } = await admin.from('service_menus').select('id').in('service_id', svIds)
  const smIds = (sms ?? []).map((x: { id: string }) => x.id)
  const { data: mn } = smIds.length ? await admin.from('menus').select('id').in('service_menu_id', smIds).eq('active', true) : { data: [] }
  const mIds = (mn ?? []).map((x: { id: string }) => x.id)
  const { data: targets } = mIds.length ? await admin.from('menu_rewards').select('id, menu_id, reward_type, reward_base').in('menu_id', mIds).eq('active', true).in('reward_type', ['rate', 'continuous']) : { data: [] }
  for (const t of (targets ?? []) as { menu_id: string; reward_type: string; reward_base: string | null }[]) {
    const g = await guardValue(admin, t.menu_id, t.reward_type, value, t.reward_base)
    if (!g.ok) return NextResponse.json({ error: `全メニュー上書きを拒否: ${g.error}` }, { status: 400 })
  }
  const { data: ins, error } = await admin.from('partner_reward_overrides').insert({ supplier_partner_id: supplierId, partner_id: partnerId, reward_id: null, override_value: value, note, created_by: actor.id }).select('id').single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'このパートナーの全メニュー個別条件は既に存在します' : error.message }, { status: error.code === '23505' ? 409 : 500 })
  await audit(admin, actor, 'create', `partner:${pt.code}/supplier-all`, { supplier: supplierId, partner: partnerId, reward_id: null, value, note, targets: (targets ?? []).length })
  return NextResponse.json({ id: ins.id })
}

/** 値レンジ（設計§3）＋既存 validateSupplierReward（逆ザヤ50%・型制限）の合成。 */
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

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const actor = await requireOps(supabase)
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const id = typeof b.id === 'string' ? b.id : ''
  if (!id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { data: cur } = await admin.from('partner_reward_overrides').select('id, supplier_partner_id, partner_id, reward_id, override_value, active').eq('id', id).maybeSingle()
  if (!cur) return NextResponse.json({ error: '個別条件が見つかりません' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let warning: string | null = null
  if (typeof b.active === 'boolean') patch.active = b.active
  if (b.override_value != null) {
    const value = Number(b.override_value)
    if (cur.reward_id) {
      const ctx = await rewardContext(admin, cur.reward_id)
      if (!ctx) return NextResponse.json({ error: '対象の報酬が見つかりません' }, { status: 404 })
      const g = await guardValue(admin, ctx.reward.menu_id, ctx.reward.reward_type, value, ctx.reward.reward_base)
      if (!g.ok) return NextResponse.json({ error: g.error }, { status: 400 })
      warning = g.warning ?? null
    } else {
      if (!(value > 0 && value <= 100)) return NextResponse.json({ error: '率は0より大きく100%以下で設定してください' }, { status: 400 })
    }
    patch.override_value = value
  }
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const { error } = await admin.from('partner_reward_overrides').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const action = typeof b.active === 'boolean' ? (b.active ? 'reactivate' : 'deactivate') : 'update'
  await audit(admin, actor, action, `override:${id}`, { before: { value: cur.override_value, active: cur.active }, after: { value: patch.override_value ?? cur.override_value, active: patch.active ?? cur.active }, supplier: cur.supplier_partner_id, partner: cur.partner_id, reward_id: cur.reward_id })
  return NextResponse.json({ ok: true, warning })
}
