'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// SYNAPSE 名簿化（N2/N3/N4）：1件の詳細＝全情報・編集・会社URL取込(SYNAPSE)・再度紹介(既存フローへ)。
// ★本人スコープAPI（synapse_contacts）。再度紹介は /app/refer へのディープリンク＝money/帰属/deals書込は新設しない。

export type DetailContact = {
  id: string
  name: string | null; company: string | null; industry: string | null; role: string | null
  relationship: string | null; needs: string | null; notes: string | null
  suggested_service: string | null; suggested_angle: string | null
  acted_at: string | null; enriched_at: string | null
  url: string | null; company_size: string | null; scanned_at: string | null
  source: string; created_at: string; updated_at: string
}

const FIELDS: Array<[label: string, key: keyof DetailContact, textarea?: boolean]> = [
  ['お名前', 'name'], ['会社・組織', 'company'], ['業種', 'industry'], ['規模', 'company_size'],
  ['役割・役職', 'role'], ['関係性', 'relationship'], ['困りごと・求めていること', 'needs', true], ['メモ', 'notes', true],
]

export default function SynapseDetailClient({ contact, aiEnabled }: { contact: DetailContact; aiEnabled: boolean }) {
  const router = useRouter()
  const [c, setC] = useState<DetailContact>(contact)
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(([, k]) => [k, (contact[k] as string) ?? ''])))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [okMsg, setOkMsg] = useState('')
  const [url, setUrl] = useState(contact.url ?? '')
  const [scanBusy, setScanBusy] = useState(false); const [scanErr, setScanErr] = useState(''); const [scanInfo, setScanInfo] = useState<string | null>(null)
  const [intro, setIntro] = useState<{ text: string } | null>(null); const [introBusy, setIntroBusy] = useState(false)

  function setField(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); setDirty(true); setOkMsg('') }

  async function save() {
    setBusy(true); setErr(''); setOkMsg('')
    try {
      const res = await fetch(`/api/synapse/contacts/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const j = await res.json().catch(() => ({})); if (!res.ok) { setErr(j?.error || '保存に失敗しました'); return }
      setC(j.contact as DetailContact); setDirty(false); setOkMsg('保存しました')
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
      const nc = j.contact as DetailContact
      setC(nc); setForm(Object.fromEntries(FIELDS.map(([, k]) => [k, (nc[k] as string) ?? ''])) as Record<string, string>); setDirty(false)
      const f = j.filled ?? {}
      const parts = [f.industry && `業種：${f.industry}`, f.size && `規模：${f.size}`, f.needs && `困りごと：${f.needs}`, f.service ? `提案：${f.service}${f.angle ? `（${f.angle}）` : ''}` : '提案：今は適合なし'].filter(Boolean)
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

  return (
    <div className="page-anim" style={{ padding: '14px 0 28px' }}>
      <div style={{ padding: '0 20px 6px' }}>
        <Link href="/app/synapse" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 600, textDecoration: 'none' }}>← つながり一覧</Link>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '-.01em', marginTop: 8 }}>{c.name || c.company || '名称未設定'}</h1>
        {(c.company || c.role) && <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 2 }}>{[c.company, c.role].filter(Boolean).join('・')}</div>}
      </div>

      {/* SYNAPSE：会社URL取込 */}
      {aiEnabled && (
        <div style={{ margin: '12px 20px 0', background: 'var(--blue-bg2)', border: '1.5px solid var(--blue-bg)', borderRadius: 14, padding: '14px 15px' }}>
          <b style={{ fontSize: '.8rem', color: 'var(--blue-dk)' }}>会社URLからSYNAPSEが埋める</b>
          <p style={{ fontSize: '.62rem', color: '#52529E', margin: '4px 0 9px', lineHeight: 1.6 }}>会社サイトのURLを渡すと、業種・規模・想定の困りごとを読み取り、提案までします。</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.co.jp" inputMode="url" style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--blue-bg)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.76rem' }} />
            <button onClick={scan} disabled={scanBusy} className="btn btn-p lift" style={{ flexShrink: 0, padding: '0 16px' }}>{scanBusy ? '取得中…' : 'SYNAPSE'}</button>
          </div>
          {scanInfo && <div style={{ marginTop: 9, background: '#fff', border: '1px solid var(--blue-bg)', borderRadius: 10, padding: '9px 11px', fontSize: '.64rem', color: 'var(--txt)', lineHeight: 1.6 }}>埋めました：{scanInfo}<div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 3 }}>下のフォームでご確認・修正のうえ保存できます。</div></div>}
          {scanErr && <p style={{ fontSize: '.64rem', color: 'var(--red)', margin: '8px 0 0' }}>{scanErr}</p>}
        </div>
      )}

      {/* 提案（読みがあれば）＋ 紹介文 */}
      {c.suggested_service && (
        <div style={{ margin: '12px 20px 0', background: '#fff', border: '1px solid var(--blue-bg)', borderRadius: 14, padding: '13px 15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: c.suggested_angle ? 5 : 9 }}>
            <span style={{ fontSize: '.54rem', fontWeight: 800, color: 'var(--blue)' }}>SYNAPSEの提案</span>
            <span style={{ fontSize: '.6rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 6, padding: '2px 8px' }}>{c.suggested_service}</span>
          </div>
          {c.suggested_angle && <div style={{ fontSize: '.66rem', color: 'var(--blue-dk)', fontWeight: 700, lineHeight: 1.6, marginBottom: 9 }}>切り口：{c.suggested_angle}</div>}
          <button onClick={makeIntro} className="btn btn-p lift" style={{ width: '100%' }}>紹介文を作る</button>
        </div>
      )}

      {/* 再度紹介（既存フローへ・フォーム入力なしで開始） */}
      <div style={{ margin: '12px 20px 0' }}>
        <Link href="/app/refer" className="lift" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 46, background: '#fff', border: '1.5px solid var(--blue)', borderRadius: 12, textDecoration: 'none', color: 'var(--blue)', fontWeight: 800, fontSize: '.82rem' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M16 5h4V1M8 19H4v4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          この人を紹介する
        </Link>
      </div>

      {/* 全情報の編集 */}
      <div style={{ margin: '18px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px' }}>
        <b style={{ fontSize: '.8rem', fontWeight: 800, display: 'block', marginBottom: 12 }}>情報</b>
        {FIELDS.map(([label, key, textarea]) => (
          <div key={key as string} style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 4 }}>{label}</label>
            {textarea
              ? <textarea value={form[key as string]} onChange={e => setField(key as string, e.target.value)} rows={2} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem', resize: 'vertical' }} />
              : <input value={form[key as string]} onChange={e => setField(key as string, e.target.value)} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem' }} />}
          </div>
        ))}
        {c.url && <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 2 }}>URL：<a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>{c.url}</a></div>}
        {err && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '8px 0 0' }}>{err}</p>}
        {okMsg && <p style={{ fontSize: '.66rem', color: 'var(--green)', fontWeight: 700, margin: '8px 0 0' }}>{okMsg}</p>}
        <button onClick={save} disabled={busy || !dirty} className="btn btn-p lift" style={{ width: '100%', marginTop: 12, opacity: dirty ? 1 : .55 }}>{busy ? '保存中…' : '変更を保存'}</button>
        <button onClick={remove} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: 'var(--red)', fontSize: '.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '6px' }}>このつながりを削除</button>
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
