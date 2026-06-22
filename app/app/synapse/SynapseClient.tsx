'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'

// SYNAPSE 名簿化（N1/N4）：トップは“つながりの名簿”を主役に。知能（読み/取込/提案）は各行の詳細ページへ。
// ★紹介履歴は read-only（page で getPartnerWithDeals）。書込は synapse_contacts のみ（本人スコープAPI）。
// ★再度紹介＝既存フロー（/app/refer）へのディープリンクのみ＝money/帰属/deals書込は新設しない。

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

  // ── SYNAPSEに話す（追加用・任意）。Feature C 紹介文。──
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
    <div style={{ padding: '6px 0 24px' }}>
      {/* ══ つながりの名簿（主役） ══ */}
      <div style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 2px 9px' }}>
          <h2 className="ty-h2" style={{ margin: 0 }}>あなたのつながり</h2>
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
            <p style={{ fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8 }}>{search ? '該当する人がいません。' : 'ここに、あなたが繋いだ人・これから繋ぐ人が並びます。\n下の「会った人を追加」から始めましょう。'}</p>
          </div>
        ) : entries.map(e => e.kind === 'referred' ? (
          // 紹介済み：1行＋補助（read-only）＋再度紹介（既存フローへ）
          <div key={e.key} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 13px', marginBottom: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ flex: 1, fontSize: '.78rem', fontWeight: 700, ...oneLine }}>{e.name}</b>
              {e.ref!.status && <span style={{ fontSize: '.52rem', fontWeight: 800, color: (STATUS_TONE[e.ref!.status] ?? STATUS_TONE['支払済']).c, background: (STATUS_TONE[e.ref!.status] ?? STATUS_TONE['支払済']).bg, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>{e.ref!.status}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: '.6rem', color: 'var(--muted2)' }}>
              <span style={{ ...oneLine }}>{e.ref!.service ?? '案件'}</span>
              {e.ref!.amount != null && e.ref!.amount > 0 && <span className="tnum" style={{ fontWeight: 700, color: 'var(--txt)', fontFamily: 'Inter', flexShrink: 0 }}>¥{e.ref!.amount.toLocaleString()}</span>}
              <Link href="/app/refer" style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '.6rem', fontWeight: 800, color: 'var(--blue)', textDecoration: 'none' }}>再度紹介 →</Link>
            </div>
          </div>
        ) : (
          // 見込み：タップで詳細ページへ
          <Link key={e.key} href={`/app/synapse/${e.c!.id}`} className="row-hover lift" style={{ display: 'block', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 13px', marginBottom: 7, textDecoration: 'none', color: 'var(--txt)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ flex: 1, fontSize: '.78rem', fontWeight: 700, ...oneLine }}>{e.name}</b>
              {e.c!.suggested_service
                ? <span style={{ fontSize: '.5rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>{e.c!.suggested_service}</span>
                : <span style={{ fontSize: '.5rem', fontWeight: 800, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>見込み</span>}
              <span style={{ color: 'var(--muted)', fontSize: '.7rem', flexShrink: 0 }}>›</span>
            </div>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 3, ...oneLine }}>{e.c!.needs || [e.c!.company, e.c!.industry].filter(Boolean).join('・') || '困りごと未記録'}</div>
          </Link>
        ))}
      </div>

      {/* ══ 会った人を追加（控えめな1導線・先に入れておける） ══ */}
      <div style={{ padding: '20px 20px 0' }}>
        {!showAdd ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {aiEnabled && <button onClick={() => setShowAdd(true)} className="lift" style={{ flex: 1, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 12, padding: '11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700, color: 'var(--blue-dk)' }}>＋ 会った人を追加（SYNAPSEに話す）</button>}
            <button onClick={() => { setAdding({ name: '', company: '', needs: '' }); setAddErr('') }} className="lift" style={{ flex: aiEnabled ? '0 0 auto' : 1, background: '#fff', border: '1px dashed var(--line)', borderRadius: 12, padding: '11px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700, color: 'var(--muted)' }}>手入力</button>
          </div>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={send} disabled={busy} className="btn btn-p lift" style={{ flex: 1 }}>{busy ? '送信中…' : (thread.length === 0 ? 'SYNAPSEに話す' : '続ける')}</button>
              <button onClick={() => { setAdding({ name: '', company: '', needs: '' }); setAddErr('') }} className="lift" style={{ flexShrink: 0, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: '0 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)' }}>手入力</button>
            </div>
            {threadErr && <p style={{ fontSize: '.66rem', color: 'var(--red)', margin: '8px 0 0' }}>{threadErr}</p>}
          </div>
        )}
      </div>

      {/* 手入力で追加（新規・最小） */}
      {adding && (
        <div onClick={ev => { if (ev.target === ev.currentTarget) setAdding(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 430, borderRadius: '16px 16px 0 0', padding: '18px 18px calc(20px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <b style={{ fontSize: '.86rem', fontWeight: 800 }}>会った人を追加</b>
              <button onClick={() => setAdding(null)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
            </div>
            <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>まず名前だけでもOK。あとで詳細ページから会社URLを渡せばSYNAPSEが埋めます。</p>
            {[['お名前', 'name'], ['会社・組織', 'company'], ['困りごと（任意）', 'needs']].map(([label, key]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 4 }}>{label}</label>
                <input value={(adding as any)[key]} onChange={ev => setAdding(a => a ? { ...a, [key]: ev.target.value } : a)} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem' }} />
              </div>
            ))}
            {addErr && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '0 0 8px' }}>{addErr}</p>}
            <button onClick={saveAdd} disabled={addBusy} className="btn btn-p lift" style={{ width: '100%' }}>{addBusy ? '保存中…' : '名簿に追加'}</button>
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
