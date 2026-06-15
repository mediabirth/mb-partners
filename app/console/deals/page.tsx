'use client'
import { useEffect, useState, useTransition, useRef } from 'react'
import ServiceIcon from '@/components/ServiceIcon'
import ConsoleNav from '@/components/ConsoleNav'

function channelChip(channel: string) {
  if (channel === 'referral') return { cls: 'chip chip-referral', label: '紹介' }
  if (channel === 'direct')   return { cls: 'chip chip-direct',   label: '直販' }
  return { cls: 'chip chip-cooperation', label: '協力' }
}

type Deal = {
  id: string; customer_name: string; channel: string; source: string
  status: string; amount: number; base_amount: number | null; created_at: string; service_id: string
  reward_snapshot: { ref_type?: string; ref_value?: number; ref_base?: string } | null
  service_menus: { coop_enabled?: boolean | null; coop_type?: string | null; coop_value?: number | null; coop_base?: string | null } | null
  services: { name: string; icon: string; color: string } | null
  partners: { code: string; profiles: { name: string; color: string } | null } | null
}

type Service = { id: string; name: string; icon: string; color: string }

// ⑧ Determine whether a deal's reward is %-based (needs a real-amount base).
// cooperation → selected menu's coop_* (fixed = no base)。協力dealはmenu_idバックフィル済でメニュー一本化。
function rateInfo(d: Deal): { isRate: boolean; rate: number | null; baseLabel: string } {
  if (d.channel === 'cooperation') {
    const m = d.service_menus
    if (m?.coop_enabled) {
      if (m.coop_type === 'fixed') return { isRate: false, rate: null, baseLabel: m.coop_base ?? '売上' }
      return { isRate: true, rate: Number(m.coop_value ?? 0), baseLabel: m.coop_base ?? '売上' }
    }
    return { isRate: false, rate: null, baseLabel: '売上' }
  }
  if (d.reward_snapshot?.ref_type === 'rate') {
    return { isRate: true, rate: Number(d.reward_snapshot.ref_value), baseLabel: d.reward_snapshot.ref_base ?? '売上' }
  }
  return { isRate: false, rate: null, baseLabel: '売上' }
}
function needsBase(d: Deal): boolean {
  return rateInfo(d).isRate && (d.base_amount == null)
}

