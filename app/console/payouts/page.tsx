'use client'
import { useEffect, useState, useTransition } from 'react'
import ConsoleNav from '@/components/ConsoleNav'
import CountUp from '@/components/CountUp'

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
  const map: Record<string, { label: string; bg: string; color: string; dot: string }> = {
    open:   { label: '締め前',  bg: 'var(--bg2)',    color: 'var(--muted2)', dot: 'var(--muted)' },
    closed: { label: '締め済',  bg: 'var(--amber-bg)', color: 'var(--amber)', dot: 'var(--amber)' },
    paid:   { label: '支払済',  bg: 'var(--green-bg)', color: 'var(--green)', dot: 'var(--green)' },
  }
  const s = map[status] ?? map.open
  return (
    <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.6rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: s.bg, color: s.color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </span>
  )
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

        <div className="page-anim" style={{ padding: '32px 28px', maxWidth: 880 }}>
          {loading && <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>読み込み中…</p>}
          {!loading && batches.length === 0 && (
            <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>バッチがありません。月末自動締めを待つか、月次締めをAPIで実行してください。</p>
          )}

          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {batches.map(batch => {
            const ym = batch.month.substring(0, 7)
            const isOpen = batch.status === 'open'
            const isPaid = batch.status === 'paid'
            const isExpanded = expanded === batch.id

            const gross = totalGross(batch.payout_items)
            const wh = totalWh(batch.payout_items)
            const net = totalNet(batch.payout_items)
            const whPct = gross > 0 ? (wh / gross) * 100 : 0
            const netPct = gross > 0 ? (net / gross) * 100 : 0

            return (
              <div key={batch.id} className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
                {/* Batch header */}
                <div
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '20px 22px', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--line)' : undefined }}
                  onClick={() => setExpanded(isExpanded ? null : batch.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <b style={{ fontSize: '.95rem' }}>{monthLabel(batch.month)}</b>
                      {statusBadge(batch.status)}
                      <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>{batch.payout_items.length}名</span>
                    </div>

                    {/* Money flow: 合計 → 源泉 → 手取 */}
                    <div style={{ marginTop: 14, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                      <div>
                        <div className="eyebrow" style={{ fontSize: '.56rem', color: 'var(--muted2)', letterSpacing: '.04em' }}>合計</div>
                        <div className="tnum" style={{ fontSize: '.92rem', fontWeight: 800, fontFamily: 'Inter' }}>
                          <CountUp value={gross} format="yen" />
                        </div>
                      </div>
                      <div style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: '.75rem' }}>−</div>
                      <div>
                        <div className="eyebrow" style={{ fontSize: '.56rem', color: 'var(--muted2)', letterSpacing: '.04em' }}>源泉</div>
                        <div className="tnum" style={{ fontSize: '.92rem', fontWeight: 800, fontFamily: 'Inter', color: 'var(--red)' }}>
                          <CountUp value={wh} format="yen" />
                        </div>
                      </div>
                      <div style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: '.75rem' }}>=</div>
                      <div>
                        <div className="eyebrow" style={{ fontSize: '.56rem', color: 'var(--muted2)', letterSpacing: '.04em' }}>手取</div>
                        <div className="tnum" style={{ fontSize: '.92rem', fontWeight: 800, fontFamily: 'Inter', color: 'var(--green)' }}>
                          <CountUp value={net} format="yen" />
                        </div>
                      </div>
                    </div>

                    {/* Proportion bar: net (green) + withholding (red) = total */}
                    <div style={{ marginTop: 12, display: 'flex', height: 7, borderRadius: 20, overflow: 'hidden', background: 'var(--bg2)', maxWidth: 420 }}>
                      <div className="bar-grow" style={{ width: `${netPct}%`, background: 'var(--green)' }} />
                      <div className="bar-grow" style={{ width: `${whPct}%`, background: 'var(--red)' }} />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                    {/* CSV export — only when closed or paid */}
                    <a
                      href={isOpen ? undefined : `/api/console/payouts/${ym}/csv`}
                      download={isOpen ? undefined : `payout_${ym}.csv`}
                      aria-disabled={isOpen}
                      className="btn btn-g"
                      style={{
                        fontSize: '.68rem', fontWeight: 700, padding: '6px 14px', borderRadius: 9,
                        background: isOpen ? 'var(--bg2)' : 'var(--blue-bg2)',
                        color: isOpen ? 'var(--muted2)' : 'var(--blue)',
                        border: '1px solid ' + (isOpen ? 'transparent' : 'var(--blue-bg)'),
                        textDecoration: 'none', cursor: isOpen ? 'default' : 'pointer',
                        pointerEvents: isOpen ? 'none' : 'auto', opacity: isOpen ? .6 : 1,
                      }}
                    >
                      CSV出力
                    </a>

                    {/* Mark paid — only when closed */}
                    {batch.status === 'closed' && (
                      <button
                        onClick={() => markPaid(batch.month)}
                        disabled={pending}
                        className="btn"
                        style={{ fontSize: '.68rem', fontWeight: 700, padding: '6px 14px', borderRadius: 9, background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bg)', cursor: 'pointer' }}
                      >
                        支払済にする
                      </button>
                    )}
                  </div>

                  {/* Chevron */}
                  <span style={{ color: 'var(--muted)', fontSize: '.8rem', marginLeft: 4, alignSelf: 'center', transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>∨</span>
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
                        <div key={item.partner_id} className="lift" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, padding: '13px 22px', borderTop: i > 0 ? '1px solid var(--line)' : undefined, alignItems: 'center' }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: p?.profiles?.color ?? '#B9BAC4', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700 }}>
                            {(p?.profiles?.name ?? p?.code ?? '?')[0]}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <b style={{ fontSize: '.78rem' }}>{p?.profiles?.name ?? '—'}</b>
                              <span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontFamily: 'Inter' }}>{p?.code}</span>
                              <span className="chip" style={{ fontSize: '.56rem', padding: '1px 7px', borderRadius: 10, background: 'var(--bg2)', color: 'var(--muted2)' }}>
                                {item.statement?.tax_type === 'individual' ? '個人' : '法人'}
                              </span>
                            </div>
                            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2 }}>
                              {item.statement?.deal_count ?? '?'}件 · 源泉 <span style={{ color: 'var(--red)' }}>¥{item.withholding.toLocaleString()}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div className="tnum" style={{ fontSize: '.82rem', fontWeight: 800, fontFamily: 'Inter', color: 'var(--green)' }}>
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
                      <div style={{ padding: '13px 22px', borderTop: '1px solid var(--line)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 22 }}>
                        <div style={{ fontSize: '.68rem', color: 'var(--muted2)', textAlign: 'right' }}>
                          源泉合計 <b className="tnum" style={{ color: 'var(--red)' }}>−¥{totalWh(batch.payout_items).toLocaleString()}</b>
                        </div>
                        <div className="tnum" style={{ fontSize: '.82rem', fontWeight: 800, fontFamily: 'Inter' }}>
                          振込合計 <span style={{ color: 'var(--green)' }}>¥{totalNet(batch.payout_items).toLocaleString()}</span>
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
