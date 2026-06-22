'use client'
import { useState, useMemo } from 'react'

// SYNAPSE 画面の作り直し：2ゾーン（① SYNAPSEからの提案 ② あなたの人脈）に集約。
// バックエンド（enrich/contacts/紹介履歴read/Feature C）は流用。重複を排し、何に使えるかが一目で伝わる構成。
// ★紹介履歴は read-only（page で getPartnerWithDeals）。書込は synapse_contacts のみ（本人スコープAPI）。お金/帰属/通知は非接触。

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

type Editing = { id?: string; source: string; name: string; company: string; industry: string; role: string; relationship: string; needs: string; notes: string; suggested_service: string; suggested_angle: string }
const EMPTY: Editing = { source: 'manual', name: '', company: '', industry: '', role: '', relationship: '', needs: '', notes: '', suggested_service: '', suggested_angle: '' }
const toEditing = (c: SynapseContact): Editing => ({ id: c.id, source: c.source, name: c.name ?? '', company: c.company ?? '', industry: c.industry ?? '', role: c.role ?? '', relationship: c.relationship ?? '', needs: c.needs ?? '', notes: c.notes ?? '', suggested_service: c.suggested_service ?? '', suggested_angle: c.suggested_angle ?? '' })

const STATUS_TONE: Record<string, { c: string; bg: string }> = {
  進行: { c: 'var(--blue)', bg: 'var(--blue-bg)' }, 成約: { c: 'var(--green)', bg: 'var(--green-bg)' }, 支払済: { c: 'var(--muted2)', bg: 'var(--bg2)' },
}
const oneLine: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

