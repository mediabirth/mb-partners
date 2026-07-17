/**
 * サプライヤーのメニュー内部運用定義（完全等価化A・2026-07-18）。
 * MBサービスマスタのメニュー編集と同一機能を自社メニューに限って提供する（内部運用定義=即時＋監査＋運営通知）。
 * GET  ?menu_id= — 報酬（型/値/トリガー/期間/協力タスク）＋レートカード種別
 * POST { op:'rewards_set', menu_id, rewards:[{id?, reward_type, reward_value, reward_trigger, reward_months, tasks[] }] }
 *        set-semantics: 一覧に無い既存報酬は無効化（過去案件の正典参照を保全＝物理削除しない）。
 *        検証は既存 validateSupplierReward（逆ザヤ50%・standardは固定/受注額%のみ）＝サーバが正。
 * POST { op:'hearing_set', menu_id, items:[...] } — コンソール定義APIと同一のset-semantics（回答残存はinactive保全）。
 * ★境界: menus→service_menus→services.supplier_partner_id=本人 のみ。確定済み案件は reward_snapshot 凍結で不変（money非接触）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { validateSupplierReward, STD_RATE_CARD } from '@/lib/supplier-fee'

export const runtime = 'nodejs'
const HEARING_TYPES = ['text', 'number', 'select']
const COOP_TASK_MASTER: { label: string; kind: 'auto' | 'manual' }[] = [
  { label: 'つなぐ', kind: 'auto' }, { label: 'アポイント', kind: 'auto' }, { label: 'ヒヤリング', kind: 'manual' },
  { label: 'アシスト/フォロー', kind: 'manual' }, { label: '価格/条件合意', kind: 'manual' }, { label: 'クロージング', kind: 'manual' },
]

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
  return { partnerId: p.id, code: p.code, card: (p.supplier_rate_card as string | null) ?? STD_RATE_CARD, name: (p as { company_name?: string | null }).company_name || (p.profiles as { name?: string } | null)?.name || p.code }
}

/** menu → service の所有検証。service_id も返す（タスクテンプレ行に必要）。 */
async function ownMenu(admin: Admin, partnerId: string, menuId: string): Promise<{ serviceId: string } | null> {
  const { data: m } = await admin.from('menus').select('service_menu_id').eq('id', menuId).maybeSingle()
  if (!m?.service_menu_id) return null
  const { data: sm } = await admin.from('service_menus').select('service_id').eq('id', m.service_menu_id).maybeSingle()
  if (!sm?.service_id) return null
  const { data: sv } = await admin.from('services').select('id').eq('id', sm.service_id).eq('supplier_partner_id', partnerId).maybeSingle()
  return sv ? { serviceId: sm.service_id } : null
}

async function notify(admin: Admin, who: { code: string; name: string }, target: string, meta: Record<string, unknown>) {
  try { await admin.from('audit_logs').insert({ actor_profile_id: null, actor_name: `サプライヤー本人（${who.name}）`, category: 'supplier_self', target, action: 'update', meta }) } catch { /* best-effort */ }
  try { const { sendSlack } = await import('@/lib/notify'); await sendSlack(`🏷️ MB Partners｜サプライヤー自己設定：*${who.name}*（${who.code}）が ${target} を変更しました\n${JSON.stringify(meta).slice(0, 300)}`) } catch { /* best-effort */ }
}

export async function GET(req: NextRequest) {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const menuId = new URL(req.url).searchParams.get('menu_id') ?? ''
  const own = await ownMenu(admin, me.partnerId, menuId)
  if (!own) return NextResponse.json({ error: '自社メニューのみ参照できます' }, { status: 403 })
  const [{ data: rewards }, { data: tpls }, { data: hearing }] = await Promise.all([
    admin.from('menu_rewards').select('id, reward_type, reward_value, reward_base, reward_trigger, default_months, sort, active').eq('menu_id', menuId).eq('active', true).order('sort'),
    admin.from('cooperation_task_templates').select('reward_id, label, active').eq('service_id', own.serviceId).eq('active', true),
    admin.from('menu_hearing_items').select('id, label, input_type, options, required, sort, active').eq('menu_id', menuId).order('sort'),
  ])
  const tasksByReward: Record<string, string[]> = {}
  for (const t of (tpls ?? []) as { reward_id: string | null; label: string }[]) {
    if (t.reward_id) (tasksByReward[t.reward_id] ??= []).push(t.label)
  }
  return NextResponse.json({
    card: me.card, passthrough: me.card === STD_RATE_CARD,
    rewards: ((rewards ?? []) as { id: string }[]).map(r => ({ ...r, tasks: tasksByReward[r.id] ?? [] })),
    hearing: ((hearing ?? []) as { active: boolean }[]).filter(h => h.active),
  })
}

