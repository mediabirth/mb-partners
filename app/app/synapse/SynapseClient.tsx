'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'

// SYNAPSE 一覧（確定モック synapse_list_compact 準拠）：枠なし・区切り線の密なリスト。
// ★紹介履歴は read-only（page で getPartnerWithDeals）。書込は synapse_contacts のみ（本人スコープAPI）。
// ★再度紹介＝/app/refer への deep-link のみ（行内には出さず詳細へ集約）。お金/帰属/deals書込は新設しない。

export type SynapseContact = {
  id: string
  name: string | null; company: string | null; industry: string | null; role: string | null
  relationship: string | null; needs: string | null; notes: string | null
  suggested_service: string | null; suggested_angle: string | null
  acted_at: string | null; enriched_at: string | null
  url: string | null; company_size: string | null; scanned_at: string | null
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

// ステータス文字色：見込み=info／進行=secondary／成約=success／支払済=tertiary。
const STATUS_COLOR: Record<string, string> = { 見込み: 'var(--blue)', 進行: 'var(--amber)', 成約: 'var(--green)', 支払済: 'var(--muted2)' }
const oneLine: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

export default function SynapseClient({ initialContacts, referred, aiEnabled }: { initialContacts: SynapseContact[]; referred: ReferredEntry[]; aiEnabled: boolean }) {
  const [prospects, setProspects] = useState<SynapseContact[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'referred' | 'prospect'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [thread, setThread] = useState<ThreadMsg[]>([])
  const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const [threadErr, setThreadErr] = useState('')
  const [adding, setAdding] = useState<null | { name: string; company: string; needs: string }>(null); const [addErr, setAddErr] = useState(''); const [addBusy, setAddBusy] = useState(false)
  const [intro, setIntro] = useState<{ text: string } | null>(null); const [introBusy, setIntroBusy] = useState(false)

  type Entry = { key: string; kind: 'referred' | 'prospect'; name: string; company: string | null; date: string; ref?: ReferredEntry; c?: SynapseContact }
  const entries = useMemo(() => {
    const ref: Entry[] = referred.map(r => ({ key: 'd' + r.id, kind: 'referred', name: r.name, company: r.company, date: r.date, ref: r }))
    const pro: Entry[] = prospects.map(c => ({ key: 'c' + c.id, kind: 'prospect', name: c.name ?? c.company ?? '名称未設定', company: c.company, date: c.created_at, c }))
    let list = filter === 'referred' ? ref : filter === 'prospect' ? pro : [...ref, ...pro]
    const q = search.trim()
    if (q) list = list.filter(e => (`${e.name} ${e.company ?? ''} ${e.c?.industry ?? ''} ${e.ref?.service ?? ''}`).includes(q))
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [referred, prospects, filter, search])

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
  async function makeIntro(contact: string, need: string, service: string) {
    setIntroBusy(true); setIntro({ text: '' })
    try {
      const res = await fetch('/api/ai/draft-intro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contact, need, service, tone: '丁寧' }) })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setIntro({ text: '【現在ご利用いただけません】手入力で文面をご用意ください。' }); return }
      if (!res.ok) { setIntro({ text: j?.error || '生成に失敗しました' }); return }
      setIntro({ text: j.draft || '生成できませんでした' })
    } catch { setIntro({ text: '通信に失敗しました' }) } finally { setIntroBusy(false) }
  }
  async function saveAdd() {
    if (!adding) return
    if (!`${adding.name}${adding.company}${adding.needs}`.trim()) { setAddErr('内容を入力してください'); return }
    setAddBusy(true); setAddErr('')
    try {
      const res = await fetch('/api/synapse/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: adding.name, company: adding.company, needs: adding.needs, source: 'manual' }) })
      const j = await res.json().catch(() => ({})); if (!res.ok) { setAddErr(j?.error || '保存に失敗しました'); return }
      setProspects(prev => [j.contact as SynapseContact, ...prev]); setAdding(null)
    } catch { setAddErr('保存に失敗しました') } finally { setAddBusy(false) }
  }

  return (
    <div style={{ padding: '4px 0 24px' }}>
      {/* 見出し「あなたのつながり（人数）」＋ ＋追加 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 10px' }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-.01em' }}>あなたのつながり <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted2)' }}>{referred.length + prospects.length}</span></h1>
        <button onClick={() => { setAdding({ name: '', company: '', needs: '' }); setAddErr('') }} className="lift" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 800 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>追加
        </button>
      </div>

      {/* 検索（スリム）＋区分チップ */}
      <div style={{ padding: '0 20px 6px' }}>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="名前・会社で検索" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px 8px 32px', fontFamily: 'inherit', fontSize: '.74rem', background: 'var(--bg2)' }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['all', 'すべて'], ['referred', '紹介済み'], ['prospect', '見込み']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ padding: '5px 13px', borderRadius: 999, fontFamily: 'inherit', fontSize: '.68rem', fontWeight: 700, cursor: 'pointer', border: 'none', background: filter === v ? 'var(--blue)' : 'var(--bg2)', color: filter === v ? '#fff' : 'var(--muted2)' }}>{l}</button>
          ))}
        </div>
      </div>

      {/* リスト：区切り線の密な行 */}
      <div style={{ marginTop: 6 }}>
        {entries.length === 0 ? (
          <p style={{ padding: '30px 20px', textAlign: 'center', fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{search ? '該当する人がいません。' : 'ここに、あなたが繋いだ人・これから繋ぐ人が並びます。\n右上の「＋追加」から始めましょう。'}</p>
        ) : entries.map(e => {
          const status = e.kind === 'prospect' ? '見込み' : e.ref!.status
          const sub = e.kind === 'prospect'
            ? ([e.c!.industry, e.c!.needs].filter(Boolean).join('・') || '困りごと未記録')
            : (e.ref!.service ?? '案件')
          // 見込み→詳細ページ。紹介済み→既存フロー(再度紹介・deep-link)。
          const href = e.kind === 'prospect' ? `/app/synapse/${e.c!.id}` : '/app/refer'
          return (
            <Link key={e.key} href={href} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderTop: '1px solid var(--line)', textDecoration: 'none', color: 'var(--txt)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 700, ...oneLine }}>{e.name}</div>
                <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 2, ...oneLine }}>{sub}</div>
              </div>
              <span style={{ fontSize: '.62rem', fontWeight: 700, color: STATUS_COLOR[status] ?? 'var(--muted2)', flexShrink: 0 }}>{status}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          )
        })}
        {entries.length > 0 && <div style={{ borderTop: '1px solid var(--line)' }} />}
      </div>

      {/* SYNAPSEに話す（控えめ・任意） */}
      {aiEnabled && (
        <div style={{ padding: '18px 20px 0' }}>
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} className="lift" style={{ width: '100%', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 11, padding: '11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.73rem', fontWeight: 700, color: 'var(--blue-dk)' }}>会った人を SYNAPSE に話して追加する</button>
          ) : (
            <div style={{ background: 'var(--blue-bg2)', border: '1.5px solid var(--blue-bg)', borderRadius: 14, padding: '14px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <b style={{ fontSize: '.8rem', color: 'var(--blue-dk)' }}>SYNAPSEに話す</b>
                <button onClick={() => { setShowAdd(false); setThread([]); setThreadErr('') }} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.62rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
              </div>
              {thread.length === 0 && <p style={{ fontSize: '.62rem', color: '#52529E', margin: '0 0 9px', lineHeight: 1.6 }}>会った方のことを話すと、合いそうなMBサービスと切り口を返します。後で紹介するために、先に名簿へ入れておけます。</p>}
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
                          {m.draft && (m.savedId ? <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--green)', alignSelf: 'center' }}>✓ 名簿に保存</span> : <button onClick={() => saveFromThread(i)} className="lift" style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--blue)', background: '#fff', border: '1px solid var(--blue)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>名簿に保存</button>)}
                        </div>
                      )}
                    </div>
                  ))}
                  {busy && <div style={{ alignSelf: 'flex-start', fontSize: '.62rem', color: 'var(--muted2)' }}>SYNAPSEが考えています…</div>}
                </div>
              )}
              <textarea value={input} onChange={e => setInput(e.target.value)} rows={thread.length === 0 ? 3 : 2} placeholder={thread.length === 0 ? '例：食品メーカーの佐藤部長と会った。新規ECの人材が社内におらず採用に困っているらしい。' : '続けて話す…'} style={{ width: '100%', border: '1.5px solid var(--blue-bg)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.78rem', resize: 'vertical', marginBottom: 8 }} />
              <button onClick={send} disabled={busy} className="btn btn-p lift" style={{ width: '100%' }}>{busy ? '送信中…' : (thread.length === 0 ? 'SYNAPSEに話す' : '続ける')}</button>
              {threadErr && <p style={{ fontSize: '.66rem', color: 'var(--red)', margin: '8px 0 0' }}>{threadErr}</p>}
            </div>
          )}
        </div>
      )}

      {/* 追加（最小フォーム） */}
      {adding && (
        <div onClick={ev => { if (ev.target === ev.currentTarget) setAdding(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 430, borderRadius: '16px 16px 0 0', padding: '18px 18px calc(20px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <b style={{ fontSize: '.86rem', fontWeight: 800 }}>つながりを追加</b>
              <button onClick={() => setAdding(null)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
            </div>
            <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>まず名前だけでもOK。あとで詳細ページから会社URLを渡せばSYNAPSEが埋めます。</p>
            {([['お名前', 'name'], ['会社・組織', 'company'], ['困りごと（任意）', 'needs']] as const).map(([label, key]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 4 }}>{label}</label>
                <input value={adding[key]} onChange={ev => setAdding(a => a ? { ...a, [key]: ev.target.value } : a)} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem' }} />
              </div>
            ))}
            {addErr && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '0 0 8px' }}>{addErr}</p>}
            <button onClick={saveAdd} disabled={addBusy} className="btn btn-p lift" style={{ width: '100%' }}>{addBusy ? '保存中…' : '名簿に追加'}</button>
          </div>
        </div>
      )}

      {/* 紹介文（Feature C） */}
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