export default function SynapseClient({ initialContacts, referred, aiEnabled }: { initialContacts: SynapseContact[]; referred: ReferredEntry[]; aiEnabled: boolean }) {
  const [prospects, setProspects] = useState<SynapseContact[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'referred' | 'prospect'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [thread, setThread] = useState<ThreadMsg[]>([])
  const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const [threadErr, setThreadErr] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null); const [editErr, setEditErr] = useState(''); const [editBusy, setEditBusy] = useState(false)
  const [intro, setIntro] = useState<{ text: string } | null>(null); const [introBusy, setIntroBusy] = useState(false)
  const [enrichBusy, setEnrichBusy] = useState(false); const [enrichErr, setEnrichErr] = useState('')

  // 提案＝読みのある見込み×未行動（新しい順）。未読み＝困りごと有・読み無・未処理。
  const proposals = useMemo(() => prospects.filter(c => c.suggested_service && !c.acted_at).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [prospects])
  const unreadCount = useMemo(() => prospects.filter(c => c.needs && !c.suggested_service && !c.enriched_at).length, [prospects])

  // 人脈一覧（紹介済み＋見込み）→ 区分・検索・新しい順。
  type Entry = { key: string; kind: 'referred' | 'prospect'; name: string; company: string | null; date: string; ref?: ReferredEntry; c?: SynapseContact }
  const entries = useMemo(() => {
    const ref: Entry[] = referred.map(r => ({ key: 'd' + r.id, kind: 'referred', name: r.name, company: r.company, date: r.date, ref: r }))
    const pro: Entry[] = prospects.map(c => ({ key: 'c' + c.id, kind: 'prospect', name: c.name ?? c.company ?? '名称未設定', company: c.company, date: c.created_at, c }))
    let list = filter === 'referred' ? ref : filter === 'prospect' ? pro : [...ref, ...pro]
    const q = search.trim()
    if (q) list = list.filter(e => (`${e.name} ${e.company ?? ''} ${e.c?.industry ?? ''} ${e.ref?.service ?? ''}`).includes(q))
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [referred, prospects, filter, search])

  // ── 操作（synapse_contacts のみ・本人スコープAPI／Feature C 紹介文） ──
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
  async function runEnrich() {
    if (enrichBusy) return
    setEnrichBusy(true); setEnrichErr('')
    try {
      const res = await fetch('/api/synapse/enrich', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setEnrichErr('提案の生成は現在ご利用いただけません。'); return }
      if (!res.ok) { setEnrichErr(j?.error || '生成に失敗しました'); return }
      const updated = (j.updated ?? []) as SynapseContact[]
      if (updated.length) { const byId = Object.fromEntries(updated.map(u => [u.id, u])); setProspects(prev => prev.map(c => byId[c.id] ?? c)) }
    } catch { setEnrichErr('通信に失敗しました') } finally { setEnrichBusy(false) }
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

  const efld = (label: string, key: keyof Editing, placeholder = '', textarea = false) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 4 }}>{label}</label>
      {textarea
        ? <textarea value={editing![key] as string} onChange={e => setEditing(d => d ? { ...d, [key]: e.target.value } : d)} rows={2} placeholder={placeholder} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem', resize: 'vertical' }} />
        : <input value={editing![key] as string} onChange={e => setEditing(d => d ? { ...d, [key]: e.target.value } : d)} placeholder={placeholder} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem' }} />}
    </div>
  )

  const ProposalCard = ({ c }: { c: SynapseContact }) => (
    <div style={{ background: 'var(--blue-bg2)', border: '1.5px solid var(--blue-bg)', borderRadius: 14, padding: '13px 15px', marginBottom: 9 }}>
      <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 700, ...oneLine }}>{[c.name, c.company].filter(Boolean).join('・') || '相手'}</div>
      <div style={{ fontSize: '.84rem', fontWeight: 800, color: 'var(--txt)', lineHeight: 1.4, margin: '3px 0 7px', ...oneLine }}>{c.needs || '困りごと未記録'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 9 }}>
        <span style={{ fontSize: '.58rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>{c.suggested_service}</span>
        {c.suggested_angle && <span style={{ flex: 1, minWidth: 0, fontSize: '.62rem', color: 'var(--blue-dk)', fontWeight: 600, ...oneLine }}>{c.suggested_angle}</span>}
      </div>
      <button onClick={() => makeIntro(c.company || c.name || '相手の方', c.needs || '', c.suggested_service!, c.id)} className="btn btn-p lift" style={{ width: '100%', padding: '9px' }}>紹介文を作る</button>
    </div>
  )

  return (
    <div style={{ padding: '6px 0 24px' }}>
      {/* ══ ゾーン①：SYNAPSEからの提案 ══ */}
      <div style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 2px 9px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2"><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2zM9 21h6M10 19h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h2 className="ty-h2" style={{ margin: 0 }}>SYNAPSEからの提案</h2>
        </div>

        {proposals.length > 0 ? (
          <>
            {proposals.map(c => <ProposalCard key={c.id} c={c} />)}
            {unreadCount > 0 && (
              <button onClick={runEnrich} disabled={enrichBusy} className="lift" style={{ width: '100%', background: '#fff', border: '1px solid var(--blue)', borderRadius: 11, padding: '10px', cursor: enrichBusy ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 800, color: 'var(--blue)' }}>{enrichBusy ? 'SYNAPSEが考えています…' : `ほか ${unreadCount}人分の提案を出す →`}</button>
            )}
          </>
        ) : unreadCount > 0 ? (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '18px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 12 }}>{unreadCount}人の見込みがいます。SYNAPSEが「この人にはこれを紹介できる」を考えます。</p>
            <button onClick={runEnrich} disabled={enrichBusy} className="btn btn-p lift" style={{ width: '100%' }}>{enrichBusy ? 'SYNAPSEが考えています…' : `${unreadCount}人分の提案を出す`}</button>
            {enrichErr && <p style={{ fontSize: '.64rem', color: 'var(--red)', marginTop: 8 }}>{enrichErr}</p>}
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '22px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8 }}>会った人を追加すると、SYNAPSEが<br /><b style={{ color: 'var(--txt)' }}>「この人にはこれを紹介できる」</b>と提案します。</p>
          </div>
        )}
        {enrichErr && proposals.length > 0 && <p style={{ fontSize: '.64rem', color: 'var(--red)', marginTop: 8 }}>{enrichErr}</p>}
      </div>

      {/* ══ ゾーン②：あなたの人脈 ══ */}
      <div style={{ padding: '22px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 2px 9px' }}>
          <h2 className="ty-h2" style={{ margin: 0 }}>あなたの人脈</h2>
          <span style={{ fontSize: '.64rem', color: 'var(--muted2)', fontWeight: 600 }}>{referred.length + prospects.length}人</span>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="名前・会社で検索" style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 13px', fontFamily: 'inherit', fontSize: '.76rem', marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {([['all', 'すべて'], ['referred', '紹介済み'], ['prospect', '見込み']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontFamily: 'inherit', fontSize: '.68rem', fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${filter === v ? 'var(--blue)' : 'var(--line)'}`, background: filter === v ? 'var(--blue)' : '#fff', color: filter === v ? '#fff' : 'var(--muted2)' }}>{l}</button>
          ))}
        </div>

        {entries.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '26px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8 }}>{search ? '該当する人がいません。' : 'ここに、あなたが紹介した人と見込みが並びます。\n下の「会った人を追加」から始めましょう。'}</p>
          </div>
        ) : entries.map(e => e.kind === 'referred' ? (
          // 紹介済み：1行＋補助（read-only）
          <div key={e.key} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 13px', marginBottom: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ flex: 1, fontSize: '.78rem', fontWeight: 700, ...oneLine }}>{e.name}</b>
              {e.ref!.status && <span style={{ fontSize: '.52rem', fontWeight: 800, color: (STATUS_TONE[e.ref!.status] ?? STATUS_TONE['支払済']).c, background: (STATUS_TONE[e.ref!.status] ?? STATUS_TONE['支払済']).bg, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>{e.ref!.status}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: '.6rem', color: 'var(--muted2)' }}>
              <span style={{ ...oneLine }}>{e.ref!.service ?? '案件'}</span>
              {e.ref!.amount != null && e.ref!.amount > 0 && <span className="tnum" style={{ fontWeight: 700, color: 'var(--txt)', fontFamily: 'Inter', flexShrink: 0 }}>¥{e.ref!.amount.toLocaleString()}</span>}
              <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{(e.date || '').slice(0, 7)}</span>
            </div>
          </div>
        ) : (
          // 見込み：1行＋困りごと要約（タップで編集）
          <button key={e.key} onClick={() => setEditing(toEditing(e.c!))} className="row-hover" style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 13px', marginBottom: 7, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--txt)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ flex: 1, fontSize: '.78rem', fontWeight: 700, ...oneLine }}>{e.name}</b>
              <span style={{ fontSize: '.5rem', fontWeight: 800, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>見込み</span>
            </div>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 3, ...oneLine }}>{e.c!.needs || '困りごと未記録'}</div>
          </button>
        ))}
      </div>

      {/* ══ 会った人を追加（控えめな1導線） ══ */}
      <div style={{ padding: '20px 20px 0' }}>
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
                        {m.draft && (m.savedId ? <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--green)', alignSelf: 'center' }}>✓ 保存しました</span> : <button onClick={() => saveFromThread(i)} className="lift" style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--blue)', background: '#fff', border: '1px solid var(--blue)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>人脈に保存</button>)}
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

      {/* 手入力／編集モーダル */}
      {editing && (
        <div onClick={ev => { if (ev.target === ev.currentTarget) setEditing(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 430, borderRadius: '16px 16px 0 0', padding: '18px 18px calc(20px + env(safe-area-inset-bottom))', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <b style={{ fontSize: '.86rem', fontWeight: 800 }}>{editing.id ? '見込みを編集' : '手入力で追加'}</b>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editing.id && <button onClick={() => { const id = editing.id!; setEditing(null); remove(id) }} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: '.66rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>}
                <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
              </div>
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
