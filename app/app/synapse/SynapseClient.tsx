'use client'
import { useState } from 'react'

// SYNAPSE Phase 0（P0-3）：私的台帳のクライアントUI。
// AIヒアリング→“候補”を本人が確認・編集してから保存（人が最終フィルタ）／手入力の追加・編集・削除。
// ★保存/更新/削除は本人スコープのAPI経由。お金・帰属・既存通知には一切触れない。

export type SynapseContact = {
  id: string
  name: string | null
  company: string | null
  industry: string | null
  role: string | null
  relationship: string | null
  needs: string | null
  notes: string | null
  source: string
  created_at: string
  updated_at: string
}

type Draft = {
  id?: string
  source: string
  name: string; company: string; industry: string; role: string; relationship: string; needs: string; notes: string
}

const EMPTY: Draft = { source: 'manual', name: '', company: '', industry: '', role: '', relationship: '', needs: '', notes: '' }
const toDraft = (c: SynapseContact): Draft => ({ id: c.id, source: c.source, name: c.name ?? '', company: c.company ?? '', industry: c.industry ?? '', role: c.role ?? '', relationship: c.relationship ?? '', needs: c.needs ?? '', notes: c.notes ?? '' })

export default function SynapseClient({ initialContacts, aiEnabled }: { initialContacts: SynapseContact[]; aiEnabled: boolean }) {
  const [contacts, setContacts] = useState<SynapseContact[]>(initialContacts)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // AI intake（会話化）：私的秘書との短いチャット。質問が返れば回答、ドラフトが返れば確認フォームへ。
  type ChatMsg = { role: 'user' | 'assistant'; content: string }
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [aiErr, setAiErr] = useState('')

  async function sendTurn() {
    const textIn = chatInput.trim()
    if (!textIn) { setAiErr('内容を入力してください'); return }
    const nextChat: ChatMsg[] = [...chat, { role: 'user', content: textIn }]
    setChat(nextChat); setChatInput(''); setChatBusy(true); setAiErr('')
    try {
      const res = await fetch('/api/synapse/intake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: nextChat }) })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setAiErr('AIヒアリングは現在ご利用いただけません。手入力で追加できます。'); return }
      if (!res.ok) { setAiErr(j?.error || '抽出に失敗しました'); return }
      if (Array.isArray(j.questions) && j.questions.length > 0) {
        // 追い質問 → 会話に秘書のメッセージとして積む。
        setChat([...nextChat, { role: 'assistant', content: j.questions.join('\n') }])
      } else if (j.draft) {
        // 十分な信号 → 確認フォーム（保存はまだしない）。会話はリセット。
        const c = j.draft
        setDraft({ source: 'interview', name: c.name ?? '', company: c.company ?? '', industry: c.industry ?? '', role: c.role ?? '', relationship: c.relationship ?? '', needs: c.needs ?? '', notes: c.notes ?? '' })
        setChat([]); setChatInput('')
      } else {
        setAiErr('うまく聞き取れませんでした。もう少し具体的にお話しください。')
      }
    } catch {
      setAiErr('通信に失敗しました')
    } finally {
      setChatBusy(false)
    }
  }
  function resetChat() { setChat([]); setChatInput(''); setAiErr('') }

  async function save() {
    if (!draft) return
    const payload = { name: draft.name, company: draft.company, industry: draft.industry, role: draft.role, relationship: draft.relationship, needs: draft.needs, notes: draft.notes, source: draft.source }
    if (!Object.values({ ...payload, source: '' }).some(v => (v ?? '').trim())) { setErr('内容を入力してください'); return }
    setBusy(true); setErr('')
    try {
      const url = draft.id ? `/api/synapse/contacts/${draft.id}` : '/api/synapse/contacts'
      const res = await fetch(url, { method: draft.id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error || '保存に失敗しました'); return }
      const saved = j.contact as SynapseContact
      setContacts(prev => draft.id ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev])
      setDraft(null); setTranscript('')
    } catch {
      setErr('保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('この連絡先を削除しますか？')) return
    try {
      const res = await fetch(`/api/synapse/contacts/${id}`, { method: 'DELETE' })
      if (res.ok) setContacts(prev => prev.filter(c => c.id !== id))
    } catch { /* noop */ }
  }

  const fld = (label: string, key: keyof Draft, placeholder = '', textarea = false) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 4 }}>{label}</label>
      {textarea
        ? <textarea value={draft![key] as string} onChange={e => setDraft(d => d ? { ...d, [key]: e.target.value } : d)} rows={2} placeholder={placeholder} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem', resize: 'vertical' }} />
        : <input value={draft![key] as string} onChange={e => setDraft(d => d ? { ...d, [key]: e.target.value } : d)} placeholder={placeholder} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem' }} />}
    </div>
  )

  return (
    <div style={{ padding: '8px 0 24px' }}>
      {/* AIヒアリング＝私的秘書との短い会話（キー未設定なら非表示＝graceful degrade） */}
      {aiEnabled && !draft && (
        <div style={{ margin: '8px 20px 0', background: 'var(--blue-bg2)', border: '1.5px solid var(--blue-bg)', borderRadius: 14, padding: '15px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--blue)', display: 'flex' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l1.9 4.6L18.5 9l-3.5 3 1 4.8L12 14.6 8 16.8l1-4.8L5.5 9l4.6-1.4L12 3z" /></svg></span>
              <b style={{ fontSize: '.82rem', color: 'var(--blue-dk)' }}>AI秘書に話す</b>
            </div>
            {chat.length > 0 && <button onClick={resetChat} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.62rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>最初から</button>}
          </div>
          {chat.length === 0
            ? <p style={{ fontSize: '.63rem', color: '#52529E', margin: '0 0 10px', lineHeight: 1.6 }}>最近会った方のことを、思いつくままお話しください。秘書が少しだけ質問し、項目に整理します。<b>保存前に必ずご確認・編集いただけます。</b></p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '4px 0 10px' }}>
                {chat.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', background: m.role === 'user' ? 'var(--blue)' : '#fff', color: m.role === 'user' ? '#fff' : 'var(--txt)', border: m.role === 'user' ? 'none' : '1px solid var(--blue-bg)', borderRadius: 12, padding: '8px 12px', fontSize: '.72rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                ))}
                {chatBusy && <div style={{ alignSelf: 'flex-start', fontSize: '.62rem', color: 'var(--muted2)', padding: '2px 4px' }}>秘書が考えています…</div>}
              </div>
            )}
          <textarea value={chatInput} onChange={e => setChatInput(e.target.value)} rows={chat.length === 0 ? 3 : 2}
            placeholder={chat.length === 0 ? '例：先週、知人の紹介で食品メーカーの佐藤部長と会った。新規ECに力を入れたいが社内に人材がいなくて困っているらしい。' : 'お答えを入力…'}
            style={{ width: '100%', border: '1.5px solid var(--blue-bg)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.78rem', resize: 'vertical', marginBottom: 8 }} />
          <button onClick={sendTurn} disabled={chatBusy} className="btn btn-p lift" style={{ width: '100%' }}>{chatBusy ? '送信中…' : (chat.length === 0 ? '秘書に話す' : '答える')}</button>
          {aiErr && <p style={{ fontSize: '.66rem', color: 'var(--red)', margin: '8px 0 0' }}>{aiErr}</p>}
        </div>
      )}

      {/* 確認・編集／手入力フォーム */}
      {draft ? (
        <div style={{ margin: '14px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <b style={{ fontSize: '.84rem', fontWeight: 800 }}>{draft.id ? '連絡先を編集' : (draft.source === 'interview' ? '内容を確認して保存' : '手入力で追加')}</b>
            <button onClick={() => { setDraft(null); setErr('') }} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.66rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          </div>
          {draft.source === 'interview' && !draft.id && <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>AIの下書きです。事実と違う点は修正してから保存してください。</p>}
          {fld('お名前', 'name', '佐藤 太郎')}
          {fld('会社・組織', 'company', '〇〇株式会社')}
          {fld('業種', 'industry', '食品メーカー')}
          {fld('役割・役職', 'role', '営業部 部長')}
          {fld('関係性', 'relationship', '前職の同僚の紹介')}
          {fld('困りごと・求めていること', 'needs', 'ECの新規立ち上げ人材', true)}
          {fld('メモ', 'notes', '任意', true)}
          {err && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '0 0 8px' }}>{err}</p>}
          <button onClick={save} disabled={busy} className="btn btn-p lift" style={{ width: '100%' }}>{busy ? '保存中…' : (draft.id ? '更新する' : '確認して保存する')}</button>
        </div>
      ) : (
        <div style={{ padding: '14px 20px 0' }}>
          <button onClick={() => { setDraft({ ...EMPTY }); setErr('') }} className="lift" style={{ width: '100%', background: '#fff', border: '1px dashed var(--line)', borderRadius: 12, padding: '12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.76rem', fontWeight: 700, color: 'var(--muted)' }}>＋ 手入力で追加</button>
        </div>
      )}

      {/* 台帳一覧 */}
      <div style={{ padding: '20px 20px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 className="ty-h2">あなたのつながり</h2>
        <span style={{ fontSize: '.64rem', color: 'var(--muted2)', fontWeight: 600 }}>{contacts.length}件</span>
      </div>
      {contacts.length === 0 ? (
        <div style={{ margin: '0 20px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '32px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: '.74rem', color: 'var(--muted2)', lineHeight: 1.8 }}>ここにあなたのつながりが蓄積されます。<br />上の「AIに整理してもらう」か「手入力で追加」から始めましょう。</p>
        </div>
      ) : (
        <div style={{ padding: '0 20px' }}>
          {contacts.map(c => (
            <div key={c.id} className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, background: '#EEEDFE', color: '#3C3489', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter', fontWeight: 800, fontSize: '.95rem', flexShrink: 0, userSelect: 'none' }}>{(c.name || c.company || '？').trim().charAt(0)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ fontSize: '.84rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || '（名前未設定）'}</b>
                    {c.source === 'interview' && <span style={{ fontSize: '.5rem', fontWeight: 800, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>AI</span>}
                  </div>
                  {(c.company || c.role || c.industry) && (
                    <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 2 }}>{[c.company, c.role, c.industry].filter(Boolean).join('・')}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setDraft(toDraft(c))} style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--blue)', background: 'none', border: '1px solid var(--line)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>
                  <button onClick={() => remove(c.id)} style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted2)', background: 'none', border: '1px solid var(--line)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>
                </div>
              </div>
              {(c.relationship || c.needs || c.notes) && (
                <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid #F2F2F6', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.relationship && <div style={{ fontSize: '.64rem', color: 'var(--txt)' }}><span style={{ color: 'var(--muted2)' }}>関係性：</span>{c.relationship}</div>}
                  {c.needs && <div style={{ fontSize: '.64rem', color: 'var(--txt)' }}><span style={{ color: 'var(--muted2)' }}>困りごと：</span>{c.needs}</div>}
                  {c.notes && <div style={{ fontSize: '.62rem', color: 'var(--muted2)', lineHeight: 1.6 }}>{c.notes}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
