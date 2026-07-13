/**
 * サプライヤー自己設定API（B・本人のみ・セッションスコープ強制）。
 * GET   — 自社ブランド・メニュー・報酬・保留中の申請（設定UIの材料）
 * PATCH — 即時反映系: メニュー報酬額（既存 validateSupplierReward＝型制限/逆ザヤガード準拠）・社内向けメモ。
 *         全て audit_logs＋運営Slack通知。
 * POST  — 申請制: 顧客向け説明/イメージ画像/メニュー名/公開・非公開 → supplier_change_requests（pending）。
 * ★境界: 全て「セッション由来 partner id の自社ブランド配下」であることを検証（他社/MBブランドは構造的に不可）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { validateSupplierReward } from '@/lib/supplier-fee'

export const runtime = 'nodejs'

type Admin = Awaited<ReturnType<typeof createServiceRoleClient>>

async function requireSupplier(): Promise<{ partnerId: string; code: string; name: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('partners').select('id, code, supplier_rate_card, profiles(name)').eq('profile_id', user.id).maybeSingle()
  if (!p) return null
  const admin = await createServiceRoleClient()
  if (!p.supplier_rate_card) {
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', p.id).limit(1)
    if (!sv?.length) return null
  }
  return { partnerId: p.id, code: p.code, name: (p.profiles as { name?: string } | null)?.name ?? p.code }
}

/** 対象が自社ブランド配下であることの検証（service直・menu経由の両方）。 */
async function ownService(admin: Admin, partnerId: string, serviceId: string): Promise<boolean> {
  const { data } = await admin.from('services').select('id').eq('id', serviceId).eq('supplier_partner_id', partnerId).maybeSingle()
  return !!data
}
async function ownMenu(admin: Admin, partnerId: string, menuId: string): Promise<{ serviceId: string } | null> {
  const { data: m } = await admin.from('menus').select('service_menu_id').eq('id', menuId).maybeSingle()
  if (!m?.service_menu_id) return null
  const { data: sm } = await admin.from('service_menus').select('service_id').eq('id', m.service_menu_id).maybeSingle()
  if (!sm?.service_id) return null
  return (await ownService(admin, partnerId, sm.service_id)) ? { serviceId: sm.service_id } : null
}

async function notify(admin: Admin, who: { code: string; name: string }, action: string, target: string, meta: Record<string, unknown>) {
  try { await admin.from('audit_logs').insert({ actor_profile_id: null, actor_name: `サプライヤー本人（${who.name}）`, category: 'supplier_self', target, action, meta }) } catch { /* best-effort */ }
  try {
    const { sendSlack } = await import('@/lib/notify')
    await sendSlack(`🏷️ MB Partners｜サプライヤー自己設定：*${who.name}*（${who.code}）が ${target} を${action === 'request' ? '申請' : '変更'}しました\n${JSON.stringify(meta).slice(0, 300)}`)
  } catch { /* best-effort */ }
}

