'use client'
import { useState } from 'react'

// SYNAPSE 作り直し（R1/R2/R4）：消えない会話スレッド＋“読み”＋カードの一手。呼称は SYNAPSE に統一。
// ★保存/紹介文生成は本人スコープのAPI経由。お金・帰属・既存通知には一切触れない。

export type SynapseContact = {
  id: string
  name: string | null; company: string | null; industry: string | null; role: string | null
  relationship: string | null; needs: string | null; notes: string | null
  suggested_service: string | null; suggested_angle: string | null
  acted_at: string | null
  source: string; created_at: string; updated_at: string
}

type Reading = { service: string; why: string; angle: string }
type DraftFields = { name: string | null; company: string | null; industry: string | null; role: string | null; relationship: string | null; needs: string | null; notes: string | null }
type ThreadMsg =
  | { role: 'user'; text: string }
  | { role: 'synapse'; reply: string; reading: Reading | null; crossRef: string | null; question: string | null; draft: DraftFields | null; savedId?: string }

type Editing = { id?: string; source: string; name: string; company: string; industry: string; role: string; relationship: string; needs: string; notes: string; suggested_service: string; suggested_angle: string }
const EMPTY: Editing = { source: 'manual', name: '', company: '', industry: '', role: '', relationship: '', needs: '', notes: '', suggested_service: '', suggested_angle: '' }
const toEditing = (c: SynapseContact): Editing => ({ id: c.id, source: c.source, name: c.name ?? '', company: c.company ?? '', industry: c.industry ?? '', role: c.role ?? '', relationship: c.relationship ?? '', needs: c.needs ?? '', notes: c.notes ?? '', suggested_service: c.suggested_service ?? '', suggested_angle: c.suggested_angle ?? '' })

