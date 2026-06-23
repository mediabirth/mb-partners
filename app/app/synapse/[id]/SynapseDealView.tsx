'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SynapseCrest from '../SynapseCrest'
import type { HistoryItem } from './SynapseDetailClient'

// B-3 read-only詳細（deal由来・台帳未登録）。表示は read-only：編集トグル・SYNAPSE URL実行・需要分析は出さない。
// アクション：①再度紹介＝/app/refer プリフィルdeep-link（送信/帰属/money無改修）。②台帳に追加して育てる（synapse_contacts のみ書込）。
// ★deals/money/帰属/目録 には一切書かない。紹介履歴は親(SELECT)から受領した read-only データ。

export type DealSeed = {
  dealId: string
  entity: 'individual' | 'corporate'
  name: string | null
  company: string | null
  person: string | null
  service: string | null
  status: string
}

const STATUS_C: Record<string, string> = { 進行: 'var(--amber)', 成約: 'var(--green)', 支払済: 'var(--muted2)', 不成立: 'var(--muted)' }

export default function SynapseDealView({ seed, history }: { seed: DealSeed; history: HistoryItem[] }) {
  const router = useRouter()
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [growBusy, setGrowBusy] = useState(false); const [growErr, setGrowErr] = useState('')

  const corp = seed.entity === 'corporate'
  const main = (corp ? (seed.company || seed.name) : (seed.name || seed.company)) || '紹介した顧客'
  const subParts = corp ? [seed.person, seed.service] : [seed.service]
  const sub = subParts.filter(Boolean).join('・')
  const entityLabel = corp ? '法人' : '個人'
  const historyShown = showAllHistory ? history : history.slice(0, 3)

  // ①再度紹介：/app/refer に入力初期値のみ引き継ぐ（送信/帰属/money は無改修）。
  const refParams = new URLSearchParams()
  refParams.set('ct', corp ? 'corporate' : 'individual')
  if (seed.company) refParams.set('co', seed.company)
  const referName = corp ? (seed.person || seed.name) : seed.name
  if (referName) refParams.set('nm', referName)
  const memoCarry = [seed.service && `サービス：${seed.service}`, seed.status && `状態：${seed.status}`].filter(Boolean).join(' / ')
  if (memoCarry) refParams.set('memo', memoCarry.slice(0, 400))
  const referHref = `/app/refer?${refParams.toString()}`

  // ②台帳に追加して育てる：synapse_contacts に本人スコープで作成→編集可の台帳詳細へ。書込は contacts のみ。
  async function grow() {
    setGrowBusy(true); setGrowErr('')
    try {
      const body = corp
        ? { company: seed.company, name: seed.person, entity_type: 'corporate', source: 'manual' }
        : { name: seed.name, entity_type: 'individual', source: 'manual' }
      const res = await fetch('/api/synapse/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.contact?.id) { setGrowErr(j?.error || '追加に失敗しました'); return }
      router.push(`/app/synapse/${j.contact.id}`)
    } catch { setGrowErr('追加に失敗しました') } finally { setGrowBusy(false) }
  }

  const labelStyle: React.CSSProperties = { fontSize: '.56rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.02em' }
  const valStyle: React.CSSProperties = { fontSize: '.78rem', fontWeight: 600, marginTop: 2, lineHeight: 1.5 }

  return (
    <div className="page-anim" style={{ padding: '14px 0 28px' }}>
      <div style={{ padding: '0 20px' }}>
        <Link href="/app/synapse" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 600, textDecoration: 'none' }}>← つながり</Link>
      </div>

      {/* ヘッダー（read-only） */}
      <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '1.12rem', fontWeight: 900, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{main}</h1>
          {sub && <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
        </div>
        <span style={{ fontSize: '.56rem', fontWeight: 800, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 999, padding: '3px 10px', flexShrink: 0, marginTop: 4 }}>{entityLabel}・紹介済み</span>
      </div>

      {/* 情報（read-only・編集トグル/ URL実行/ 需要分析は出さない） */}
      <div style={{ margin: '16px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <b style={{ fontSize: '.82rem', fontWeight: 800 }}>情報</b>
          <span style={{ fontSize: '.54rem', fontWeight: 800, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 6, padding: '3px 8px' }}>読み取り専用</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
          <div><div style={labelStyle}>区分</div><div style={{ ...valStyle, color: 'var(--txt)' }}>{entityLabel}</div></div>
          <div><div style={labelStyle}>状態</div><div style={{ ...valStyle, color: STATUS_C[seed.status] ?? 'var(--txt)' }}>{seed.status}</div></div>
          {corp && <div><div style={labelStyle}>会社・組織</div><div style={{ ...valStyle, color: seed.company ? 'var(--txt)' : 'var(--muted)' }}>{seed.company || '—'}</div></div>}
          <div><div style={labelStyle}>{corp ? '担当者' : 'お名前'}</div><div style={{ ...valStyle, color: (corp ? seed.person : seed.name) ? 'var(--txt)' : 'var(--muted)' }}>{(corp ? seed.person : seed.name) || '—'}</div></div>
          <div style={{ gridColumn: '1 / -1' }}><div style={labelStyle}>紹介したサービス</div><div style={{ ...valStyle, color: seed.service ? 'var(--txt)' : 'var(--muted)' }}>{seed.service || '—'}</div></div>
        </div>
        <p style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 13, lineHeight: 1.7, paddingTop: 12, borderTop: '1px solid #F2F2F6' }}>過去に紹介した顧客です。台帳に追加すると、編集・会社URLからのSYNAPSE分析ができるようになります。</p>
      </div>

      {/* 紹介の履歴（read-only） */}
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

      {/* ②台帳に追加して育てる */}
      <div style={{ margin: '18px 20px 0' }}>
        <button onClick={grow} disabled={growBusy} className="btn btn-p lift" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <SynapseCrest size={18} />{growBusy ? '追加中…' : '台帳に追加して育てる'}
        </button>
        {growErr && <p style={{ fontSize: '.62rem', color: 'var(--red)', margin: '7px 0 0', textAlign: 'center' }}>{growErr}</p>}
        <p style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 7, textAlign: 'center', lineHeight: 1.6 }}>台帳に加えると、編集・SYNAPSE分析・需要のキーワードが使えます。</p>
      </div>

      {/* ①このつながりを再度紹介する（/app/refer プリフィル・控えめ） */}
      <div style={{ margin: '14px 20px 0', textAlign: 'center' }}>
        <Link href={referHref} className="lift" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#fff', border: '1px solid var(--line)', borderRadius: 999, textDecoration: 'none', color: 'var(--blue)', fontWeight: 700, fontSize: '.72rem' }}>この人を再度紹介する →</Link>
        <p style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 7 }}>いまの情報を引き継いで紹介できます。</p>
      </div>

      {/* 紹介の履歴 すべて見る ポップアップ */}
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
    </div>
  )
}
