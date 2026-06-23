'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SynapseCrest from '../SynapseCrest'
import type { MatchCandidate } from '@/lib/synapse-match'
import type { Nudge } from '@/lib/synapse-nudge'

// SYNAPSE 詳細＝需要分析モデル（仕上げ）。情報(事実プロフィール+編集トグル+URL欄に小SYNAPSEボタン) → 需要分析(キーワード＋推奨サービスの2段) → タグ→ポップアップ→紹介文(Feature C) → 紹介する(deep-link) → 削除。
// ★本人スコープAPI。需要分析・タグ・推奨サービス・生成文は read-onlyな知能＝money/attribution/deals は書かない。

export type DetailContact = {
  id: string
  name: string | null; company: string | null; industry: string | null; role: string | null
  relationship: string | null; needs: string | null; notes: string | null
  suggested_service: string | null; suggested_angle: string | null
  acted_at: string | null; enriched_at: string | null
  url: string | null; company_size: string | null; scanned_at: string | null
  entity_type: string | null; phone: string | null; address: string | null
  demand_summary: string | null; demand_tags: string[] | null; recommended_services: string[] | null
  source: string; created_at: string; updated_at: string
}
export type HistoryItem = { id: string; label: string; service: string | null; status: string; date: string }

const STATUS_C: Record<string, string> = { 進行: 'var(--amber)', 成約: 'var(--green)', 支払済: 'var(--muted2)', 不成立: 'var(--muted)' }

const FIELDS: Array<[label: string, key: keyof DetailContact, long?: boolean]> = [
  ['会社・組織', 'company'], ['役割・役職', 'role'], ['業種', 'industry'], ['規模', 'company_size'],
  ['電話', 'phone'], ['お名前', 'name'], ['住所', 'address', true], ['メモ', 'notes', true],
]

