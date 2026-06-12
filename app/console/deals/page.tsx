'use client'
import { useEffect, useState, useTransition } from 'react'
import ServiceIcon from '@/components/ServiceIcon'
import ConsoleNav from '@/components/ConsoleNav'

type Deal = {
  id: string; customer_name: string; channel: string; source: string
  status: string; amount: number; created_at: string; service_id: string
  services: { name: string; icon: string; color: string } | null
  partners: { code: string; profiles: { name: string; color: string } | null } | null
}

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

  useEffect(() => {
    fetch('/api/console/deals').then(r => r.json()).then(d => { setDeals(d.deals); setProfile(d.profile) }).finally(() => setLoading(false))
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
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setDeals(prev => prev.filter(d => d.id !== deal.id))
        setSelected(null)
        showToast('案件を取り消しました')
      }
    })
  }

  if (loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName="管理者" profileColor="#0E0E14" />
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
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>案件ボード</h1>
          <span style={{ fontSize: '.72rem', color: 'var(--muted2)' }}>{deals.length}件</span>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {COLS.map(col => {
              const colDeals = deals.filter(d => d.status === col.key)
              return (
                <div key={col.key} style={{ background: '#F4F4F7', borderRadius: 13, padding: 10, minHeight: 140 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 10px', fontSize: '.7rem', fontWeight: 700, color: 'var(--muted2)' }}>
                    {col.label}
                    <span style={{ fontFamily: 'Inter', color: '#B9BAC4' }}>{colDeals.length}</span>
                  </div>
                  {colDeals.map(d => (
                    <div key={d.id}
                      onClick={() => setSelected(d)}
                      style={{
                        background: '#fff', border: '1px solid #EDEDF1', borderRadius: 11,
                        padding: 12, marginBottom: 8, cursor: 'pointer',
                        boxShadow: selected?.id === d.id ? '0 0 0 2px var(--blue)' : undefined,
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                        {d.services && <ServiceIcon icon={d.services.icon} color={d.services.color} size={26} />}
                        <b style={{ fontSize: '.74rem', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.customer_name}
                        </b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.6rem', color: 'var(--muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: d.channel === 'referral' ? 'var(--blue)' : 'var(--txt)', flexShrink: 0 }}/>
                          {d.channel === 'referral' ? '紹介' : '営業'}
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
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.25)', zIndex: 70, opacity: 1 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, width: 460, maxWidth: '96vw', height: '100%', background: '#fff', borderLeft: '1px solid var(--line)', zIndex: 80, display: 'flex', flexDirection: 'column', boxShadow: '-18px 0 48px rgba(14,14,20,.1)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: '.9rem' }}>{selected.customer_name}</b>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              {[
                ['サービス', selected.services?.name ?? selected.service_id],
                ['チャネル', selected.channel === 'referral' ? '紹介' : '営業'],
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

              {/* Status actions */}
              <div style={{ marginTop: 18 }}>
                <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 8 }}>ステータス変更</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {NEXT[selected.status] && (
                    <button
                      onClick={() => updateStatus(selected, NEXT[selected.status]!)}
                      disabled={pending}
                      className="btn btn-p" style={{ fontSize: '.72rem', padding: '9px 14px' }}>
                      → {COLS.find(c => c.key === NEXT[selected.status])?.label}
                    </button>
                  )}
                  {PREV[selected.status] && (
                    <button
                      onClick={() => updateStatus(selected, PREV[selected.status]!)}
                      disabled={pending}
                      className="btn btn-g" style={{ fontSize: '.72rem', padding: '9px 14px' }}>
                      ← {COLS.find(c => c.key === PREV[selected.status])?.label}
                    </button>
                  )}
                </div>
              </div>

              {/* Cancel */}
              {selected.status !== 'paid' && (
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                  <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 8 }}>管理操作</p>
                  <button
                    onClick={() => cancelDeal(selected)}
                    disabled={pending}
                    style={{ fontSize: '.7rem', color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                    案件を取り消し
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Toast */}
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
