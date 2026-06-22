'use client'
import { useEffect, useState, useTransition, type ReactNode } from 'react'
import useSWR from 'swr'
import ConsoleNav from '@/components/ConsoleNav'
import StatusPill from '@/components/ui/StatusPill'
import Avatar from '@/components/ui/Avatar'
import { partnerKind } from '@/lib/status'

/* ============================================================
 * 支払管理（BR-C4 再設計）— 「誰にいくら払うか」中心の1統合リスト。
 * 内部用語（凍結/未凍結/override/源泉…）は前面に出さず、確定/確定前/支払済み のプレーンな言葉に。
 * ★お金の計算・操作（締め/確定=凍結/支払済/取消）の処理ロジックは既存ハンドラをそのまま呼ぶ＝不変。
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
  name: string; color: string | null; sub: string
  amount: number; breakdown: BD[]
  csvYm?: string
  primary?: { label: string; onClick: () => void; tone: 'green' | 'blue' }
  secondary?: { label: string; onClick: () => void }
}

function yen(n: number) { return `¥${n.toLocaleString()}` }

function PayRow({ row, busy }: { row: Row; busy: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderTop: '1px solid #F2F2F6' }}>
      <div className="lift" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <Avatar name={row.name} color={row.color} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <b style={{ fontSize: '.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</b>
            <StatusPill size="sm" {...partnerKind(row.kind)} />
          </div>
          <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sub}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="eyebrow" style={{ fontSize: '.5rem', color: 'var(--muted2)', letterSpacing: '.06em' }}>お支払額</div>
          <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '.92rem', fontWeight: 800 }}>{yen(row.amount)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          {row.primary && <button onClick={row.primary.onClick} disabled={busy} style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.68rem', fontWeight: 800, padding: '7px 13px', borderRadius: 8, color: row.primary.tone === 'green' ? 'var(--green)' : '#fff', background: row.primary.tone === 'green' ? 'var(--green-bg)' : 'var(--blue)' }}>{row.primary.label}</button>}
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '.7rem', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>∨</span>
      </div>
      {open && (
        <div style={{ padding: '12px 18px 14px 64px', background: 'var(--bg2)' }}>
          <div className="eyebrow" style={{ fontSize: '.52rem', color: 'var(--muted2)', marginBottom: 6 }}>内訳</div>
          {row.breakdown.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '.7rem', borderTop: b.op === '=' ? '1px solid var(--line)' : undefined, marginTop: b.op === '=' ? 4 : 0, paddingTop: b.op === '=' ? 8 : 4 }}>
              <span style={{ color: b.op === '=' ? 'var(--txt)' : 'var(--muted2)', fontWeight: b.op === '=' ? 800 : 500 }}>{b.op === '−' ? '− ' : b.op === '＋' ? '＋ ' : ''}{b.label}</span>
              <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: b.op === '=' ? 800 : 600 }}>{b.op === '−' ? '−' : ''}{yen(Math.abs(b.value))}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {row.csvYm && <a href={`/api/console/payouts/${row.csvYm}/csv`} download={`payout_${row.csvYm}.csv`} style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--blue)', textDecoration: 'none', border: '1px solid var(--blue-bg)', background: 'var(--blue-bg2)', borderRadius: 8, padding: '5px 11px' }}>CSV出力</a>}
            {row.secondary && <button onClick={row.secondary.onClick} disabled={busy} style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--muted2)', background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 11px', cursor: 'pointer' }}>{row.secondary.label}</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, total, count, defaultOpen, accent, children }: { title: string; total?: number; count: number; defaultOpen: boolean; accent: string; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <b style={{ fontSize: '.92rem', flex: 1 }}>{title}<span style={{ fontSize: '.66rem', color: 'var(--muted2)', fontWeight: 600, marginLeft: 8 }}>{count}件</span></b>
        {total != null && <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 800 }}>{yen(total)}</span>}
        <span style={{ color: 'var(--muted)', fontSize: '.75rem', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>∨</span>
      </div>
      {open && (count === 0
        ? <p style={{ padding: '0 20px 18px', fontSize: '.72rem', color: 'var(--muted2)' }}>対象はありません。</p>
        : <div style={{ borderTop: '1px solid var(--line)' }}>{children}</div>)}
    </div>
  )
}

export default function PayoutsPage() {
  const { data, mutate } = useSWR<{ batches: Batch[] }>('/api/console/payouts')
  const batches = data?.batches ?? []
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
    if (!confirm(`${monthLabel(month)} 分のパートナー報酬をすべて「支払済み」にしますか？`)) return
    startTransition(async () => {
      const res = await fetch(`/api/console/payouts/${month.substring(0, 7)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_paid' }) })
      if (res.ok) { await mutate(); show('支払済みにしました') } else { const d = await res.json().catch(() => ({})); show(d.error ?? 'エラーが発生しました') }
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
      if (r.ok) { await loadDelivery(); show(paid ? '支払済みにしました' : '未払いに戻しました') } else show('更新に失敗しました')
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
    name: it.partners?.profiles?.name ?? it.partners?.code ?? '—', color: it.partners?.profiles?.color ?? null,
    sub: `${monthLabel(b.month)} · ${it.synthetic ? 'チーム報酬' : `${it.statement?.deal_count ?? 0}件`}`,
    amount: pNet(it), csvYm: b.month.substring(0, 7),
    breakdown: [{ label: '報酬合計', value: pGross(it) }, { label: '源泉徴収', value: pWh(it), op: '−' }, { label: 'お支払い', value: pNet(it), op: '=' }],
    primary: withPay ? { label: '支払済みにする', onClick: () => markPaid(b.month), tone: 'green' } : undefined,
  })
  const deliveryRow = (f: Frozen, withPay: boolean): Row => ({
    key: `d-${f.id}`, kind: 'delivery', name: dname[f.delivery_id] ?? '委託先', color: null,
    sub: `${monthLabel(f.period)} · 委託費＋経費`,
    amount: f.amount,
    breakdown: [{ label: '委託費', value: f.base_fee }, { label: '承認済み経費', value: f.expense_total, op: '＋' }, { label: 'お支払い', value: f.amount, op: '=' }],
    primary: withPay ? { label: '支払済みにする', onClick: () => setPaid(f, true), tone: 'green' } : undefined,
    secondary: withPay ? { label: '確定を取り消す', onClick: () => undo(f) } : { label: '未払いに戻す', onClick: () => setPaid(f, false) },
  })
  const pendingRow = (p: Pending): Row => ({
    key: `pend-${p.delivery_id}-${p.period}`, kind: 'delivery', name: dname[p.delivery_id] ?? '委託先', color: null,
    sub: `${monthLabel(p.period)} · ${p.count}件（集計中）`,
    amount: p.amount,
    breakdown: [{ label: '委託費', value: p.baseFee }, { label: '承認済み経費', value: p.expenseTotal, op: '＋' }, { label: '見込み額', value: p.amount, op: '=' }],
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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>支払管理</h1>
          <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 2 }}>誰に・いくら払うか。各行をひらくと内訳が見られます。</p>
        </div>

        <div className="page-anim" style={{ padding: '26px 28px', maxWidth: 880 }}>
          {/* ① 要支払い（主役・最上段） */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 4px 8px' }}>
              {/* B4: 要支払いが ¥0（対象0件）のときは「今すぐ振り込む」CTAヒントを出さない（押せても無意味なため）。空ステート文言は維持。 */}
              <h2 style={{ fontSize: '.86rem', fontWeight: 800 }}>要支払い{due.length > 0 && dueTotal > 0 && <span style={{ fontSize: '.64rem', color: 'var(--muted2)', fontWeight: 600, marginLeft: 6 }}>今すぐ振り込む</span>}</h2>
              <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)' }}>計 {yen(dueTotal)}</span>
            </div>
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
              {due.length === 0
                ? <p style={{ padding: '20px', fontSize: '.74rem', color: 'var(--muted2)', textAlign: 'center' }}>支払うべきものはありません。すべて支払済みです。</p>
                : due.map(r => <PayRow key={r.key} row={r} busy={busy} />)}
            </div>
          </div>

          {/* ② 確定前（今月集計中・副） */}
          <Section title="確定前（今月集計中）" total={collectingTotal} count={collecting.length} defaultOpen={false} accent="var(--amber)">
            {collecting.map(r => <PayRow key={r.key} row={r} busy={busy} />)}
          </Section>

          {/* ③ 支払済み（履歴・副） */}
          <Section title="支払済み" count={paidRows.length} defaultOpen={false} accent="var(--muted2)">
            {paidRows.map(r => <PayRow key={r.key} row={r} busy={busy} />)}
          </Section>
        </div>
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 9, fontSize: '.74rem', fontWeight: 600, zIndex: 99 }}>{toast}</div>}
    </div>
  )
}
