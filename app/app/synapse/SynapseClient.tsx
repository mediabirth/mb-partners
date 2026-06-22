'use client'
import { useState, useEffect, useMemo } from 'react'

// SYNAPSE 再構成：まず“自分専用CRM”。紹介履歴(read-only)＋私的台帳(synapse_contacts)を1リストにマージ。
// その上に 分析サマリー／SYNAPSEからの問いかけ／次の一手（紹介文を作る）。AIヒアリングは“追加”の補助に降格。
// ★紹介履歴は read-only（page で getPartnerWithDeals）。保存/更新/削除は synapse_contacts のみ（本人スコープAPI）。お金/帰属/通知は非接触。

export type SynapseContact = {
  id: string
  name: string | null; company: string | null; industry: string | null; role: string | null
  relationship: string | null; needs: string | null; notes: string | null
  suggested_service: string | null; suggested_angle: string | null
  acted_at: string | null; enriched_at: string | null
  source: string; created_at: string; updated_at: string
}
export type ReferredEntry = {
  id: string; name: string; company: string | null; service: string | null
  status: string; statusKey: string; amount: number | null; date: string
}

type DraftFields = { name: string | null; company: string | null; industry: string | null; role: string | null; relationship: string | null; needs: string | null; notes: string | null }
type Reading = { service: string; why: string; angle: string }
type ThreadMsg =
  | { role: 'user'; text: string }
  | { role: 'synapse'; reply: string; reading: Reading | null; crossRef: string | null; question: string | null; draft: DraftFields | null; savedId?: string }
type Nudge = { id: string; kind: 'followup' | 'dormant' | 'seed'; title: string; body: string; contactId: string | null; contactName: string | null }

type Editing = { id?: string; source: string; name: string; company: string; industry: string; role: string; relationship: string; needs: string; notes: string; suggested_service: string; suggested_angle: string }
const EMPTY: Editing = { source: 'manual', name: '', company: '', industry: '', role: '', relationship: '', needs: '', notes: '', suggested_service: '', suggested_angle: '' }
const toEditing = (c: SynapseContact): Editing => ({ id: c.id, source: c.source, name: c.name ?? '', company: c.company ?? '', industry: c.industry ?? '', role: c.role ?? '', relationship: c.relationship ?? '', needs: c.needs ?? '', notes: c.notes ?? '', suggested_service: c.suggested_service ?? '', suggested_angle: c.suggested_angle ?? '' })

const STATUS_TONE: Record<string, { c: string; bg: string }> = {
  進行: { c: 'var(--blue)', bg: 'var(--blue-bg)' }, 成約: { c: 'var(--green)', bg: 'var(--green-bg)' }, 支払済: { c: 'var(--muted2)', bg: 'var(--bg2)' },
}
const NUDGE_META: Record<string, { label: string; color: string }> = {
  followup: { label: 'フォロー', color: 'var(--blue)' }, dormant: { label: 'まだ動ける', color: 'var(--amber)' }, seed: { label: '新しい種', color: 'var(--green)' },
}
const oneLine: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