export async function GET() {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  // サクサク: 直列チェーンを段階並列化（brands→[sms/deals素/reqs]→menus→[rewards/frozen/asg]・結果は従来と同一）
  const { data: brands } = await admin.from('services').select('id, name, active, supplier_memo, image_url').eq('supplier_partner_id', me.partnerId).order('sort')
  const svIds = (brands ?? []).map(b => b.id)
  const [smsRes, dsRes, reqsRes, honorificMod] = await Promise.all([
    svIds.length ? admin.from('service_menus').select('id, service_id').in('service_id', svIds) : Promise.resolve({ data: [] as never[] }),
    svIds.length ? admin.from('deals').select('id, customer_name, customer_type, company_name, contact_name, status, created_at, fixed_month, service_id, fee_snapshot, deal_items(id, revenue)').in('service_id', svIds).neq('status', 'lost').order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] as never[] }),
    admin.from('supplier_change_requests').select('id, service_id, menu_id, kind, payload, status, reason, created_at').eq('supplier_partner_id', me.partnerId).order('created_at', { ascending: false }).limit(20),
    import('@/lib/customer'),
  ])
  const sms = (smsRes.data ?? []) as { id: string; service_id: string }[]
  const smIds = sms.map(x => x.id)
  const { data: mn } = smIds.length ? await admin.from('menus').select('id, name, service_menu_id, public_description').in('service_menu_id', smIds).order('sort') : { data: [] as never[] }
  const menus = ((mn ?? []) as { id: string; name: string; service_menu_id: string; public_description: string | null }[]).map(m => ({ id: m.id, name: m.name, public_description: m.public_description, service_id: sms.find(x => x.id === m.service_menu_id)?.service_id ?? '' }))
  const mIds = menus.map(m => m.id)
  const ds = (dsRes.data ?? []) as Record<string, unknown>[]
  const dealIds = ds.map(x => x.id as string)
  const [rewardsRes, frRes, asgRes] = await Promise.all([
    mIds.length ? admin.from('menu_rewards').select('id, menu_id, reward_type, reward_value, reward_base').in('menu_id', mIds).eq('active', true).order('sort') : Promise.resolve({ data: [] as never[] }),
    dealIds.length ? admin.from('supplier_charges').select('deal_id').eq('supplier_partner_id', me.partnerId).in('deal_id', dealIds) : Promise.resolve({ data: [] as never[] }),
    dealIds.length ? admin.from('delivery_assignments').select('deal_id, status').in('deal_id', dealIds) : Promise.resolve({ data: [] as never[] }),
  ])
  const rewards = (rewardsRes.data ?? []) as { id: string; menu_id: string; reward_type: string; reward_value: number; reward_base: string | null }[]
  const { customerHonorific } = honorificMod
  const frozenSet = new Set(((frRes.data ?? []) as { deal_id: string | null }[]).map(x => x.deal_id))
  const asg = (asgRes.data ?? []) as { deal_id: string; status: string | null }[]
  const deals = ds.map(d => ({
    id: d.id as string,
    customer: customerHonorific(d as never),
    status: d.status as string,
    brand: (brands ?? []).find(b => b.id === d.service_id)?.name ?? '',
    created_at: d.created_at as string,
    fixed_month: (d.fixed_month as string | null) ?? null,
    revenue: (((d.deal_items as { revenue: number | null }[] | null) ?? [])).reduce((s2, it) => s2 + (Number(it.revenue) || 0), 0),
    item_id: ((d.deal_items as { id: string }[] | null) ?? [])[0]?.id ?? null,
    from_network: !!(d.fee_snapshot as { self_service?: boolean } | null)?.self_service,
    frozen: frozenSet.has(d.id as string),
    assignments: asg.filter(a => a.deal_id === d.id).map(a => ({ status: a.status })),
  }))
  const reqs = reqsRes.data
  return NextResponse.json({ brands: brands ?? [], menus, rewards, deals, requests: reqs ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest) {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const b = await req.json().catch(() => ({}))

  // 即時①: メニュー報酬額（値のみ・型/ベースは正典・既存ガード準拠）
  if (typeof b.reward_id === 'string' && b.reward_value != null) {
    const { data: r } = await admin.from('menu_rewards').select('id, menu_id, reward_type, reward_value, reward_base').eq('id', b.reward_id).maybeSingle()
    if (!r) return NextResponse.json({ error: '報酬が見つかりません' }, { status: 404 })
    const own = await ownMenu(admin, me.partnerId, r.menu_id)
    if (!own) return NextResponse.json({ error: '自社メニューの報酬のみ変更できます' }, { status: 403 })
    const value = Number(b.reward_value)
    if (!Number.isFinite(value) || value <= 0) return NextResponse.json({ error: '値が不正です' }, { status: 400 })
    // 値レンジ（個別条件§3と同一）: fixed=1〜10,000,000／率=100%以下（折半カードの50%上限は validateSupplierReward が担う）
    if (r.reward_type === 'fixed' && value > 10_000_000) return NextResponse.json({ error: '固定額は10,000,000円以下で設定してください' }, { status: 400 })
    if (r.reward_type !== 'fixed' && value > 100) return NextResponse.json({ error: '率は100%以下で設定してください' }, { status: 400 })
    const g = await validateSupplierReward(admin, r.menu_id, r.reward_type, value, r.reward_base)
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: 400 })
    const { error } = await admin.from('menu_rewards').update({ reward_value: value }).eq('id', r.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await notify(admin, me, 'update', `reward:${r.id}`, { before: r.reward_value, after: value, menu_id: r.menu_id })
    return NextResponse.json({ ok: true, warning: g.warning ?? null })
  }

  // 即時③: 成約案件の受注額（Phase 0の運営代行入力を本人化・2026-07-13）。
  //   ★凍結済み請求への波及なしは既存の2段凍結（supplier_charges凍結後skip）が構造的に保証。
  //   出所はコンソール案件タイムライン（deal_events）と audit_logs に記録＝「サプライヤー入力」が運営から見える。
  if (typeof b.deal_id === 'string' && b.revenue != null) {
    const { data: d } = await admin.from('deals').select('id, service_id, status, customer_name, deal_items(id)').eq('id', b.deal_id).maybeSingle()
    if (!d) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
    if (!(await ownService(admin, me.partnerId, d.service_id as string))) return NextResponse.json({ error: '自社メニューの案件のみ入力できます' }, { status: 403 })
    if (d.status !== 'confirmed') return NextResponse.json({ error: d.status === 'paid' ? 'この案件は確定済みです（受注額の変更はMB Partnersへご連絡ください）' : '受注額は成約後の案件に入力できます' }, { status: 400 })
    const { data: frozenRow } = await admin.from('supplier_charges').select('id').eq('supplier_partner_id', me.partnerId).eq('deal_id', d.id).limit(1)
    if (frozenRow?.length) return NextResponse.json({ error: 'この案件の請求は締め済みです（確定済み・変更はMB Partnersへ）' }, { status: 400 })
    const revenue = Math.round(Number(b.revenue))
    if (!Number.isFinite(revenue) || revenue < 0 || revenue > 1_000_000_000) return NextResponse.json({ error: '受注額が不正です' }, { status: 400 })
    const item = ((d.deal_items as { id: string }[] | null) ?? [])[0]
    if (item) {
      const { error } = await admin.from('deal_items').update({ revenue }).eq('id', item.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await admin.from('deal_items').insert({ deal_id: d.id, service_id: d.service_id, kind: 'referral', amount: 0, revenue, sort: 0 })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    try { await admin.from('deal_events').insert({ deal_id: d.id, body: `受注額をサプライヤー本人が入力: ¥${revenue.toLocaleString()}（${me.name}）`, visible_to_partner: false, created_by: null }) } catch { /* best-effort */ }
    await notify(admin, me, 'update', `deal-revenue:${d.id}`, { customer: d.customer_name, revenue })
    return NextResponse.json({ ok: true })
  }

  // 即時②: 社内向けメモ（自社ブランド）
  if (typeof b.service_id === 'string' && 'supplier_memo' in b) {
    if (!(await ownService(admin, me.partnerId, b.service_id))) return NextResponse.json({ error: '自社ブランドのみ編集できます' }, { status: 403 })
    const memo = typeof b.supplier_memo === 'string' ? b.supplier_memo.trim().slice(0, 2000) : null
    const { error } = await admin.from('services').update({ supplier_memo: memo || null }).eq('id', b.service_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await notify(admin, me, 'update', `memo:${b.service_id}`, { length: (memo ?? '').length })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const b = await req.json().catch(() => ({}))
  const kind = String(b.kind ?? '')
  if (!['public_description', 'image', 'menu_name', 'visibility'].includes(kind)) return NextResponse.json({ error: 'kind が不正です' }, { status: 400 })
  const serviceId = typeof b.service_id === 'string' ? b.service_id : ''
  const menuId = typeof b.menu_id === 'string' && b.menu_id ? b.menu_id : null
  if (!serviceId) return NextResponse.json({ error: 'service_id は必須です' }, { status: 400 })
  if (!(await ownService(admin, me.partnerId, serviceId))) return NextResponse.json({ error: '自社ブランドのみ申請できます' }, { status: 403 })
  if ((kind === 'public_description' || kind === 'menu_name') && !menuId) return NextResponse.json({ error: 'menu_id は必須です' }, { status: 400 })
  if (menuId) {
    const own = await ownMenu(admin, me.partnerId, menuId)
    if (!own || own.serviceId !== serviceId) return NextResponse.json({ error: '自社メニューのみ申請できます' }, { status: 403 })
  }
  const value = kind === 'visibility' ? !!b.value : String(b.value ?? '').trim().slice(0, 4000)
  if (kind !== 'visibility' && !value) return NextResponse.json({ error: '内容を入力してください' }, { status: 400 })
  const { data: ins, error } = await admin.from('supplier_change_requests').insert({ supplier_partner_id: me.partnerId, service_id: serviceId, menu_id: menuId, kind, payload: { value } }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await notify(admin, me, 'request', `${kind}:${menuId ?? serviceId}`, { request_id: ins.id, value: typeof value === 'string' ? value.slice(0, 120) : value })
  return NextResponse.json({ id: ins.id, status: 'pending' })
}