const COLS = [
  { key: 'received',    label: '受付',       accent: 'var(--amber)', accentBg: 'var(--amber-bg)' },
  { key: 'in_progress', label: '対応中',     accent: 'var(--blue)',  accentBg: 'var(--blue-bg)' },
  { key: 'confirmed',   label: '成約・確定', accent: 'var(--green)', accentBg: 'var(--green-bg)' },
  { key: 'paid',        label: '支払済',     accent: 'var(--muted2)', accentBg: 'var(--bg2)' },
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
  const [services, setServices]     = useState<Service[]>([])
  const dragItem = useRef<{ id: string; status: string } | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  // ② base-amount entry on confirming a rate-based deal
  const [baseModal, setBaseModal] = useState<{ deal: Deal; rate: number; baseLabel: string } | null>(null)
  const [baseInput, setBaseInput] = useState('')
  // ① edit 実績金額 from the detail panel (any status)
  const [editingBase, setEditingBase] = useState(false)
  const [baseEdit, setBaseEdit] = useState('')

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
    // ② Confirming a rate-based deal without a recorded base → ask for the actual amount first.
    if (newStatus === 'confirmed' && needsBase(deal)) {
      const ri = rateInfo(deal)
      setBaseInput('')
      setBaseModal({ deal, rate: ri.rate as number, baseLabel: ri.baseLabel })
      return
    }
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, status: newStatus } : d))
        if (selected?.id === deal.id) setSelected(d => d ? { ...d, status: newStatus } : d)
        showToast(`ステータスを「${COLS.find(c => c.key === newStatus)?.label}」に変更しました`)
      } else if (data?.needsBase) {
        // Fallback: server says base required (e.g. stale client data)
        setBaseInput('')
        setBaseModal({ deal, rate: Number(data.rate), baseLabel: data.baseLabel ?? '売上' })
      } else {
        showToast(data?.error ?? '更新に失敗しました')
      }
    })
  }

  function confirmWithBase() {
    if (!baseModal) return
    const base = Number(baseInput.replace(/[,，\s]/g, ''))
    if (!base || Number.isNaN(base) || base <= 0) { showToast('実額を正しく入力してください'); return }
    const { deal, rate } = baseModal
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed', base_amount: base }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const computed = Math.round(base * rate / 100)
        setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, status: 'confirmed', base_amount: base, amount: computed } : d))
        if (selected?.id === deal.id) setSelected(d => d ? { ...d, status: 'confirmed', base_amount: base, amount: computed } : d)
        setBaseModal(null)
        showToast(`成約確定：報酬 ¥${computed.toLocaleString()}`)
      } else {
        showToast(data?.error ?? '確定に失敗しました')
      }
    })
  }

  // ① Save/edit the actual amount (base) from the detail panel — reward recomputes.
  function saveBase() {
    if (!selected) return
    const ri = rateInfo(selected)
    const base = Number(baseEdit.replace(/[,，\s]/g, ''))
    if (!base || Number.isNaN(base) || base <= 0) { showToast('実額を正しく入力してください'); return }
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_amount: base }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const computed = Math.round(base * (ri.rate as number) / 100)
        setDeals(prev => prev.map(d => d.id === selected.id ? { ...d, base_amount: base, amount: computed } : d))
        setSelected(s => s ? { ...s, base_amount: base, amount: computed } : s)
        setEditingBase(false)
        showToast(`実績金額を保存：報酬 ¥${computed.toLocaleString()}`)
      } else {
        showToast(data?.error ?? '保存に失敗しました')
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
      <ConsoleNav />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ flex: 1 }}>
            <p className="eyebrow" style={{ marginBottom: 2 }}>案件管理</p>
            <h1 style={{ fontSize: '1rem', fontWeight: 900, lineHeight: 1 }}>案件ボード</h1>
          </div>

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
        </div>

        <div style={{ padding: '28px 32px' }}>
          <div className="page-anim ckanban" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 22, alignItems: 'start' }}>
            {COLS.map((col, ci) => {
              const colDeals = filteredDeals.filter(d => d.status === col.key)
              return (
                <div
                  key={col.key}
                  className={`col${dragOverCol === col.key ? ' over' : ''}`}
                  onDragOver={e => onDragOver(e, col.key)}
                  onDragLeave={onDragLeave}
                  onDrop={e => onDrop(e, col.key)}
                  style={{
                    background: 'var(--bg2)', borderRadius: 16, padding: 14, minHeight: 200,
                    border: '1px solid var(--line)',
                    transition: 'background .15s, outline .15s',
                  }}
                >
                  {/* Column header — neutral (no colored accent border/dot) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '4px 4px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{col.label}</span>
                      {ci < COLS.length - 1 && (
                        <span aria-hidden style={{ color: 'var(--muted)', fontSize: '.7rem', marginLeft: 2 }}>→</span>
                      )}
                    </div>
                    <span
                      className="tnum"
                      style={{
                        fontFamily: 'Inter', fontSize: '.66rem', fontWeight: 800,
                        color: 'var(--muted2)', background: '#fff', border: '1px solid var(--line)',
                        borderRadius: 999, padding: '2px 9px', minWidth: 24, textAlign: 'center', flexShrink: 0,
                      }}
                    >
                      {colDeals.length}
                    </span>
                  </div>

                  {colDeals.length === 0 && (
                    <div style={{ padding: '22px 8px', textAlign: 'center', fontSize: '.62rem', color: 'var(--muted)', border: '1.5px dashed var(--line)', borderRadius: 12, background: '#fff' }}>
                      案件なし
                    </div>
                  )}

                  {colDeals.map(d => (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={() => onDragStart(d)}
                      onClick={() => setSelected(d)}
                      className="card-hover"
                      style={{
                        background: '#fff', border: '1px solid #EDEDF1', borderRadius: 13,
                        padding: 14, marginBottom: 10, cursor: 'grab',
                        boxShadow: selected?.id === d.id ? '0 0 0 2px var(--blue)' : undefined,
                        userSelect: 'none',
                      }}
                    >
                      {/* Service + customer */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                        {d.services && <ServiceIcon icon={d.services.icon} color={d.services.color} size={28} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <b style={{ display: 'block', fontSize: '.76rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {d.customer_name}
                          </b>
                          {d.services && (
                            <span style={{ display: 'block', fontSize: '.58rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {d.services.name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Channel + amount / base-needed hint */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span className={channelChip(d.channel).cls}>{channelChip(d.channel).label}</span>
                        {needsBase(d) ? (
                          <span className="chip" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>要・実額入力</span>
                        ) : d.amount > 0 ? (
                          <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, color: 'var(--txt)', fontSize: '.72rem' }}>
                            ¥{d.amount.toLocaleString()}
                          </span>
                        ) : null}
                      </div>

                      {/* Partner */}
                      {d.partners?.profiles && (
                        <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: d.partners.profiles.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.52rem', fontWeight: 700, flexShrink: 0 }}>
                            {d.partners.profiles.name[0]}
                          </span>
                          <span style={{ fontSize: '.6rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.partners.profiles.name}</span>
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

              {/* ① 実績金額（率案件）— 常時表示・編集 */}
              {rateInfo(selected).isRate && (
                <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--bg2)', borderRadius: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700 }}>実績金額（{rateInfo(selected).baseLabel}）</p>
                      <p style={{ fontSize: '.88rem', fontWeight: 800, fontFamily: 'Inter', marginTop: 3 }}>
                        {selected.base_amount != null
                          ? `¥${selected.base_amount.toLocaleString()}`
                          : <span style={{ color: 'var(--amber)', fontSize: '.74rem' }}>未入力</span>}
                      </p>
                      <p style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 3 }}>
                        × {rateInfo(selected).rate}% = 報酬 {selected.amount > 0 ? `¥${selected.amount.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    {!editingBase && (
                      <button onClick={() => { setEditingBase(true); setBaseEdit(selected.base_amount?.toString() ?? '') }} className="btn btn-g" style={{ fontSize: '.7rem', padding: '7px 12px', flexShrink: 0 }}>
                        {selected.base_amount != null ? '金額を編集' : '金額を入力'}
                      </button>
                    )}
                  </div>
                  {editingBase && (
                    <div style={{ marginTop: 12 }}>
                      <input
                        autoFocus inputMode="numeric"
                        value={baseEdit}
                        onChange={e => setBaseEdit(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveBase() }}
                        placeholder={`${rateInfo(selected).baseLabel}の実額（例: 300000）`}
                        style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontFamily: 'Inter', fontSize: '.85rem' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0', fontSize: '.72rem' }}>
                        <span style={{ color: 'var(--muted2)' }}>確定報酬（{rateInfo(selected).rate}%）</span>
                        <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--blue)' }}>
                          {(() => { const bv = Number(baseEdit.replace(/[,，\s]/g, '')); return bv > 0 ? `¥${Math.round(bv * (rateInfo(selected).rate as number) / 100).toLocaleString()}` : '—' })()}
                        </b>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditingBase(false)} className="btn btn-g" style={{ fontSize: '.7rem', padding: '7px 12px' }}>キャンセル</button>
                        <button onClick={saveBase} disabled={pending} className="btn btn-p" style={{ fontSize: '.7rem', padding: '7px 14px' }}>保存</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

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

      {/* ② Base-amount entry modal (rate-based confirmation) */}
      {baseModal && (() => {
        const base = Number(baseInput.replace(/[,，\s]/g, ''))
        const preview = base && !Number.isNaN(base) && base > 0 ? Math.round(base * baseModal.rate / 100) : null
        return (
          <>
            <div onClick={() => setBaseModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
            <div className="page-anim" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, maxWidth: '92vw', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
              <b style={{ fontSize: '.92rem', display: 'block' }}>成約確定 — 実額の入力</b>
              <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.6 }}>
                {baseModal.deal.customer_name}（報酬 {baseModal.rate}% × {baseModal.baseLabel}）。{baseModal.baseLabel}の実額を入力してください。
              </p>
              <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', margin: '16px 0 6px' }}>{baseModal.baseLabel}（円）</label>
              <input
                autoFocus
                inputMode="numeric"
                value={baseInput}
                onChange={e => setBaseInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmWithBase() }}
                placeholder="例: 300000"
                style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'Inter', fontSize: '.9rem' }}
              />
              <div style={{ marginTop: 12, padding: '11px 14px', background: 'var(--blue-bg2)', borderRadius: 10, fontSize: '.74rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--muted2)' }}>確定報酬（{baseModal.rate}%）</span>
                <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--blue)', fontSize: '.95rem' }}>{preview != null ? `¥${preview.toLocaleString()}` : '—'}</b>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                <button onClick={() => setBaseModal(null)} className="btn btn-g" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
                <button onClick={confirmWithBase} disabled={pending || preview == null} className="btn btn-p" style={{ fontSize: '.74rem', padding: '9px 18px' }}>成約確定する</button>
              </div>
            </div>
          </>
        )
      })()}

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