export default function SynapseClient({ initialContacts, referred, aiEnabled }: { initialContacts: SynapseContact[]; referred: ReferredEntry[]; aiEnabled: boolean }) {
  const [prospects, setProspects] = useState<SynapseContact[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'referred' | 'prospect'>('all')
  // 会話（降格・「会った人を追加」内）
  const [showAdd, setShowAdd] = useState(false)
  const [thread, setThread] = useState<ThreadMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [threadErr, setThreadErr] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [editErr, setEditErr] = useState(''); const [editBusy, setEditBusy] = useState(false)
  const [intro, setIntro] = useState<{ text: string } | null>(null); const [introBusy, setIntroBusy] = useState(false)
  const [nudges, setNudges] = useState<Nudge[]>([]); const [nudgesOpen, setNudgesOpen] = useState(false)
  const [enrichBusy, setEnrichBusy] = useState(false); const [enrichErr, setEnrichErr] = useState('')
  const [dormantOnly, setDormantOnly] = useState(false)

  // 未読み＝困りごとあり・読み未設定・未処理。読みの自動付与の対象。
  const unreadCount = useMemo(() => prospects.filter(c => c.needs && !c.suggested_service && !c.enriched_at).length, [prospects])

  // T1：読みの自動付与（会話不要・一括）。生成済みはキャッシュ＝再実行で対象外。
  async function runEnrich() {
    if (enrichBusy) return
    setEnrichBusy(true); setEnrichErr('')
    try {
      const res = await fetch('/api/synapse/enrich', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setEnrichErr('読みの自動付与は現在ご利用いただけません。'); return }
      if (!res.ok) { setEnrichErr(j?.error || '生成に失敗しました'); return }
      const updated = (j.updated ?? []) as SynapseContact[]
      if (updated.length) {
        const byId = Object.fromEntries(updated.map(u => [u.id, u]))
        setProspects(prev => prev.map(c => byId[c.id] ?? c))
      }
    } catch { setEnrichErr('通信に失敗しました') } finally { setEnrichBusy(false) }
  }

  useEffect(() => {
    if (!aiEnabled) return
    let alive = true
    fetch('/api/synapse/nudges').then(r => r.ok ? r.json() : { nudges: [] }).then(j => { if (alive) setNudges(Array.isArray(j.nudges) ? j.nudges : []) }).catch(() => {})
    return () => { alive = false }
  }, [aiEnabled])

  // ── 分析サマリー（軽量・一目） ──
  const summary = useMemo(() => {
    const ind: Record<string, number> = {}
    for (const c of prospects) if (c.industry) ind[c.industry] = (ind[c.industry] ?? 0) + 1
    for (const r of referred) if (r.service) ind[r.service] = (ind[r.service] ?? 0) + 1
    const topInd = Object.entries(ind).sort((a, b) => b[1] - a[1])[0] ?? null
    const dormant = prospects.filter(c => c.needs && !c.acted_at).length
    return { referred: referred.length, prospect: prospects.length, topInd, dormant }
  }, [prospects, referred])

  // T2「今日の一手」：読みあり×未行動×新しい順 の上位3件（決定的選定）。空なら非表示。
  const todaysMoves = useMemo(() =>
    prospects.filter(c => c.suggested_service && !c.acted_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3),
    [prospects])

  // ── 統合リスト（紹介済み＋見込み）→ 絞り込み・検索・新しい順 ──
  type Entry = { key: string; kind: 'referred' | 'prospect'; name: string; company: string | null; date: string; ref?: ReferredEntry; c?: SynapseContact }
  const entries = useMemo(() => {
    const ref: Entry[] = referred.map(r => ({ key: 'd' + r.id, kind: 'referred', name: r.name, company: r.company, date: r.date, ref: r }))
    const pro: Entry[] = prospects.map(c => ({ key: 'c' + c.id, kind: 'prospect', name: c.name ?? c.company ?? '名称未設定', company: c.company, date: c.created_at, c }))
    let list = filter === 'referred' ? ref : filter === 'prospect' ? pro : [...ref, ...pro]
    // T3：動いていない（困りごとあり×未行動）だけに絞る。
    if (dormantOnly) list = list.filter(e => e.kind === 'prospect' && e.c!.needs && !e.c!.acted_at)
    const q = search.trim()
    if (q) list = list.filter(e => (`${e.name} ${e.company ?? ''} ${e.c?.industry ?? ''} ${e.ref?.service ?? ''}`).includes(q))
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [referred, prospects, filter, search, dormantOnly])

  // ── 操作（synapse_contacts のみ・本人スコープAPI） ──
  async function send() {
    const text = input.trim(); if (!text) { setThreadErr('話す内容を入力してください'); return }
    const next: ThreadMsg[] = [...thread, { role: 'user', text }]
    setThread(next); setInput(''); setBusy(true); setThreadErr('')
    try {
      const messages = next.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.role === 'user' ? m.text : m.reply }))
      const res = await fetch('/api/synapse/intake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setThreadErr('SYNAPSEは現在ご利用いただけません。手入力で追加できます。'); return }
      if (!res.ok) { setThreadErr(j?.error || '応答に失敗しました'); return }
      setThread([...next, { role: 'synapse', reply: j.reply ?? '', reading: j.reading ?? null, crossRef: j.crossRef ?? null, question: j.question ?? null, draft: j.draft ?? null }])
    } catch { setThreadErr('通信に失敗しました') } finally { setBusy(false) }
  }
  async function saveFromThread(idx: number) {
    const m = thread[idx]; if (m.role !== 'synapse' || !m.draft) return
    const payload = { ...m.draft, source: 'interview', suggested_service: m.reading?.service ?? '', suggested_angle: m.reading?.angle ?? '' }
    try {
      const res = await fetch('/api/synapse/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({})); if (!res.ok) { setThreadErr(j?.error || '保存に失敗しました'); return }
      setProspects(prev => [j.contact as SynapseContact, ...prev])
      setThread(prev => prev.map((x, i) => i === idx && x.role === 'synapse' ? { ...x, savedId: (j.contact as SynapseContact).id } : x))
    } catch { setThreadErr('保存に失敗しました') }
  }
  async function markActed(id: string) {
    try {
      const res = await fetch(`/api/synapse/contacts/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acted: true }) })
      const j = await res.json().catch(() => ({})); if (res.ok && j.contact) setProspects(prev => prev.map(c => c.id === id ? j.contact : c))
    } catch { /* noop */ }
  }
  async function makeIntro(contact: string, need: string, service: string, contactId?: string) {
    if (contactId) markActed(contactId)
    setIntroBusy(true); setIntro({ text: '' })
    try {
      const res = await fetch('/api/ai/draft-intro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contact, need, service, tone: '丁寧' }) })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setIntro({ text: '【現在ご利用いただけません】手入力で文面をご用意ください。' }); return }
      if (!res.ok) { setIntro({ text: j?.error || '生成に失敗しました' }); return }
      setIntro({ text: j.draft || '生成できませんでした' })
    } catch { setIntro({ text: '通信に失敗しました' }) } finally { setIntroBusy(false) }
  }
  async function saveManual() {
    if (!editing) return
    const payload = { name: editing.name, company: editing.company, industry: editing.industry, role: editing.role, relationship: editing.relationship, needs: editing.needs, notes: editing.notes, suggested_service: editing.suggested_service, suggested_angle: editing.suggested_angle, source: editing.source }
    if (!Object.entries(payload).some(([k, v]) => k !== 'source' && (v ?? '').trim())) { setEditErr('内容を入力してください'); return }
    setEditBusy(true); setEditErr('')
    try {
      const url = editing.id ? `/api/synapse/contacts/${editing.id}` : '/api/synapse/contacts'
      const res = await fetch(url, { method: editing.id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({})); if (!res.ok) { setEditErr(j?.error || '保存に失敗しました'); return }
      const saved = j.contact as SynapseContact
      setProspects(prev => editing.id ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev]); setEditing(null)
    } catch { setEditErr('保存に失敗しました') } finally { setEditBusy(false) }
  }
  async function remove(id: string) {
    if (!confirm('この見込みを削除しますか？')) return
    try { const res = await fetch(`/api/synapse/contacts/${id}`, { method: 'DELETE' }); if (res.ok) setProspects(prev => prev.filter(c => c.id !== id)) } catch { /* noop */ }
  }
  function preloadNudge(n: Nudge) {
    setShowAdd(true); setThread([{ role: 'synapse', reply: n.body, reading: null, crossRef: null, question: null, draft: null }]); setThreadErr(''); setInput('')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const efld = (label: string, key: keyof Editing, placeholder = '', textarea = false) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 4 }}>{label}</label>
      {textarea
        ? <textarea value={editing![key] as string} onChange={e => setEditing(d => d ? { ...d, [key]: e.target.value } : d)} rows={2} placeholder={placeholder} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem', resize: 'vertical' }} />
        : <input value={editing![key] as string} onChange={e => setEditing(d => d ? { ...d, [key]: e.target.value } : d)} placeholder={placeholder} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem' }} />}
    </div>
  )

  return (
    <div style={{ padding: '8px 0 24px' }}>
      {/* ── T2「今日の一手」：読みのある見込みの上位を ready-to-act で（開いて5秒で次の動き） ── */}
      {todaysMoves.length > 0 && (
        <div style={{ padding: '8px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 2px 8px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2"><path d="M13 2L3 14h7l-1 8 10-12h-7z" strokeLinejoin="round" /></svg>
            <h2 className="ty-h2" style={{ margin: 0 }}>今日の一手</h2>
          </div>
          {todaysMoves.map(c => (
            <div key={c.id} style={{ background: 'var(--blue-bg2)', border: '1.5px solid var(--blue-bg)', borderRadius: 13, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--txt)', lineHeight: 1.4, ...oneLine }}>{c.needs || c.name || '相手'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.58rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 6, padding: '2px 8px' }}>{c.suggested_service}</span>
                {c.suggested_angle && <span style={{ flex: 1, minWidth: 0, fontSize: '.62rem', color: 'var(--blue-dk)', fontWeight: 600, ...oneLine }}>{c.suggested_angle}</span>}
              </div>
              <button onClick={() => makeIntro(c.company || c.name || '相手の方', c.needs || '', c.suggested_service!, c.id)} className="btn btn-p lift" style={{ width: '100%', marginTop: 9, padding: '9px' }}>紹介文を作る</button>
            </div>
          ))}
        </div>
      )}

      {/* ── T1：読みの自動付与トリガ（未読みがある時だけ・1つ） ── */}
      {unreadCount > 0 && (
        <div style={{ padding: '14px 20px 0' }}>
          <button onClick={runEnrich} disabled={enrichBusy} className="lift" style={{ width: '100%', background: '#fff', border: '1.5px solid var(--blue)', borderRadius: 12, padding: '12px', cursor: enrichBusy ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '.76rem', fontWeight: 800, color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {enrichBusy ? 'SYNAPSEが読みを出しています…' : <>未読みの見込み <b style={{ fontFamily: 'Inter' }}>{unreadCount}</b> 件に読みを出す →</>}
          </button>
          {enrichErr && <p style={{ fontSize: '.64rem', color: 'var(--red)', margin: '7px 0 0' }}>{enrichErr}</p>}
        </div>
      )}

      {/* ── 分析サマリー（軽量・一目） ── */}
      <div style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ l: '紹介済み', v: `${summary.referred}件`, c: 'var(--green)', act: false }, { l: '見込み', v: `${summary.prospect}件`, c: 'var(--blue)', act: false }, { l: '動いていない', v: `${summary.dormant}件`, c: 'var(--amber)', act: true }].map(s => {
            // T3：動いていない→該当でフィルタ（行き止まりにしない）。
            const onClick = s.act ? () => { setDormantOnly(v => !v); setFilter('prospect'); setSearch(''); if (typeof window !== 'undefined') window.scrollTo({ top: 9999, behavior: 'smooth' }) } : undefined
            const active = s.act && dormantOnly
            return (
              <button key={s.l} onClick={onClick} disabled={!s.act} className={s.act ? 'lift' : undefined} style={{ flex: 1, background: active ? 'var(--amber-bg)' : '#fff', border: `1px solid ${active ? 'var(--amber)' : 'var(--line)'}`, borderRadius: 12, padding: '10px 10px', textAlign: 'center', cursor: s.act ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                <div style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 800, color: s.c, letterSpacing: '-.02em' }}>{s.v}</div>
                <div style={{ fontSize: '.54rem', color: 'var(--muted2)', fontWeight: 600, marginTop: 1 }}>{s.l}{s.act && summary.dormant > 0 ? (active ? ' ✓' : ' →') : ''}</div>
              </button>
            )
          })}
        </div>
        {summary.topInd && <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 7, paddingLeft: 2 }}>多い領域：<b style={{ color: 'var(--txt)' }}>{summary.topInd[0]}</b>（{summary.topInd[1]}件）</div>}
      </div>

      {/* ── SYNAPSEからの問いかけ（1行フック・畳む） ── */}
      {nudges.length > 0 && (
        <div style={{ padding: '14px 20px 0' }}>
          {(nudgesOpen ? nudges : nudges.slice(0, 1)).map(n => {
            const meta = NUDGE_META[n.kind] ?? NUDGE_META.seed
            return (
              <button key={n.id} onClick={() => preloadNudge(n)} className="row-hover lift" style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--txt)', marginBottom: 7 }}>
                <span style={{ fontSize: '.48rem', fontWeight: 800, color: '#fff', background: meta.color, borderRadius: 5, padding: '2px 6px', flexShrink: 0 }}>{meta.label}</span>
                <span style={{ flex: 1, fontSize: '.68rem', fontWeight: 600, ...oneLine }}>{n.body}</span>
                <span style={{ color: 'var(--blue)', fontSize: '.7rem', flexShrink: 0 }}>›</span>
              </button>
            )
          })}
          {nudges.length > 1 && <button onClick={() => setNudgesOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '.62rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 2px' }}>{nudgesOpen ? '閉じる' : `ほか${nudges.length - 1}件の問いかけ`}</button>}
        </div>
      )}

      {/* ── 会った人を追加（AIヒアリング/手入力＝控えめ導線） ── */}
      <div style={{ padding: '14px 20px 0' }}>
        {!showAdd ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {aiEnabled && <button onClick={() => setShowAdd(true)} className="lift" style={{ flex: 1, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 12, padding: '11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700, color: 'var(--blue-dk)' }}>＋ 会った人を追加（SYNAPSEに話す）</button>}
            <button onClick={() => { setEditing({ ...EMPTY }); setEditErr('') }} className="lift" style={{ flex: aiEnabled ? '0 0 auto' : 1, background: '#fff', border: '1px dashed var(--line)', borderRadius: 12, padding: '11px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700, color: 'var(--muted)' }}>手入力</button>
          </div>
        ) : (
          <div style={{ background: 'var(--blue-bg2)', border: '1.5px solid var(--blue-bg)', borderRadius: 14, padding: '14px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <b style={{ fontSize: '.8rem', color: 'var(--blue-dk)' }}>SYNAPSEに話す</b>
              <button onClick={() => { setShowAdd(false); setThread([]); setThreadErr('') }} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.62rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
            </div>
            {thread.length === 0 && <p style={{ fontSize: '.62rem', color: '#52529E', margin: '0 0 9px', lineHeight: 1.6 }}>会った方のことを話すと、合いそうなMBサービスと切り口を返します。</p>}
            {thread.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '2px 0 9px' }}>
                {thread.map((m, i) => m.role === 'user' ? (
                  <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '88%', background: 'var(--blue)', color: '#fff', borderRadius: 12, padding: '8px 12px', fontSize: '.72rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                ) : (
                  <div key={i} style={{ alignSelf: 'flex-start', width: '100%' }}>
                    <div style={{ background: '#fff', border: '1px solid var(--blue-bg)', borderRadius: 12, padding: '9px 12px', fontSize: '.72rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.reply}</div>
                    {m.reading && (
                      <div style={{ marginTop: 7, background: '#fff', border: '1px solid var(--blue-bg)', borderRadius: 10, padding: '8px 11px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><span style={{ fontSize: '.5rem', fontWeight: 800, color: 'var(--blue)' }}>読み</span><span style={{ fontSize: '.6rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 6, padding: '1px 7px' }}>{m.reading.service}</span></div>
                        {m.reading.angle && <div style={{ fontSize: '.64rem', color: 'var(--blue-dk)', fontWeight: 700, lineHeight: 1.5 }}>切り口：{m.reading.angle}</div>}
                      </div>
                    )}
                    {m.crossRef && <div style={{ marginTop: 5, fontSize: '.6rem', color: 'var(--muted2)', lineHeight: 1.5 }}>🔗 {m.crossRef}</div>}
                    {(m.reading || m.draft) && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                        {m.reading && <button onClick={() => makeIntro(m.draft?.company || m.draft?.name || '相手の方', m.draft?.needs || '', m.reading!.service)} className="lift" style={{ fontSize: '.64rem', fontWeight: 700, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>紹介文を作る</button>}
                        {m.draft && (m.savedId ? <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--green)', alignSelf: 'center' }}>✓ 保存しました</span> : <button onClick={() => saveFromThread(i)} className="lift" style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--blue)', background: '#fff', border: '1px solid var(--blue)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>台帳に保存</button>)}
                      </div>
                    )}
                  </div>
                ))}
                {busy && <div style={{ alignSelf: 'flex-start', fontSize: '.62rem', color: 'var(--muted2)' }}>SYNAPSEが考えています…</div>}
              </div>
            )}
            <textarea value={input} onChange={e => setInput(e.target.value)} rows={thread.length === 0 ? 3 : 2} placeholder={thread.length === 0 ? '例：食品メーカーの佐藤部長と会った。新規ECの人材が社内におらず採用に困っているらしい。' : '続けて話す…'} style={{ width: '100%', border: '1.5px solid var(--blue-bg)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.78rem', resize: 'vertical', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={send} disabled={busy} className="btn btn-p lift" style={{ flex: 1 }}>{busy ? '送信中…' : (thread.length === 0 ? 'SYNAPSEに話す' : '続ける')}</button>
              <button onClick={() => { setEditing({ ...EMPTY }); setEditErr('') }} className="lift" style={{ flexShrink: 0, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: '0 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)' }}>手入力</button>
            </div>
            {threadErr && <p style={{ fontSize: '.66rem', color: 'var(--red)', margin: '8px 0 0' }}>{threadErr}</p>}
          </div>
        )}
      </div>

      {/* ── 検索＋区分フィルタ ── */}
      <div style={{ padding: '18px 20px 0' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="名前・会社で検索" style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 13px', fontFamily: 'inherit', fontSize: '.78rem', marginBottom: 9 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {([['all', 'すべて'], ['referred', '紹介済み'], ['prospect', '見込み']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${filter === v ? 'var(--blue)' : 'var(--line)'}`, background: filter === v ? 'var(--blue)' : '#fff', color: filter === v ? '#fff' : 'var(--muted2)' }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── 統合リスト（コンパクト） ── */}
      <div style={{ padding: '14px 20px 0' }}>
        {entries.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '30px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8 }}>{search ? '該当する相手がいません。' : 'ここに紹介した方・見込みが集まります。\n上の「会った人を追加」から始めましょう。'}</p>
          </div>
        ) : entries.map(e => e.kind === 'referred' ? (
          // 紹介済み：ステータス中心・read-only
          <div key={e.key} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '11px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ flex: 1, fontSize: '.8rem', fontWeight: 700, ...oneLine }}>{e.name}</b>
              {e.ref!.status && <span style={{ fontSize: '.54rem', fontWeight: 800, color: (STATUS_TONE[e.ref!.status] ?? STATUS_TONE['支払済']).c, background: (STATUS_TONE[e.ref!.status] ?? STATUS_TONE['支払済']).bg, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>{e.ref!.status}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
              {e.ref!.service && <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted)', background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{e.ref!.service}</span>}
              {e.ref!.amount != null && e.ref!.amount > 0 && <span className="tnum" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--txt)', fontFamily: 'Inter' }}>¥{e.ref!.amount.toLocaleString()}</span>}
              <span style={{ marginLeft: 'auto', fontSize: '.54rem', color: 'var(--muted2)' }}>{(e.date || '').slice(0, 7)}</span>
            </div>
          </div>
        ) : (
          // 見込み：困りごと主役→読み＋切り口→一手→名前・会社（従）
          <div key={e.key} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '12px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--txt)', lineHeight: 1.4, ...oneLine }}>{e.c!.needs || e.name}</div>
              </div>
              <span style={{ fontSize: '.5rem', fontWeight: 800, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>見込み</span>
            </div>
            {e.c!.suggested_service ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.58rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 6, padding: '2px 8px' }}>{e.c!.suggested_service}</span>
                {e.c!.suggested_angle && <span style={{ flex: 1, minWidth: 0, fontSize: '.62rem', color: 'var(--blue-dk)', fontWeight: 600, ...oneLine }}>{e.c!.suggested_angle}</span>}
              </div>
            ) : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              {e.c!.suggested_service
                ? <button onClick={() => makeIntro(e.c!.company || e.c!.name || '相手の方', e.c!.needs || '', e.c!.suggested_service!, e.c!.id)} className="lift" style={{ fontSize: '.64rem', fontWeight: 700, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>紹介文を作る</button>
                : e.c!.enriched_at
                  ? <span style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 600 }}>今は適合なし（後で繋がります）</span>
                  : <button onClick={() => preloadNudge({ id: 'c', kind: 'seed', title: '', body: `${e.name}（${e.c!.needs || '困りごと未記録'}）について相談したい`, contactId: null, contactName: null })} style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--blue)', background: 'none', border: '1px solid var(--blue)', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>相談する</button>}
              {e.c!.acted_at && <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--green)' }}>✓ 対応済み</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => setEditing(toEditing(e.c!))} style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted2)', background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>
                <button onClick={() => remove(e.c!.id)} style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted2)', background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>
              </span>
            </div>
            <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid #F2F2F6', fontSize: '.6rem', color: 'var(--muted2)', ...oneLine }}>
              {[e.name, e.c!.company, e.c!.industry].filter(Boolean).join('・') || '名称未設定'}
            </div>
          </div>
        ))}
      </div>

      {/* 手入力／編集モーダル */}
      {editing && (
        <div onClick={ev => { if (ev.target === ev.currentTarget) setEditing(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 430, borderRadius: '16px 16px 0 0', padding: '18px 18px calc(20px + env(safe-area-inset-bottom))', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <b style={{ fontSize: '.86rem', fontWeight: 800 }}>{editing.id ? '見込みを編集' : '手入力で追加'}</b>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
            </div>
            {efld('困りごと・求めていること', 'needs', 'ECの新規立ち上げ人材', true)}
            {efld('お名前', 'name', '佐藤 太郎')}
            {efld('会社・組織', 'company', '〇〇株式会社')}
            {efld('業種', 'industry', '食品メーカー')}
            {efld('役割・役職', 'role', '営業部 部長')}
            {efld('関係性', 'relationship', '前職の同僚の紹介')}
            {efld('メモ', 'notes', '任意', true)}
            {editErr && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '0 0 8px' }}>{editErr}</p>}
            <button onClick={saveManual} disabled={editBusy} className="btn btn-p lift" style={{ width: '100%' }}>{editBusy ? '保存中…' : (editing.id ? '更新する' : '保存する')}</button>
          </div>
        </div>
      )}

      {/* 紹介文（Feature C）結果モーダル */}
      {intro && (
        <div onClick={ev => { if (ev.target === ev.currentTarget) setIntro(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 390, borderRadius: 16, padding: '18px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <b style={{ fontSize: '.84rem', fontWeight: 800 }}>紹介文の下書き</b>
              <button onClick={() => setIntro(null)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
            </div>
            {introBusy ? <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '20px 0', textAlign: 'center' }}>SYNAPSEが下書きしています…</p>
              : <><textarea value={intro.text} readOnly rows={9} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontFamily: 'inherit', fontSize: '.78rem', lineHeight: 1.7, resize: 'vertical' }} /><button onClick={() => { navigator.clipboard?.writeText(intro.text) }} className="btn btn-p lift" style={{ width: '100%', marginTop: 8 }}>コピーする</button></>}
          </div>
        </div>
      )}
    </div>
  )
}
