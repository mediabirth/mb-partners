'use client'
import { useEffect, useState, useTransition, type ReactNode } from 'react'
import PageGuide from '@/components/PageGuide'
import { GUIDE_PAYOUTS, GUIDE_SUPPLIER_CHARGES } from '@/lib/console-guides'
import useSWR from 'swr'
import ConsoleNav from '@/components/ConsoleNav'
import StatusDot from '../StatusDot'
import Avatar from '@/components/ui/Avatar'
import { partnerKind } from '@/lib/status'
import SupplierChargesPanel from './SupplierChargesPanel'

/* ============================================================
 * 支払（BR-C4 再設計＋情報再構造化 2026-07-14）— お金の出入りの唯一の画面。
 *   タブ①パートナーへの支払（MBが払う・従来の支払管理）／タブ②サプライヤーからの請求（MBが請求する・旧 /console/supplier-charges を統合）。
 * 内部用語（凍結/未凍結/override/源泉…）は前面に出さず、確定/確定前/支払済み のプレーンな言葉に。
 * ★お金の計算・操作（締め/確定=凍結/支払済/取消/請求済/入金済）の処理ロジックは既存ハンドラをそのまま呼ぶ＝不変。
 * ============================================================ */

type PayoutItem = {
  partner_id: string; gross: number; withholding: number; net: number
  statement: { deal_count?: number; tax_type?: string; override_only?: boolean }
  partners: { code: string; profiles: { name: string; color: string } | null } | null
  override_gross?: number; combined_gross?: number; combined_withholding?: number; combined_net?: number; synthetic?: boolean
}
type Batch = { id: string; month: string; status: 'open' | 'closed' | 'paid'; closed_at: string | null; paid_at: string | null; payout_items: PayoutItem[] }
type Pending = { delivery_id: string; period: string; baseFee: number; expenseTotal: number; amount: number; count: number }
type Frozen = { id: string; delivery_id: string; deal_id: string; deal_item_id: string | null; base_fee: number; expense_total: number; amount: number; period: string; status: string; frozen_at: string; paid_at: string | null }

function monthLabel(d: string) { const [y, m] = d.split('-'); return `${y}年${Number(m)}月` }

type BD = { label: string; value: number; op?: '−' | '＋' | '=' }
type Row = {
  key: string; kind: 'referral' | 'frontier' | 'delivery'
  name: string; code?: string | null; color: string | null; sub: string
  amount: number; breakdown: BD[]
  csvYm?: string
  primary?: { label: string; onClick: () => void; tone: 'green' | 'blue' }
  secondary?: { label: string; onClick: () => void }
}

function yen(n: number) { return `¥${n.toLocaleString()}` }

function PayRow({ row, busy }: { row: Row; busy: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderTop: '0.5px solid var(--line)' }}>
      <div className="lift" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <Avatar name={row.name} color={row.color} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <b style={{ fontSize: '.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</b>
            {/* ①名前表記: 氏名主体＋補助のコード小 */}
            {row.code && <span style={{ fontSize: '.56rem', color: 'var(--muted2)', fontWeight: 500, flexShrink: 0 }}>{row.code}</span>}
            <StatusDot {...partnerKind(row.kind)} />
          </div>
          <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sub}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="eyebrow" style={{ fontSize: '.5rem', color: 'var(--muted2)', letterSpacing: '.06em' }}>お支払額</div>
          <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '.92rem', fontWeight: 500 }}>{yen(row.amount)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          {row.primary && <button onClick={row.primary.onClick} disabled={busy} style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.68rem', fontWeight: 500, padding: '7px 13px', borderRadius: 8, color: row.primary.tone === 'green' ? 'var(--green)' : '#fff', background: row.primary.tone === 'green' ? 'var(--green-bg)' : 'var(--c-blue)' }}>{row.primary.label}</button>}
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '.7rem', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>∨</span>
      </div>
      {open && (
        <div style={{ padding: '12px 18px 14px 64px', background: 'var(--bg2)' }}>
          <div className="eyebrow" style={{ fontSize: '.52rem', color: 'var(--muted2)', marginBottom: 6 }}>内訳</div>
          {row.breakdown.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '.7rem', borderTop: b.op === '=' ? '0.5px solid var(--line)' : undefined, marginTop: b.op === '=' ? 4 : 0, paddingTop: b.op === '=' ? 8 : 4 }}>
              <span style={{ color: b.op === '=' ? 'var(--txt)' : 'var(--muted2)', fontWeight: 500 }}>{b.op === '−' ? '− ' : b.op === '＋' ? '＋ ' : ''}{b.label}</span>
              <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500 }}>{b.op === '−' ? '−' : ''}{yen(Math.abs(b.value))}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {row.csvYm && <a href={`/api/console/payouts/${row.csvYm}/csv`} download={`payout_${row.csvYm}.csv`} style={{ fontSize: '.64rem', fontWeight: 500, color: 'var(--c-blue)', textDecoration: 'none', border: '1px solid var(--blue-bg)', background: 'var(--blue-bg2)', borderRadius: 8, padding: '5px 11px' }}>CSV出力</a>}
            {row.secondary && <button onClick={row.secondary.onClick} disabled={busy} style={{ fontSize: '.64rem', fontWeight: 500, color: 'var(--muted2)', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 8, padding: '5px 11px', cursor: 'pointer' }}>{row.secondary.label}</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, total, count, defaultOpen, accent, children }: { title: string; total?: number; count: number; defaultOpen: boolean; accent: string; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <b style={{ fontSize: '.92rem', flex: 1 }}>{title}<span style={{ fontSize: '.66rem', color: 'var(--muted2)', fontWeight: 500, marginLeft: 8 }}>{count}件</span></b>
        {total != null && <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 500 }}>{yen(total)}</span>}
        <span style={{ color: 'var(--muted)', fontSize: '.75rem', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>∨</span>
      </div>
      {open && (count === 0
        ? <p style={{ padding: '0 20px 18px', fontSize: '.72rem', color: 'var(--muted2)' }}>対象はありません。</p>
        : <div style={{ borderTop: '0.5px solid var(--line)' }}>{children}</div>)}
    </div>
  )
}

