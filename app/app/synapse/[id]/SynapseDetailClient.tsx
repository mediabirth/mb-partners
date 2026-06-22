'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// SYNAPSE 詳細（確定モック synapse_detail_polished 準拠）：提案→紹介する→URL補完→情報(プロフィール+編集トグル)→削除。
// ★本人スコープAPI（synapse_contacts）。再度紹介＝/app/refer deep-link＝money/帰属/deals書込は新設しない。

export type DetailContact = {
  id: string
  name: string | null; company: string | null; industry: string | null; role: string | null
  relationship: string | null; needs: string | null; notes: string | null
  suggested_service: string | null; suggested_angle: string | null
  acted_at: string | null; enriched_at: string | null
  url: string | null; company_size: string | null; scanned_at: string | null
  source: string; created_at: string; updated_at: string
}

// プロフィール表示の項目（短＝2カラム、long＝全幅）。
const FIELDS: Array<[label: string, key: keyof DetailContact, long?: boolean]> = [
  ['業種', 'industry'], ['規模', 'company_size'], ['役割・役職', 'role'], ['関係性', 'relationship'],
  ['お名前', 'name'], ['会社・組織', 'company'], ['困りごと・求めていること', 'needs', true], ['メモ', 'notes', true],
]

export default function SynapseDetailClient({ contact, aiEnabled }: { contact: DetailContact; aiEnabled: boolean }) {
  const router = useRouter()
  const [c, setC] = useState<DetailContact>(contact)
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(([, k]) => [k, (contact[k] as string) ?? ''])))
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [url, setUrl] = useState(contact.url ?? '')
  const [scanBusy, setScanBusy] = useState(false); const [scanErr, setScanErr] = useState(''); const [scanInfo, setScanInfo] = useState<string | null>(null)
  const [intro, setIntro] = useState<{ text: string } | null>(null); const [introBusy, setIntroBusy] = useState(false)

  const initial = (c.name || c.company || '？').trim().charAt(0)

  function startEdit() { setForm(Object.fromEntries(FIELDS.map(([, k]) => [k, (c[k] as string) ?? '']))); setEdit(true); setErr('') }
  async function save() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/synapse/contacts/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const j = await res.json().catch(() => ({})); if (!res.ok) { setErr(j?.error || '保存に失敗しました'); return }
      setC(j.contact as DetailContact); setEdit(false)
    } catch { setErr('保存に失敗しました') } finally { setBusy(false) }
  }
  async function remove() {
    if (!confirm('このつながりを削除しますか？')) return
    try { const res = await fetch(`/api/synapse/contacts/${c.id}`, { method: 'DELETE' }); if (res.ok) router.push('/app/synapse') } catch { /* noop */ }
  }
  async function scan() {
    if (!url.trim()) { setScanErr('会社URLを入力してください'); return }
    setScanBusy(true); setScanErr(''); setScanInfo(null)
    try {
      const res = await fetch('/api/synapse/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: c.id, url }) })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setScanErr('URL取込は現在ご利用いただけません。'); return }
      if (!res.ok) { setScanErr(j?.error || '取得に失敗しました'); return }
      setC(j.contact as DetailContact)
      const f = j.filled ?? {}
      const parts = [f.industry && `業種：${f.industry}`, f.size && `規模：${f.size}`, f.needs && `困りごと：${f.needs}`, f.service ? `提案：${f.service}` : '提案：今は適合なし'].filter(Boolean)
      setScanInfo(parts.join(' ／ ') || '読み取れる情報が見つかりませんでした。')
    } catch { setScanErr('通信に失敗しました') } finally { setScanBusy(false) }
  }
  async function makeIntro() {
    setIntroBusy(true); setIntro({ text: '' })
    try {
      const res = await fetch('/api/ai/draft-intro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contact: c.company || c.name || '相手の方', need: c.needs || '', service: c.suggested_service || '', tone: '丁寧' }) })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setIntro({ text: '【現在ご利用いただけません】手入力で文面をご用意ください。' }); return }
      if (!res.ok) { setIntro({ text: j?.error || '生成に失敗しました' }); return }
      setIntro({ text: j.draft || '生成できませんでした' })
    } catch { setIntro({ text: '通信に失敗しました' }) } finally { setIntroBusy(false) }
  }

  const labelStyle: React.CSSProperties = { fontSize: '.56rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.02em' }
  const valStyle: React.CSSProperties = { fontSize: '.78rem', fontWeight: 600, color: 'var(--txt)', marginTop: 2, lineHeight: 1.5 }
  const inputStyle: React.CSSProperties = { width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.8rem', marginTop: 3 }

  return (
    <div className="page-anim" style={{ padding: '14px 0 28px' }}>
      {/* 1. 戻る */}
      <div style={{ padding: '0 20px' }}>
        <Link href="/app/synapse" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 600, textDecoration: 'none' }}>← つながり一覧</Link>
      </div>

      {/* 2. ヘッダー：アバター＋名前＋会社・業種＋ステータス */}
      <div style={{ padding: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--blue-bg)', color: 'var(--blue-dk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter', fontWeight: 800, fontSize: '1.25rem', flexShrink: 0, userSelect: 'none' }}>{initial}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || c.company || '名称未設定'}</h1>
          {[c.company, c.industry].filter(Boolean).length > 0 && <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[c.company, c.industry].filter(Boolean).join('・')}</div>}
        </div>
        <span style={{ fontSize: '.56rem', fontWeight: 800, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>見込み</span>
      </div>

      {/* 3. SYNAPSEの提案（読みがある時のみ） */}
      {c.suggested_service && (
        <div style={{ margin: '16px 20px 0', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 14, padding: '13px 15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: c.suggested_angle ? 5 : 9 }}>
            <span style={{ fontSize: '.54rem', fontWeight: 800, color: 'var(--blue)', letterSpacing: '.04em' }}>SYNAPSEの提案</span>
            <span style={{ fontSize: '.6rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 6, padding: '2px 8px' }}>{c.suggested_service}</span>
          </div>
          {c.suggested_angle && <div style={{ fontSize: '.66rem', color: 'var(--blue-dk)', fontWeight: 700, lineHeight: 1.6, marginBottom: 10 }}>切り口：{c.suggested_angle}</div>}
          <button onClick={makeIntro} className="btn btn-p lift" style={{ width: '100%' }}>紹介文を作る</button>
        </div>
      )}

      {/* 4. この人を紹介する（既存フローへ） */}
      <div style={{ margin: '12px 20px 0' }}>
        <Link href="/app/refer" className="lift" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 46, background: 'var(--blue)', border: 'none', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: '.82rem' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M16 5h4V1M8 19H4v4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          この人を紹介する
        </Link>
      </div>

      {/* 5. SYNAPSE自動補完（破線ボックス） */}
      {aiEnabled && (
        <div style={{ margin: '16px 20px 0', border: '1.5px dashed var(--blue-bg)', borderRadius: 14, padding: '14px 15px', background: 'var(--blue-bg2)' }}>
          <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--blue-dk)', marginBottom: 8, lineHeight: 1.5 }}>会社URLを渡すと、業種・規模・困りごとを自動で埋めます。</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.co.jp" inputMode="url" style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--blue-bg)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.76rem', background: '#fff' }} />
            <button onClick={scan} disabled={scanBusy} className="btn btn-p lift" style={{ flexShrink: 0, padding: '0 16px' }}>{scanBusy ? '取得中…' : 'SYNAPSE'}</button>
          </div>
          {scanInfo && <div style={{ marginTop: 9, background: '#fff', border: '1px solid var(--blue-bg)', borderRadius: 10, padding: '9px 11px', fontSize: '.64rem', color: 'var(--txt)', lineHeight: 1.6 }}>埋めました：{scanInfo}</div>}
          {scanErr && <p style={{ fontSize: '.64rem', color: 'var(--red)', margin: '8px 0 0' }}>{scanErr}</p>}
        </div>
      )}

      {/* 6. 情報（プロフィール表示／編集トグル） */}
      <div style={{ margin: '18px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <b style={{ fontSize: '.82rem', fontWeight: 800 }}>情報</b>
          {edit
            ? <button onClick={() => { setEdit(false); setErr('') }} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
            : <button onClick={startEdit} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
        </div>

        {!edit ? (
          // 読みやすいプロフィール表示。短い項目は2カラム、long は全幅。
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
            {FIELDS.map(([label, key, long]) => {
              const v = (c[key] as string) || null
              return (
                <div key={key as string} style={{ gridColumn: long ? '1 / -1' : 'auto', minWidth: 0 }}>
                  <div style={labelStyle}>{label}</div>
                  <div style={{ ...valStyle, color: v ? 'var(--txt)' : 'var(--muted)' }}>{v || '—'}</div>
                </div>
              )
            })}
            {c.url && <div style={{ gridColumn: '1 / -1' }}><div style={labelStyle}>URL</div><a href={c.url} target="_blank" rel="noopener noreferrer" style={{ ...valStyle, color: 'var(--blue)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.url}</a></div>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
            {FIELDS.map(([label, key, long]) => (
              <div key={key as string} style={{ gridColumn: long ? '1 / -1' : 'auto', minWidth: 0 }}>
                <label style={labelStyle}>{label}</label>
                {long
                  ? <textarea value={form[key as string]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  : <input value={form[key as string]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />}
              </div>
            ))}
            {err && <p style={{ gridColumn: '1 / -1', fontSize: '.68rem', color: 'var(--red)', margin: 0 }}>{err}</p>}
            <button onClick={save} disabled={busy} className="btn btn-p lift" style={{ gridColumn: '1 / -1', width: '100%', marginTop: 2 }}>{busy ? '保存中…' : '保存する'}</button>
          </div>
        )}
      </div>

      {/* 7. 削除（控えめ） */}
      <div style={{ padding: '14px 20px 0', textAlign: 'center' }}>
        <button onClick={remove} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '.66rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '6px' }}>このつながりを削除</button>
      </div>

      {/* 紹介文モーダル */}
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
