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
  const { data: p } = await supabase.from('partners').select('id, code, supplier_rate_card, company_name, profiles(name)').eq('profile_id', user.id).maybeSingle()
  if (!p) return null
  const admin = await createServiceRoleClient()
  if (!p.supplier_rate_card) {
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', p.id).limit(1)
    if (!sv?.length) return null
  }
  return { partnerId: p.id, code: p.code, name: (p as { company_name?: string | null }).company_name || (p.profiles as { name?: string } | null)?.name || p.code }
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
  const { data: brands } = await admin.from('services').select('id, name, active, supplier_memo, image_url, logo_path, icon, color, category, subtitle, description, who, target_audience, url').eq('supplier_partner_id', me.partnerId).order('sort')
  const svIds = (brands ?? []).map(b => b.id)
  const [smsRes, dsRes, reqsRes, honorificMod] = await Promise.all([
    svIds.length ? admin.from('service_menus').select('id, service_id').in('service_id', svIds) : Promise.resolve({ data: [] as never[] }),
    svIds.length ? admin.from('deals').select('id, customer_name, customer_type, company_name, contact_name, status, created_at, fixed_month, service_id, menu_id, reward_snapshot, fee_snapshot, deal_items(id, revenue)').in('service_id', svIds).neq('status', 'lost').order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] as never[] }),
    admin.from('supplier_change_requests').select('id, service_id, menu_id, kind, payload, status, reason, created_at').eq('supplier_partner_id', me.partnerId).order('created_at', { ascending: false }).limit(20),
    import('@/lib/customer'),
  ])
  const sms = (smsRes.data ?? []) as { id: string; service_id: string }[]
  const smIds = sms.map(x => x.id)
  const { data: mn } = smIds.length ? await admin.from('menus').select('id, name, service_menu_id, public_description, short_description, description, active').in('service_menu_id', smIds).order('sort') : { data: [] as never[] }
  const menus = ((mn ?? []) as { id: string; name: string; service_menu_id: string; public_description: string | null; short_description: string | null; description: string | null; active: boolean | null }[]).map(m => ({ id: m.id, name: m.name, active: m.active !== false, public_description: m.public_description, short_description: m.short_description, description: m.description, service_id: sms.find(x => x.id === m.service_menu_id)?.service_id ?? '' }))
  const mIds = menus.map(m => m.id)
  const ds = (dsRes.data ?? []) as Record<string, unknown>[]
  const dealIds = ds.map(x => x.id as string)
  const menuNameById: Record<string, string> = Object.fromEntries(menus.map(m => [m.id, m.name]))
  const [rewardsRes, frRes, asgRes] = await Promise.all([
    mIds.length ? admin.from('menu_rewards').select('id, menu_id, reward_type, reward_value, reward_base').in('menu_id', mIds).eq('active', true).order('sort') : Promise.resolve({ data: [] as never[] }),
    dealIds.length ? admin.from('supplier_charges').select('deal_id').eq('supplier_partner_id', me.partnerId).in('deal_id', dealIds) : Promise.resolve({ data: [] as never[] }),
    dealIds.length ? admin.from('delivery_assignments').select('id, deal_id, delivery_id, status, base_fee').in('deal_id', dealIds) : Promise.resolve({ data: [] as never[] }),
  ])
  const rewards = (rewardsRes.data ?? []) as { id: string; menu_id: string; reward_type: string; reward_value: number; reward_base: string | null }[]
  const { customerHonorific } = honorificMod
  const frozenSet = new Set(((frRes.data ?? []) as { deal_id: string | null }[]).map(x => x.deal_id))
  const asg = (asgRes.data ?? []) as { id: string; deal_id: string; delivery_id: string; status: string | null; base_fee: number | null }[]
  // v6: 自社の委託先（supplier_partner_id=本人）一覧
  const { data: dlvs } = await admin.from('deliveries').select('id, name, kind, contact_email, active, auth_user_id').eq('supplier_partner_id', me.partnerId).order('created_at', { ascending: false })
  const dlvIds = [...new Set(asg.map(a => a.delivery_id))]
  const { data: dlvNames } = dlvIds.length ? await admin.from('deliveries').select('id, name').in('id', dlvIds) : { data: [] as never[] }
  const dlvNameById: Record<string, string> = Object.fromEntries(((dlvNames ?? []) as { id: string; name: string }[]).map(x => [x.id, x.name]))
  const deals = ds.map(d => ({
    id: d.id as string,
    customer: customerHonorific(d as never),
    status: d.status as string,
    brand: (brands ?? []).find(b => b.id === d.service_id)?.name ?? '',
    menu_name: menuNameById[((d.reward_snapshot as { menu_id?: string } | null)?.menu_id ?? (d.menu_id as string | null)) ?? ''] ?? null,
    created_at: d.created_at as string,
    fixed_month: (d.fixed_month as string | null) ?? null,
    revenue: (((d.deal_items as { revenue: number | null }[] | null) ?? [])).reduce((s2, it) => s2 + (Number(it.revenue) || 0), 0),
    item_id: ((d.deal_items as { id: string }[] | null) ?? [])[0]?.id ?? null,
    from_network: !!(d.fee_snapshot as { self_service?: boolean } | null)?.self_service,
    frozen: frozenSet.has(d.id as string),
    // own=自社委託先（納品済みの宣言は own のみ・MB直の委託は運営が確認）
    assignments: asg.filter(a => a.deal_id === d.id).map(a => ({ id: a.id, status: a.status, base_fee: a.base_fee, delivery_name: dlvNameById[a.delivery_id] ?? '委託先', own: (dlvs ?? []).some(v => v.id === a.delivery_id) })),
  }))
  const reqs = reqsRes.data
  return NextResponse.json({ brands: brands ?? [], menus, rewards, deals, deliveries: dlvs ?? [], requests: reqs ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
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
    // ベンダー純化P2: 桁ミス確認（vendor-redesign.md §3(b)）。★保存は既に完了＝絶対にブロックしない。
    //   本人には嫌疑表示をしない＝乖離時のみ「桁のご確認を」トースト用フラグを返すだけ（判定失敗は静かに無し）。
    let digitCheck = false
    try {
      const { data: d2 } = await admin.from('deals').select('menu_id, reward_snapshot').eq('id', d.id).maybeSingle()
      const menuId = ((d2?.reward_snapshot as { menu_id?: string } | null)?.menu_id ?? (d2?.menu_id as string | null)) || null
      if (menuId && revenue > 0) {
        const { flagForDeal } = await import('@/lib/revenue-flag')
        digitCheck = !!(await flagForDeal(admin, { id: d.id, menu_id: menuId, revenue }))
      }
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, digit_check: digitCheck, saved: revenue })
  }

  // 即時④: 会社名（法人の正式名称・v9）。表示系全域が company_name を優先する。
  if (typeof b.company_name === 'string') {
    const cn = b.company_name.trim().slice(0, 120)
    const { error } = await admin.from('partners').update({ company_name: cn || null }).eq('id', me.partnerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await notify(admin, me, 'update', `company-name:${me.partnerId}`, { company_name: cn })
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

  // v6①: 委託先の招待（自社所有・既存deliveries/invites流儀・実メールは任意）
  if (kind === 'invite_delivery') {
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : ''
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
    if (!name) return NextResponse.json({ error: '委託先の名称は必須です' }, { status: 400 })
    const { data: dv, error: dvErr } = await admin.from('deliveries').insert({ name, kind: typeof b.work === 'string' ? b.work.trim().slice(0, 60) || null : null, contact_email: email || null, active: true, supplier_partner_id: me.partnerId, note: `サプライヤー（${me.name}）の委託先` }).select('id').single()
    if (dvErr) return NextResponse.json({ error: dvErr.message }, { status: 500 })
    const { randomUUID } = await import('node:crypto')
    const token = randomUUID()
    const { error: invErr } = await admin.from('invites').insert({ kind: 'vendor', role: 'vendor', email: email || null, name, token, delivery_id: dv.id, expires_at: new Date(Date.now() + 7 * 86400e3).toISOString() })
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
    const { partnerFacingOrigin, requestOrigin } = await import('@/lib/app-origin')
    const invite_url = `${partnerFacingOrigin(requestOrigin(req))}/invite/${token}`
    let emailed = false
    if (email) {
      try { const { sendInviteEmail } = await import('@/lib/email'); emailed = (await sendInviteEmail({ to: email, name, url: invite_url, expiresAt: null, kind: 'vendor' })).sent } catch { /* best-effort */ }
    }
    await notify(admin, me, 'update', `delivery-invite:${dv.id}`, { name, email: email || null })
    return NextResponse.json({ id: dv.id, invite_url, emailed })
  }

  // v6②: 自社案件への委託アサイン（提示）＝受託者のアプリに承諾待ちで表示（既存vendorフローに接続）
  if (kind === 'assign') {
    const dealId = typeof b.deal_id === 'string' ? b.deal_id : ''
    const deliveryId = typeof b.delivery_id === 'string' ? b.delivery_id : ''
    const baseFee = Math.round(Number(b.base_fee))
    if (!dealId || !deliveryId || !Number.isFinite(baseFee) || baseFee < 0) return NextResponse.json({ error: 'deal_id / delivery_id / base_fee は必須です' }, { status: 400 })
    const { data: dl } = await admin.from('deals').select('id, service_id, customer_name').eq('id', dealId).maybeSingle()
    if (!dl || !(await ownService(admin, me.partnerId, dl.service_id as string))) return NextResponse.json({ error: '自社メニューの案件のみアサインできます' }, { status: 403 })
    const { data: dv } = await admin.from('deliveries').select('id, name, supplier_partner_id').eq('id', deliveryId).maybeSingle()
    if (!dv || dv.supplier_partner_id !== me.partnerId) return NextResponse.json({ error: '自社の委託先のみアサインできます' }, { status: 403 })
    const { data: ins, error } = await admin.from('delivery_assignments').insert({ deal_id: dealId, delivery_id: deliveryId, base_fee: baseFee, status: 'proposed', assigned_at: new Date().toISOString(), note: `サプライヤー（${me.name}）から提示` }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    try { await admin.from('deal_events').insert({ deal_id: dealId, body: `委託を提示: ${dv.name} ・ 委託費 ¥${baseFee.toLocaleString()}（サプライヤー ${me.name} から）`, visible_to_partner: false, created_by: null }) } catch { /* best-effort */ }
    await notify(admin, me, 'update', `assign:${ins.id}`, { deal: dl.customer_name, delivery: dv.name, base_fee: baseFee })
    return NextResponse.json({ id: ins.id, status: 'proposed' })
  }

  // ベンダー純化P1: 納品済みの宣言（vendor面から移管・vendor-redesign.md §1 V2/V10）。
  //   自社案件×自社委託先のみ。状態機械は不変（accepted→delivered・書き手のみ発注元へ）。宣言者・日時は deal_events に常時記録。
  if (kind === 'deliver') {
    const assignmentId = typeof b.assignment_id === 'string' ? b.assignment_id : ''
    if (!assignmentId) return NextResponse.json({ error: 'assignment_id は必須です' }, { status: 400 })
    const { data: asg } = await admin.from('delivery_assignments').select('id, deal_id, status, base_fee, delivery_id').eq('id', assignmentId).maybeSingle()
    if (!asg) return NextResponse.json({ error: '委託が見つかりません' }, { status: 404 })
    const { data: dl } = await admin.from('deals').select('id, service_id, customer_name').eq('id', asg.deal_id).maybeSingle()
    if (!dl || !(await ownService(admin, me.partnerId, dl.service_id as string))) return NextResponse.json({ error: '自社メニューの案件のみ操作できます' }, { status: 403 })
    const { data: dv } = await admin.from('deliveries').select('id, name, supplier_partner_id').eq('id', asg.delivery_id).maybeSingle()
    if (!dv || dv.supplier_partner_id !== me.partnerId) return NextResponse.json({ error: '自社の委託先のみ納品済みにできます' }, { status: 403 })
    if (!['accepted', 'assigned'].includes(asg.status ?? '')) return NextResponse.json({ error: '納品済みにできるのは了承済の委託のみです' }, { status: 409 })
    const { data: upd, error } = await admin.from('delivery_assignments')
      .update({ status: 'delivered', updated_at: new Date().toISOString() })
      .eq('id', assignmentId).eq('status', asg.status).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!upd?.length) return NextResponse.json({ error: '状態が変化していません' }, { status: 409 })
    try { await admin.from('deal_events').insert({ deal_id: asg.deal_id, visible_to_partner: false, created_by: null, body: `納品済みにしました: ${dv.name} ・ 委託費 ¥${(asg.base_fee ?? 0).toLocaleString()}（サプライヤー ${me.name} が確認）` }) } catch { /* best-effort */ }
    await notify(admin, me, 'update', `deliver:${assignmentId}`, { deal: dl.customer_name, delivery: dv.name, base_fee: asg.base_fee ?? 0 })
    return NextResponse.json({ ok: true, status: 'delivered' })
  }

  // v8: 一括申請（表示に関わる変更をまとめて申請＝APPに正しく表示するための全フィールド）
  if (kind === 'batch_request') {
    const serviceId0 = typeof b.service_id === 'string' ? b.service_id : ''
    if (!serviceId0 || !(await ownService(admin, me.partnerId, serviceId0))) return NextResponse.json({ error: '自社ブランドのみ申請できます' }, { status: 403 })
    const items = Array.isArray(b.requests) ? b.requests as { kind: string; menu_id?: string | null; value: unknown }[] : []
    const ALLOWED = ['public_description', 'image', 'logo', 'menu_name', 'visibility', 'subtitle', 'category', 'description', 'who', 'target_audience', 'url', 'menu_short_description', 'menu_description']
    if (!items.length || items.some(it => !ALLOWED.includes(it.kind))) return NextResponse.json({ error: '申請内容が不正です' }, { status: 400 })
    const rows: Record<string, unknown>[] = []
    for (const it of items) {
      const mid = typeof it.menu_id === 'string' && it.menu_id ? it.menu_id : null
      if (mid) { const own = await ownMenu(admin, me.partnerId, mid); if (!own || own.serviceId !== serviceId0) return NextResponse.json({ error: '自社メニューのみ申請できます' }, { status: 403 }) }
      const val = it.kind === 'visibility' ? !!it.value : String(it.value ?? '').trim().slice(0, 4000)
      rows.push({ supplier_partner_id: me.partnerId, service_id: serviceId0, menu_id: mid, kind: it.kind, payload: { value: val } })
    }
    const { data: ins, error } = await admin.from('supplier_change_requests').insert(rows).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await notify(admin, me, 'request', `batch:${serviceId0}`, { count: rows.length, kinds: items.map(i => i.kind) })
    return NextResponse.json({ ids: (ins ?? []).map(x => x.id), status: 'pending', count: rows.length })
  }

  if (!['public_description', 'image', 'logo', 'menu_name', 'visibility', 'menu_visibility', 'menu_create', 'subtitle', 'category', 'description', 'who', 'target_audience', 'url', 'menu_short_description', 'menu_description'].includes(kind)) return NextResponse.json({ error: 'kind が不正です' }, { status: 400 })
  const serviceId = typeof b.service_id === 'string' ? b.service_id : ''
  const menuId = typeof b.menu_id === 'string' && b.menu_id ? b.menu_id : null
  if (!serviceId) return NextResponse.json({ error: 'service_id は必須です' }, { status: 400 })
  if (!(await ownService(admin, me.partnerId, serviceId))) return NextResponse.json({ error: '自社ブランドのみ申請できます' }, { status: 403 })
  if ((kind === 'public_description' || kind === 'menu_name' || kind === 'menu_visibility') && !menuId) return NextResponse.json({ error: 'menu_id は必須です' }, { status: 400 })
  if (menuId) {
    const own = await ownMenu(admin, me.partnerId, menuId)
    if (!own || own.serviceId !== serviceId) return NextResponse.json({ error: '自社メニューのみ申請できます' }, { status: 403 })
  }
  const value = (kind === 'visibility' || kind === 'menu_visibility') ? !!b.value : String(b.value ?? '').trim().slice(0, 4000)
  if (kind !== 'visibility' && kind !== 'menu_visibility' && !value) return NextResponse.json({ error: '内容を入力してください' }, { status: 400 })
  const { data: ins, error } = await admin.from('supplier_change_requests').insert({ supplier_partner_id: me.partnerId, service_id: serviceId, menu_id: menuId, kind, payload: { value } }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await notify(admin, me, 'request', `${kind}:${menuId ?? serviceId}`, { request_id: ins.id, value: typeof value === 'string' ? value.slice(0, 120) : value })
  return NextResponse.json({ id: ins.id, status: 'pending' })
}
