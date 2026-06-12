'use client'
import { useEffect, useState, useTransition } from 'react'
import ConsoleNav from '@/components/ConsoleNav'

type PayoutItem = {
  partner_id: string
  gross: number
  withholding: number
  net: number
  statement: { deal_count: number; tax_type: string }
  partners: { code: string; profiles: { name: string; color: string } | null } | null
}

type Batch = {
  id: string
  month: string      // date 'YYYY-MM-DD'
  status: 'open' | 'closed' | 'paid'
  closed_at: string | null
  paid_at: string | null
  payout_items: PayoutItem[]
}

function monthLabel(dateStr: string) {
  const [y, m] = dateStr.split('-')
  return `${y}年${m}月`
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    open:   { label: '締め前',  bg: '#F4F4F7',    color: 'var(--muted2)' },
    closed: { label: '締め済',  bg: '#FBF1DF',    color: '#D98914' },
    paid:   { label: '支払済',  bg: '#E5F3F1',    color: '#15917E' },
  }
  const s = map[status] ?? map.open
  return <span style={{ fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color }}>{s.label}</span>
}

export default function PayoutsPage() {
  const [batches, setBatches]   = useState<Batch[]>([])
  const [profile, setProfile]   = useState<{ name: string; color: string } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast]       = useState('')
  const [pending, startTransition] = useTransition()

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  useEffect(() => {
    fetch('/api/console/payouts')
      .then(r => r.json())
      .then(d => { setBatches(d.batches ?? []) })
      .finally(() => setLoading(false))
    fetch('/api/console/deals')
      .then(r => r.json())
      .then(d => setProfile(d.profile))
  }, [])

  function markPaid(month: string) {
    if (!confirm(`${monthLabel(month)} バッチを支払済にしますか？\n対象の案件が「支払済」列に移動します。`)) return
    startTransition(async () => {
      const ym = month.substring(0, 7)
      const res = await fetch(`/api/console/payouts/${ym}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid' }),
      })
      if (res.ok) {
        setBatches(prev => prev.map(b => b.month === month ? { ...b, status: 'paid', paid_at: new Date().toISOString() } : b))
        showToast('支払済に変更しました')
      } else {
        const d = await res.json()
        showToast(d.error ?? 'エラーが発生しました')
      }
    })
  }

  const totalGross = (items: PayoutItem[]) => items.reduce((s, i) => s + i.gross, 0)
  const totalNet   = (items: PayoutItem[]) => items.reduce((s, i) => s + i.net, 0)
  const totalWh    = (items: PayoutItem[]) => items.reduce((s, i) => s + i.withholding, 0)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>支払管理</h1>
          <span style={{ fontSize: '.72rem', color: 'var(--muted2)' }}>{batches.length}バッチ</span>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 860 }}>
          {loading && <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>読み込み中…</p>}
          {!loading && batches.length === 0 && (
            <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>バッチがありません。月末自動締めを待つか、月次締めをAPIで実行してください。</p>
          )}

          {batches.map(batch => {
            const ym = batch.month.substring(0, 7)
            const isOpen = batch.status === 'open'
            const isPaid = batch.status === 'paid'
            const isExpanded = expanded === batch.id

            return (
              <div key={batch.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, marginBottom: 14, overflow: 'hidden' }}>
                {/* Batch header */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--line)' : undefined }}
                  onClick={() => setExpanded(isExpanded ? null : batch.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: '.9rem' }}>{monthLabel(batch.month)}</b>
                      {statusBadge(batch.status)}
                      <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>{batch.payout_items.length}名</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: '.7rem', fontFamily: 'Inter', color: 'var(--muted2)' }}>
                      合計 ¥{totalGross(batch.payout_items).toLocaleString()} → 手取 ¥{totalNet(batch.payout_items).toLocaleString()}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {/* CSV export — only when closed or paid */}
                    <a
                      href={isOpen ? undefined : `/api/console/payouts/${ym}/csv`}
                      download={isOpen ? undefined : `payout_${ym}.csv`}
                      aria-disabled={isOpen}
                      style={{
                        fontSize: '.68rem', fontWeight: 700, padding: '5px 12px', borderRadius: 8,
                        background: isOpen ? '#F4F4F7' : 'var(--blue-bg2)',
                        color: isOpen ? 'var(--muted2)' : 'var(--blue)',
                        border: '1px solid ' + (isOpen ? 'transparent' : 'var(--blue-bg)'),
                        textDecoration: 'none', cursor: isOpen ? 'default' : 'pointer',
                        pointerEvents: isOpen ? 'none' : 'auto',
                      }}
                    >
                      CSV出力
                    </a>

                    {/* Mark paid — only when closed */}
                    {batch.status === 'closed' && (
                      <button
                        onClick={() => markPaid(batch.month)}
                        disabled={pending}
                        style={{ fontSize: '.68rem', fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: '#E5F3F1', color: '#15917E', border: '1px solid #C2E8E4', cursor: 'pointer' }}
                      >
                        支払済にする
                      </button>
                    )}
                  </div>

                  {/* Chevron */}
                  <span style={{ color: 'var(--muted)', fontSize: '.8rem', marginLeft: 4 }}>{isExpanded ? '∧' : '∨'}</span>
                </div>

                {/* Partner rows */}
                {isExpanded && (
                  <div>
                    {batch.payout_items.length === 0 && (
                      <div style={{ padding: '12px 20px', fontSize: '.72rem', color: 'var(--muted2)' }}>対象なし</div>
                    )}
                    {batch.payout_items.map((item, i) => {
                      const p = item.partners
                      return (
                        <div key={item.partner_id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, padding: '11px 20px', borderTop: i > 0 ? '1px solid #F2F2F6' : undefined, alignItems: 'center' }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: p?.profiles?.color ?? '#B9BAC4', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.68rem', fontWeight: 700 }}>
                            {(p?.profiles?.name ?? p?.code ?? '?')[0]}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <b style={{ fontSize: '.78rem' }}>{p?.profiles?.name ?? '—'}</b>
                              <span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontFamily: 'Inter' }}>{p?.code}</span>
                              <span style={{ fontSize: '.56rem', padding: '1px 5px', borderRadius: 10, background: '#F4F4F7', color: 'var(--muted2)' }}>
                                {item.statement?.tax_type === 'individual' ? '個人' : '法人'}
                              </span>
                            </div>
                            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1 }}>
                              {item.statement?.deal_count ?? '?'}件 · 源泉 ¥{item.withholding.toLocaleString()}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '.78rem', fontWeight: 800, fontFamily: 'Inter', color: 'var(--blue)' }}>
                              ¥{item.net.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '.58rem', color: 'var(--muted2)' }}>
                              総額 ¥{item.gross.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {/* Batch totals */}
                    {batch.payout_items.length > 0 && (
                      <div style={{ padding: '10px 20px', borderTop: '1px solid var(--line)', background: '#FAFAFA', display: 'flex', justifyContent: 'flex-end', gap: 20 }}>
                        <div style={{ fontSize: '.68rem', color: 'var(--muted2)', textAlign: 'right' }}>
                          源泉合計 <b style={{ color: 'var(--red)' }}>−¥{totalWh(batch.payout_items).toLocaleString()}</b>
                        </div>
                        <div style={{ fontSize: '.78rem', fontWeight: 800, fontFamily: 'Inter' }}>
                          振込合計 ¥{totalNet(batch.payout_items).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1A1A2E', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: '.78rem', fontWeight: 600, zIndex: 9999 }}>
          {toast}
        </div>
      )}
    </div>
  )
}