type Forecast = { month: string; total_net: number; partner_count: number; items: { partner_id: string; name: string; color: string | null; deal_count: number; gross: number; withholding: number; net: number }[] }

export default function PayoutsPage() {
  // 統合タブ: pay=パートナーへの支払（既定）／charges=サプライヤーからの請求（旧URLは ?tab=charges でリダイレクト着地）
  //   SSRは常に'pay'で描画し、?tab はマウント後に反映（hydration不一致=React#418を避ける）。
  const [tab, setTab] = useState<'pay' | 'charges'>('pay')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'charges') setTab('charges')
  }, [])
  function switchTab(t: 'pay' | 'charges') {
    setTab(t)
    if (typeof window !== 'undefined') window.history.replaceState(null, '', t === 'charges' ? '/console/payouts?tab=charges' : '/console/payouts')
  }
  const { data, mutate } = useSWR<{ batches: Batch[] }>('/api/console/payouts')
  const batches = data?.batches ?? []
  // ④ 締め前「今月の支払見込み」（読み取り集計・close_month非実行）。
  const { data: fc } = useSWR<Forecast>('/api/console/payouts/forecast')
  const [pending, setPending] = useState<Pending[]>([])
  const [frozen, setFrozen] = useState<Frozen[]>([])
  const [dname, setDname] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [, startTransition] = useTransition()
  function show(m: string) { setToast(m); setTimeout(() => setToast(''), 2500) }
  async function loadDelivery() {
    const d = await fetch('/api/console/delivery-payouts').then(r => r.json()).catch(() => ({}))
    setPending(d.pending ?? []); setFrozen(d.frozen ?? []); setDname(d.deliveryName ?? {})
  }
  useEffect(() => { loadDelivery() }, [])

  // ── 既存ハンドラ（処理ロジック不変・ラベルのみプレーン化） ──
  function markPaid(month: string) {
    if (!confirm(`${monthLabel(month)} 分のパートナー報酬をすべて「支払済」にしますか？`)) return
    startTransition(async () => {
      const res = await fetch(`/api/console/payouts/${month.substring(0, 7)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_paid' }) })
      if (res.ok) { await mutate(); show('支払済にしました') } else { const d = await res.json().catch(() => ({})); show(d.error ?? '支払済にできませんでした。時間をおいて再度お試しください') }
    })
  }
  async function freeze(p: Pending) {
    if (!confirm(`${dname[p.delivery_id] ?? '委託先'}・${monthLabel(p.period)} の ${yen(p.amount)} を確定しますか？\n確定後の経費変更はこの金額に影響しません。`)) return
    setBusy(true)
    try {
      const r = await fetch('/api/console/delivery-payouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_id: p.delivery_id, period: p.period }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { await loadDelivery(); show('今月分を確定しました') }
      else if (d.needsMigration) show('テーブル未作成（Phase B DDL 実行が必要）')
      else show(d.error ?? '確定に失敗しました')
    } catch { show('確定に失敗しました') } finally { setBusy(false) }
  }
  async function setPaid(item: Frozen, paid: boolean) {
    setBusy(true)
    try {
      const r = await fetch(`/api/console/delivery-payouts/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paid }) })
      if (r.ok) { await loadDelivery(); show(paid ? '支払済にしました' : '未払いに戻しました') } else show('更新に失敗しました')
    } catch { show('更新に失敗しました') } finally { setBusy(false) }
  }
  async function undo(item: Frozen) {
    if (!confirm('この確定を取り消しますか？（確定前に戻ります）')) return
    setBusy(true)
    try {
      const r = await fetch(`/api/console/delivery-payouts/${item.id}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { await loadDelivery(); show('確定を取り消しました') } else show(d.error ?? '取消に失敗しました')
    } catch { show('取消に失敗しました') } finally { setBusy(false) }
  }

  const pNet = (it: PayoutItem) => it.combined_net ?? it.net
  const pGross = (it: PayoutItem) => it.combined_gross ?? it.gross
  const pWh = (it: PayoutItem) => it.combined_withholding ?? it.withholding
  const partnerRow = (it: PayoutItem, b: Batch, withPay: boolean): Row => ({
    key: `p-${b.id}-${it.partner_id}`,
    kind: (it.override_gross ?? 0) > 0 ? 'frontier' : 'referral',
    // ①名前表記: 氏名主体（コードは補助表示）。名前解決は既存 partners→profiles ネスト＝単一ソース。
    name: it.partners?.profiles?.name ?? it.partners?.code ?? '—', code: it.partners?.profiles?.name ? it.partners?.code ?? null : null,
    color: it.partners?.profiles?.color ?? null,
    sub: `${monthLabel(b.month)} ・ ${it.synthetic ? 'チーム報酬' : `${it.statement?.deal_count ?? 0}件`}`,
    amount: pNet(it), csvYm: b.month.substring(0, 7),
    breakdown: [{ label: '報酬合計', value: pGross(it) }, { label: '源泉徴収', value: pWh(it), op: '−' }, { label: 'お支払い', value: pNet(it), op: '=' }],
    primary: withPay ? { label: '支払済にする', onClick: () => markPaid(b.month), tone: 'green' } : undefined,
  })
  const deliveryRow = (f: Frozen, withPay: boolean): Row => ({
    key: `d-${f.id}`, kind: 'delivery', name: dname[f.delivery_id] ?? '委託先', color: null,
    sub: `${monthLabel(f.period)} ・ 委託費＋経費`,
    amount: f.amount,
    breakdown: [{ label: '委託費', value: f.base_fee }, { label: '承認済経費', value: f.expense_total, op: '＋' }, { label: 'お支払い', value: f.amount, op: '=' }],
    primary: withPay ? { label: '支払済にする', onClick: () => setPaid(f, true), tone: 'green' } : undefined,
    secondary: withPay ? { label: '確定を取り消す', onClick: () => undo(f) } : { label: '未払いに戻す', onClick: () => setPaid(f, false) },
  })
  const pendingRow = (p: Pending): Row => ({
    key: `pend-${p.delivery_id}-${p.period}`, kind: 'delivery', name: dname[p.delivery_id] ?? '委託先', color: null,
    sub: `${monthLabel(p.period)} ・ ${p.count}件（集計中）`,
    amount: p.amount,
    breakdown: [{ label: '委託費', value: p.baseFee }, { label: '承認済経費', value: p.expenseTotal, op: '＋' }, { label: '見込み額', value: p.amount, op: '=' }],
    primary: { label: '今月分を確定する', onClick: () => freeze(p), tone: 'blue' },
  })

  // ── 3状態に振り分け ──
  const due: Row[] = [
    ...batches.filter(b => b.status === 'closed').flatMap(b => b.payout_items.map(it => partnerRow(it, b, true))),
    ...frozen.filter(f => f.status === 'unpaid').map(f => deliveryRow(f, true)),
  ]
  const dueTotal = due.reduce((s, r) => s + r.amount, 0)
  const collecting: Row[] = [
    ...batches.filter(b => b.status === 'open').flatMap(b => b.payout_items.map(it => partnerRow(it, b, false))),
    ...pending.map(pendingRow),
  ]
  const collectingTotal = collecting.reduce((s, r) => s + r.amount, 0)
  const paidRows: Row[] = [
    ...batches.filter(b => b.status === 'paid').flatMap(b => b.payout_items.map(it => ({ ...partnerRow(it, b, false), primary: undefined }))),
    ...frozen.filter(f => f.status === 'paid').map(f => deliveryRow(f, false)),
  ]

  // ── ④ ダッシュボード集計（既存データの読み取り集計のみ・money計算/書き込み非接触） ──
  const jstYm = (() => { const j = new Date(Date.now() + 9 * 3600_000); return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}` })()
  const curBatch = batches.find(b => b.month.substring(0, 7) === jstYm)
  // 今月：open batch があればそれ優先、無ければ confirmed 見込み（forecast）。
  const thisMonthNet = curBatch ? curBatch.payout_items.reduce((s, it) => s + pNet(it), 0) : (fc?.total_net ?? 0)
  const thisMonthPartners = curBatch ? curBatch.payout_items.length : (fc?.partner_count ?? 0)
  const thisMonthConfirmed = !!curBatch
  // 月別（全batch・month降順は既存。net=combined_net合算・人数）
  const byMonth = batches.map(b => ({ month: b.month, status: b.status, net: b.payout_items.reduce((s, it) => s + pNet(it), 0), partners: b.payout_items.length }))
  const monthMax = Math.max(thisMonthNet, ...byMonth.map(m => m.net), 1)
  // パートナー別累計（payout_items 横断・net合算）
  const partnerTotals = (() => {
    const m = new Map<string, { name: string; code: string | null; color: string | null; total: number; months: number }>()
    for (const b of batches) for (const it of b.payout_items) {
      const cur = m.get(it.partner_id) ?? { name: it.partners?.profiles?.name ?? it.partners?.code ?? '—', code: it.partners?.profiles?.name ? it.partners?.code ?? null : null, color: it.partners?.profiles?.color ?? null, total: 0, months: 0 }
      cur.total += pNet(it); cur.months += 1
      m.set(it.partner_id, cur)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  })()
  const partnerMax = Math.max(...partnerTotals.map(p => p.total), 1)
  // 延滞アラート：確定済み(closed)で未払いのまま日数が経過（翌月末払い≒30日超で要対応）。表示のみ。
  const overdueDays = (() => {
    const closed = batches.filter(b => b.status === 'closed' && b.closed_at)
    if (!closed.length) return null
    return Math.max(...closed.map(b => Math.floor((Date.now() - new Date(b.closed_at as string).getTime()) / 86_400_000)))
  })()
  const overdue = overdueDays != null && overdueDays > 30

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <h1 style={{ fontSize: '1rem', fontWeight: 500 }}>支払</h1>
            <PageGuide data={tab === 'pay' ? GUIDE_PAYOUTS : GUIDE_SUPPLIER_CHARGES} />
          </span>
          {/* 統合タブ（案件ボードのQR切替と同文法） */}
          <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 9, padding: 3 }}>
            {([['pay', 'パートナーへの支払'], ['charges', 'サプライヤーからの請求']] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => switchTab(v)} style={{
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500,
                padding: '7px 14px', borderRadius: 7, whiteSpace: 'nowrap',
                color: tab === v ? 'var(--txt)' : 'var(--muted2)',
                background: tab === v ? '#fff' : 'transparent',
                boxShadow: tab === v ? '0 1px 4px rgba(14,14,20,.1)' : 'none',
              }}>{lbl}</button>
            ))}
          </div>
        </div>

        {tab === 'charges' ? (
          <div className="page-anim" style={{ padding: '26px 28px 44px', maxWidth: 1040 }}>
            <SupplierChargesPanel />
          </div>
        ) : (
        <div className="page-anim" style={{ padding: '26px 28px', maxWidth: 880 }}>
          {/* B: 取得中はブランクでなく骨組みskeleton（pop-in/ガクッ防止） */}
          {data === undefined ? (
            <div className="stagger">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div className="ui-skeleton" style={{ height: 110, borderRadius: 16 }} />
                <div className="ui-skeleton" style={{ height: 110, borderRadius: 16 }} />
              </div>
              <div className="ui-skeleton" style={{ height: 180, borderRadius: 16, marginBottom: 16 }} />
              <div className="ui-skeleton" style={{ height: 140, borderRadius: 16 }} />
            </div>
          ) : (<>

          {/* ④ ダッシュボード（読み取り集計・表示のみ） */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {/* 今月の支払見込み */}
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <span style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)' }}>{monthLabel(`${jstYm}-01`)}の支払{thisMonthConfirmed ? '' : '見込み'}</span>
                <span style={{ fontSize: '.52rem', fontWeight: 500, color: thisMonthConfirmed ? 'var(--green)' : 'var(--amber)', background: thisMonthConfirmed ? 'var(--green-bg)' : 'var(--amber-bg)', borderRadius: 20, padding: '2px 8px' }}>
                  {thisMonthConfirmed ? '確定済み' : '締め後に確定'}
                </span>
              </div>
              <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.6rem', fontWeight: 500, color: 'var(--c-blue)', lineHeight: 1.1 }}>{yen(thisMonthNet)}</div>
              <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 5 }}>対象 {thisMonthPartners} 名{!thisMonthConfirmed && ' ・ 確定済み案件の見込み（締めで確定）'}</div>
            </div>
            {/* 要支払い（即振込）＋延滞 */}
            <div style={{ background: '#fff', border: `0.5px solid ${overdue ? 'var(--red)' : 'var(--line)'}`, borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <span style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)' }}>要支払い（即振込）</span>
                {overdue && <span style={{ fontSize: '.52rem', fontWeight: 500, color: 'var(--red)', background: 'var(--red-bg)', borderRadius: 20, padding: '2px 8px' }}>延滞 {overdueDays}日</span>}
              </div>
              <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.6rem', fontWeight: 500, color: dueTotal > 0 ? 'var(--green)' : 'var(--muted2)', lineHeight: 1.1 }}>{yen(dueTotal)}</div>
              <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 5 }}>{due.length} 件</div>
            </div>
          </div>

          {/* 月別の支払い（過去遡り・読み取り集計） */}
          {byMonth.length > 0 && (
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 16, padding: '16px 20px', marginBottom: 18 }}>
              <b style={{ fontSize: '.78rem' }}>月別の支払い</b>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
                {byMonth.map(m => (
                  <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 64, flexShrink: 0, fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 500 }}>{monthLabel(m.month)}</span>
                    <div style={{ flex: 1, height: 18, background: 'var(--bg2)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(4, Math.round(m.net / monthMax * 100))}%`, height: '100%', borderRadius: 5, background: m.status === 'paid' ? 'var(--muted2)' : m.status === 'closed' ? 'var(--green)' : 'var(--amber)' }} />
                    </div>
                    <span className="tnum" style={{ width: 92, textAlign: 'right', fontFamily: 'Inter', fontSize: '.7rem', fontWeight: 500 }}>{yen(m.net)}</span>
                    <span style={{ width: 38, textAlign: 'right', fontSize: '.58rem', color: 'var(--muted2)' }}>{m.partners}名</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* パートナー別 累計支払（読み取り集計） */}
          {partnerTotals.length > 0 && (
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 16, padding: '16px 20px', marginBottom: 20 }}>
              <b style={{ fontSize: '.78rem' }}>パートナー別 累計支払</b>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {partnerTotals.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={p.name} color={p.color} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}{p.code && <span style={{ fontSize: '.56rem', color: 'var(--muted2)', fontWeight: 500, marginLeft: 6 }}>{p.code}</span>}</div>
                      <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(4, Math.round(p.total / partnerMax * 100))}%`, height: '100%', borderRadius: 4, background: 'var(--c-blue)' }} />
                      </div>
                    </div>
                    <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.74rem', fontWeight: 500, flexShrink: 0 }}>{yen(p.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ① 要支払い（主役・最上段） */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 4px 8px' }}>
              {/* B4: 要支払いが ¥0（対象0件）のときは「今すぐ振り込む」CTAヒントを出さない（押せても無意味なため）。空ステート文言は維持。 */}
              <h2 style={{ fontSize: '.86rem', fontWeight: 500 }}>要支払い{due.length > 0 && dueTotal > 0 && <span style={{ fontSize: '.64rem', color: 'var(--muted2)', fontWeight: 500, marginLeft: 6 }}>今すぐ振り込む</span>}</h2>
              <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.1rem', fontWeight: 500, color: 'var(--green)' }}>計 {yen(dueTotal)}</span>
            </div>
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
              {due.length === 0
                ? <p style={{ padding: '20px', fontSize: '.74rem', color: 'var(--muted2)', textAlign: 'center' }}>支払うべきものはありません。すべて支払済です。</p>
                : due.map(r => <PayRow key={r.key} row={r} busy={busy} />)}
            </div>
          </div>

          {/* ② 確定前（今月集計中・副） */}
          <Section title="確定前（今月集計中）" total={collectingTotal} count={collecting.length} defaultOpen={false} accent="var(--amber)">
            {collecting.map(r => <PayRow key={r.key} row={r} busy={busy} />)}
          </Section>

          {/* ③ 支払済（履歴・副） */}
          <Section title="支払済" count={paidRows.length} defaultOpen={false} accent="var(--muted2)">
            {paidRows.map(r => <PayRow key={r.key} row={r} busy={busy} />)}
          </Section>
          </>)}
        </div>
        )}
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 9, fontSize: '.74rem', fontWeight: 500, zIndex: 99 }}>{toast}</div>}
    </div>
  )
}
