'use client'
import { useEffect, useState, useTransition, useRef } from 'react'
import ServiceIcon from '@/components/ServiceIcon'
import ConsoleNav from '@/components/ConsoleNav'

type Deal = {
  id: string; customer_name: string; channel: string; source: string
  status: string; amount: number; created_at: string; service_id: string
  services: { name: string; icon: string; color: string } | null
  partners: { code: string; profiles: { name: string; color: string } | null } | null
}

type Service = { id: string; name: string; icon: string; color: string }

const COLS = [
  { key: 'received',    label: '受付' },
  { key: 'in_progress', label: '対応中' },
  { key: 'confirmed',   label: '成約・確定' },
  { key: 'paid',        label: '支払済' },
] as const

type Status = typeof COLS[number]['key']
const NEXT: Record<string, Status | null> = {
  received: 'in_progress', in_progress: 'confirmed', confirmed: 'paid', paid: null,
}
const PREV: Record<string, Status | null> = {
  received: null, in_progress: 'received', confirmed: 'in_progress', paid: 'confirmed',
}

export default function DealsPage() {
  const [deals, setDeals]           = useState<Deal[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Deal | null>(null)
  const [profile, setProfile]       = useState<{ name: string; color: string } | null>(null)
  const [pending, startTransition]  = useTransition()
  const [toast, setToast]           = useState('')
  const [filterSvc, setFilterSvc]   = useState('all')
  const [showAddDeal, setShowAddDeal] = useState(false)
  const [services, setServices]     = useState<Service[]>([])
  const dragItem = useRef<{ id: string; status: string } | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/console/deals').then(r => r.json()).then(d => {
      setDeals(d.deals)
      setProfile(d.profile)
      // Extract unique services from deals
      const svcMap = new Map<string, Service>()
      for (const deal of d.deals) {
        if (deal.services && !svcMap.has(deal.service_id)) {
          svcMap.set(deal.service_id, { id: deal.service_id, ...deal.services })
        }
      }
      setServices(Array.from(svcMap.values()))
    }).finally(() => setLoading(false))
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  function updateStatus(deal: Deal, newStatus: Status) {
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, status: newStatus } : d))
        if (selected?.id === deal.id) setSelected(d => d ? { ...d, status: newStatus } : d)
        showToast(`ステータスを「${COLS.find(c => c.key === newStatus)?.label}」に変更しました`)
      }
    })
  }

  function cancelDeal(deal: Deal) {
    if (!confirm(`「${deal.customer_name}」の案件を取り消しますか?`)) return
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeals(prev => prev.filter(d => d.id !== deal.id))
        setSelected(null)
        showToast('案件を取り消しました')
      }
    })
  }

  // D&D handlers
  function onDragStart(deal: Deal) {
    dragItem.current = { id: deal.id, status: deal.status }
  }
  function onDragOver(e: React.DragEvent, colKey: string) {
    e.preventDefault()
    setDragOverCol(colKey)
  }
  function onDragLeave(e: React.DragEvent) {
    // only clear if leaving the column entirely (not moving to a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null)
    }
  }
  function onDrop(e: React.DragEvent, targetStatus: Status) {
    e.preventDefault()
    setDragOverCol(null)
    const src = dragItem.current
    if (!src || src.status === targetStatus) return
    const deal = deals.find(d => d.id === src.id)
    if (!deal) return
    updateStatus(deal, targetStatus)
    dragItem.current = null
  }

  const filteredDeals = filterSvc === 'all'
    ? deals
    : deals.filter(d => d.service_id === filterSvc)

  if (loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--muted2)', fontSize: '.8rem' }}>読み込み中…</p>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900, flex: 1 }}>案件ボード</h1>

          {/* Service filter */}
          <select
            value={filterSvc}
            onChange={e => setFilterSvc(e.target.value)}
            style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontSize: '.76rem', background: '#fff', color: 'var(--txt)', cursor: 'pointer' }}
          >
            <option value="all">全サービス ({deals.length}件)</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({deals.filter(d => d.service_id === s.id).length}件)</option>
            ))}
          </select>

          <button
            onClick={() => setShowAddDeal(true)}
            className="btn btn-p" style={{ fontSize: '.76rem', padding: '8px 16px' }}
          >
            + 手動登録
          </button>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {COLS.map(col => {
              const colDeals = filteredDeals.filter(d => d.status === col.key)
              return (
                <div
                  key={col.key}
                  className={`col${dragOverCol === col.key ? ' over' : ''}`}
                  onDragOver={e => onDragOver(e, col.key)}
                  onDragLeave={onDragLeave}
                  onDrop={e => onDrop(e, col.key)}
                  style={{ background: '#F4F4F7', borderRadius: 13, padding: 10, minHeight: 140, transition: 'background .15s, outline .15s' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 10px', fontSize: '.7rem', fontWeight: 700, color: 'var(--muted2)' }}>
                    {col.label}
                    <span style={{ fontFamily: 'Inter', color: '#B9BAC4' }}>{colDeals.length}</span>
                  </div>
                  {colDeals.map(d => (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={() => onDragStart(d)}
                      onClick={() => setSelected(d)}
                      style={{
                        background: '#fff', border: '1px solid #EDEDF1', borderRadius: 11,
                        padding: 12, marginBottom: 8, cursor: 'grab',
                        boxShadow: selected?.id === d.id ? '0 0 0 2px var(--blue)' : undefined,
                        userSelect: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                        {d.services && <ServiceIcon icon={d.services.icon} color={d.services.color} size={26} />}
                        <b style={{ fontSize: '.74rem', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.customer_name}
                        </b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.6rem', color: 'var(--muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: d.channel === 'referral' ? 'var(--blue)' : 'var(--txt)', flexShrink: 0 }}/>
                          {d.channel === 'referral' ? '紹介' : d.channel === 'direct' ? '直販' : '協力'}
                        </span>
                        {d.amount > 0 && (
                          <span style={{ fontFamily: 'Inter', fontWeight: 700, color: 'var(--txt)', fontSize: '.66rem' }}>
                            ¥{d.amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {d.partners?.profiles && (
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 17, height: 17, borderRadius: '50%', background: d.partners.profiles.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.5rem', fontWeight: 700 }}>
                            {d.partners.profiles.name[0]}
                          </span>
                          <span style={{ fontSize: '.58rem', color: 'var(--muted2)' }}>{d.partners.profiles.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.25)', zIndex: 70 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, width: 460, maxWidth: '96vw', height: '100%', background: '#fff', borderLeft: '1px solid var(--line)', zIndex: 80, display: 'flex', flexDirection: 'column', boxShadow: '-18px 0 48px rgba(14,14,20,.1)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: '.9rem' }}>{selected.customer_name}</b>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div className="cascade" style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              {[
                ['サービス', selected.services?.name ?? selected.service_id],
                ['チャネル', selected.channel === 'referral' ? '紹介' : selected.channel === 'direct' ? '直販' : '協力'],
                ['ソース', selected.source],
                ['ステータス', COLS.find(c => c.key === selected.status)?.label ?? selected.status],
                ['報酬予定', selected.amount > 0 ? `¥${selected.amount.toLocaleString()}` : '未確定'],
                ['パートナー', selected.partners ? `${selected.partners.profiles?.name ?? ''} (${selected.partners.code})` : '—'],
                ['登録日', new Date(selected.created_at).toLocaleString('ja')],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: '.75rem', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted2)' }}>{k}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
                </div>
              ))}

              <div style={{ marginTop: 18 }}>
                <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 8 }}>ステータス変更</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {NEXT[selected.status] && (
                    <button onClick={() => updateStatus(selected, NEXT[selected.status]!)} disabled={pending} className="btn btn-p" style={{ fontSize: '.72rem', padding: '9px 14px' }}>
                      → {COLS.find(c => c.key === NEXT[selected.status])?.label}
                    </button>
                  )}
                  {PREV[selected.status] && (
                    <button onClick={() => updateStatus(selected, PREV[selected.status]!)} disabled={pending} className="btn btn-g" style={{ fontSize: '.72rem', padding: '9px 14px' }}>
                      ← {COLS.find(c => c.key === PREV[selected.status])?.label}
                    </button>
                  )}
                </div>
              </div>

              {selected.status !== 'paid' && (
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                  <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 8 }}>管理操作</p>
                  <button onClick={() => cancelDeal(selected)} disabled={pending} style={{ fontSize: '.7rem', color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                    案件を取り消し
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Manual deal drawer */}
      {showAddDeal && (
        <AddDealDrawer
          services={services}
          onClose={() => setShowAddDeal(false)}
          onAdded={(deal) => {
            setDeals(prev => [deal, ...prev])
            setShowAddDeal(false)
            showToast('案件を登録しました')
          }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--txt)', color: '#fff', padding: '12px 22px',
          borderRadius: 9, fontSize: '.74rem', fontWeight: 600, zIndex: 99, whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function AddDealDrawer({ services, onClose, onAdded }: {
  services: Service[]
  onClose: () => void
  onAdded: (deal: Deal) => void
}) {
  const [customerName, setCustomerName] = useState('')
  const [serviceId, setServiceId]       = useState(services[0]?.id ?? '')
  const [channel, setChannel]           = useState<'referral' | 'direct'>('direct')
  const [amount, setAmount]             = useState('')
  const [memo, setMemo]                 = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerName) { setError('お名前を入力してください'); return }
    if (!serviceId) { setError('サービスを選択してください'); return }
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/console/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          service_id: serviceId,
          channel,
          source: 'manual',
          status: 'received',
          amount: amount ? Number(amount) : 0,
          internal_memo: memo,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      onAdded(data.deal)
    } catch (err: any) {
      setError(err.message ?? '登録に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.25)', zIndex: 70 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, width: 460, maxWidth: '96vw', height: '100%', background: '#fff', borderLeft: '1px solid var(--line)', zIndex: 80, display: 'flex', flexDirection: 'column', boxShadow: '-18px 0 48px rgba(14,14,20,.1)', animation: 'slideIn .22s ease' }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: '.9rem' }}>案件を手動登録</b>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div className="fld">
            <label>顧客名 *</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" required />
          </div>
          <div className="fld">
            <label>サービス *</label>
            <select
              value={serviceId}
              onChange={e => setServiceId(e.target.value)}
              style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.9rem', background: '#fff' }}
            >
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="fld">
            <label>チャネル</label>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value as 'referral' | 'direct')}
              style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.9rem', background: '#fff' }}
            >
              <option value="direct">営業（直接）</option>
              <option value="referral">紹介</option>
            </select>
          </div>
          <div className="fld">
            <label>報酬額（任意）</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" />
          </div>
          <div className="fld">
            <label>内部メモ（任意）</label>
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="管理者のみ閲覧可能" />
          </div>
          {error && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
          <button type="submit" disabled={submitting} className="btn btn-p" style={{ width: '100%', marginTop: 8 }}>
            {submitting ? '登録中...' : '案件を登録する'}
          </button>
        </form>
      </div>
    </>
  )
}