export default function SynapseDetailClient({ contact, aiEnabled, history, candidates = [], nudge = null }: { contact: DetailContact; aiEnabled: boolean; history: HistoryItem[]; candidates?: MatchCandidate[]; nudge?: Nudge | null }) {
  const router = useRouter()
  const [c, setC] = useState<DetailContact>(contact)
  // 一言ナッジの「後で」（localStorage＝本人端末スコープ・DB/money非接触）。
  const [nudgeHidden, setNudgeHidden] = useState(false)
  const nudgeKey = nudge ? `syn_nudge_dismissed_${contact.id}_${nudge.kind}` : ''
  useEffect(() => { if (nudgeKey) { try { if (localStorage.getItem(nudgeKey)) setNudgeHidden(true) } catch { /* noop */ } } }, [nudgeKey])
  function dismissNudge() { setNudgeHidden(true); try { if (nudgeKey) localStorage.setItem(nudgeKey, '1') } catch { /* noop */ } }
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState<Record<string, string>>(() => ({ entity_type: contact.entity_type ?? 'corporate', ...Object.fromEntries(FIELDS.map(([, k]) => [k, (contact[k] as string) ?? ''])) }))
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [url, setUrl] = useState(contact.url ?? '')
  const [scanBusy, setScanBusy] = useState(false); const [scanErr, setScanErr] = useState(''); const [scanInfo, setScanInfo] = useState<string | null>(null)
  const [rescan, setRescan] = useState(false)   // 分析済みパネル内の「再分析」URL入力の開閉
  const [picked, setPicked] = useState<{ tag: string; kind: 'keyword' | 'service' } | null>(null)
  const [intro, setIntro] = useState<{ text: string } | null>(null); const [introBusy, setIntroBusy] = useState(false)

  const entityLabel = (c.entity_type === 'individual') ? '個人' : '法人'
  const keywords = Array.isArray(c.demand_tags) ? c.demand_tags : []
  const recos = Array.isArray(c.recommended_services) ? c.recommended_services : []
  const analyzed = !!(c.demand_summary || keywords.length || recos.length)

  // E：このつながりの情報を /app/refer にクエリで引き継ぐ（入力欄の初期値のみ・送信/帰属/money は無改修）。
  const refParams = new URLSearchParams()
  refParams.set('ct', c.entity_type === 'individual' ? 'individual' : 'corporate')
  if (c.company) refParams.set('co', c.company)
  if (c.name) refParams.set('nm', c.name)
  if (c.phone) refParams.set('phone', c.phone)
  const memoCarry = [c.notes, c.industry && `業種：${c.industry}`, c.address && `住所：${c.address}`].filter(Boolean).join(' / ')
  if (memoCarry) refParams.set('memo', memoCarry.slice(0, 400))
  const referHref = `/app/refer?${refParams.toString()}`
  const historyShown = showAllHistory ? history : history.slice(0, 3)

  function reflect(nc: DetailContact) { setC(nc); setForm({ entity_type: nc.entity_type ?? 'corporate', ...Object.fromEntries(FIELDS.map(([, k]) => [k, (nc[k] as string) ?? ''])) }) }
  function startEdit() { setForm({ entity_type: c.entity_type ?? 'corporate', ...Object.fromEntries(FIELDS.map(([, k]) => [k, (c[k] as string) ?? ''])) }); setEdit(true); setErr('') }
  async function save() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/synapse/contacts/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const j = await res.json().catch(() => ({})); if (!res.ok) { setErr(j?.error || '保存に失敗しました'); return }
      reflect(j.contact as DetailContact); setEdit(false)
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
      if (j.contact) reflect(j.contact as DetailContact)   // ★⑤：事実が空欄補完されDBから再取得→画面に反映
      setEdit(false)
      const ff = j.filledFacts ?? {}
      const labels: Record<string, string> = { company: '会社', industry: '業種', size: '規模', phone: '電話', address: '住所' }
      const filled = Object.keys(ff).map(k => labels[k] ?? k).join('・')
      setScanInfo(filled ? `空欄を補完：${filled}（既存値は変更なし）／需要分析を更新` : '需要分析を更新しました')
    } catch { setScanErr('通信に失敗しました') } finally { setScanBusy(false) }
  }
  async function makeIntro(tag: string, kind: 'keyword' | 'service') {
    setPicked(null); setIntroBusy(true); setIntro({ text: '' })
    try {
      // キーワード＝切り口(tone)に／推奨サービス＝service に渡す（既存 Feature C）。
      const body = kind === 'service'
        ? { contact: c.company || c.name || '相手の方', need: c.demand_summary || '', service: tag, tone: '丁寧' }
        : { contact: c.company || c.name || '相手の方', need: `${tag}（${c.demand_summary ?? ''}）`.slice(0, 600), service: c.suggested_service || '', tone: `丁寧・「${tag}」を切り口に` }
      const res = await fetch('/api/ai/draft-intro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setIntro({ text: '【現在ご利用いただけません】手入力で文面をご用意ください。' }); return }
      if (!res.ok) { setIntro({ text: j?.error || '生成に失敗しました' }); return }
      setIntro({ text: j.draft || '生成できませんでした' })
    } catch { setIntro({ text: '通信に失敗しました' }) } finally { setIntroBusy(false) }
  }

  const labelStyle: React.CSSProperties = { fontSize: '.56rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.02em' }
  const valStyle: React.CSSProperties = { fontSize: '.78rem', fontWeight: 600, marginTop: 2, lineHeight: 1.5 }
  const inputStyle: React.CSSProperties = { width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.8rem', marginTop: 3 }
  const tagBtn = (active: boolean, accent: string, bg: string): React.CSSProperties => ({ fontSize: '.62rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 999, padding: '5px 12px', border: `1.5px solid ${active ? accent : bg}`, background: active ? accent : bg, color: active ? '#fff' : accent })

  return (
    <div className="page-anim" style={{ padding: '14px 0 28px' }}>
      <div style={{ padding: '0 20px' }}>
        <Link href="/app/synapse" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 600, textDecoration: 'none' }}>← つながり</Link>
      </div>

      {/* ヘッダー（アバターなし・entity_type で主表示を切替：法人=会社名／個人=氏名） */}
      {(() => {
        const corp = c.entity_type !== 'individual'
        const main = corp ? (c.company || c.name) : (c.name || c.company)
        const subParts = corp ? [c.name, c.industry] : [c.role, c.company]
        const sub = subParts.filter(Boolean).join('・')
        return (
          <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: '1.12rem', fontWeight: 900, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{main || '名称未設定'}</h1>
              {sub && <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
            </div>
            <span style={{ fontSize: '.56rem', fontWeight: 800, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 999, padding: '3px 10px', flexShrink: 0, marginTop: 4 }}>{entityLabel}・見込み</span>
          </div>
        )
      })()}

      {/* Phase4：一言ナッジ（該当時のみ・控えめ・「後で」で畳める＝localStorage本人端末スコープ）。無ければ非表示＝沈黙。 */}
      {nudge && !nudgeHidden && (
        <div style={{ margin: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 10, padding: '9px 12px' }}>
          <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 5, padding: '2px 6px' }}>先回り</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: '.64rem', color: 'var(--blue-dk)', fontWeight: 600, lineHeight: 1.5 }}>{nudge.reason}</span>
          <button onClick={dismissNudge} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.6rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>後で</button>
        </div>
      )}

      {/* B2. 主役＝「SYNAPSEの読み」パネル（info背景・最上部）。未分析はCTA／分析中は紋章が灯る／完了でreveal。 */}
      <div style={{ margin: '16px 20px 0', background: 'var(--blue-bg2)', border: '1.5px solid var(--blue-bg)', borderRadius: 16, padding: '16px 16px' }}>
        {scanBusy ? (
          // 読み取り中：紋章のノードが順に灯る（reduced-motionで静止）
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '12px 0' }}>
            <SynapseCrest size={58} scanning />
            <span style={{ fontSize: '.76rem', fontWeight: 800, color: 'var(--blue-dk)' }}>SYNAPSE が読み取り中…</span>
            <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>会社情報を読み解いています</span>
          </div>
        ) : analyzed ? (
          // 分析あり：読みが立ち上がる（opacity/translateYのreveal）
          <div key={c.updated_at} className="syn-reveal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <SynapseCrest size={22} />
              <b style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--blue-dk)' }}>SYNAPSEの読み</b>
            </div>
            {c.demand_summary
              ? <p style={{ fontSize: '.74rem', color: 'var(--txt)', lineHeight: 1.85 }}>{c.demand_summary}</p>
              : <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7 }}>この会社の需要傾向を読み解きました。下のキーワード／推奨サービスから紹介文を作れます。</p>}
            {keywords.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ ...labelStyle, marginBottom: 6 }}>キーワード（需要の切り口）</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {keywords.map(t => <button key={t} onClick={() => setPicked({ tag: t, kind: 'keyword' })} style={tagBtn(picked?.tag === t && picked?.kind === 'keyword', 'var(--blue)', '#fff')}>{t}</button>)}
                </div>
              </div>
            )}
            {recos.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ ...labelStyle, marginBottom: 6 }}>推奨サービス（MB）</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {recos.map(t => <button key={t} onClick={() => setPicked({ tag: t, kind: 'service' })} style={tagBtn(picked?.tag === t && picked?.kind === 'service', 'var(--green)', 'var(--green-bg)')}>{t}</button>)}
                </div>
              </div>
            )}
            {/* B：再分析は読みパネル内に一本化（情報カードのURL欄は廃止）。 */}
            {aiEnabled && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--blue-bg)' }}>
                {rescan ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.co.jp" inputMode="url" disabled={scanBusy} style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--blue-bg)', borderRadius: 9, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.76rem', background: '#fff' }} />
                    <button onClick={scan} disabled={scanBusy} className="lift" style={{ flexShrink: 0, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 9, padding: '0 13px', cursor: scanBusy ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '.66rem', fontWeight: 800 }}>SYNAPSE</button>
                  </div>
                ) : (
                  <button onClick={() => setRescan(true)} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '.62rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>別のURLで再分析する</button>
                )}
              </div>
            )}
          </div>
        ) : (
          // 未分析：このパネル自体を誘導CTAに
          <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><SynapseCrest size={64} /></div>
            <b style={{ fontSize: '.84rem', fontWeight: 800, color: 'var(--blue-dk)' }}>まだ読み解いていません</b>
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '5px auto 13px', lineHeight: 1.7, maxWidth: 260 }}>会社URLを渡すと、SYNAPSEがこの会社の需要を読み解きます。</p>
            {aiEnabled ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.co.jp" inputMode="url" disabled={scanBusy} style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--blue-bg)', borderRadius: 10, padding: '9px 12px', fontFamily: 'inherit', fontSize: '.78rem', background: '#fff' }} />
                <button onClick={scan} disabled={scanBusy} className="lift" style={{ flexShrink: 0, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', cursor: scanBusy ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 800 }}>SYNAPSE</button>
              </div>
            ) : (
              <p style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>URL取込は現在ご利用いただけません。</p>
            )}
          </div>
        )}
        {scanInfo && <div style={{ marginTop: 10, fontSize: '.6rem', color: 'var(--green)', fontWeight: 600, lineHeight: 1.6 }}>{scanInfo}</div>}
        {scanErr && <p style={{ fontSize: '.62rem', color: 'var(--red)', margin: '8px 0 0' }}>{scanErr}</p>}
      </div>

      {/* B：つなげる候補（需要分析の下・候補がある時のみ・最大3・0件は非表示＝沈黙）。理由付き＝なぜこの人/サービス。 */}
      {candidates.length > 0 && (
        <div style={{ margin: '18px 20px 0', background: '#fff', border: '1.5px solid var(--blue-bg)', borderRadius: 14, padding: '15px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <SynapseCrest size={18} />
            <b style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--blue-dk)' }}>つなげる候補</b>
          </div>
          <p style={{ fontSize: '.6rem', color: 'var(--muted2)', marginBottom: 11, lineHeight: 1.6 }}>需要の重なりから、高確度のつなぎ方だけを示します。</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {candidates.map((cand, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 11, padding: '11px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 800, color: cand.kind === 'service' ? 'var(--green)' : 'var(--blue)', background: cand.kind === 'service' ? 'var(--green-bg)' : 'var(--blue-bg)', borderRadius: 5, padding: '2px 6px' }}>{cand.kind === 'service' ? 'サービス' : '人'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '.8rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cand.title}</span>
                </div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 4, lineHeight: 1.6 }}>{cand.reason}</div>
                <button onClick={() => makeIntro(cand.kind === 'service' ? cand.title : (cand.reasons[0] || cand.title), cand.kind === 'service' ? 'service' : 'keyword')} className="lift" style={{ marginTop: 9, background: 'var(--blue-bg2)', color: 'var(--blue)', border: '1px solid var(--blue-bg)', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.66rem', fontWeight: 800 }}>この切り口で紹介文を作る</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. 情報＝事実プロフィール（編集トグル・URL欄に小SYNAPSEボタン） */}
      <div style={{ margin: '18px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <b style={{ fontSize: '.82rem', fontWeight: 800 }}>情報</b>
          {edit
            ? <button onClick={() => { setEdit(false); setErr('') }} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
            : <button onClick={startEdit} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
        </div>

        {/* B：会社URL＋SYNAPSEボタンは「SYNAPSEの読み」パネルに一本化（情報カードのURL欄は廃止＝二重URL解消）。 */}

        {!edit ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
            <div><div style={labelStyle}>区分</div><div style={{ ...valStyle, color: 'var(--txt)' }}>{entityLabel}</div></div>
            {FIELDS.map(([label, key, long]) => {
              const v = (c[key] as string) || null
              return (
                <div key={key as string} style={{ gridColumn: long ? '1 / -1' : 'auto', minWidth: 0 }}>
                  <div style={labelStyle}>{label}</div>
                  <div style={{ ...valStyle, color: v ? 'var(--txt)' : 'var(--muted)' }}>{v || '—'}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
            <div><label style={labelStyle}>区分</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                {(['corporate', 'individual'] as const).map(v => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, entity_type: v }))} style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${form.entity_type === v ? 'var(--blue)' : 'var(--line)'}`, background: form.entity_type === v ? 'var(--blue)' : '#fff', color: form.entity_type === v ? '#fff' : 'var(--muted2)' }}>{v === 'corporate' ? '法人' : '個人'}</button>
                ))}
              </div>
            </div>
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

      {/* C. 紹介の履歴（read-only・このつながりに紐づく過去の紹介） */}
      <div style={{ margin: '18px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: history.length ? 10 : 0 }}>
          <b style={{ fontSize: '.82rem', fontWeight: 800 }}>紹介の履歴</b>
          {history.length > 3 && <button onClick={() => setShowAllHistory(true)} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '.66rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>すべて見る（{history.length}）</button>}
        </div>
        {history.length === 0 ? (
          <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7 }}>まだ紹介の履歴はありません。</p>
        ) : historyShown.map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #F2F2F6' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.service ?? '案件'}</span>
            <span style={{ flexShrink: 0, fontSize: '.58rem', color: 'var(--muted2)' }}>{(h.date || '').slice(0, 7)}</span>
            <span style={{ flexShrink: 0, fontSize: '.58rem', fontWeight: 800, color: STATUS_C[h.status] ?? 'var(--muted2)' }}>{h.status}</span>
          </div>
        ))}
      </div>

      {/* 3. このつながりを紹介する（既存フローへ・情報を引き継ぐ・控えめなセカンダリ） */}
      <div style={{ margin: '18px 20px 0', textAlign: 'center' }}>
        <Link href={referHref} className="lift" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#fff', border: '1px solid var(--line)', borderRadius: 999, textDecoration: 'none', color: 'var(--blue)', fontWeight: 700, fontSize: '.72rem' }}>このつながりを紹介する →</Link>
        <p style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 7 }}>いまの情報を引き継いで紹介できます。</p>
      </div>

      {/* 4. 削除（控えめ） */}
      <div style={{ padding: '20px 20px 0', textAlign: 'center' }}>
        <button onClick={remove} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '.66rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '6px' }}>このつながりを削除</button>
      </div>

      {/* C. すべて見る ポップアップ（全件） */}
      {showAllHistory && (
        <div onClick={ev => { if (ev.target === ev.currentTarget) setShowAllHistory(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 128, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 430, borderRadius: '16px 16px 0 0', padding: '18px 18px calc(18px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <b style={{ fontSize: '.86rem', fontWeight: 800 }}>紹介の履歴（{history.length}）</b>
              <button onClick={() => setShowAllHistory(false)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
            </div>
            {history.map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid #F2F2F6' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: '.74rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.service ?? '案件'}<span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 400, marginLeft: 6 }}>{h.label}</span></span>
                <span style={{ flexShrink: 0, fontSize: '.58rem', color: 'var(--muted2)' }}>{(h.date || '').slice(0, 7)}</span>
                <span style={{ flexShrink: 0, fontSize: '.58rem', fontWeight: 800, color: STATUS_C[h.status] ?? 'var(--muted2)' }}>{h.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ④ タグ選択ポップアップ（小・品よく） */}
      {picked && (
        <div onClick={ev => { if (ev.target === ev.currentTarget) setPicked(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.35)', backdropFilter: 'blur(2px)', zIndex: 125, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 calc(20px + env(safe-area-inset-bottom))' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', width: 'calc(100% - 40px)', maxWidth: 340, boxShadow: '0 12px 40px rgba(14,14,20,.18)' }}>
            <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginBottom: 11 }}>{picked.kind === 'service' ? '推奨サービス' : 'キーワード'}：<b style={{ color: 'var(--txt)' }}>{picked.tag}</b></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPicked(null)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.68rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '7px 10px' }}>閉じる</button>
              <button onClick={() => makeIntro(picked.tag, picked.kind)} className="lift" style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 800 }}>{picked.kind === 'service' ? 'このサービスで紹介文を作る' : 'このキーワードで紹介文を作る'}</button>
            </div>
          </div>
        </div>
      )}

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