export async function POST(req: NextRequest) {
  const me = await requireSupplier()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const b = await req.json().catch(() => ({}))
  const menuId = typeof b.menu_id === 'string' ? b.menu_id : ''
  const own = await ownMenu(admin, me.partnerId, menuId)
  if (!own) return NextResponse.json({ error: '自社メニューのみ編集できます' }, { status: 403 })
  const passthrough = me.card === STD_RATE_CARD

  if (b.op === 'rewards_set') {
    const rows = Array.isArray(b.rewards) ? b.rewards as { id?: string; reward_type?: string; reward_value?: unknown; reward_trigger?: string; reward_months?: unknown; tasks?: string[] }[] : null
    if (!rows) return NextResponse.json({ error: 'rewards は必須です' }, { status: 400 })
    if (rows.length > 6) return NextResponse.json({ error: '報酬は6件までです' }, { status: 400 })
    const warnings: string[] = []
    // 事前検証（1件でも違反なら全体拒否＝MB保存と同じく一括）
    const normalized = [] as { id?: string; reward_type: string; reward_value: number; reward_base: string | null; reward_trigger: string | null; default_months: number | null; tasks: string[] }[]
    for (const r of rows) {
      const type = ['fixed', 'rate', 'continuous'].includes(r.reward_type ?? '') ? r.reward_type! : 'fixed'
      if (passthrough && type === 'continuous') return NextResponse.json({ error: '標準カードでは継続型は設定できません（固定または受注額%）' }, { status: 400 })
      const value = Math.round(Number(r.reward_value) || 0)
      if (!(value > 0)) return NextResponse.json({ error: '報酬の値を入力してください' }, { status: 400 })
      const base = type === 'fixed' ? null : (passthrough ? '売上' : '粗利')
      const g = await validateSupplierReward(admin, menuId, type, value, base)
      if (!g.ok) return NextResponse.json({ error: g.error }, { status: 400 })
      if (g.warning) warnings.push(g.warning)
      normalized.push({ id: r.id, reward_type: type, reward_value: value, reward_base: base, reward_trigger: String(r.reward_trigger ?? '').trim().slice(0, 120) || null, default_months: type === 'continuous' ? (Math.round(Number(r.reward_months)) || null) : null, tasks: Array.isArray(r.tasks) ? r.tasks.filter(t => COOP_TASK_MASTER.some(m => m.label === t)) : [] })
    }
    // set-semantics: 一覧に無い既存報酬は無効化（物理削除しない＝過去案件の正典参照を保全）
    const { data: cur } = await admin.from('menu_rewards').select('id').eq('menu_id', menuId).eq('active', true)
    const keep = new Set(normalized.map(r => r.id).filter(Boolean))
    const toArchive = ((cur ?? []) as { id: string }[]).filter(c => !keep.has(c.id)).map(c => c.id)
    if (toArchive.length) {
      await admin.from('menu_rewards').update({ active: false }).in('id', toArchive)
      await admin.from('cooperation_task_templates').update({ active: false }).in('reward_id', toArchive).then(() => {}, () => {})
    }
    const savedIds: string[] = []
    for (let i = 0; i < normalized.length; i++) {
      const r = normalized[i]
      const row = { menu_id: menuId, reward_type: r.reward_type, reward_value: r.reward_value, reward_base: r.reward_base, reward_trigger: r.reward_trigger, default_months: r.default_months, sort: i, active: true }
      let rid = r.id ?? null
      if (rid) {
        const { error } = await admin.from('menu_rewards').update(row).eq('id', rid).eq('menu_id', menuId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        const { data: ins, error } = await admin.from('menu_rewards').insert(row).select('id').single()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        rid = ins.id
      }
      savedIds.push(rid!)
      // 協力タスク同期（MB保存と同一の器: cooperation_task_templates・reward_id紐付け）
      const { data: exist } = await admin.from('cooperation_task_templates').select('id, label, active').eq('reward_id', rid)
      const existBy = new Map(((exist ?? []) as { id: string; label: string; active: boolean }[]).map(t => [t.label, t]))
      for (const mt of COOP_TASK_MASTER) {
        const want = r.tasks.includes(mt.label)
        const have = existBy.get(mt.label)
        if (want && !have) await admin.from('cooperation_task_templates').insert({ service_id: own.serviceId, reward_id: rid, label: mt.label, kind: mt.kind, required: true, trigger_key: mt.kind === 'auto' ? 'in_progress' : null, sort: COOP_TASK_MASTER.findIndex(x => x.label === mt.label), active: true }).then(() => {}, () => {})
        else if (want && have && !have.active) await admin.from('cooperation_task_templates').update({ active: true }).eq('id', have.id)
        else if (!want && have && have.active) await admin.from('cooperation_task_templates').update({ active: false }).eq('id', have.id)
      }
    }
    await notify(admin, me, `menu-rewards:${menuId}`, { rewards: normalized.map(r => ({ type: r.reward_type, value: r.reward_value, tasks: r.tasks.length })), archived: toArchive.length })
    return NextResponse.json({ ok: true, ids: savedIds, warning: warnings[0] ?? null })
  }

  if (b.op === 'hearing_set') {
    const items = Array.isArray(b.items) ? b.items as { id?: string; label?: string; input_type?: string; options?: unknown; required?: boolean; sort?: number }[] : null
    if (!items) return NextResponse.json({ error: 'items は必須です' }, { status: 400 })
    if (items.length > 30) return NextResponse.json({ error: '項目は30件までです' }, { status: 400 })
    for (const it of items) {
      if (!String(it.label ?? '').trim()) return NextResponse.json({ error: '項目名が空の行があります' }, { status: 400 })
      if (it.input_type && !HEARING_TYPES.includes(it.input_type)) return NextResponse.json({ error: '不正な型です' }, { status: 400 })
    }
    const { data: cur } = await admin.from('menu_hearing_items').select('id').eq('menu_id', menuId)
    const keep = new Set(items.map(i => i.id).filter(Boolean))
    const drop = ((cur ?? []) as { id: string }[]).filter(c => !keep.has(c.id)).map(c => c.id)
    if (drop.length) {
      const { data: answered } = await admin.from('deal_hearing_answers').select('item_id').in('item_id', drop)
      const answeredSet = new Set(((answered ?? []) as { item_id: string }[]).map(a => a.item_id))
      const hardDrop = drop.filter(d => !answeredSet.has(d))
      const softDrop = drop.filter(d => answeredSet.has(d))
      if (hardDrop.length) await admin.from('menu_hearing_items').delete().in('id', hardDrop)
      if (softDrop.length) await admin.from('menu_hearing_items').update({ active: false }).in('id', softDrop)
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const row = { menu_id: menuId, label: String(it.label).trim().slice(0, 80), input_type: HEARING_TYPES.includes(it.input_type ?? '') ? it.input_type : 'text', options: it.options ?? null, required: !!it.required, sort: Number.isFinite(it.sort) ? Number(it.sort) : i, active: true }
      if (it.id) await admin.from('menu_hearing_items').update(row).eq('id', it.id).eq('menu_id', menuId)
      else await admin.from('menu_hearing_items').insert(row)
    }
    await notify(admin, me, `menu-hearing:${menuId}`, { count: items.length })
    const { data } = await admin.from('menu_hearing_items').select('id, label, input_type, options, required, sort, active').eq('menu_id', menuId).eq('active', true).order('sort')
    return NextResponse.json({ ok: true, items: data ?? [] })
  }

  return NextResponse.json({ error: '不明な操作です' }, { status: 400 })
}