export default function SynapseClient({ initialContacts, aiEnabled }: { initialContacts: SynapseContact[]; aiEnabled: boolean }) {
  const [contacts, setContacts] = useState<SynapseContact[]>(initialContacts)
  const [thread, setThread] = useState<ThreadMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [threadErr, setThreadErr] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [editErr, setEditErr] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  // 紹介文（Feature C）インライン結果
  const [intro, setIntro] = useState<{ text: string } | null>(null)
  const [introBusy, setIntroBusy] = useState(false)

  // ── 会話：送信しても消えない多ターンのスレッド ──
  async function send() {
    const text = input.trim()
    if (!text) { setThreadErr('話す内容を入力してください'); return }
    const next: ThreadMsg[] = [...thread, { role: 'user', text }]
    setThread(next); setInput(''); setBusy(true); setThreadErr('')
    try {
      const messages = next.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.role === 'user' ? m.text : m.reply }))
      const res = await fetch('/api/synapse/intake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setThreadErr('SYNAPSEは現在ご利用いただけません。手入力で台帳に追加できます。'); return }
      if (!res.ok) { setThreadErr(j?.error || '応答に失敗しました'); return }
      setThread([...next, { role: 'synapse', reply: j.reply ?? '', reading: j.reading ?? null, crossRef: j.crossRef ?? null, question: j.question ?? null, draft: j.draft ?? null }])
    } catch {
      setThreadErr('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  // スレッド内インライン：台帳に保存（読みも一緒に格納）。保存してもスレッドは継続。
  async function saveFromThread(idx: number) {
    const m = thread[idx]
    if (m.role !== 'synapse' || !m.draft) return
    const payload = { ...m.draft, source: 'interview', suggested_service: m.reading?.service ?? '', suggested_angle: m.reading?.angle ?? '' }
    try {
      const res = await fetch('/api/synapse/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setThreadErr(j?.error || '保存に失敗しました'); return }
      const saved = j.contact as SynapseContact
      setContacts(prev => [saved, ...prev])
      setThread(prev => prev.map((x, i) => i === idx && x.role === 'synapse' ? { ...x, savedId: saved.id } : x))
    } catch { setThreadErr('保存に失敗しました') }
  }

  // P2-1：行動トラッキング。「紹介文を作る」「対応済みにする」で acted_at を記録（お金とは無関係）。
  async function markActed(id: string) {
    try {
      const res = await fetch(`/api/synapse/contacts/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acted: true }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.contact) setContacts(prev => prev.map(c => c.id === id ? j.contact : c))
    } catch { /* noop */ }
  }

  // 紹介文を作る（Feature C /api/ai/draft-intro へ接続）。台帳カード起点なら acted も記録。
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
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setEditErr(j?.error || '保存に失敗しました'); return }
      const saved = j.contact as SynapseContact
      setContacts(prev => editing.id ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev])
      setEditing(null)
    } catch { setEditErr('保存に失敗しました') } finally { setEditBusy(false) }
  }

  async function remove(id: string) {
    if (!confirm('この連絡先を削除しますか？')) return
    try { const res = await fetch(`/api/synapse/contacts/${id}`, { method: 'DELETE' }); if (res.ok) setContacts(prev => prev.filter(c => c.id !== id)) } catch { /* noop */ }
  }

  const efld = (label: string, key: keyof Editing, placeholder = '', textarea = false) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 4 }}>{label}</label>
      {textarea
        ? <textarea value={editing![key] as string} onChange={e => setEditing(d => d ? { ...d, [key]: e.target.value } : d)} rows={2} placeholder={placeholder} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem', resize: 'vertical' }} />
        : <input value={editing![key] as string} onChange={e => setEditing(d => d ? { ...d, [key]: e.target.value } : d)} placeholder={placeholder} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem' }} />}
    </div>
  )

  const ReadingBlock = ({ r }: { r: Reading }) => (
    <div style={{ marginTop: 8, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: '.5rem', fontWeight: 800, letterSpacing: '.08em', color: 'var(--blue)' }}>SYNAPSEの読み</span>
        <span style={{ fontSize: '.6rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 6, padding: '1px 7px' }}>{r.service}</span>
      </div>
      {r.why && <div style={{ fontSize: '.66rem', color: 'var(--txt)', lineHeight: 1.6 }}>{r.why}</div>}
      {r.angle && <div style={{ fontSize: '.66rem', color: 'var(--blue-dk)', fontWeight: 700, marginTop: 4, lineHeight: 1.6 }}>切り口：{r.angle}</div>}
    </div>
  )

  return (
    <div style={{ padding: '8px 0 24px' }}>
      {/* ── SYNAPSE 会話スレッド（消えない・キー未設定なら非表示＝graceful degrade） ── */}
      {aiEnabled && (
        <div style={{ margin: '8px 20px 0', background: 'var(--blue-bg2)', border: '1.5px solid var(--blue-bg)', borderRadius: 14, padding: '15px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--blue)', display: 'flex' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="9" r="2.4" /><circle cx="9" cy="18" r="2.4" /><path d="M8 7l8 1.5M7.6 16l1.2-7.5M11 18l5-7" /></svg></span>
              <b style={{ fontSize: '.82rem', color: 'var(--blue-dk)' }}>SYNAPSEに話す</b>
            </div>
            {thread.length > 0 && <button onClick={() => { setThread([]); setThreadErr('') }} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.62rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>最初から</button>}
          </div>

          {thread.length === 0 && (
            <p style={{ fontSize: '.63rem', color: '#52529E', margin: '0 0 10px', lineHeight: 1.6 }}>最近会った方のことを話してください。SYNAPSEが理解し、合いそうなMBサービスと“刺さる切り口”を返します。</p>
          )}

          {thread.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: '4px 0 10px' }}>
              {thread.map((m, i) => m.role === 'user' ? (
                <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '88%', background: 'var(--blue)', color: '#fff', borderRadius: 12, padding: '8px 12px', fontSize: '.72rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.text}</div>
              ) : (
                <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '94%', width: '100%' }}>
                  <div style={{ background: '#fff', border: '1px solid var(--blue-bg)', borderRadius: 12, padding: '9px 12px', fontSize: '.72rem', lineHeight: 1.6, color: 'var(--txt)', whiteSpace: 'pre-wrap' }}>{m.reply}</div>
                  {m.reading && <ReadingBlock r={m.reading} />}
                  {m.crossRef && <div style={{ marginTop: 6, fontSize: '.62rem', color: 'var(--muted2)', lineHeight: 1.6, paddingLeft: 2 }}>🔗 {m.crossRef}</div>}
                  {/* 一手：紹介文を作る／台帳に保存（インライン・スレッドは継続） */}
                  {(m.reading || m.draft) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      {m.reading && (
                        <button onClick={() => makeIntro(m.draft?.company || m.draft?.name || '相手の方', m.draft?.needs || '', m.reading!.service)} className="lift" style={{ fontSize: '.66rem', fontWeight: 700, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>紹介文を作る</button>
                      )}
                      {m.draft && (m.savedId
                        ? <span style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--green)', alignSelf: 'center' }}>✓ 台帳に保存しました</span>
                        : <button onClick={() => saveFromThread(i)} className="lift" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--blue)', background: '#fff', border: '1px solid var(--blue)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>台帳に保存</button>)}
                    </div>
                  )}
                </div>
              ))}
              {busy && <div style={{ alignSelf: 'flex-start', fontSize: '.62rem', color: 'var(--muted2)', padding: '2px 4px' }}>SYNAPSEが考えています…</div>}
            </div>
          )}

          <textarea value={input} onChange={e => setInput(e.target.value)} rows={thread.length === 0 ? 3 : 2}
            placeholder={thread.length === 0 ? '例：食品メーカーの佐藤部長と会った。新規ECの人材が社内におらず採用に困っているらしい。' : '続けて話す…'}
            style={{ width: '100%', border: '1.5px solid var(--blue-bg)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.78rem', resize: 'vertical', marginBottom: 8 }} />
          <button onClick={send} disabled={busy} className="btn btn-p lift" style={{ width: '100%' }}>{busy ? '送信中…' : (thread.length === 0 ? 'SYNAPSEに話す' : '続ける')}</button>
          {threadErr && <p style={{ fontSize: '.66rem', color: 'var(--red)', margin: '8px 0 0' }}>{threadErr}</p>}
        </div>
      )}

      {/* 手入力で追加 */}
      <div style={{ padding: '14px 20px 0' }}>
        <button onClick={() => { setEditing({ ...EMPTY }); setEditErr('') }} className="lift" style={{ width: '100%', background: '#fff', border: '1px dashed var(--line)', borderRadius: 12, padding: '12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.76rem', fontWeight: 700, color: 'var(--muted)' }}>＋ 手入力で追加</button>
      </div>

      {/* 台帳一覧（need-first・読み＋一手付き） */}
      <div style={{ padding: '20px 20px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 className="ty-h2">あなたのつながり</h2>
        <span style={{ fontSize: '.64rem', color: 'var(--muted2)', fontWeight: 600 }}>{contacts.length}件</span>
      </div>
      {contacts.length === 0 ? (
        <div style={{ margin: '0 20px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '32px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: '.74rem', color: 'var(--muted2)', lineHeight: 1.8 }}>ここにあなたのつながりが蓄積されます。<br />上の「SYNAPSEに話す」か「手入力で追加」から始めましょう。</p>
        </div>
      ) : (
        <div style={{ padding: '0 20px' }}>
          {contacts.map(c => (
            <div key={c.id} className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 15px', marginBottom: 10 }}>
              {/* 主役：困りごと・ニーズ */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2"><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2zM9 21h6M10 19h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span style={{ fontSize: '.54rem', fontWeight: 800, letterSpacing: '.08em', color: 'var(--blue)' }}>困りごと・ニーズ</span>
                  </div>
                  {c.needs
                    ? <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--txt)', lineHeight: 1.5, letterSpacing: '-.01em' }}>{c.needs}</div>
                    : <div style={{ fontSize: '.74rem', fontWeight: 600, color: 'var(--muted)' }}>困りごとは未記録（編集で追記できます）</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setEditing(toEditing(c))} style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--blue)', background: 'none', border: '1px solid var(--line)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>
                  <button onClick={() => remove(c.id)} style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted2)', background: 'none', border: '1px solid var(--line)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>
                </div>
              </div>

              {/* 一手：読み（適合サービス＋切り口）＋紹介文を作る ／ 読みが無ければ SYNAPSEに相談 */}
              {c.suggested_service ? (
                <div style={{ marginTop: 9, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 10, padding: '9px 11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: c.suggested_angle ? 4 : 0 }}>
                    <span style={{ fontSize: '.5rem', fontWeight: 800, letterSpacing: '.08em', color: 'var(--blue)' }}>SYNAPSEの読み</span>
                    <span style={{ fontSize: '.6rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 6, padding: '1px 7px' }}>{c.suggested_service}</span>
                  </div>
                  {c.suggested_angle && <div style={{ fontSize: '.64rem', color: 'var(--blue-dk)', fontWeight: 700, lineHeight: 1.6 }}>切り口：{c.suggested_angle}</div>}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => makeIntro(c.company || c.name || '相手の方', c.needs || '', c.suggested_service!, c.id)} className="lift" style={{ fontSize: '.64rem', fontWeight: 700, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>紹介文を作る</button>
                    {c.acted_at
                      ? <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--green)' }}>✓ 対応済み</span>
                      : <button onClick={() => markActed(c.id)} style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>対応済みにする</button>}
                  </div>
                </div>
              ) : (
                <button onClick={() => { setInput(`${c.name || c.company || 'この方'}（${c.needs || '困りごと未記録'}）について相談したい`); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ marginTop: 9, fontSize: '.62rem', fontWeight: 700, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0' }}>SYNAPSEに相談する →</button>
              )}

              {/* 従：誰か＋タグ */}
              <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid #F2F2F6', display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: '#EEEDFE', color: '#3C3489', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter', fontWeight: 800, fontSize: '.78rem', flexShrink: 0, userSelect: 'none' }}>{(c.name || c.company || '？').trim().charAt(0)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <b style={{ fontSize: '.74rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || '（名前未設定）'}</b>
                    {c.source === 'interview' && <span style={{ fontSize: '.48rem', fontWeight: 800, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>SYNAPSE</span>}
                  </div>
                  {(c.company || c.role) && <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[c.company, c.role].filter(Boolean).join('・')}</div>}
                </div>
              </div>
              {(c.industry || c.relationship) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {c.industry && <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted)', background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>業種 {c.industry}</span>}
                  {c.relationship && <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted)', background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{c.relationship}</span>}
                </div>
              )}
              {c.notes && <div style={{ fontSize: '.6rem', color: 'var(--muted2)', lineHeight: 1.6, marginTop: 8 }}>{c.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 手入力／編集フォーム（モーダル・スレッドは保持） */}
      {editing && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditing(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 430, borderRadius: '16px 16px 0 0', padding: '18px 18px calc(20px + env(safe-area-inset-bottom))', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <b style={{ fontSize: '.86rem', fontWeight: 800 }}>{editing.id ? '連絡先を編集' : '手入力で追加'}</b>
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
        <div onClick={e => { if (e.target === e.currentTarget) setIntro(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 390, borderRadius: 16, padding: '18px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <b style={{ fontSize: '.84rem', fontWeight: 800 }}>紹介文の下書き</b>
              <button onClick={() => setIntro(null)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
            </div>
            {introBusy
              ? <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '20px 0', textAlign: 'center' }}>SYNAPSEが下書きしています…</p>
              : <>
                  <textarea value={intro.text} readOnly rows={9} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontFamily: 'inherit', fontSize: '.78rem', lineHeight: 1.7, resize: 'vertical' }} />
                  <button onClick={() => { navigator.clipboard?.writeText(intro.text) }} className="btn btn-p lift" style={{ width: '100%', marginTop: 8 }}>コピーする</button>
                </>}
          </div>
        </div>
      )}
    </div>
  )
}
